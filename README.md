# Sequence Multiplayer

A real-time, browser-based version of the Sequence board game. Play with 2–4
people, each on their own device, connected over the internet through a
shared room code.

## What's in this project

- **Frontend:** React 19 + Tailwind, built with Vite
- **Backend:** Express + Socket.IO (single Node process serves both the API and the built frontend)
- **No database** — game state lives in server memory. Rooms are cleaned up automatically ~10 minutes after everyone leaves.

## Run locally

**Prerequisites:** Node.js 18.18+

```bash
npm install
npm run dev
```

This starts the server (with Vite in middleware mode for hot reload) at
`http://localhost:3000`. Open it in two browser tabs (or two devices on the
same network hitting your machine's LAN IP) to test with multiple players.

## Playing across devices

1. One person opens the deployed URL, enters a name, and either types a room
   code or leaves it blank to make one up (e.g. `FAMILY1`).
2. After joining, click **Copy invite link** in the sidebar — this copies a
   URL with `?room=CODE` pre-filled.
3. Send that link to the other players. When they open it, the room code is
   already filled in — they just enter their name and hit **Join Game**.
4. Once 2–4 players have joined, anyone can click **Start Game**.

If someone's connection drops mid-game, their seat and hand are preserved —
reopening the same link on the same browser reconnects them automatically.
If they're gone for good, any other connected player can click **Skip their
turn** to keep the game moving.

## Deploying

This is a single Node service — deploy it anywhere that runs Node 18+.

### Option A: Docker (recommended)

```bash
docker build -t sequence-multiplayer .
docker run -p 3000:3000 sequence-multiplayer
```

Works as-is on Render, Railway, Fly.io, or any container host. Most of these
platforms inject `PORT` automatically — the server reads `process.env.PORT`
and falls back to `3000`.

### Option B: Plain Node

```bash
npm install
npm run build      # builds the frontend into dist/
npm start          # runs the server in production mode
```

### Environment variables

See `.env.example`:

- `PORT` — defaults to `3000`. Usually set automatically by your host.
- `CORS_ORIGIN` — defaults to `*`. Only needs to be set if you ever split the
  frontend and backend into separate deployments; leave it alone for the
  default single-service setup.

Because the frontend is served from the same origin as the Socket.IO server,
players just need the one deployed URL — no separate frontend hosting, no
manual CORS configuration, and every device that opens the link connects to
the same shared game state.
