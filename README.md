# Stat Clash

A multiplayer online card game — **Top Trumps mixed with Uno**.

Each card has 4 stats: **Health, Speed, Attack, Defense**. Everyone starts with 7 cards (host can choose 5–9). On your turn you place one card and pick a stat, then every other player places a card face-down. The player with the **lowest** value on the chosen stat *loses* and pulls **2 random cards** out of the magical deck — played cards just vanish. You can also pull a card from the deck instead of playing. First player to empty their hand wins. The deck is infinite: you can always pull any card out of it.

Lobbies are listed in the app — no room codes to type. The host can add bots (that pick random cards/stats), cap players at 2–8, and start whenever the lobby has at least 2 (humans + bots).

Dropped connections are forgiven for ~20 seconds: your seat is kept, the other
players see you as "reconnecting…", and reconnecting over the same link quietly
re-attaches you in place. After that window the seat is released. Lobbies (and
robot-only games) that end up with **zero people** disintegrate on their own —
the room data is deleted and the listing disappears.

- Server-authoritative game logic runs in a **Cloudflare Worker (Durable Object)** — one DO per room, so players can't cheat.
- Static UI is served by **GitHub Pages**.

## Layout

```
public/              static client (GitHub Pages)
worker/              Cloudflare Worker + Durable Object rooms
  src/game.js        pure game rules (unit-tested)
  src/cards.js       absurd-card deck, stat generation, limits
  src/room.js        websocket room Durable Object (host, bots, settings)
  src/lobby.js       lobby directory Durable Object (room list)
  test/              node:test suite
.github/workflows/   auto-deploy client to Pages + worker on every push
```

## Run locally

```bash
cd worker
npm install
npx wrangler dev
```

Then open `public/index.html` in a browser with a static server, e.g. `npx serve public`, and set `WORKER_URL = "http://localhost:8787"` in `public/app.js`. Play in two browser tabs.

## Deploy the Worker

```bash
cd worker
npm install
npx wrangler deploy   # prints your workers.dev URL
```

Put that URL into `public/app.js`:

```js
const WORKER_URL = "https://cardsgame-worker.YOUR-SUBDOMAIN.workers.dev";
```

## Deploy the client to GitHub Pages

1. Push this repo to GitHub with the default branch named `main`.
2. In the repo → **Settings → Pages → Source: GitHub Actions**.
3. Push a commit; the `.github/workflows/pages.yml` workflow builds and publishes `public/`.

Share links look like `https://YOUR-USER.github.io/STAT-CLASH-REPO/`.

## Auto-deploy: push to update (cards, rules, UI)

Two GitHub Actions run automatically on every push to `main`:

- `.github/workflows/pages.yml` — publishes the client to GitHub Pages.
- `.github/workflows/deploy-worker.yml` — runs the tests, then deploys the Worker
  with `npx wrangler deploy`. Add the two repo secrets to enable it:

  - `CLOUDFLARE_API_TOKEN` — an API token with *Workers Scripts: Edit* and
    *Account Settings: Read* permissions
  - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account id (shown by `wrangler whoami`)

### Adding new cards (start to finish)

1. Open `worker/src/cards.js` and add one line to `CARD_TEMPLATES`:

```js
["Mythril Unicorn", "🦄"],   // any unique name + emoji
```

2. `git add -A && git commit -m "add mythril unicorn" && git push`
3. Done. The workflow installs deps, runs the test suite, then deploys the Worker.
   The client needs **no** rework — cards are rendered from server state, so new
   cards appear in games immediately after deploy.

Notes:

- Card stats are derived deterministically from the card **name**, so inserting,
  removing, or reordering cards never changes existing cards' stats.
- If you change rules in `worker/src/game.js`, add a unit test in
  `worker/test/game.test.mjs` — the workflow refuses to deploy failing tests.

## Protocol

Clients open a WebSocket to `/lobby` to receive the list of open rooms, and create/join a room via `/ws?room=<ID>&name=<NAME>[&create=1]` (the host generates the ID; players join by clicking a lobby entry or the invite link — codes are never shown). Reconnecting to a seat you already hold is done with `/ws?...&reconnectId=<myId>`. All messages are JSON:

- C→S `{"type":"start"}` — host starts the game (needs ≥2 players, bots included)
- C→S `{"type":"settings","handSize":5..9,"maxPlayers":2..8}` — host sets lobby options
- C→S `{"type":"packs","enabledPacks":["space","politicians",...]}` — host toggles card packs on/off (disabled packs' cards can't be drawn; at least one pack must stay on)
- C→S `{"type":"addBot"}` — host adds a bot
- C→S `{"type":"play","asLeader":true,"cardId":..,"stat":..}` — leader plays
- C→S `{"type":"play","asLeader":false,"cardId":..}` — responder answers
- C→S `{"type":"draw"}` — leader draws instead of playing
- S→C `{"type":"state","state":{...}}` — full public view; each client only sees its own hand. State carries `packs` (the 13 packs with counts + `enabled` flags) and `deckCount` (card types in the currently enabled packs)
- S→C `{"type":"lobbies","lobbies":[...]}` — room directory via the `/lobby` socket

Bots are server-driven: when it's a bot's play window the worker auto-plays a random card and stat (only the human-relevant plays are sent to the client). Rooms auto-expire after 4 hours idle and are swept from the directory after 30 minutes without activity.