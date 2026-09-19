import { Room } from "./room.js";
import { Lobby } from "./lobby.js";

export { Room, Lobby };

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error("WORKER ERROR", e && e.stack ? e.stack : e);
      return new Response("worker error", { status: 500 });
    }
  },
};

async function route(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/lobby" ) {
      const stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
      return stub.fetch(request);
    }

    if (url.pathname === "/ws") {
      // clients come here after picking a lobby from the list
      const room = url.searchParams.get("room");
      if (!room) return new Response("Missing room", { status: 400 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
      const forward = new URL(request.url);
      forward.searchParams.set("room", room);
      return stub.fetch(new Request(forward, request));
    }

    return new Response("cardsgame worker", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
}