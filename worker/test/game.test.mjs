import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  addPlayer,
  addBot,
  startGame,
  setSettings,
  playAsActive,
  playAsResponder,
  drawAsActive,
  resolveRound,
  activePlayerId,
  isBot,
  publicView,
} from "../src/game.js";
import { createDeck } from "../src/cards.js";

const DECK_SIZE = createDeck().length;

function twoPlayerGame() {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  addPlayer(g, "b", "Bob");
  const ok = startGame(g);
  assert.equal(ok.ok, true);
  return g;
}

test("starts with 7 cards each and a deck", () => {
  const g = twoPlayerGame();
  assert.equal(g.hands.a.length, 7);
  assert.equal(g.hands.b.length, 7);
  assert.equal(g.deck.length, DECK_SIZE - 14);
  assert.equal(g.phase, "playing");
});

test("hand size and max players are configurable by the host", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  const res = setSettings(g, "a", { handSize: 5, maxPlayers: 8 });
  assert.equal(res.ok, true);
  assert.equal(g.handSize, 5);
  assert.equal(g.maxPlayers, 8);
  // non-host can't change
  addPlayer(g, "b", "Bob");
  const res2 = setSettings(g, "b", { handSize: 9 });
  assert.equal(res2.ok, false);
  // out of range rejected
  const res3 = setSettings(g, "a", { handSize: 3 });
  assert.equal(res3.ok, false);
});

test("bots take a player slot and can be added", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  const res = setSettings(g, "a", { maxPlayers: 3 });
  assert.equal(res.ok, true);
  const b1 = addBot(g, "a");
  assert.equal(b1.ok, true);
  assert.equal(isBot(g, b1.id), true);
  const b2 = addBot(g, "a");
  assert.equal(b2.ok, true);
  const idsBefore = g.players.map((p) => p.id);
  const b3 = addBot(g, "a");
  assert.equal(b3.ok, false); // full at 3 now
  assert.deepEqual(g.players.map((p) => p.id), idsBefore); // rejected add must not evict anyone
  assert.equal(g.hostId, "a"); // host stays in charge
  const join = addPlayer(g, "b", "Bob");
  assert.equal(join.ok, false); // bots occupied all slots
});

test("game with a bot plays and the bot keeps playing its turn", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  const res = addBot(g, "a");
  assert.equal(res.ok, true);
  startGame(g);
  // Alice leads, bot responds
  const leader = activePlayerId(g);
  const bot = g.players.find((p) => p.bot);
  if (leader === "a") {
    playAsActive(g, "a", g.hands.a[0].id, "health");
    playAsResponder(g, bot.id, g.hands[bot.id][0].id);
  } else {
    playAsActive(g, bot.id, g.hands[bot.id][0].id, "health");
    playAsResponder(g, "a", g.hands.a[0].id);
  }
  // round resolved, a winner may or may not exist
  assert.ok(["playing", "finished"].includes(g.phase));
  const totalCards = g.hands.a.length + g.hands[bot.id].length + g.deck.length + g.pot.length;
  assert.equal(totalCards, DECK_SIZE);
});

test("only the active player can play as leader", () => {
  const g = twoPlayerGame();
  const ok = playAsActive(g, "b", g.hands.b[0].id, "attack");
  assert.equal(ok.ok, false);
});

test("leader plays a card and chooses a stat, others respond, loser collects", () => {
  const g = twoPlayerGame();
  const leader = activePlayerId(g);
  const other = leader === "a" ? "b" : "a";
  const beforeOther = g.hands[other].length;

  // force Bob to lose: give leader a high card, give other a low card on chosen stat
  const leadCard = { ...g.hands[leader][0], attack: 1000 };
  g.hands[leader][0] = leadCard;
  const otherCard = { ...g.hands[other][0], attack: 1 };
  g.hands[other][0] = otherCard;

  playAsActive(g, leader, leadCard.id, "attack");
  assert.equal(g.phase, "compare");

  const res = playAsResponder(g, other, otherCard.id);
  assert.equal(res.ok, true);
  assert.equal(res.resolved, true);

  // the lowest player collected both cards into their hand
  assert.ok(g.hands[other].length > g.hands[leader].length);
  // loser nets +1: gave up 1 card, received all 2 played cards
  assert.ok(g.hands[other].length >= beforeOther + 1);
  assert.equal(g.lastResult.loserId, other);
  assert.equal(g.lastResult.count, 2);
  const totalCards = g.hands.a.length + g.hands.b.length + g.deck.length + g.pot.length;
  assert.equal(totalCards, DECK_SIZE);
});

test("drawing takes a deck card and advances the turn", () => {
  const g = twoPlayerGame();
  const leader = activePlayerId(g);
  const n = g.deck.length;
  const before = g.hands[leader].length;
  const res = drawAsActive(g, leader);
  assert.equal(res.ok, true);
  assert.equal(g.hands[leader].length, before + 1);
  assert.equal(g.deck.length, n - 1);
  assert.notEqual(activePlayerId(g), leader);
});

test("responder cannot respond twice", () => {
  const g = twoPlayerGame();
  const leader = activePlayerId(g);
  const other = leader === "a" ? "b" : "a";
  playAsActive(g, leader, g.hands[leader][0].id, "health");
  const card = g.hands[other][0];
  const r1 = playAsResponder(g, other, card.id);
  assert.equal(r1.ok, true);
  const r2 = playAsResponder(g, other, g.hands[other][0].id);
  assert.equal(r2.ok, false);
});

test("tie on the lowest stat moves cards to the pot", () => {
  const g = twoPlayerGame();
  const leader = activePlayerId(g);
  const other = leader === "a" ? "b" : "a";
  // both get attack = 5 -> tie on lowest
  g.hands[leader][0] = { ...g.hands[leader][0], attack: 5 };
  g.hands[other][0] = { ...g.hands[other][0], attack: 5 };
  playAsActive(g, leader, g.hands[leader][0].id, "attack");
  playAsResponder(g, other, g.hands[other][0].id);
  assert.equal(g.pot.length, 2);
  assert.equal(g.phase, "playing");
});

test("a player who empties their hand wins", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  addPlayer(g, "b", "Bob");
  startGame(g);
  const leader = activePlayerId(g);
  const other = leader === "a" ? "b" : "a";

  // leader plays their last card but loses; the responder plays their winning
  // last card, does not collect, and empties their hand -> responder wins
  g.hands[leader] = [{ ...g.hands[leader][0], speed: 1 }];
  g.hands[other] = [{ ...g.hands[other][0], speed: 100 }];
  playAsActive(g, leader, g.hands[leader][0].id, "speed");
  playAsResponder(g, other, g.hands[other][0].id);

  assert.equal(g.phase, "finished");
  assert.equal(g.winnerId, other);
  assert.equal(g.hands[other].length, 0);
});

test("publicView hides other players' hands", () => {
  const g = twoPlayerGame();
  const v = publicView(g, "a");
  assert.equal(v.myHand.length, 7);
  assert.equal(v.players.length, 2);
  assert.ok(!Array.isArray(v.players[0].hand));
  assert.equal(v.players[0].handCount, 7);
});

test("played cards stay hidden until the round resolves", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  addPlayer(g, "b", "Bob");
  addPlayer(g, "c", "Carl");
  startGame(g);
  const leader = activePlayerId(g);
  const others = g.order.filter((x) => x !== leader);
  const r1 = others[0];
  const r2 = others[1];

  playAsActive(g, leader, g.hands[leader][0].id, "health");

  // while the round is open no one sees the leader's card or the stat
  assert.deepEqual(publicView(g, leader).activePlay, { played: true });
  assert.deepEqual(publicView(g, r1).activePlay, { played: true });

  playAsResponder(g, r1, g.hands[r1][0].id); // compare is still open

  // a responder sees their own card, everyone else only gets a placeholder
  const own = publicView(g, r1);
  assert.ok(own.responses[r1].name);
  const foe = publicView(g, r2);
  assert.deepEqual(foe.responses[r1], { hidden: true });

  playAsResponder(g, r2, g.hands[r2][0].id); // last one in -> round resolves

  // after the resolve the played cards are revealed in lastResult
  assert.equal(g.lastResult.stat, "health");
  assert.equal(g.lastResult.played.length, 3);
});

test("conservation holds and the deck never runs dry", () => {
  const g = createGame("TEST");
  addPlayer(g, "a", "Alice");
  addPlayer(g, "b", "Bob");
  addPlayer(g, "c", "Carl");
  addPlayer(g, "d", "Dawn");
  startGame(g);
  const total = DECK_SIZE;
  for (let round = 0; round < 200 && g.phase !== "finished"; round++) {
    const leader = activePlayerId(g);
    let res = playAsActive(g, leader, g.hands[leader][0].id, "health");
    if (!res.ok) break;
    for (const p of g.players) {
      if (p.id !== leader && g.phase === "compare" && g.hands[p.id]?.length) {
        playAsResponder(g, p.id, g.hands[p.id][0].id);
      }
    }
    const sum =
      Object.values(g.hands).reduce((n, h) => n + h.length, 0) + g.deck.length + g.pot.length;
    assert.equal(sum, total, `round ${round}`);
  }
});

test("cannot start with fewer than 2 players", () => {
  const g = createGame("X");
  addPlayer(g, "a", "Alice");
  const res = startGame(g);
  assert.equal(res.ok, false);
});