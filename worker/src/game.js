import { createDeck, shuffle, HAND_SIZE, MAX_PLAYERS, isStat } from "./cards.js";

export function createGame(code) {
  return {
    code,
    phase: "lobby", // lobby | playing | compare | finished
    hostId: null,
    players: [], // [{id, name}]
    order: [], // fixed seat order of player ids
    turnIndex: 0,
    hands: {}, // id -> [card, ...]
    deck: [], // remaining cards
    activePlay: null, // {card, stat} from the active player
    responses: {}, // playerId -> card chosen during compare
    pot: [], // accumulated cards from tied rounds
    winnerId: null,
    log: [],
  };
}

function log(state, msg) {
  state.log.push(msg);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

export function activePlayerId(state) {
  if (state.order.length === 0) return null;
  return state.order[state.turnIndex % state.order.length];
}

export function addPlayer(state, id, name) {
  if (state.phase !== "lobby") return { ok: false, error: "Game already started." };
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: "Room is full." };
  if (state.players.some((p) => p.id === id)) return { ok: false, error: "Already joined." };
  state.players.push({ id, name });
  state.order.push(id);
  state.hands[id] = [];
  if (!state.hostId) state.hostId = id;
  log(state, `${name} joined. (${state.players.length}/${MAX_PLAYERS})`);
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
  if (state.hostId === id) state.hostId = state.players[0].id;
  if (wasActive && state.phase !== "lobby") state.phase = "playing";
  // walk turn to a sensible spot
  state.turnIndex = Math.min(state.turnIndex, state.order.length - 1);
  log(state, `${player.name} left the game.`);
}

export function startGame(state) {
  if (state.phase !== "lobby") return { ok: false, error: "Game already started." };
  if (state.players.length < 2) return { ok: false, error: "Need at least 2 players." };
  const cards = shuffle(createDeck());
  state.deck = cards.slice(HAND_SIZE * state.players.length);
  state.players.forEach((p, i) => {
    state.hands[p.id] = cards.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE);
  });
  state.phase = "playing";
  state.turnIndex = 0;
  log(state, "Game started! Everyone got 7 cards.");
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
  if (!state.deck.length) return { ok: false, error: "The deck is empty." };
  const card = state.deck.pop();
  state.hands[id].push(card);
  log(state, `${nameOf(state, id)} drew ${card.emoji} ${card.name} from the deck.`);
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
  state.phase = "compare";
  log(state, `${nameOf(state, id)} plays ${card.emoji} ${card.name} and challenges ${stat}!`);
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

  if (tied.length > 1) {
    state.pot.push(...cards);
    state.activePlay = null;
    state.responses = {};
    state.phase = "playing";
    log(state, `Tie on ${stat} (${min})! No one loses. Cards move to the pot.`);
  } else {
    const loser = tied[0];
    const winnings = [...cards, ...state.pot];
    state.pot = [];
    state.hands[loser].push(...winnings);
    log(state, `${nameOf(state, loser)} had the lowest ${stat} (${min}) and collects ${
      winnings.length
    } card(s) to their hand.`);
    state.activePlay = null;
    state.responses = {};
    state.phase = "playing";
  }

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
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: state.hands[p.id] ? state.hands[p.id].length : 0,
    })),
    order: state.order,
    turnIndex: state.turnIndex,
    activePlayerId: activePlayerId(state),
    deckCount: state.deck.length,
    activePlay: state.activePlay,
    responses: state.responses, // card objects of all responses (hidden from hand views)
    potCount: state.pot.length,
    winnerId: state.winnerId,
    log: state.log.slice(-12),
    myHand: state.hands[forPlayerId] || [],
    myId: forPlayerId,
  };
}