import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  addPlayer,
  startGame,
  playAsActive,
  playAsResponder,
  drawAsActive,
  resolveRound,
  activePlayerId,
  publicView,
} from "../src/game.js";

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
  assert.equal(g.deck.length, 52 - 14);
  assert.equal(g.phase, "playing");
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
  const totalCards = g.hands.a.length + g.hands.b.length + g.deck.length + g.pot.length;
  assert.equal(totalCards, 52);
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

test("cannot start with fewer than 2 players", () => {
  const g = createGame("X");
  addPlayer(g, "a", "Alice");
  const res = startGame(g);
  assert.equal(res.ok, false);
});