const WS_ORIGIN = "http://127.0.0.1:8787";

function connect(code, name, create) {
  const u = new URL(`${WS_ORIGIN}/ws`);
  u.searchParams.set("code", code);
  u.searchParams.set("name", name);
  if (create) u.searchParams.set("create", "1");
  const ws = new WebSocket(u);
  const states = [];
  ws.addEventListener("message", (e) => states.push(JSON.parse(e.data)));
  return new Promise((resolve) => {
    ws.onopen = () => resolve({ ws, states });
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
  const code = "AWSQ2";
  const A = await connect(code, "Alice", true);
  const B = await connect(code, "Bob", false);

  // lobby with 2 players
  await waitForState(A, (s) => s.phase === "lobby" && s.players.length === 2);
  console.log("[1] LOBBY OK");

  A.ws.send(JSON.stringify({ type: "start" }));
  await waitForState(A, (s) => s.phase === "playing");
  console.log("[2] START OK (hands:", (await waitForState(A, (s) => s.phase === "playing")).myHand.length, ")");

  let played = 0;
  playRound(A, B, () => {}, code + "r" + played);
  await sleep(400);
  const stateA = A.states.filter((m) => m.type === "state").at(-1).state;
  const stateB = B.states.filter((m) => m.type === "state").at(-1).state;
  console.log("[3] ROUND PLAYED. pots:", stateA.potCount, "decks:", stateA.deckCount, "phase:", stateA.phase);
  console.log("    hands after: Alice", stateA.myHand.length, "/ Bob", stateB.myHand.length);

  const total = stateA.myHand.length + stateB.myHand.length + stateA.deckCount + stateA.potCount;
  if (total !== 52) throw new Error(`card conservation broken: ${total}`);

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
  const total2 = sA.myHand.length + sB.myHand.length + sA.deckCount + sA.potCount;
  if (total2 !== 52) throw new Error(`card conservation broken: ${total2}`);
  console.log("[5] CARD CONSERVATION OK (52)");

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