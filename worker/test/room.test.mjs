import { test } from "node:test";
import assert from "node:assert/strict";
import { Room } from "../src/room.js";
import { createGame, addPlayer, addBot, startGame, playAsResponder, activePlayerId, publicView } from "../src/game.js";

function makeRoom() {
  const room = Object.create(Room.prototype);
  room.game = createGame("TEST");
  room.connections = new Map();
  room.away = new Map();
  room.finishedAt = null;
  room.lastSeen = Date.now();
  room.state = {
    id: { toString: () => "test-room" },
    storage: {
      get: async () => undefined,
      put: async () => {},
      delete: async () => {},
      deleteMulti: async () => {},
      deleteAlarm: async () => {},
      setAlarm: async () => {},
    },
  };
  room.env = {};
  room.persist = async () => {};
  room.syncLobby = async () => {};
  return room;
}

function fakeSocket() {
  const events = new Map();
  return {
    readyState: 1,
    send() {},
    close() {},
    accept() {},
    addEventListener(type, fn) {
      events.set(type, fn);
    },
    _emit(type, data) {
      const fn = events.get(type);
      if (fn) fn(data);
    },
  };
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

// A human's seat is held within the grace window so a transient drop can rejoin.
test("a held seat survives within the grace period", async () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addPlayer(g, "p2", "Kim");
  startGame(g);
  room.away.set("p1", Date.now());
  await room.sweepAway();
  assert.ok(room.game, "game still lives");
  assert.ok(g.players.some((p) => p.id === "p1"), "seat held within grace");
  assert.ok(room.away.has("p1"), "still marked away, not evicted");
});

// After the grace lapses the seat is evicted for good.
test("an away seat is evicted after the grace period", async () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addPlayer(g, "p2", "Kim");
  startGame(g);
  room.away.set("p1", Date.now() - 30_000);
  await room.sweepAway();
  assert.ok(!g.players.some((p) => p.id === "p1"), "gone after grace");
  assert.ok(!room.away.has("p1"));
});

// Reconnecting to a still-held seat reattaches instead of creating a new player.
test("reconnecting to a held seat reattaches without adding a player", async () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addPlayer(g, "p2", "Kim");
  startGame(g);
  room.away.set("p1", Date.now() - 5000);
  const before = g.players.length;
  const socket = fakeSocket();
  await room.handleSession(socket, "Human", "p1");
  assert.equal(g.players.length, before, "no duplicate seat");
  assert.equal(room.connections.get("p1"), socket, "socket reattached");
  assert.ok(!room.away.has("p1"), "no longer away");
});

// A lobby whose last human left (even with bots around) disintegrates.
test("a lobby with zero humans disintegrates", async () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addBot(g, "p1");
  assert.equal(g.players.filter((p) => !p.bot).length, 1);
  room.away.set("p1", Date.now() - 30_000);
  let closed = false;
  room.syncLobby = async () => {
    closed = true;
  };
  await room.sweepAway();
  assert.equal(room.game, null, "room disintegrated");
  assert.ok(closed, "lobby directory notified");
});

// A started game whose last human leaves (bots left) disintegrates too.
test("a started game with only bots left disintegrates", async () => {
  const room = makeRoom();
  const g = room.game;
  addPlayer(g, "p1", "Human");
  addBot(g, "p1");
  startGame(g);
  assert.equal(g.phase, "playing");
  room.away.set("p1", Date.now() - 30_000);
  await room.sweepAway();
  assert.equal(room.game, null, "room disintegrated");
});
