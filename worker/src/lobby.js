// Singleton Durable Object that tracks all open rooms and pushes the list
// to every connected client, so players can browse & join without codes.

const ENTRY_TTL_MS = 1000 * 60 * 30; // rooms vanish from the list after 30min of no updates

export class Lobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.rooms = new Map(); // id -> { room info, ts }
    this.ws = new Set(); // live client sockets for the lobby list
  }

  async ensureLoaded() {
    if (this.rooms.size === 0) {
      const saved = await this.state.storage.get("rooms");
      if (saved) this.rooms = new Map(Object.entries(saved));
    }
  }

  async save() {
    await this.state.storage.put("rooms", Object.fromEntries(this.rooms));
  }

  // Drop entries for rooms that vanished, emptied, or went quiet.
  sweep(now = Date.now()) {
    let changed = false;
    for (const [id, entry] of this.rooms) {
      if (entry.room && entry.room.count === 0) {
        this.rooms.delete(id);
        changed = true;
      } else if (now - (entry.ts || 0) > ENTRY_TTL_MS) {
        this.rooms.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/update") {
      await this.ensureLoaded();
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("bad body", { status: 400 });
      }
      const room = body.room;
      if (body.action === "close" || !room || room.count === 0) {
        const id = room?.id;
        if (id && this.rooms.has(id)) {
          this.rooms.delete(id);
          await this.save();
        }
      } else if (room.phase === "lobby") {
        this.rooms.set(room.id, { room, ts: Date.now() });
        await this.save();
      } else if (this.rooms.has(room.id)) {
        // game started; hide it from the join list
        this.rooms.delete(room.id);
        await this.save();
      }
      if (this.sweep()) await this.save();
      this.notify();
      return new Response("ok");
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.ws.add(server);
      await this.ensureLoaded();
      if (this.sweep()) await this.save();
      this.sendLobbyList(server);
      server.addEventListener("close", () => this.ws.delete(server));
      server.addEventListener("error", () => this.ws.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("lobby", { status: 200 });
  }

  sendLobbyList(ws) {
    if (ws.readyState !== 1) return;
    const list = [...this.rooms.values()]
      .map((e) => e.room)
      .sort((a, b) => (a.count - b.count) || (a.id < b.id ? -1 : 1));
    ws.send(JSON.stringify({ type: "lobbies", lobbies: list }));
  }

  notify() {
    for (const ws of this.ws) this.sendLobbyList(ws);
  }
}