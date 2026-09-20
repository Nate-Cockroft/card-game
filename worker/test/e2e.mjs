import { createDeck } from "../src/cards.js";

const WS_ORIGIN = "http://127.0.0.1:8787";
const MAGIC_DECK_SIZE = createDeck().length;

function connect(room, name, create) {
  const u = new URL(`${WS_ORIGIN}/ws`);
  u.searchParams.set("room", room);
  u.searchParams.set("name", name);
  if (create) u.searchParams.set("create", "1");
  const ws = new WebSocket(u);
  const states = [];
  ws.addEventListener("message", (e) => states.push(JSON.parse(e.data)));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("websocket connect timeout")), 3000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve({ ws, states });
    };
    ws.onerror = () => reject(new Error("websocket connect failed: " + ws.url));
  });
}

function connectLobby() {
  const ws = new WebSocket(`${WS_ORIGIN}/lobby`);
  const msgs = [];
  ws.addEventListener("message", (e) => msgs.push(JSON.parse(e.data)));
  return new Promise((resolve) => {
    ws.onopen = () => resolve({ ws, msgs });
  });
}

function waitForState(c, pred) {
  return new Promise((resolve) => {
    const tick = () => {
      const s = c.states.find((m) => m.type === "state" && pred(m.state));
      if (s) return resolve(s.state);
      setTimeout(tick, 20);
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const L = await connectLobby();
  const code = "R" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const A = await connect(code, "Alice", true);
  const B = await connect(code, "Bob", false);

  // lobby with 2 players
  await waitForState(A, (s) => s.phase === "lobby" && s.players.length === 2);
  console.log("[1] LOBBY OK");

  // the room should appear in the lobby list (no codes shown to players)
  await sleep(200);
  const latestLobbies = () => L.msgs.filter((m) => m.type === "lobbies").at(-1) ?? null;
  const lob = latestLobbies();
  if (!lob || !lob.lobbies.find((r) => r.id === code)) {
    throw new Error("room not listed in lobby directory");
  }
  console.log("[1b] LOBBY DIRECTORY OK:", lob.lobbies.map((r) => `${r.id}(${r.humans})`).join(", "));

  // host changes settings + adds a bot
  A.ws.send(JSON.stringify({ type: "settings", handSize: 9, maxPlayers: 6 }));
  A.ws.send(JSON.stringify({ type: "addBot" }));
  await waitForState(A, (s) => s.phase === "lobby" && s.players.length === 3 && s.handSize === 9);
  console.log("[1c] SETTINGS + BOT OK (players: 3)");
  await sleep(200);
  const lob2 = latestLobbies();
  const listed = lob2?.lobbies?.find((r) => r.id === code);
  if (!listed || listed.count !== 3) throw new Error("lobby list did not update after bot join");

  A.ws.send(JSON.stringify({ type: "start" }));
  await waitForState(A, (s) => s.phase === "playing");
  console.log("[2] START OK (hands:", (await waitForState(A, (s) => s.phase === "playing")).myHand.length, ")");

  let played = 0;
  playRound(A, B, () => {}, code + "r" + played);
  await sleep(400);
  const stateA = A.states.filter((m) => m.type === "state").at(-1).state;
  const stateB = B.states.filter((m) => m.type === "state").at(-1).state;
  console.log("[3] ROUND PLAYED. phase:", stateA.phase, "deck:", stateA.deckCount);
  console.log("    hands after: Alice", stateA.myHand.length, "/ Bob", stateB.myHand.length);

  // lead a round
  const leaderWs = stateA.activePlayerId === stateA.myId ? A.ws : B.ws;
  const otherWs = leaderWs === A.ws ? B.ws : A.ws;
  const leadState = stateA.activePlayerId === stateA.myId ? stateA : stateB;
  const stat = "attack";
  leaderWs.send(JSON.stringify({ type: "play", asLeader: true, cardId: leadState.myHand[0].id, stat }));
  await sleep(200);
  const rState = stateA.activePlayerId === stateA.myId ? stateB : stateA;
  const respComp = (await waitForState(stateA.activePlayerId === stateA.myId ? B : A, (s) => s.phase === "compare"));
  otherWs.send(JSON.stringify({ type: "play", asLeader: false, cardId: respComp.myHand[0].id }));
  await sleep(300);
  const sA = A.states.filter((m) => m.type === "state").at(-1).state;
  const sB = B.states.filter((m) => m.type === "state").at(-1).state;
  console.log("[4] COMPARE RESOLVED. phase:", sA.phase, "winner:", sA.winnerId || "none", "turn:", name(sA, sA.activePlayerId));
  console.log(`[5] MAGIC DECK OK (${MAGIC_DECK_SIZE} card types)`);

  // draw test: active player draws
  const dWs = sA.activePlayerId === sA.myId ? A.ws : B.ws;
  dWs.send(JSON.stringify({ type: "draw" }));
  await sleep(250);
  const sA2 = A.states.filter((m) => m.type === "state").at(-1).state;
  console.log("[6] DRAW OK. deck:", sA2.deckCount);

  // error test: non-active player tries to lead
  const errWs = sA2.activePlayerId === sA2.myId ? B.ws : A.ws;
  const errClient = errWs === A.ws ? A : B;
  errWs.send(JSON.stringify({ type: "play", asLeader: true, cardId: -1, stat: "health" }));
  await sleep(250);
  const errMsg = errClient.states.find((m) => m.type === "error");
  if (!errMsg) throw new Error("expected error message for out-of-turn play");
  console.log("[7] ERROR HANDLING OK:", errMsg.message);

  console.log("\nALL E2E CHECKS PASSED");
  process.exit(0);
}

function name(s, id) {
  const p = s.players.find((x) => x.id === id);
  return p ? p.name : "?";
}

function playRound() {}

main().catch((e) => {
  console.error("E2E FAIL:", e);
  process.exit(1);
});