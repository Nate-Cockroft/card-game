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
  publicView,
} from "./game.js";
import { randomCode } from "./cards.js";

const ROOM_TTL = 1000 * 60 * 60 * 4; // rooms auto-expire after 4h idle

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map(); // playerId -> WebSocket
    this.game = null;
    // load any persisted game before serving requests
    this.ready = this.tryLoad();
  }

  async tryLoad() {
    const g = await this.state.storage.get("game");
    if (g) this.game = g;
  }

  async persist() {
    await this.state.storage.put("game", this.game);
    await this.state.storage.put("lastSeen", Date.now());
  }

  roomId() {
    return this.state.id.toString();
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    if (url.pathname === "/ws" && upgrade === "websocket") {
      const name = (url.searchParams.get("name") || "Player").slice(0, 16);
      const wantCreate = url.searchParams.get("create") === "1";
      const friendly = url.searchParams.get("room") || this.roomId();

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
      this.handleSession(server, name).catch((e) => {
        console.error("SESSION ERROR", e && e.stack ? e.stack : e);
        try {
          server.close(1011, "internal error");
        } catch {}
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("cardsgame room", { status: 200 });
  }

  async handleSession(server, name) {
    // register the player into the game
    const id = this.makeId();
    const res = addPlayer(this.game, id, name);
    if (!res.ok) {
      server.send(JSON.stringify({ type: "error", message: res.error }));
      server.close(4001, res.error);
      return;
    }
    this.connections.set(id, server);
    await this.persist();
    await this.syncLobby("open");
    this.broadcast();

    server.addEventListener("message", (event) => this.handleMessage(id, event.data));
    server.addEventListener("close", () => this.handleClose(id));
    server.addEventListener("error", () => this.handleClose(id));
  }

  async handleMessage(playerId, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
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

  async handleClose(playerId) {
    if (!this.game) return;
    const wasPresent = this.game.players.some((p) => p.id === playerId);
    if (wasPresent) {
      removePlayer(this.game, playerId);
    }
    this.connections.delete(playerId);
    // Evict humans whose sockets are gone (keeps players with live sockets, and all bots).
    for (const p of [...this.game.players]) {
      if (!p.bot && !this.connections.has(p.id)) removePlayer(this.game, p.id);
    }
    if (this.game.players.length <= 1 && this.game.phase !== "lobby") {
      this.game.phase = "finished";
      this.game.winnerId = this.game.players[0]?.id ?? null;
    }
    if (this.game.players.length === 0) {
      // no one left; wipe room data
      this.game = null;
      await this.state.storage.delete("game");
      await this.syncLobby("close");
      return;
    }
    await this.persist();
    await this.syncLobby("open");
    this.broadcast();
    this.autoPlayBots();
  }

  // If it's a bot's turn (or bots are waiting to respond), make their moves.
  autoPlayBots() {
    const g = this.game;
    if (!g || g.phase === "lobby" || g.phase === "finished") return;

    if (g.phase === "playing") {
      const active = activePlayerId(g);
      if (active && isBot(g, active)) {
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
      // every bot except the active leader that hasn't responded yet plays
      const active = activePlayerId(g);
      const pendingBots = g.players.filter((p) => p.bot && p.id !== active && !g.responses[p.id]);
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

  async syncLobby(action) {
    try {
      const stub = this.env.LOBBY.get(this.env.LOBBY.idFromName("global"));
      const res = await stub.fetch("https://lobby.internal/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, room: this.lobbyInfo() }),
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
    for (const [playerId, ws] of this.connections) {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "state", state: publicView(this.game, playerId) }));
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