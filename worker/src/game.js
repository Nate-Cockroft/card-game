import {
  createDeck,
  DEFAULT_HAND_SIZE,
  DEFAULT_MAX_PLAYERS,
  MIN_HAND_SIZE,
  MAX_HAND_SIZE,
  MIN_PLAYERS,
  MAX_PLAYERS,
  isStat,
} from "./cards.js";

export function createGame(code) {
  return {
    code,
    phase: "lobby", // lobby | playing | compare | finished
    hostId: null,
    handSize: DEFAULT_HAND_SIZE,
    maxPlayers: DEFAULT_MAX_PLAYERS,
    players: [], // [{id, name, bot}]
    order: [], // fixed seat order of player ids
    turnIndex: 0,
    hands: {}, // id -> [card, ...]
    activePlay: null, // {card, stat} from the active player
    responses: {}, // playerId -> card chosen during compare
    lastResult: null, // {loserId|null, count} from the most recent resolved round
    winnerId: null,
    log: [],
  };
}

const botNamePool = ["Bot-α", "Bot-β", "Bot-γ", "Bot-δ", "Bot-ε", "Bot-ζ", "Bot-η", "Bot-θ"];

function log(state, msg) {
  state.log.push(msg);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

export function setSettings(state, hostId, { handSize, maxPlayers }) {
  if (state.phase !== "lobby") return { ok: false, error: "Settings can only change before the game starts." };
  if (state.hostId !== hostId) return { ok: false, error: "Only the host can change settings." };
  if (handSize !== undefined) {
    if (!Number.isInteger(handSize) || handSize < MIN_HAND_SIZE || handSize > MAX_HAND_SIZE) {
      return { ok: false, error: `Hand size must be ${MIN_HAND_SIZE}-${MAX_HAND_SIZE} cards.` };
    }
    state.handSize = handSize;
  }
  if (maxPlayers !== undefined) {
    if (!Number.isInteger(maxPlayers) || maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
      return { ok: false, error: `Max players must be ${MIN_PLAYERS}-${MAX_PLAYERS}.` };
    }
    if (state.players.length > maxPlayers) {
      return { ok: false, error: "Some players would be pushed out." };
    }
    state.maxPlayers = maxPlayers;
  }
  log(state, `Settings: ${state.handSize} starting cards, ${state.maxPlayers} max players.`);
  return { ok: true };
}

export function addBot(state, hostId) {
  if (state.phase !== "lobby") return { ok: false, error: "Bots can only be added before the game starts." };
  if (state.hostId !== hostId) return { ok: false, error: "Only the host can add bots." };
  if (state.players.length >= state.maxPlayers) {
    return { ok: false, error: "Lobby is at max capacity." };
  }
  const n = state.players.filter((p) => p.bot).length;
  const id = "bot" + (Math.floor(Math.random() * 1e6)).toString(36);
  state.players.push({ id, name: botNamePool[n % botNamePool.length], bot: true });
  state.order.push(id);
  state.hands[id] = [];
  log(state, `${botNamePool[n % botNamePool.length]} joined as a bot.`);
  return { ok: true, id };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

export function activePlayerId(state) {
  if (state.order.length === 0) return null;
  return state.order[state.turnIndex % state.order.length];
}

export function isBot(state, id) {
  const p = playerById(state, id);
  return p ? !!p.bot : false;
}

export function addPlayer(state, id, name) {
  if (state.phase !== "lobby") return { ok: false, error: "Game already started." };
  if (state.players.length >= state.maxPlayers) return { ok: false, error: "Room is full." };
  if (state.players.some((p) => p.id === id)) return { ok: false, error: "Already joined." };
  state.players.push({ id, name, bot: false });
  state.order.push(id);
  state.hands[id] = [];
  if (!state.hostId) state.hostId = id;
  log(state, `${name} joined. (${state.players.length}/${state.maxPlayers})`);
  return { ok: true };
}

export function removePlayer(state, id) {
  const player = playerById(state, id);
  if (!player) return;
  const wasActive = activePlayerId(state) === id;
  state.players = state.players.filter((p) => p.id !== id);
  state.order = state.order.filter((p) => p.id !== id);
  delete state.hands[id];
  delete state.responses[id];
  if (!state.players.length) return;
  if (state.hostId === id) state.hostId = state.players.find((p) => !p.bot)?.id ?? state.players[0].id;
  if (wasActive && state.phase !== "lobby") state.phase = "playing";
  // walk turn to a sensible spot
  state.turnIndex = Math.min(state.turnIndex, state.order.length - 1);
  log(state, `${player.name} left the game.`);
}

const POOL_SIZE = createDeck().length;

// The "deck" is a magical infinite thing: you can pull any card out of it.
export function drawFromDeck() {
  const pool = createDeck();
  return pool[Math.floor(Math.random() * pool.length)];
}

export function startGame(state) {
  if (state.phase !== "lobby") return { ok: false, error: "Game already started." };
  if (state.players.length < 2) return { ok: false, error: "Need at least 2 players in the lobby." };
  state.players.forEach((p) => {
    state.hands[p.id] = Array.from({ length: state.handSize }, () => drawFromDeck());
  });
  state.phase = "playing";
  state.turnIndex = 0;
  log(state, "Game started! Everyone got " + state.handSize + " cards.");
  log(state, `${nameOf(state, activePlayerId(state))} will lead the first round.`);
  return { ok: true };
}

export function nameOf(state, id) {
  const p = playerById(state, id);
  return p ? p.name : "?";
}

export function drawAsActive(state, id) {
  if (state.phase !== "playing") return { ok: false, error: "Not your play window." };
  if (activePlayerId(state) !== id) return { ok: false, error: "Not your turn." };
  const card = drawFromDeck();
  state.hands[id].push(card);
  log(state, `${nameOf(state, id)} pulled a card out of the magical deck.`);
  advanceTurn(state);
  return { ok: true, drew: card };
}

export function playAsActive(state, id, cardId, stat) {
  if (state.phase !== "playing") return { ok: false, error: "Not your play window." };
  if (activePlayerId(state) !== id) return { ok: false, error: "Not your turn." };
  if (!isStat(stat)) return { ok: false, error: "Invalid stat." };
  const idx = state.hands[id].findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, error: "Card not in your hand." };
  const card = state.hands[id][idx];
  state.hands[id].splice(idx, 1);
  state.activePlay = { card, stat };
  state.responses = {};
  state.lastResult = null;
  state.phase = "compare";
  log(state, `${nameOf(state, id)} plays a card face down.`);
  return { ok: true };
}

export function playAsResponder(state, id, cardId) {
  if (state.phase !== "compare") return { ok: false, error: "No round is open." };
  if (id === activePlayerId(state)) return { ok: false, error: "You are leading this round." };
  if (state.responses[id]) return { ok: false, error: "You already answered." };
  const idx = state.hands[id].findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, error: "Card not in your hand." };
  const card = state.hands[id][idx];
  state.hands[id].splice(idx, 1);
  state.responses[id] = card;
  const pending = state.order.length - 1 - Object.keys(state.responses).length;
  log(state, `${nameOf(state, id)} placed a card face down. (${pending} to go)`);
  if (pending <= 0) {
    resolveRound(state);
    return { ok: true, resolved: true };
  }
  return { ok: true, resolved: false };
}

export function resolveRound(state) {
  if (state.phase !== "compare") return;
  const { card: leadCard, stat } = state.activePlay;
  const cards = [leadCard, ...Object.values(state.responses)];
  const owners = [activePlayerId(state), ...Object.keys(state.responses)];
  const values = cards.map((c) => c[stat]);
  const min = Math.min(...values);
  const tied = owners.filter((id, i) => cards[i][stat] === min);

  // played cards simply vanish; the loser pulls 2 fresh cards from the deck
  state.lastResult = { played: cards, stat };

  if (tied.length > 1) {
    state.lastResult.loserId = null;
    state.lastResult.count = 0;
    log(state, `Tie on ${stat} (${min})! No one loses.`);
  } else {
    const loser = tied[0];
    const winnings = [drawFromDeck(), drawFromDeck()];
    state.lastResult.loserId = loser;
    state.lastResult.count = winnings.length;
    state.hands[loser].push(...winnings);
    log(state, `${nameOf(state, loser)} had the lowest ${stat} (${min}) and pulls 2 cards from the deck.`);
  }

  state.activePlay = null;
  state.responses = {};
  state.phase = "playing";

  checkForWinner(state);
  if (state.phase !== "finished") {
    advanceTurn(state);
    if (state.phase === "playing") {
      log(state, `${nameOf(state, activePlayerId(state))} leads the next round.`);
    }
  }
}

export function advanceTurn(state) {
  state.turnIndex = (state.turnIndex + 1) % state.order.length;
}

export function checkForWinner(state) {
  if (state.phase === "finished") return;
  const empties = state.players
    .map((p) => p.id)
    .filter((id) => state.hands[id].length === 0)
    .sort((a, b) => state.order.indexOf(a) - state.order.indexOf(b));
  if (empties.length) {
    state.winnerId = empties[0];
    state.phase = "finished";
    log(state, `${nameOf(state, state.winnerId)} emptied their hand and WINS!`);
  }
}

// Public, per-player view (hide other players' hands).
export function publicView(state, forPlayerId) {
  return {
    code: state.code,
    phase: state.phase,
    hostId: state.hostId,
    handSize: state.handSize,
    maxPlayers: state.maxPlayers,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      bot: p.bot,
      handCount: state.hands[p.id] ? state.hands[p.id].length : 0,
    })),
    order: state.order,
    turnIndex: state.turnIndex,
    activePlayerId: activePlayerId(state),
    deckCount: POOL_SIZE,
    // While a round is open the leader's card AND the challenged stat stay
    // hidden; each responder only sees their own card (others are placeholders).
    activePlay:
      state.activePlay && state.phase === "compare" ? { played: true } : state.activePlay,
    responses:
      state.phase === "compare"
        ? Object.fromEntries(
            Object.entries(state.responses).map(([id, card]) =>
              id === forPlayerId ? [id, card] : [id, { hidden: true }]
            )
          )
        : state.responses,
    lastResult: state.lastResult,
    winnerId: state.winnerId,
    log: state.log.slice(-12),
    myHand: state.hands[forPlayerId] || [],
    myId: forPlayerId,
  };
}