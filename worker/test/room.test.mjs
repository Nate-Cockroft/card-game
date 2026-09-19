import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../src/room.js";
import { createGame, addPlayer, addBot, startGame, playAsResponder, activePlayerId, publicView } from "../src/game.js";

function makeRoom() {
  const room = Object.create(Room.prototype);
  room.game = createGame("TEST");
  room.connections = new Map();
  room.state = {
    id: { toString: () => "test-room" },
    storage: { get: async () => undefined, put: async () => {}, delete: async () => {} },
  };
  room.env = {};
  room.persist = async () => {};
  return room;
}

// A bot that leads a round must not block the other bots from responding.
test("bot leader does not deadlock bot responses", () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addBot(g, "p1");
  addBot(g, "p1");
  assert.equal(startGame(g).ok, true);

  const bots = g.players.filter((p) => p.bot).map((p) => p.id);
  g.turnIndex = g.order.indexOf(bots[0]);

  room.autoPlayBots();
  assert.equal(g.phase, "compare", "bot leader should open a round");
  const leader = activePlayerId(g);
  assert.equal(leader, bots[0]);

  room.autoPlayBots();
  assert.equal(g.responses[leader], undefined, "leader must not be recorded as a responder");
  assert.ok(g.responses[bots[1]], "the other bot should have responded");
});

// Once the lone human responds too, the round resolves and lastResult is exposed.
test("round resolves when the last human responds after bot moves", () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addBot(g, "p1");
  addBot(g, "p1");
  startGame(g);
  const bots = g.players.filter((p) => p.bot).map((p) => p.id);
  g.turnIndex = g.order.indexOf(bots[0]);

  room.autoPlayBots();
  room.autoPlayBots();
  const humanCard = g.hands["p1"][0];
  const res = playAsResponder(g, "p1", humanCard.id);
  assert.equal(res.ok, true);

  assert.ok(g.lastResult, "lastResult should be set after a resolve");
  assert.equal(typeof g.lastResult.count, "number");
  assert.ok(["playing", "finished"].includes(g.phase));

  const view = publicView(g, "p1");
  assert.deepEqual(view.lastResult, g.lastResult, "publicView should expose lastResult");
});
