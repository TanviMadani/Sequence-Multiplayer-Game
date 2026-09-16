<div align="center">

# ♠️ Sequence Multiplayer ♥️

**A real-time, cross-platform multiplayer web adaptation of the classic Sequence board game.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://sequence-multiplayer-game-production.up.railway.app)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.8-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)

<br />

### 🌐 [Play Live on Railway → sequence-multiplayer-game-production.up.railway.app](https://sequence-multiplayer-game-production.up.railway.app)

</div>

---

## 🎯 Overview

**Sequence Multiplayer** brings the beloved board-and-card strategy game to any screen. Play with 2 to 4 friends across laptops, tablets, and mobile phones with zero app installation needed. Create or join a private room with a simple code, share the invite link, and compete to build horizontal, vertical, or diagonal sequences of 5 chips on the board!

---

## ✨ Features

- ⚡ **Real-Time Multiplayer:** Built on WebSockets via Socket.IO with instantaneous move broadcasting and low-latency state synchronization.
- 📱 **Adaptive Screen-Fit Architecture:**
  - **Desktop (Landscape View):** Symmetrical 3-column layout (Room & Players on Left, 10x10 Landscape Board in Center, Player's Hand on Right) with **zero page scrolling**.
  - **Mobile (Vertical View):** Compact top bar, responsive 1:1 square board filling screen width, and touch-friendly bottom card dock.
- 🃏 **Complete Sequence Game Logic:**
  - Standard 10x10 board with 4 wildcard corner stars.
  - **Two-Eyed Jacks (♣ & ♦):** Wild cards that can be placed on any open space.
  - **One-Eyed Jacks (♥ & ♠):** Removal cards that can eliminate an opponent's unlocked chip.
  - **Sequence Locking & Trophy Markers:** Completed sequences lock into place so they cannot be removed.
- 🔄 **Smart Reconnection & State Preservation:** Persistent player identity (`localStorage` UUID) ensures seamless reconnection during brief network disconnects or page reloads without losing seats or hands.
- ⏭️ **Turn Skip Fallback:** Connected players can vote to skip turns of players who go offline mid-game.
- 🛡️ **Information Redaction & Security:** Authoritative server architecture ensures private player hands are never leaked over the wire.
- 🚀 **Zero Database Requirement:** Ephemeral in-memory game state with automatic garbage collection 10 minutes after rooms become empty.

---

## 🕹️ How to Play

1. **Create or Join a Room:** Enter your nickname and type a room code (e.g. `GAME123`) or join via an invite link.
2. **Invite Friends:** Copy the shareable invite link and send it to other players (supports 2–4 players).
3. **Start the Game:** Once at least 2 players are in the room, click **Start Game**.
4. **On Your Turn:**
   - Select a card from **Your Hand**.
   - Valid board locations will glow with an indigo ring.
   - Click on the glowing cell to place your chip (or remove an opponent's chip with a 1-Eyed Jack).
   - Draw a replacement card automatically.
5. **Win the Game:** Form 1 continuous sequence (or 2 sequences in 2-player games) of 5 connected chips in any direction!

---

## 🛠️ Tech Stack

| Layer               | Technologies                                                                         |
| :------------------ | :----------------------------------------------------------------------------------- |
| **Frontend**        | React 19, TypeScript, Vite 6, Tailwind CSS v4, Motion, Lucide Icons, Canvas Confetti |
| **Backend**         | Node.js, Express, Socket.IO, TSX                                                     |
| **Networking**      | WebSockets + HTTP Long-Polling fallback with strict CORS & host validation           |
| **DevOps & Deploy** | Docker, Railway, Multi-stage Slim Container Build                                    |

---

## 📁 Project Structure

```
sequence-multiplayer/
├── client/                    # React + Vite frontend (zero-config bundled into dist/)
│   ├── src/
│   │   ├── components/        # Reusable React UI: Settings, Activity Feed, Modals, etc.
│   │   │   ├── SettingsModal.tsx        # F31: Gameplay / Audio / Appearance / Account
│   │   │   ├── ActivityFeed.tsx         # F32: Match event log (chip, sequence, undo)
│   │   │   ├── AchievementToast.tsx     # Achievement unlock popups
│   │   │   ├── ConfirmModal.tsx         # Surrender / action confirmations
│   │   │   ├── FriendsModal.tsx         # F25: Friends, requests, invites
│   │   │   ├── GameOverModal.tsx        # Win/Loss results + rewards summary
│   │   │   ├── LeaderboardModal.tsx     # F24: Rating / wins / streak boards
│   │   │   ├── LevelUpModal.tsx         # F22: Rank promotions + XP progress
│   │   │   ├── NotificationBell.tsx     # F27: In-app notif center
│   │   │   ├── ProfileModal.tsx         # Profile + cosmetics shop
│   │   │   ├── RankBadge.tsx            # F23: Elo rank tier visual badges
│   │   │   ├── TournamentModal.tsx      # F28: Bracket tournament lobbies
│   │   │   └── WinningSequenceHighlight.tsx
│   │   ├── lib/
│   │   │   └── AudioManager.ts          # F30: Web Audio synthesized SFX engine
│   │   ├── App.tsx            # Main responsive UI (Desktop 3-col / Mobile vertical)
│   │   ├── main.tsx           # React entrypoint
│   │   └── index.css          # Tailwind CSS v4 styling & scrollbar reset
│   ├── index.html
│   └── vite.config.ts         # Vite config (Tailwind, @shared alias, dist build)
├── server/
│   └── server.ts              # Express + Socket.IO authoritative server
│                               # (hosts dist/ in prod, runs Socket.IO rooms & logic)
├── shared/                    # TypeScript modules imported by BOTH client & server
│   ├── types.ts               # Shared interfaces (GameState, ClientGameState, Card, etc.)
│   ├── logic.ts               # Board logic, Sequence win checks, state redaction helpers
│   └── constants/
│       └── rewards.ts         # XP, achievements, shop catalog, audio & game settings
├── Dockerfile                 # Multi-stage Node 20 slim production container build
├── .dockerignore
├── render.yaml                # Render.com Blueprint: zero-click web service deploy
├── .env.example               # PORT / CORS_ORIGIN reference (local dev only)
├── .gitignore
├── tsconfig.json              # Shared TypeScript config (paths: @shared/* alias)
├── package.json               # Unified scripts: dev / build / lint / start / preview
├── package-lock.json
└── README.md                  # This file
```

---

## 🚀 Getting Started Locally

### Prerequisites

- **Node.js:** 18.18+ or 20+
- **npm:** 9+

### Installation & Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.com/TanviMadani/Sequence-Multiplayer-Game.git
   cd Sequence-Multiplayer-Game
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   _(or `npm ci` for reproducible locked installs, just like CI/Render uses)_

3. **Start the development server:**

   ```bash
   npm run dev
   ```

   This runs Express + Socket.IO via TSX and launches Vite in middleware mode — so
   frontend HMR and WebSocket server run on the **same port** (3000), avoiding CORS issues.

4. Open `http://localhost:3000` in your browser. Open multiple tabs or different
   devices on your local network to test multiplayer gameplay.

### Typecheck & Production Build

```bash
npm run lint          # tsc --noEmit (typecheck only, zero JS emitted)
npm run build         # 1) tsc --noEmit  2) vite build → writes to ./dist/
npm run start         # NODE_ENV=production tsx server/server.ts (serves ./dist/)
```

---

## ☁️ Deploy on Render (Web Service or Blueprint)

This project ships with a `render.yaml` Blueprint that can deploy in 1-click.

### Option A — Blueprint / "Deploy to Environment" (Recommended)

1. Push the code to your GitHub repo.
2. In Render, go to **Blueprints → New Blueprint Instance**.
3. Select your repo, pick the branch (`main`), and choose `render.yaml`.
4. Click **Apply**. Render will automatically provision a Web Service with:
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `npm run start`
   - **Plan:** Starter (upgrade to Standard for >5 concurrent rooms)
   - **Env Vars:** `NODE_ENV=production`, `CORS_ORIGIN=*`

### Option B — Manual Web Service

1. In Render → **New + → Web Service**.
2. Connect your repo.
3. Configure the service:
   | Field | Value |
   |---|---|
   | Runtime | **Node** |
   | Root Directory | `.` _(leave empty)_ |
   | Build Command | `npm ci && npm run build` |
   | Start Command | `npm run start` |
   | Node Version | **20** (matches Dockerfile engines) |
   | Plan | Starter or higher |
4. Under **Environment Variables** set:
   ```
   NODE_ENV=production
   CORS_ORIGIN=*
   ```
5. Click **Create Web Service**. The first build takes 2–3 minutes.
6. When it shows **Live**, open the `onrender.com` URL and enjoy!

### Updating an Existing Render Deploy

Every push to the `main` branch (or whichever you chose) triggers an
**auto-deploy** if you left the default setting on. If something breaks:

- Go to **Events** in Render to see build logs.
- If you get `Cannot find module @shared/...` — re-run `npm run build` locally
  first to reproduce, since Render runs the exact same commands.
- Socket.IO requires sticky sessions on horizontal scaling; keep service to
  **1 instance** or upgrade Render plan with sticky session support.

### Deploy as Docker (Alternative)

Render can deploy the Dockerfile instead of Node runtime:

1. Set Runtime = **Docker** in the Web Service form.
2. Render auto-detects the `Dockerfile`; no other config needed.
3. Env vars remain the same.
