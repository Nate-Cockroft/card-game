import { randomCode } from "./cards.js";
import { Room } from "./room.js";

export { Room };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      // if no code is supplied, hand out a fresh one
      let code = (url.searchParams.get("code") || "").toUpperCase();
      if (!code) code = randomCode();
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      const forward = new URL(request.url);
      forward.searchParams.set("code", code);
      return stub.fetch(new Request(forward, request));
    }

    return new Response("cardsgame worker", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};