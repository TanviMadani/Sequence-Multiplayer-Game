import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GameState, Player, Card, UndoSnapshot, RewardBreakdown, PlayerProfile, MatchHistoryRecord, PlayerAchievement, createDeck } from "./src/types";
import { createInitialBoard, checkSequences, toClientState, pickAvailableColor } from "./src/logic";
import { REWARD_CONFIG, GAME_CONFIG, ACHIEVEMENT_DEFINITIONS, AchievementDef } from "./src/constants/rewards";

const ROOM_ID_MAX_LEN = 20;
const NAME_MAX_LEN = 20;
const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000; // clean up an abandoned room after 10 minutes

// In-memory player profiles store
const playerProfiles = new Map<string, PlayerProfile>();

function getOrCreateProfile(playerId: string, name: string): PlayerProfile {
  let profile = playerProfiles.get(playerId);
  if (!profile) {
    profile = {
      playerId,
      name,
      coins: 0,
      totalGames: 0,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      totalSequences: 0,
      dailyStreak: 0,
      matchHistory: [],
      achievements: {},
    };
    playerProfiles.set(playerId, profile);
  } else if (name && profile.name !== name) {
    profile.name = name;
  }
  return profile;
}

function checkAndUnlockAchievements(profile: PlayerProfile): AchievementDef[] {
  const newlyUnlocked: AchievementDef[] = [];
  const now = Date.now();

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    let current = profile.achievements[def.id];
    if (!current) {
      current = { achievementId: def.id, unlocked: false, unlockedAt: null, claimed: false };
      profile.achievements[def.id] = current;
    }

    if (current.unlocked) continue;

    let meetsReq = false;
    if (def.type === 'wins' && profile.wins >= def.targetValue) meetsReq = true;
    else if (def.type === 'sequences' && profile.totalSequences >= def.targetValue) meetsReq = true;
    else if (def.type === 'games' && profile.totalGames >= def.targetValue) meetsReq = true;
    else if (def.type === 'win_streak' && profile.bestWinStreak >= def.targetValue) meetsReq = true;

    if (meetsReq) {
      current.unlocked = true;
      current.unlockedAt = now;
      current.claimed = true;
      profile.coins += def.coinReward;
      newlyUnlocked.push(def);
    }
  }
  return newlyUnlocked;
}

function processMatchRewards(game: GameState, io: Server) {
  if (!game.winner || (game as any).processedRewards) return;
  (game as any).processedRewards = true;

  game.rewardBreakdowns = {};

  for (const p of game.players) {
    const profile = getOrCreateProfile(p.playerId, p.name);
    const isWinner = game.isTeamGame
      ? game.winningPlayerNames?.includes(p.name)
      : p.name === game.winner;

    profile.totalGames += 1;

    // Estimate sequences contributed by player
    const playerSeqCount = game.gameStats?.sequencesCount ? (isWinner ? game.gameStats.sequencesCount : 0) : 0;
    profile.totalSequences += playerSeqCount;

    if (isWinner) {
      profile.wins += 1;
      profile.currentWinStreak += 1;
      profile.bestWinStreak = Math.max(profile.bestWinStreak, profile.currentWinStreak);
    } else {
      profile.losses += 1;
      profile.currentWinStreak = 0;
    }

    const matchCompleteReward = REWARD_CONFIG.MATCH_COMPLETE;
    const victoryReward = isWinner ? REWARD_CONFIG.MATCH_WIN : 0;
    const sequenceReward = playerSeqCount * REWARD_CONFIG.SEQUENCE_COMPLETE;
    const streakBonus = (isWinner && profile.currentWinStreak >= 3) ? REWARD_CONFIG.WIN_STREAK_3_BONUS : 0;
    const totalEarned = matchCompleteReward + victoryReward + sequenceReward + streakBonus;

    profile.coins += totalEarned;

    const record: MatchHistoryRecord = {
      matchId: `${game.roomId}-${Date.now()}-${p.playerId.slice(0, 4)}`,
      timestamp: Date.now(),
      roomCode: game.roomId,
      mode: game.players.length === 2 ? '2 Players' : game.players.length === 3 ? '3 Players' : '4 Players (2v2)',
      isTeam: !!game.isTeamGame,
      winningTeam: game.winningTeam,
      winnerName: game.winner,
      isWin: isWinner,
      sequencesCount: playerSeqCount,
      durationSeconds: game.gameStats?.durationSeconds ?? 0,
      coinsEarned: totalEarned,
    };

    profile.matchHistory.unshift(record);
    if (profile.matchHistory.length > 20) profile.matchHistory.pop();

    const newlyUnlocked = checkAndUnlockAchievements(profile);

    game.rewardBreakdowns[p.playerId] = {
      matchComplete: matchCompleteReward,
      victory: victoryReward,
      sequences: sequenceReward,
      streakBonus,
      totalEarned,
    };

    if (p.socketId) {
      io.to(p.socketId).emit("profile-updated", { profile, newlyUnlocked });
    }
  }
}

// ---------- input validation / sanitization helpers ----------

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

  const games = new Map<string, GameState>();
  const socketMeta = new Map<string, { roomId: string; playerId: string }>();
  const cleanupTimers = new Map<string, NodeJS.Timeout>();

  const TURN_DURATION_MS = GAME_CONFIG.TURN_DURATION_MS;

  function resetTurnDeadline(game: GameState) {
    game.turnDeadline = Date.now() + TURN_DURATION_MS;
    game.turnDurationSeconds = 30;
  }

  function nextTurnIndex(game: GameState): number {
    if (game.players.length === 0) return 0;
    let next = (game.turnIndex + 1) % game.players.length;
    let attempts = 0;
    while (game.players[next]?.surrendered && attempts < game.players.length) {
      next = (next + 1) % game.players.length;
      attempts++;
    }
    return next;
  }

  function executeRematchStart(game: GameState) {
    game.board = createInitialBoard();
    game.status = "playing";
    game.winner = null;
    game.lastMove = null;
    game.winningSequences = undefined;
    game.winningCells = undefined;
    game.gameStats = null;
    game.winningTeam = null;
    game.winningPlayerNames = undefined;
    game.rematchVotes = [];
    game.undoAvailableForPlayerId = null;
    game.undoDeadline = null;
    game.undoSnapshot = null;
    (game as any).processedRewards = false;
    game.startTime = Date.now();
    game.totalMoves = 0;
    game.startingTurnIndex = ((game.startingTurnIndex ?? 0) + 1) % game.players.length;
    game.turnIndex = game.startingTurnIndex;
    game.deck = createDeck();
    const cardsPerPlayer = game.players.length === 2 ? 7 : 6;
    game.players.forEach(p => {
      p.hand = game.deck.splice(0, cardsPerPlayer);
      p.surrendered = false;
    });
    resetTurnDeadline(game);
  }

  // Authoritative turn timer & undo window check interval (1-second tick)
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, game] of games.entries()) {
      if (game.undoDeadline && now >= game.undoDeadline) {
        // 2-Second Undo window expired — finalize move and advance turn!
        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;
        if (game.status === 'playing') {
          game.turnIndex = nextTurnIndex(game);
          resetTurnDeadline(game);
        }
        broadcastGame(roomId);
      } else if (game.status === 'playing' && game.turnDeadline && now >= game.turnDeadline && !game.undoDeadline) {
        // Turn expired — auto-advance turn
        game.turnIndex = nextTurnIndex(game);
        resetTurnDeadline(game);
        broadcastGame(roomId);
      }
    }
  }, 1000);

  function broadcastGame(roomId: string) {
    const game = games.get(roomId);
    if (!game) return;
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

        const profile = getOrCreateProfile(playerId, playerName);
        socket.emit("profile-updated", { profile, newlyUnlocked: [] });

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
          surrendered: false,
        };
        game.players.push(player);
        socketMeta.set(socket.id, { roomId, playerId });
        broadcastGame(roomId);
      } catch (err) {
        console.error("join-room error:", err);
        socket.emit("error", "Something went wrong joining the room.");
      }
    });

    socket.on("get-profile", (playerIdRaw) => {
      const playerId = sanitizePlayerId(playerIdRaw);
      if (playerId) {
        const profile = getOrCreateProfile(playerId, "Player");
        socket.emit("profile-updated", { profile, newlyUnlocked: [] });
      }
    });

    socket.on("claim-daily-bonus", (playerIdRaw) => {
      try {
        const playerId = sanitizePlayerId(playerIdRaw);
        if (!playerId) return;

        const profile = getOrCreateProfile(playerId, "Player");
        const now = Date.now();
        const todayMidnight = new Date(now).setHours(0, 0, 0, 0);

        if (profile.lastDailyClaim) {
          const lastClaimMidnight = new Date(profile.lastDailyClaim).setHours(0, 0, 0, 0);
          if (lastClaimMidnight === todayMidnight) {
            socket.emit("error", "Daily bonus already claimed for today!");
            return;
          }

          const diffDays = Math.round((todayMidnight - lastClaimMidnight) / (24 * 60 * 60 * 1000));
          if (diffDays === 1) {
            profile.dailyStreak = ((profile.dailyStreak ?? 0) % 7) + 1;
          } else {
            profile.dailyStreak = 1; // Missed 1+ days -> reset to Day 1
          }
        } else {
          profile.dailyStreak = 1;
        }

        const streakIdx = Math.max(0, Math.min(6, (profile.dailyStreak ?? 1) - 1));
        const rewardCoins = REWARD_CONFIG.DAILY_REWARDS[streakIdx] ?? 20;

        profile.coins += rewardCoins;
        profile.lastDailyClaim = now;

        socket.emit("profile-updated", { profile, newlyUnlocked: [] });
        socket.emit("toast-message", `🎁 Claimed Day ${profile.dailyStreak} Daily Bonus (+${rewardCoins} Coins)!`);
      } catch (err) {
        console.error("claim-daily-bonus error:", err);
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
        game.startTime = Date.now();
        game.totalMoves = 0;
        game.winningSequences = undefined;
        game.winningCells = undefined;
        game.gameStats = null;
        game.winningTeam = null;
        game.winningPlayerNames = undefined;
        game.rematchVotes = [];
        (game as any).processedRewards = false;
        resetTurnDeadline(game);

        if (game.players.length === 4) {
          game.isTeamGame = true;
          game.players[0].color = "#2563eb"; // Blue
          game.players[2].color = "#2563eb"; // Blue
          game.players[1].color = "#dc2626"; // Red
          game.players[3].color = "#dc2626"; // Red
        } else {
          game.isTeamGame = false;
        }

        game.deck = createDeck();
        const cardsPerPlayer = game.players.length === 2 ? 7 : 6;
        game.players.forEach(p => {
          p.hand = game.deck.splice(0, cardsPerPlayer);
          p.surrendered = false;
        });
        game.startingTurnIndex = 0;
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
          return;
        }

        const game = games.get(roomId);
        if (!game || game.status !== "playing") return;

        const player = game.players[game.turnIndex];
        if (!player || player.socketId !== socket.id || player.surrendered) return;

        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];
        const cell = game.board[row][col];
        let validMove = false;

        if (card.rank === "J") {
          const isTwoEyed = card.suit === "C" || card.suit === "D";
          const isOneEyed = card.suit === "H" || card.suit === "S";

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

        // Capture Undo Snapshot BEFORE applying move
        const undoSnap: UndoSnapshot = {
          board: JSON.parse(JSON.stringify(game.board)),
          players: JSON.parse(JSON.stringify(game.players)),
          turnIndex: game.turnIndex,
          deck: JSON.parse(JSON.stringify(game.deck)),
          lastMove: game.lastMove ? { ...game.lastMove } : null,
          winner: game.winner,
          status: game.status,
          gameStats: game.gameStats ? { ...game.gameStats } : null,
        };

        game.totalMoves = (game.totalMoves || 0) + 1;

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

        const { count, cells, sequences } = checkSequences(game.board, player.color);
        cells.forEach(([r, c]) => {
          game.board[r][c].isLocked = true;
        });

        game.winningSequences = sequences;
        game.winningCells = cells;

        const winThreshold = (game.players.length === 2 || (game.isTeamGame && game.players.length === 4)) ? 2 : 1;
        if (count >= winThreshold) {
          game.status = "finished";
          game.winner = player.name;
          game.turnDeadline = null;
          game.undoAvailableForPlayerId = null;
          game.undoDeadline = null;
          game.undoSnapshot = null;

          const now = Date.now();
          const startTime = game.startTime || now;
          const durationSeconds = Math.max(1, Math.floor((now - startTime) / 1000));
          game.gameStats = {
            startTime,
            endTime: now,
            durationSeconds,
            totalMoves: game.totalMoves || 1,
            sequencesCount: count,
          };

          if (game.isTeamGame) {
            const teamPlayers = game.players.filter(p => p.color === player.color);
            game.winningPlayerNames = teamPlayers.map(p => p.name);
            game.winningTeam = player.color === '#2563eb' ? 'Team Blue' : player.color === '#dc2626' ? 'Team Red' : player.color === '#16a34a' ? 'Team Green' : 'Team Gold';
          } else {
            game.winningPlayerNames = [player.name];
            game.winningTeam = null;
          }

          processMatchRewards(game, io);
        } else {
          // Open 2-Second Undo Window & delay turn handoff
          game.undoSnapshot = undoSnap;
          game.undoAvailableForPlayerId = player.playerId;
          game.undoDeadline = Date.now() + GAME_CONFIG.UNDO_DURATION_MS;
          game.turnDeadline = null; // pause main turn timer during 2s undo window
        }

        broadcastGame(roomId);
      } catch (err) {
        console.error("play-card error:", err);
        socket.emit("error", "Something went wrong processing your move.");
      }
    });

    socket.on("undo-move", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || !game.undoSnapshot || !game.undoDeadline) return;

        const meta = socketMeta.get(socket.id);
        if (!meta || meta.playerId !== game.undoAvailableForPlayerId) return;

        if (Date.now() > game.undoDeadline) return;

        const snap = game.undoSnapshot;
        game.board = snap.board;
        // Preserve live player socket and connection status while restoring hands and surrender state
        for (const snapP of snap.players) {
          const currentP = game.players.find(p => p.playerId === snapP.playerId);
          if (currentP) {
            currentP.hand = snapP.hand;
            currentP.surrendered = snapP.surrendered;
          }
        }
        game.turnIndex = snap.turnIndex;
        game.deck = snap.deck;
        game.lastMove = snap.lastMove;
        game.winner = snap.winner;
        game.status = snap.status;
        game.gameStats = snap.gameStats;

        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;
        resetTurnDeadline(game);

        broadcastGame(roomId);
      } catch (err) {
        console.error("undo-move error:", err);
      }
    });

    socket.on("vote-rematch", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || game.status !== "finished") return;

        const meta = socketMeta.get(socket.id);
        if (!meta || meta.roomId !== roomId) return;

        if (!game.rematchVotes) game.rematchVotes = [];
        if (!game.rematchVotes.includes(meta.playerId)) {
          game.rematchVotes.push(meta.playerId);
        }

        const activeConnected = game.players.filter(p => p.connected);
        if (activeConnected.length >= 2 && activeConnected.every(p => game.rematchVotes?.includes(p.playerId))) {
          executeRematchStart(game);
        }
        broadcastGame(roomId);
      } catch (err) {
        console.error("vote-rematch error:", err);
      }
    });

    socket.on("surrender-game", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || game.status !== "playing") return;

        const meta = socketMeta.get(socket.id);
        if (!meta || meta.roomId !== roomId) return;

        const player = game.players.find(p => p.playerId === meta.playerId);
        if (!player || player.surrendered) return;

        player.surrendered = true;
        const remaining = game.players.filter(p => !p.surrendered);

        if (game.isTeamGame && game.players.length === 4) {
          const winnerTeamColor = player.color === '#2563eb' ? '#dc2626' : '#2563eb';
          const winningTeamPlayers = game.players.filter(p => p.color === winnerTeamColor);
          game.status = "finished";
          game.winner = winningTeamPlayers.map(p => p.name).join(' & ');
          game.winningPlayerNames = winningTeamPlayers.map(p => p.name);
          game.winningTeam = winnerTeamColor === '#2563eb' ? 'Team Blue' : 'Team Red';
          game.turnDeadline = null;
          processMatchRewards(game, io);
        } else if (remaining.length <= 1) {
          const winner = remaining[0] ?? player;
          game.status = "finished";
          game.winner = winner.name;
          game.winningPlayerNames = [winner.name];
          game.winningTeam = null;
          game.turnDeadline = null;
          processMatchRewards(game, io);
        } else {
          if (game.players[game.turnIndex].playerId === player.playerId) {
            game.turnIndex = nextTurnIndex(game);
            resetTurnDeadline(game);
          }
        }

        broadcastGame(roomId);
      } catch (err) {
        console.error("surrender-game error:", err);
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
        resetTurnDeadline(game);
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
        if (!game || game.status !== "finished") return;

        const meta = socketMeta.get(socket.id);
        if (!meta || meta.roomId !== roomId) return;

        executeRematchStart(game);
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

          if (game.status === "finished" && game.rematchVotes && game.rematchVotes.length > 0) {
            const activeConnected = game.players.filter(p => p.connected);
            if (activeConnected.length >= 2 && activeConnected.every(p => game.rematchVotes?.includes(p.playerId))) {
              executeRematchStart(game);
            }
          }
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
