import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GameState, Player, createDeck } from "./src/types";
import { createInitialBoard, checkSequences, toClientState, pickAvailableColor } from "./src/logic";

const ROOM_ID_MAX_LEN = 20;
const NAME_MAX_LEN = 20;
const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000; // clean up an abandoned room after 10 minutes

// ---------- input validation / sanitization helpers ----------
// Every value coming off the socket is untrusted. None of these throw; they
// return null/false on anything malformed so callers can bail out quietly
// instead of letting a bad payload crash the process.

function sanitizeRoomId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, ROOM_ID_MAX_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.trim().slice(0, NAME_MAX_LEN);
  return cleaned.length > 0 ? cleaned : fallback;
}

function sanitizePlayerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Client generates this with crypto.randomUUID(); just sanity-check shape/length.
  if (!/^[a-zA-Z0-9-]{4,64}$/.test(raw)) return null;
  return raw;
}

function isBoardCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 10;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // In-memory game store. A Map (not a plain object) so a malicious/odd
  // roomId like "__proto__" can never touch Object.prototype.
  const games = new Map<string, GameState>();
  // Tracks which room/player a given live socket belongs to, so disconnect
  // handling doesn't need to scan every room.
  const socketMeta = new Map<string, { roomId: string; playerId: string }>();
  // Pending cleanup timers for rooms where every player has disconnected.
  const cleanupTimers = new Map<string, NodeJS.Timeout>();

  function nextTurnIndex(game: GameState): number {
    if (game.players.length === 0) return 0;
    return (game.turnIndex + 1) % game.players.length;
  }

  function broadcastGame(roomId: string) {
    const game = games.get(roomId);
    if (!game) return;
    // Each player gets their own redacted view — nobody's hand leaks to anyone else.
    for (const p of game.players) {
      if (p.socketId) {
        io.to(p.socketId).emit("game-updated", toClientState(game, p.playerId));
      }
    }
  }

  function cancelCleanup(roomId: string) {
    const t = cleanupTimers.get(roomId);
    if (t) {
      clearTimeout(t);
      cleanupTimers.delete(roomId);
    }
  }

  function scheduleCleanup(roomId: string) {
    cancelCleanup(roomId);
    const t = setTimeout(() => {
      const game = games.get(roomId);
      if (game && game.players.every(p => !p.connected)) {
        games.delete(roomId);
      }
      cleanupTimers.delete(roomId);
    }, ROOM_EMPTY_TTL_MS);
    cleanupTimers.set(roomId, t);
  }

  io.on("connection", (socket: Socket) => {
    socket.on("join-room", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!roomId || !playerId) {
          socket.emit("error", "Invalid room code. Use letters/numbers only.");
          return;
        }
        const playerName = sanitizeName(payload?.playerName, "Player");

        socket.join(roomId);

        let game = games.get(roomId);
        if (!game) {
          game = {
            roomId,
            board: createInitialBoard(),
            players: [],
            turnIndex: 0,
            deck: createDeck(),
            status: "waiting",
            winner: null,
            lastMove: null,
          };
          games.set(roomId, game);
        }

        cancelCleanup(roomId);

        // Reconnect: same persistent playerId already has a seat here.
        const existing = game.players.find(p => p.playerId === playerId);
        if (existing) {
          existing.socketId = socket.id;
          existing.connected = true;
          existing.name = playerName;
          socketMeta.set(socket.id, { roomId, playerId });
          broadcastGame(roomId);
          return;
        }

        if (game.status !== "waiting") {
          socket.emit("error", "This game has already started.");
          return;
        }
        if (game.players.length >= 4) {
          socket.emit("error", "This room is full (4/4 players).");
          return;
        }

        const player: Player = {
          playerId,
          socketId: socket.id,
          name: playerName,
          color: pickAvailableColor(game.players),
          hand: [],
          connected: true,
        };
        game.players.push(player);
        socketMeta.set(socket.id, { roomId, playerId });
        broadcastGame(roomId);
      } catch (err) {
        console.error("join-room error:", err);
        socket.emit("error", "Something went wrong joining the room.");
      }
    });

    socket.on("start-game", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || game.status !== "waiting") return;
        if (game.players.length < 2) return;

        game.status = "playing";
        game.deck = createDeck();
        const cardsPerPlayer = game.players.length === 2 ? 7 : 6;
        game.players.forEach(p => {
          p.hand = game.deck.splice(0, cardsPerPlayer);
        });
        game.turnIndex = 0;
        broadcastGame(roomId);
      } catch (err) {
        console.error("start-game error:", err);
      }
    });

    socket.on("play-card", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const cardId = payload?.cardId;
        const row = payload?.row;
        const col = payload?.col;

        if (!roomId || typeof cardId !== "string" || !isBoardCoord(row) || !isBoardCoord(col)) {
          return; // silently ignore malformed input rather than indexing into the board with it
        }

        const game = games.get(roomId);
        if (!game || game.status !== "playing") return;

        const player = game.players[game.turnIndex];
        if (!player || player.socketId !== socket.id) return; // not your turn / not you

        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];
        const cell = game.board[row][col];
        let validMove = false;

        if (card.rank === "J") {
          const isTwoEyed = card.suit === "C" || card.suit === "D"; // wild
          const isOneEyed = card.suit === "H" || card.suit === "S"; // remove

          if (isTwoEyed) {
            if (!cell.chip && cell.card !== null) {
              cell.chip = player.color;
              validMove = true;
            }
          } else if (isOneEyed) {
            if (cell.chip && cell.chip !== "wild" && cell.chip !== player.color && !cell.isLocked) {
              cell.chip = null;
              validMove = true;
            }
          }
        } else {
          if (!cell.chip && cell.card && cell.card.rank === card.rank && cell.card.suit === card.suit) {
            cell.chip = player.color;
            validMove = true;
          }
        }

        if (!validMove) return;

        player.hand.splice(cardIndex, 1);
        if (game.deck.length > 0) {
          player.hand.push(game.deck.pop()!);
        }

        game.lastMove = {
          playerId: player.playerId,
          row,
          col,
          type: card.rank === "J" && (card.suit === "H" || card.suit === "S") ? "remove" : "place",
        };

        const { count, cells } = checkSequences(game.board, player.color);
        cells.forEach(([r, c]) => {
          game.board[r][c].isLocked = true;
        });

        const winThreshold = game.players.length === 2 ? 2 : 1;
        if (count >= winThreshold) {
          game.status = "finished";
          game.winner = player.name;
        } else {
          game.turnIndex = nextTurnIndex(game);
        }

        broadcastGame(roomId);
      } catch (err) {
        console.error("play-card error:", err);
        socket.emit("error", "Something went wrong processing your move.");
      }
    });

    // Lets any connected player advance past a seat whose occupant has
    // disconnected, so the game doesn't stall forever waiting for someone
    // who dropped their connection.
    socket.on("skip-turn", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || game.status !== "playing") return;

        const requesterMeta = socketMeta.get(socket.id);
        if (!requesterMeta || requesterMeta.roomId !== roomId) return;

        const currentPlayer = game.players[game.turnIndex];
        if (!currentPlayer || currentPlayer.connected) return; // only skippable if actually disconnected

        const requester = game.players.find(p => p.playerId === requesterMeta.playerId);
        if (!requester || !requester.connected) return;

        game.turnIndex = nextTurnIndex(game);
        broadcastGame(roomId);
      } catch (err) {
        console.error("skip-turn error:", err);
      }
    });

    socket.on("restart-game", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game) return;

        game.board = createInitialBoard();
        game.status = "waiting";
        game.winner = null;
        game.lastMove = null;
        game.turnIndex = 0;
        game.deck = createDeck();
        game.players.forEach(p => (p.hand = []));
        broadcastGame(roomId);
      } catch (err) {
        console.error("restart-game error:", err);
      }
    });

    socket.on("disconnect", () => {
      try {
        const meta = socketMeta.get(socket.id);
        socketMeta.delete(socket.id);
        if (!meta) return;

        const { roomId, playerId } = meta;
        const game = games.get(roomId);
        if (!game) return;

        const idx = game.players.findIndex(p => p.playerId === playerId);
        if (idx === -1) return;

        if (game.status === "waiting") {
          // Game hasn't started yet — just free up the seat.
          game.players.splice(idx, 1);
        } else {
          // Mid-game: keep the seat and hand, just mark them offline so
          // they can rejoin later (same playerId) and pick up where they left off.
          game.players[idx].connected = false;
          game.players[idx].socketId = null;
        }

        if (game.players.length === 0 || game.players.every(p => !p.connected)) {
          scheduleCleanup(roomId);
        }

        broadcastGame(roomId);
      } catch (err) {
        console.error("disconnect handling error:", err);
      }
    });
  });

  const isProduction =
    process.env.NODE_ENV === "production" ||
    (process.env.NODE_ENV !== "development" && fs.existsSync(path.join(process.cwd(), "dist", "index.html")));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
