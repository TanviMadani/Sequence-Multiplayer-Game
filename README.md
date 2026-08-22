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

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Motion, Lucide Icons, Canvas Confetti |
| **Backend** | Node.js, Express, Socket.IO, TSX |
| **Networking** | WebSockets + HTTP Long-Polling fallback with strict CORS & host validation |
| **DevOps & Deploy** | Docker, Railway, Multi-stage Slim Container Build |

---

## 📁 Project Structure

```
sequence-multiplayer/
├── src/
│   ├── App.tsx          # Responsive screen-fit UI (Desktop 3-column & Mobile vertical)
│   ├── logic.ts          # Core board logic, win validation, and Sequence checks
│   ├── types.ts          # Shared TypeScript models (GameState, ClientGameState, Cards)
│   ├── index.css        # Tailwind CSS v4 styling & scrollbar reset
│   └── main.tsx         # React entrypoint
├── server.ts            # Authoritative Express + Socket.IO server & SPA static hosting
├── Dockerfile           # Multi-stage container build for production
├── vite.config.ts       # Vite config with React, Tailwind, and allowedHosts
├── package.json         # Project scripts and dependencies
└── README.md            # Documentation
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

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser. Open multiple tabs or different devices on your local network to test multiplayer gameplay.

---

## 🚢 Deployment

### Deploy with Docker

```bash
# Build the production image
docker build -t sequence-multiplayer .

# Run the container
docker run -d -p 3000:3000 -e NODE_ENV=production sequence-multiplayer
```

### Deploy on Railway / Render

1. Connect your GitHub repository to [Railway](https://railway.app/) or [Render](https://render.com/).
2. Set build and start commands:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
   - **Environment Variables:** `NODE_ENV=production`
3. Generate a public domain and start playing!

---

