// Stat Clash client.
// Points WORKER_URL at your deployed Cloudflare Worker.
const WORKER_URL = "https://cardsgame-worker.nathaniel-cockroft.workers.dev";
const STAT_LABELS = { health: "Health", speed: "Speed", attack: "Attack", defense: "Defense" };

let ws = null; // game socket
let lobbyWs = null; // lobby-list socket
let state = null;
let prevState = null;
let myId = null;
let selectedCard = null;
let lobbies = [];
let collecting = false;

const $ = (id) => document.getElementById(id);
const screens = { lobby: $("lobby"), waiting: $("waiting"), game: $("game") };

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) {
    el.hidden = k !== name;
  }
}

/* ---------- lobby list ---------- */

function connectLobby() {
  lobbyWs = new WebSocket(`${WORKER_URL}/lobby`);
  lobbyWs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "lobbies") {
      lobbies = msg.lobbies;
      renderLobbyList();
    }
  };
}

function renderLobbyList() {
  const ul = $("lobby-list");
  ul.innerHTML = "";
  const open = lobbies.filter((l) => l.phase === "lobby");
  $("lobby-empty").hidden = open.length > 0;
  open.forEach((l) => {
    const li = document.createElement("li");
    const info = li.appendChild(document.createElement("div"));
    info.className = "lobby-info";
    const host = info.appendChild(document.createElement("b"));
    host.textContent = `${l.host}'s lobby`;
    const meta = info.appendChild(document.createElement("span"));
    meta.textContent = `${l.humans}/${l.maxPlayers} players · ${l.handSize} cards`;
    const join = li.appendChild(document.createElement("button"));
    join.textContent = "Join";
    join.disabled = !(l.count < l.maxPlayers);
    join.onclick = () => connectGame(l.id, false);
    ul.appendChild(li);
  });
}

/* ---------- game socket ---------- */

function generateId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function connectGame(roomId, create) {
  const u = new URL(`${WORKER_URL}/ws`);
  u.searchParams.set("room", roomId);
  u.searchParams.set("name", $("name-input").value.trim() || "Player");
  if (create) u.searchParams.set("create", "1");
  ws = new WebSocket(u.toString());
  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (state && state.phase !== "finished") {
      setStatus("Disconnected from server. Reconnect to rejoin.");
    }
  };
}

function handleMessage(msg) {
  if (msg.type === "error") {
    if (!state) showLobbyError(msg.message);
    else if (state.phase === "lobby") showWaitingError(msg.message);
    else setStatus(msg.message);
    return;
  }
  if (msg.type === "state") {
    prevState = state;
    state = msg.state;
    myId = state.myId;
    $("lobby-error").hidden = true;
    render(prevState);
  }
}

function showLobbyError(msg) {
  const el = $("lobby-error");
  el.textContent = msg;
  el.hidden = false;
  showScreen("lobby");
}

function showWaitingError(msg) {
  showScreen("waiting");
  const el = $("waiting-error");
  el.textContent = msg;
  el.hidden = false;
}

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/* ---------- rendering ---------- */

function render(prev) {
  if (!state) return;
  if (state.phase === "lobby") {
    showScreen("waiting");
    renderWaiting();
    return;
  }
  showScreen("game");
  renderGame(prev);
  if (state.phase === "finished" && !collecting) showWinner();
}

function renderWaiting() {
  const isHost = state.hostId === myId;
  $("invite-url").textContent = location.href.split("?")[0];

  const settings = $("settings");
  settings.hidden = !isHost;
  if (isHost) {
    $("hand-size").value = state.handSize;
    $("max-players").value = state.maxPlayers;
    $("settings-note").textContent =
      `Starting cards ${state.handSize} each (deck adjusts automatically). Bots take up a player slot.`;
  }

  const roster = $("roster");
  roster.innerHTML = "";
  state.players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent = (p.bot ? "🤖 " : "") + p.name;
    if (p.id === state.hostId) li.textContent += " (host)";
    roster.appendChild(li);
  });

  const startBtn = $("start-btn");
  startBtn.disabled = !(isHost && state.players.length >= 2);
  startBtn.textContent = isHost ? "Start game" : "Waiting for host…";
  startBtn.onclick = () => send({ type: "start" });

  $("add-bot-btn").onclick = () => send({ type: "addBot" });
  $("apply-settings-btn").onclick = () => {
    const v = {
      handSize: Math.max(5, Math.min(9, parseInt($("hand-size").value, 10) || 7)),
      maxPlayers: Math.max(2, Math.min(8, parseInt($("max-players").value, 10) || 6)),
    };
    send({ type: "settings", ...v });
  };
  $("waiting-error").hidden = true;
}

function renderGame(prev) {
  $("room-info").textContent = `deck ${state.deckCount} · pot ${state.potCount}`;
  renderOpponents();

  const resolving = !!(state.lastResult && prev && prev.phase === "compare" && state.phase !== "compare");
  if (resolving) {
    const tableEl = $("table");
    const cards = [...tableEl.querySelectorAll(".card")];
    if (cards.length) {
      collecting = true;
      $("pot-target").hidden = state.lastResult.loserId !== null;
      animateCardsTo(cards, state.lastResult, () => {
        collecting = false;
        $("pot-target").hidden = true;
        tableEl.innerHTML = "";
        renderTable();
        if (state.lastResult.loserId === myId) renderHand();
        if (state.phase === "finished") showWinner();
      });
    } else {
      renderTable();
    }
  } else {
    renderTable();
  }

  renderStatus();
  renderLog();
  const dealing = !!(prev && prev.phase === "lobby" && state.phase !== "lobby");
  if (!resolving || state.lastResult.loserId !== myId) {
    renderHand(dealing ? { deal: true } : {});
  }
}

/* ---------- animations ---------- */

// Element that the played card visually flies FROM.
function sourceOf(playerId) {
  if (playerId === myId) return $("hand");
  return document.querySelector(`.opponent[data-player="${playerId}"]`) || $("table");
}

// Pop a card in with a fly from `fromEl` to its final position.
function flyCard(el, fromEl, opts = {}) {
  if (!el || !fromEl || !el.isConnected) return;
  const from = fromEl.getBoundingClientRect();
  const to = el.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  el.style.setProperty("--fly-x", `${dx}px`);
  el.style.setProperty("--fly-y", `${dy}px`);
  if (opts.delay) el.style.setProperty("animation-delay", `${opts.delay}ms`);
  el.classList.add("fly", opts.cls || "fly-card");
}

// Fly the just-played cards toward the loser (or the pot on a tie).
function animateCardsTo(cards, result, done) {
  let targetEl;
  if (result.loserId === null) {
    targetEl = $("pot-target");
  } else if (result.loserId === myId) {
    targetEl = $("hand");
  } else {
    targetEl = document.querySelector(`.opponent[data-player="${result.loserId}"]`);
  }
  const target = targetEl && targetEl.isConnected ? targetEl : $("table");
  const t = target.getBoundingClientRect();
  let remaining = cards.length;
  showResultBanner(result);
  if (!remaining) {
    if (done) done();
    return;
  }
  cards.forEach((el) => {
    const from = el.getBoundingClientRect();
    const dx = t.left + t.width / 2 - (from.left + from.width / 2);
    const dy = t.top + t.height / 2 - (from.top + from.height / 2);
    el.style.setProperty("--fly-x", `${dx}px`);
    el.style.setProperty("--fly-y", `${dy}px`);
    el.classList.add("collect");
    el.addEventListener(
      "animationend",
      () => {
        el.remove();
        remaining -= 1;
        if (remaining === 0 && done) done();
      },
      { once: true }
    );
  });
}

let bannerTimer = null;
function showResultBanner(result) {
  const b = $("result-banner");
  b.hidden = false;
  b.textContent =
    result.loserId === null
      ? `Tie! ${result.count} card${result.count === 1 ? "" : "s"} go to the pot.`
      : `${nameOf(result.loserId)} loses & collects ${result.count} card${result.count === 1 ? "" : "s"}!`;
  b.classList.remove("fade");
  void b.offsetWidth;
  b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    b.classList.add("fade");
  }, 1400);
  setTimeout(() => (b.hidden = true), 2100);
}

/* ---------- board ---------- */

function renderOpponents() {
  const wrap = $("opponents");
  wrap.innerHTML = "";
  const activeId = state.activePlayerId;
  state.players.forEach((p) => {
    const div = document.createElement("div");
    div.className = "opponent" + (p.id === activeId ? " active" : "") + (p.id === myId ? " me" : "");
    div.dataset.player = p.id;
    const name = div.appendChild(document.createElement("div"));
    name.className = "opp-name";
    name.textContent = (p.bot ? "🤖 " : "") + (p.id === myId ? p.name + " (you)" : p.name);
    const count = div.appendChild(document.createElement("div"));
    count.className = "opp-count";
    count.textContent = `${p.handCount} card${p.handCount === 1 ? "" : "s"}`;
    if (p.id === state.winnerId) count.textContent += " 🏆";
    wrap.appendChild(div);
  });
}

function cardEl(card, { hide = false, chosenStat = null } = {}) {
  if (hide) {
    const c = document.createElement("div");
    c.className = "card face-down";
    return c;
  }
  const c = document.createElement("div");
  c.className = "card";
  const head = c.appendChild(document.createElement("div"));
  head.className = "card-head";
  const emoji = head.appendChild(document.createElement("span"));
  emoji.className = "emoji";
  emoji.textContent = card.emoji;
  const nm = head.appendChild(document.createElement("span"));
  nm.className = "cname";
  nm.textContent = card.name;
  ["health", "speed", "attack", "defense"].forEach((stat) => {
    const row = c.appendChild(document.createElement("div"));
    row.className = "stat-row" + (stat === chosenStat ? " chosen" : "");
    const lbl = row.appendChild(document.createElement("span"));
    lbl.textContent = STAT_LABELS[stat];
    const val = row.appendChild(document.createElement("b"));
    val.textContent = card[stat];
  });
  return c;
}

function renderTable() {
  const el = $("table");
  el.innerHTML = "";

  if (state.phase !== "compare") {
    const hint = el.appendChild(document.createElement("div"));
    hint.className = "empty";
    if (state.phase === "playing") {
      hint.textContent =
        state.activePlayerId === myId
          ? "Your turn — play a card or draw."
          : `${nameOf(state.activePlayerId)} is deciding…`;
    }
    return;
  }

  const callout = el.appendChild(document.createElement("div"));
  callout.className = "stat-callout";
  callout.textContent = `Challenging ${STAT_LABELS[state.activePlay.stat]}!`;

  const led = el.appendChild(document.createElement("div"));
  led.className = "led-card";
  const leadCardEl = cardEl(state.activePlay.card, { chosenStat: state.activePlay.stat });
  leadCardEl.dataset.player = state.activePlayerId;
  led.appendChild(leadCardEl);

  const row = el.appendChild(document.createElement("div"));
  row.className = "response-row";
  Object.keys(state.responses).forEach((id) => {
    const slot = row.appendChild(document.createElement("div"));
    slot.className = "response-slot";
    const back = cardEl(null, { hide: true });
    back.dataset.player = id;
    slot.appendChild(back);
    const lab = slot.appendChild(document.createElement("div"));
    lab.className = "resp-name";
    lab.textContent = nameOf(id);
  });

  // Animate the leader's card in if this message just opened the round.
  if (!prevState || prevState.phase !== "compare") {
    flyCard(leadCardEl, sourceOf(state.activePlayerId), { cls: "fly-lead" });
  }
  // Animate only the responses that are newly on the table.
  const prevKeys = prevState && prevState.responses ? Object.keys(prevState.responses) : [];
  Object.keys(state.responses).forEach((id, i) => {
    if (!prevKeys.includes(id)) {
      const slotCard = row.querySelector(`[data-player="${id}"]`);
      if (slotCard) flyCard(slotCard, sourceOf(id), { cls: "fly-resp", delay: 80 + i * 60 });
    }
  });
}

function renderStatus() {
  let text = "";
  if (state.phase === "playing") {
    if (state.activePlayerId === myId) text = "It's your turn! Play a card & pick a stat — or draw from the deck.";
    else text = `${nameOf(state.activePlayerId)} is choosing…`;
  } else if (state.phase === "compare") {
    if (state.activePlayerId === myId) text = "Round is open — waiting for everyone to play their card.";
    else if (state.responses[myId]) text = "You've played. Waiting for the rest…";
    else text = `${nameOf(state.activePlayerId)} challenged ${STAT_LABELS[state.activePlay.stat]}. Pick your card!`;
  }
  setStatus(text);
}

function setStatus(text) {
  $("status").innerHTML = text;
}

function nameOf(id) {
  const p = state.players.find((x) => x.id === id);
  return p ? p.name : "?";
}

function renderLog() {
  const log = $("log");
  log.innerHTML = "";
  state.log.forEach((entry) => {
    const p = log.appendChild(document.createElement("p"));
    p.textContent = entry;
  });
  log.scrollTop = log.scrollHeight;
}

/* ---------- hand ---------- */

function renderHand(opts = {}) {
  const wrap = $("hand");
  wrap.innerHTML = "";
  const controls = $("controls");

  const myTurn = state.activePlayerId === myId && state.phase === "playing";
  const mustRespond = state.phase === "compare" && state.activePlayerId !== myId && !state.responses[myId];

  state.myHand.forEach((card, i) => {
    const el = cardEl(card);
    el.dataset.cardId = card.id;
    if (myTurn || mustRespond) el.addEventListener("click", () => onCardClick(card.id));
    if (selectedCard === card.id) el.classList.add("selected");
    if (opts.deal) flyCard(el, $("table"), { cls: "fly-deal", delay: i * 45 });
    wrap.appendChild(el);
  });

  controls.hidden = !(myTurn || mustRespond);
  controls.innerHTML = "";

  if (myTurn) {
    if (state.deckCount > 0) {
      const draw = controls.appendChild(document.createElement("button"));
      draw.textContent = `Draw from deck (${state.deckCount})`;
      draw.onclick = () => {
        selectedCard = null;
        send({ type: "draw" });
      };
    }
    const chips = controls.appendChild(document.createElement("div"));
    chips.className = "chips";
    chips.appendChild(Object.assign(document.createElement("span"), { textContent: "Choose a stat:" }));
    ["health", "speed", "attack", "defense"].forEach((stat) => {
      const b = chips.appendChild(document.createElement("button"));
      b.className = "stat-btn";
      b.textContent = STAT_LABELS[stat];
      b.disabled = !selectedCard;
      b.onclick = () => {
        send({ type: "play", asLeader: true, cardId: selectedCard, stat });
        selectedCard = null;
      };
    });
  } else if (mustRespond) {
    const btn = controls.appendChild(document.createElement("button"));
    btn.className = "primary";
    btn.textContent = "Play chosen card";
    btn.disabled = !selectedCard;
    btn.onclick = () => {
      send({ type: "play", asLeader: false, cardId: selectedCard });
      selectedCard = null;
    };
  }
}

function onCardClick(cardId) {
  if (state.phase === "compare" && state.activePlayerId !== myId && state.responses[myId]) return;
  selectedCard = selectedCard === cardId ? null : cardId;
  renderHand();
}

function showWinner() {
  const name = nameOf(state.winnerId);
  $("winner-title").textContent = "🏆 " + name;
  $("winner-text").textContent = `${name} emptied their hand first and wins the game!`;
  $("winner-overlay").hidden = false;
  $("new-game-btn").onclick = () => location.href = location.pathname;
}

/* ---------- wiring ---------- */

$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("name-input").value.trim();
  if (!name) return;
  connectGame(generateId(), true);
});

$("copy-btn").addEventListener("click", () => {
  const url = location.href.split("?")[0];
  navigator.clipboard.writeText(url).then(() => {
    $("copy-btn").textContent = "Copied!";
    setTimeout(() => ($("copy-btn").textContent = "Copy link"), 1500);
  });
});

connectLobby();
renderLobbyList();