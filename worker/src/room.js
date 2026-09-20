import {
  createGame,
  addPlayer,
  addBot,
  removePlayer,
  startGame,
  setSettings,
  playAsActive,
  playAsResponder,
  drawAsActive,
  isBot,
  activePlayerId,
  playerById,
  log,
  publicView,
} from "./game.js";
import { randomCode } from "./cards.js";

const ROOM_TTL = 1000 * 60 * 60 * 4; // live rooms expire after 4h idle
const GRACE_MS = 1000 * 20; // a human's seat is held for this long after their socket dies
const FINISHED_TTL = 1000 * 60 * 2; // finished rooms disintegrate shortly after the final round

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map(); // playerId -> WebSocket
    this.away = new Map(); // playerId -> disconnect timestamp (humans with a held seat)
    this.game = null;
    this.lastSeen = Date.now();
    this.finishedAt = null;
    // load any persisted game before serving requests
    this.ready = this.tryLoad();
  }

  async tryLoad() {
    const [g, away, lastSeen] = await Promise.all([
      this.state.storage.get("game"),
      this.state.storage.get("away"),
      this.state.storage.get("lastSeen"),
    ]);
    if (g) this.game = g;
    if (away) this.away = new Map(Object.entries(away));
    if (lastSeen) this.lastSeen = lastSeen;
    if (this.game && this.game.phase === "finished") this.finishedAt = this.lastSeen;
    await this.scheduleSweep();
  }

  roomId() {
    return this.state.id.toString();
  }

  hasHumans(g) {
    return (g || this.game).players.some((p) => !p.bot);
  }

  async persist() {
    if (!this.game) return;
    if (this.game.phase === "finished" && !this.finishedAt) this.finishedAt = Date.now();
    this.lastSeen = Date.now();
    await Promise.all([
      this.state.storage.put("game", this.game),
      this.state.storage.put("lastSeen", this.lastSeen),
      this.state.storage.put("away", Object.fromEntries(this.away)),
    ]);
    await this.scheduleSweep();
  }

  // Arm a single DO alarm for the earliest pending cleanup: an away seat whose
  // grace is about to lapse, a finished room's purge, or a 4h-idle room.
  async scheduleSweep() {
    const now = Date.now();
    let next = Infinity;
    for (const ts of this.away.values()) next = Math.min(next, ts + GRACE_MS);
    if (this.game && this.game.phase === "finished" && this.finishedAt) {
      next = Math.min(next, this.finishedAt + FINISHED_TTL);
    }
    next = Math.min(next, this.lastSeen + ROOM_TTL);
    await this.state.storage.setAlarm(now + Math.max(1000, next - now));
  }

  // Wipe the room for good: drop memory, storage, the lobby entry and any alarm.
  async disintegrate() {
    if (!this.game) return;
    const info = this.lobbyInfo(); // captured before the game is cleared
    this.game = null;
    this.away.clear();
    this.finishedAt = null;
    this.connections.clear();
    try {
      await this.state.storage.deleteMulti(["game", "lastSeen", "away"]);
    } catch {}
    try {
      await this.state.storage.deleteAlarm();
    } catch {}
    await this.syncLobby("close", info);
  }

  // Expire away-seats whose grace lapsed, and disintegrate rooms that no longer
  // have (or need) any humans: empty lobbies, all-bot games, finished rooms.
  async sweepAway() {
    const g = this.game;
    if (!g) return false;
    const now = Date.now();
    let changed = false;
    for (const [id, ts] of [...this.away]) {
      if (now - ts >= GRACE_MS) {
        this.away.delete(id);
        removePlayer(g, id);
        changed = true;
      }
    }

    if (g.phase === "lobby") {
      if (!g.players.some((p) => !p.bot)) {
        await this.disintegrate(); // a lobby with zero people disintegrates
        return true;
      }
    } else if (g.phase === "finished") {
      if (now - (this.finishedAt || now) >= FINISHED_TTL) {
        await this.disintegrate();
        return true;
      }
    } else if (!g.players.some((p) => !p.bot)) {
      // no humans left mid-game; bots shouldn't roll on forever
      await this.disintegrate();
      return true;
    }

    if (g.players.length === 1 && g.phase !== "lobby") {
      g.phase = "finished";
      g.winnerId = g.players[0]?.id ?? null;
      this.finishedAt = Date.now();
      changed = true;
    }

    if (changed) {
      await this.persist();
      this.broadcast();
      this.autoPlayBots();
    }
    return changed;
  }

  // DO alarm fires when a sweep is due.
  async alarm() {
    await this.ready;
    await this.sweepAway();
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    if (url.pathname === "/ws" && upgrade === "websocket") {
      const name = (url.searchParams.get("name") || "Player").slice(0, 16);
      const wantCreate = url.searchParams.get("create") === "1";
      const reconnectId = url.searchParams.get("reconnectId") || null;
      const friendly = url.searchParams.get("room") || this.roomId();

      await this.sweepAway(); // expire lapsed seats / disintegrate before accepting

      if (!this.game) {
        if (!wantCreate) {
          await this.syncLobby("close"); // prune stale directory entries
          return new Response("Room not found", { status: 404 });
        }
        this.game = createGame(friendly.slice(0, 12));
        await this.persist();
        await this.syncLobby("open");
      } else if (wantCreate && this.game.phase === "lobby") {
        // creating into an existing empty lobby is fine (picked the same code)
      } else if (wantCreate) {
        return new Response("Room code taken", { status: 409 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server, name, reconnectId).catch((e) => {
        console.error("SESSION ERROR", e && e.stack ? e.stack : e);
        try {
          server.close(1011, "internal error");
        } catch {}
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("cardsgame room", { status: 200 });
  }

  async handleSession(server, name, reconnectId) {
    // A human reconnecting to a still-held seat reattaches instead of joining new.
    if (reconnectId && this.game) {
      const seat = playerById(this.game, reconnectId);
      if (seat && !seat.bot) {
        const id = reconnectId;
        this.away.delete(id);
        this.connections.set(id, server);
        if (this.game.phase !== "lobby") {
          log(this.game, `${seat.name} reconnected.`);
        }
        this.attachSocket(id, server);
        await this.persist();
        await this.syncLobby("open");
        this.broadcast();
        this.autoPlayBots();
        return;
      }
    }

    // fresh join
    const id = this.makeId();
    const res = addPlayer(this.game, id, name);
    if (!res.ok) {
      server.send(JSON.stringify({ type: "error", message: res.error }));
      server.close(4001, res.error);
      return;
    }
    this.connections.set(id, server);
    this.attachSocket(id, server);
    await this.persist();
    await this.syncLobby("open");
    this.broadcast();
  }

  attachSocket(id, server) {
    server.addEventListener("message", (event) => this.handleMessage(id, event.data));
    server.addEventListener("close", () => this.handleClose(id, server));
    server.addEventListener("error", () => this.handleClose(id, server));
  }

  async handleMessage(playerId, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    await this.sweepAway();
    if (!this.game) return;

    switch (msg.type) {
      case "start":
        if (this.game.hostId !== playerId) {
          this.sendTo(playerId, { type: "error", message: "Only the host can start." });
          return;
        }
        {
          const res = startGame(this.game);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        }
        await this.syncLobby("open");
        break;

      case "settings":
        if (this.game.hostId !== playerId) {
          this.sendTo(playerId, { type: "error", message: "Only the host can change settings." });
          return;
        }
        {
          const res = setSettings(this.game, playerId, msg);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        }
        await this.syncLobby("open");
        break;

      case "addBot":
        {
          const res = addBot(this.game, playerId);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        }
        await this.syncLobby("open");
        break;

      case "play":
        if (msg.asLeader) {
          const res = playAsActive(this.game, playerId, msg.cardId, msg.stat);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        } else {
          const res = playAsResponder(this.game, playerId, msg.cardId);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        }
        break;

      case "draw":
        {
          const res = drawAsActive(this.game, playerId);
          if (!res.ok) {
            this.sendTo(playerId, { type: "error", message: res.error });
            return;
          }
        }
        break;

      default:
        return;
    }
    this.persist();
    this.broadcast();
    this.autoPlayBots();
  }

  // A socket died. Humans hold their seat for a short grace so transient drops
  // can reconnect in place; after the grace, sweepAway evicts them for good.
  async handleClose(playerId, server) {
    if (!this.game) return;
    if (this.connections.get(playerId) !== server) return; // a stale, already-replaced socket
    const p = playerById(this.game, playerId);
    if (p && !p.bot) {
      this.away.set(playerId, Date.now());
      log(this.game, `${p.name} disconnected — seat held briefly.`);
    }
    this.connections.delete(playerId);
    await this.persist();
    this.broadcast();
    this.autoPlayBots();
  }

  // If it's a bot's turn (or a held human seat's), or bots are waiting to
  // respond, make their moves so the game never stalls.
  autoPlayBots() {
    const g = this.game;
    if (!g || g.phase === "lobby" || g.phase === "finished") return;
    const heldSeat = (id) => this.away.has(id);

    if (g.phase === "playing") {
      const active = activePlayerId(g);
      if (active && (isBot(g, active) || heldSeat(active))) {
        const hand = g.hands[active];
        if (hand.length) {
          const card = hand[Math.floor(Math.random() * hand.length)];
          const stat = ["health", "speed", "attack", "defense"][Math.floor(Math.random() * 4)];
          const res = playAsActive(g, active, card.id, stat);
          if (res.ok) {
            this.persist();
            this.broadcast();
            this.autoPlayBots();
          }
        }
      }
      return;
    }

    if (g.phase === "compare") {
      const active = activePlayerId(g);
      const pendingBots = g.players.filter(
        (p) => (p.bot || heldSeat(p.id)) && p.id !== active && !g.responses[p.id]
      );
      const bot = pendingBots[0];
      if (bot && g.hands[bot.id]?.length) {
        const card = g.hands[bot.id][Math.floor(Math.random() * g.hands[bot.id].length)];
        const res = playAsResponder(g, bot.id, card.id);
        if (res.ok) {
          this.persist();
          this.broadcast();
          this.autoPlayBots();
        }
      }
    }
  }

  async syncLobby(action, room) {
    try {
      const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
      const res = await stub.fetch("https://lobby.internal/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, room: room || this.lobbyInfo() }),
      });
      if (!res.ok) console.error("LOBBY SYNC FAIL", res.status);
    } catch (e) {
      console.error("LOBBY SYNC ERROR", e && e.message);
    }
  }

  lobbyInfo() {
    const g = this.game;
    if (!g) return null;
    return {
      id: g.code,
      host: g.hostId ? playerById(g, g.hostId)?.name : null,
      count: g.players.length,
      humans: g.players.filter((p) => !p.bot).length,
      maxPlayers: g.maxPlayers,
      handSize: g.handSize,
      phase: g.phase,
      code: g.code,
    };
  }

  broadcast() {
    if (!this.game) return;
    for (const [playerId, ws] of this.connections) {
      if (ws.readyState === 1) {
        const view = publicView(this.game, playerId);
        view.players.forEach((p) => (p.away = this.away.has(p.id)));
        ws.send(JSON.stringify({ type: "state", state: view }));
      }
    }
  }

  sendTo(playerId, obj) {
    const ws = this.connections.get(playerId);
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  makeId() {
    return "p" + Math.random().toString(36).slice(2, 10);
  }
}

export { randomCode };