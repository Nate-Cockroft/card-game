import {
  createGame,
  addPlayer,
  removePlayer,
  startGame,
  playAsActive,
  playAsResponder,
  drawAsActive,
  publicView,
} from "./game.js";

const ROOM_TTL = 1000 * 60 * 60 * 4; // rooms auto-expire after 4h idle

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map(); // playerId -> WebSocket
    this.game = null;
    // if there was a persisted game, load it
    this.tryLoad();
  }

  async tryLoad() {
    const g = await this.state.storage.get("game");
    if (g) this.game = g;
  }

  async persist() {
    await this.state.storage.put("game", this.game);
    await this.state.storage.put("lastSeen", Date.now());
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade");

    if (url.pathname === "/ws" && upgrade === "websocket") {
      const name = (url.searchParams.get("name") || "Player").slice(0, 16);
      const wantCreate = url.searchParams.get("create") === "1";

      if (!this.game) {
        if (!wantCreate) return new Response("Room not found", { status: 404 });
        this.game = createGame(url.searchParams.get("code") || "");
        await this.persist();
      } else if (wantCreate && this.game.phase === "lobby") {
        // creating into an existing empty lobby is fine (picked the same code)
      } else if (wantCreate) {
        return new Response("Room code taken", { status: 409 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.handleSession(server, name);
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
    this.broadcast();

    server.addEventListener("message", (event) => this.handleMessage(id, event.data));
    server.addEventListener("close", () => this.handleClose(id));
    server.addEventListener("error", () => this.handleClose(id));
  }

  handleMessage(playerId, raw) {
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
  }

  async handleClose(playerId) {
    if (!this.game) return;
    const wasPresent = this.game.players.some((p) => p.id === playerId);
    if (wasPresent) {
      removePlayer(this.game, playerId);
      if (this.game.phase === "compare") {
        // someone vanished mid-round: if everyone left has responded, resolve
        const leader = this.game.order[this.game.turnIndex % this.game.order.length];
        if (this.game.players.length <= 1) {
          this.game.phase = "finished";
          this.game.winnerId = this.game.players[0]?.id ?? null;
        }
      }
    }
    this.connections.delete(playerId);
    if (this.game.players.length === 0) {
      // no one left; wipe room data
      this.game = null;
      await this.state.storage.delete("game");
      return;
    }
    await this.persist();
    this.broadcast();
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