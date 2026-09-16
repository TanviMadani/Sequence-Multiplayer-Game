import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import {
  GameState, Player, Card, UndoSnapshot, RewardBreakdown, PlayerProfile, MatchHistoryRecord,
  PlayerAchievement, createDeck, Spectator, MatchmakingQueueEntry, BotDifficulty, PLAYER_COLORS,
  FriendRequest, FriendEntry, GameInvite, GAME_INVITE_TTL_MS, Notification,
  Tournament, TournamentSize, TournamentStatus, ActivityEvent, ActivityEventType,
  SEASONAL_REWARDS, getSeasonalLevelFromXP, getSeasonalXPForLevel, SeasonInfo,
  LeaderboardEntry, LeaderboardCategory
} from "../shared/types";
import { createInitialBoard, checkSequences, toClientState, toSpectatorState, pickAvailableColor, evaluateBotMove, calculateEloDeltas } from "../shared/logic";
import {
  REWARD_CONFIG, XP_CONFIG, GAME_CONFIG, ACHIEVEMENT_DEFINITIONS, AchievementDef,
  getLevelFromXP, SHOP_CATALOG, getRankFromRating, RANK_DEFINITIONS,
  DEFAULT_GAME_SETTINGS, RankTier
} from "../shared/constants/rewards";

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
      name: name || "Player",
      avatar: "avatar_default",
      coins: 0,
      xp: 0,
      level: 1,
      equippedCosmetics: {
        boardTheme: "board_classic",
        chipSkin: "chip_classic",
        cardBack: "card_classic",
        avatar: "avatar_default",
        victoryEffect: "victory_confetti",
        emote: "emote_thumbsup",
      },
      ownedCosmetics: [
        "board_classic",
        "chip_classic",
        "card_classic",
        "avatar_default",
        "victory_confetti",
        "emote_thumbsup",
      ],
      totalGames: 0,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      totalSequences: 0,
      dailyStreak: 0,
      matchHistory: [],
      achievements: {},
      rankedRating: 1000,
      rankedGames: 0,
      rankedWins: 0,
      rankedLosses: 0,
      // Feature 25: Friends
      friendIds: [],
      pendingFriendRequestsSent: [],
      pendingFriendRequestsReceived: [],
      // Feature 27: Notifications
      notifications: [],
      // Feature 29: Seasonal Progression
      seasonalXP: 0,
      claimedSeasonalRewards: [],
      // Feature 31: Settings
      settings: {
        showMoveIndicators: DEFAULT_GAME_SETTINGS.showMoveIndicators,
        animationsEnabled: DEFAULT_GAME_SETTINGS.animationsEnabled,
        confirmBeforeSurrender: DEFAULT_GAME_SETTINGS.confirmBeforeSurrender,
        reducedAnimations: DEFAULT_GAME_SETTINGS.reducedAnimations,
      },
      // Metadata
      lastOnline: Date.now(),
      currentRoomId: null,
    };
    playerProfiles.set(playerId, profile);
  } else if (name && profile.name !== name) {
    profile.name = name;
  }

  // Backward compatibility migrations
  if (profile.rankedRating === undefined) profile.rankedRating = 1000;
  if (profile.rankedGames === undefined) profile.rankedGames = 0;
  if (profile.rankedWins === undefined) profile.rankedWins = 0;
  if (profile.rankedLosses === undefined) profile.rankedLosses = 0;
  if (profile.friendIds === undefined) profile.friendIds = [];
  if (profile.pendingFriendRequestsSent === undefined) profile.pendingFriendRequestsSent = [];
  if (profile.pendingFriendRequestsReceived === undefined) profile.pendingFriendRequestsReceived = [];
  if (profile.notifications === undefined) profile.notifications = [];
  if (profile.seasonalXP === undefined) profile.seasonalXP = 0;
  if (profile.claimedSeasonalRewards === undefined) profile.claimedSeasonalRewards = [];
  if (profile.settings === undefined) {
    profile.settings = {
      showMoveIndicators: true,
      animationsEnabled: true,
      confirmBeforeSurrender: true,
      reducedAnimations: false,
    };
  }
  if (profile.settings.reducedAnimations === undefined) profile.settings.reducedAnimations = false;
  if (profile.lastOnline === undefined) profile.lastOnline = Date.now();
  if (profile.currentRoomId === undefined) profile.currentRoomId = null;

  return profile;
}

// ============================================================================
// Feature 25: Friends System - In-memory Stores
// ============================================================================
const friendRequests = new Map<string, FriendRequest>(); // requestId -> FriendRequest

// ============================================================================
// Feature 26: Direct Game Invites - In-memory Store
// ============================================================================
const gameInvites = new Map<string, GameInvite>(); // inviteId -> GameInvite

// ============================================================================
// Feature 28: Tournament Mode - In-memory Store
// ============================================================================
const tournaments = new Map<string, Tournament>(); // tournamentId -> Tournament

// ============================================================================
// Feature 29: Seasonal Progression - Active Season
// ============================================================================
const ACTIVE_SEASON: SeasonInfo = {
  seasonId: 's1',
  name: 'Season 1: Dawn of Champions',
  number: 1,
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).getTime(),
  endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).getTime(),
  isActive: true,
};

// ============================================================================
// Feature 32: Activity Feed Helpers
// ============================================================================
const MAX_ACTIVITY_EVENTS = 20;

function addActivityEvent(game: GameState, type: ActivityEventType, playerId: string | null, message: string, team?: string) {
  if (!game.activityFeed) game.activityFeed = [];
  const player = playerId ? game.players.find(p => p.playerId === playerId) : null;
  const event: ActivityEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    playerId,
    playerName: player?.name ?? null,
    message,
    timestamp: Date.now(),
    team,
  };
  game.activityFeed.unshift(event);
  if (game.activityFeed.length > MAX_ACTIVITY_EVENTS) {
    game.activityFeed.length = MAX_ACTIVITY_EVENTS;
  }
}

// ============================================================================
// Feature 27: Notification Helpers
// ============================================================================
const MAX_NOTIFICATIONS = 50;

function createNotification(
  type: Notification['type'],
  message: string,
  actionPayload?: any
): Notification {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    createdAt: Date.now(),
    read: false,
    actionPayload,
  };
}

// ============================================================================
// Feature 23: Rank Promotion Detection
// ============================================================================
type SendNotifFn = (io: Server, profile: PlayerProfile, notification: Notification) => void;

function checkRankPromotion(
  io: Server,
  profile: PlayerProfile,
  oldRating: number,
  newRating: number,
  sendNotifFn?: SendNotifFn,
) {
  const oldRank = getRankFromRating(oldRating);
  const newRank = getRankFromRating(newRating);
  const oldTierIdx = RANK_DEFINITIONS.findIndex(r => r.tier === oldRank.tier);
  const newTierIdx = RANK_DEFINITIONS.findIndex(r => r.tier === newRank.tier);

  if (newTierIdx > oldTierIdx && sendNotifFn) {
    const notif = createNotification(
      'rank_promotion',
      `🎉 Rank Up! You've been promoted to ${newRank.name} tier! (${newRating} Elo)`,
      { oldRating, newRating, rank: newRank.tier },
    );
    sendNotifFn(io, profile, notif);
  }
}

// ============================================================================
// Feature 29: Seasonal Reward Claiming & XP
// ============================================================================
function grantSeasonalXP(profile: PlayerProfile, xp: number) {
  const oldLevel = getSeasonalLevelFromXP(profile.seasonalXP);
  profile.seasonalXP += xp;
  const newLevel = getSeasonalLevelFromXP(profile.seasonalXP);

  const unlockedRewards: string[] = [];
  if (newLevel > oldLevel) {
    for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
      const reward = SEASONAL_REWARDS.find(r => r.level === lvl);
      if (reward && !profile.claimedSeasonalRewards.includes(lvl)) {
        profile.claimedSeasonalRewards.push(lvl);
        if (reward.rewardType === 'coins' && typeof reward.value === 'number') {
          profile.coins += reward.value;
        } else if (reward.rewardType === 'cosmetic' && typeof reward.value === 'string') {
          if (!profile.ownedCosmetics.includes(reward.value)) {
            profile.ownedCosmetics.push(reward.value);
          }
        }
        unlockedRewards.push(reward.name);
      }
    }
  }
  return unlockedRewards;
}

// ============================================================================
// Feature 24: Leaderboard Query Functions (server-side sorted queries)
// ============================================================================
function getLeaderboard(
  category: LeaderboardCategory,
  currentPlayerId: string | null,
  limit: number = 100,
): { entries: LeaderboardEntry[]; userRank: number | null; userEntry: LeaderboardEntry | null } {
  const allProfiles = Array.from(playerProfiles.values()).filter(p => p.totalGames > 0);

  let sorted: PlayerProfile[];
  switch (category) {
    case 'rating':
      sorted = allProfiles.sort((a, b) => b.rankedRating - a.rankedRating);
      break;
    case 'wins':
      sorted = allProfiles.sort((a, b) => b.wins - a.wins);
      break;
    case 'streak':
      sorted = allProfiles.sort((a, b) => b.bestWinStreak - a.bestWinStreak);
      break;
    case 'sequences':
      sorted = allProfiles.sort((a, b) => b.totalSequences - a.totalSequences);
      break;
    default:
      sorted = allProfiles.sort((a, b) => b.rankedRating - a.rankedRating);
  }

  const entries: LeaderboardEntry[] = sorted
    .slice(0, limit)
    .map((p, idx) => ({
      rank: idx + 1,
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      rankedRating: p.rankedRating,
      wins: p.wins,
      bestWinStreak: p.bestWinStreak,
      totalSequences: p.totalSequences,
      isCurrentUser: p.playerId === currentPlayerId,
    }));

  let userRank: number | null = null;
  let userEntry: LeaderboardEntry | null = null;
  if (currentPlayerId) {
    const userIdx = sorted.findIndex(p => p.playerId === currentPlayerId);
    if (userIdx !== -1) {
      userRank = userIdx + 1;
      const p = sorted[userIdx];
      userEntry = {
        rank: userRank,
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        rankedRating: p.rankedRating,
        wins: p.wins,
        bestWinStreak: p.bestWinStreak,
        totalSequences: p.totalSequences,
        isCurrentUser: true,
      };
    }
  }

  return { entries, userRank, userEntry };
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
      profile.xp += XP_CONFIG.ACHIEVEMENT_UNLOCKED;
      newlyUnlocked.push(def);
    }
  }
  return newlyUnlocked;
}

function processMatchRewards(game: GameState, io: Server, sendNotifFn?: SendNotifFn) {
  if (!game.winner || (game as any).processedRewards) return;
  (game as any).processedRewards = true;

  game.rewardBreakdowns = {};

  // Feature 22: Calculate Elo Ratings if game is ranked
  let ratingDeltas: Record<string, { oldRating: number; newRating: number; delta: number }> = {};
  if (game.isRanked) {
    ratingDeltas = calculateEloDeltas(game, playerProfiles);
    game.ratingDeltas = ratingDeltas;
  }

  for (const p of game.players) {
    if (p.isBot) continue; // Skip bot profiles

    const profile = getOrCreateProfile(p.playerId, p.name);
    const isWinner = game.isTeamGame
      ? game.winningPlayerNames?.includes(p.name)
      : p.name === game.winner;

    profile.totalGames += 1;

    // Feature 22: Update Ranked Ratings
    let rDelta = null;
    const oldRating = profile.rankedRating;
    if (game.isRanked && ratingDeltas[p.playerId]) {
      rDelta = ratingDeltas[p.playerId];
      profile.rankedRating = rDelta.newRating;
      profile.rankedGames += 1;
      if (isWinner) profile.rankedWins += 1;
      else profile.rankedLosses += 1;
      // Feature 23: Check rank promotion
      checkRankPromotion(io, profile, oldRating, profile.rankedRating, sendNotifFn);
    }

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

    // Calculate XP earned
    const xpEarned = XP_CONFIG.MATCH_COMPLETE + (isWinner ? XP_CONFIG.MATCH_WIN : 0) + (playerSeqCount * XP_CONFIG.SEQUENCE_COMPLETE);
    const oldLevel = profile.level || getLevelFromXP(profile.xp);
    profile.xp += xpEarned;
    const newLevel = getLevelFromXP(profile.xp);

    let levelUpInfo = null;
    if (newLevel > oldLevel) {
      profile.level = newLevel;
      const bonusCoins = (newLevel - oldLevel) * XP_CONFIG.LEVEL_UP_BONUS_COINS;
      profile.coins += bonusCoins;
      levelUpInfo = {
        didLevelUp: true,
        oldLevel,
        newLevel,
        bonusCoins,
      };
    }

    profile.coins += totalEarned;

    // Feature 29: Grant Seasonal XP & check for rewards
    const seasonalXPEarned = XP_CONFIG.MATCH_COMPLETE + (isWinner ? XP_CONFIG.MATCH_WIN : 0) + (playerSeqCount * XP_CONFIG.SEQUENCE_COMPLETE);
    const unlockedSeasonalRewards = grantSeasonalXP(profile, seasonalXPEarned);

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
      xpEarned,
      isRanked: game.isRanked,
      ratingDelta: rDelta?.delta,
    };

    profile.matchHistory.unshift(record);
    if (profile.matchHistory.length > 20) profile.matchHistory.pop();

    const newlyUnlocked = checkAndUnlockAchievements(profile);

    // Feature 27: Achievement unlock notifications
    for (const ach of newlyUnlocked) {
      const achNotif = createNotification(
        'achievement',
        `🏆 Achievement Unlocked: ${ach.name}! (${ach.coinReward} coins)`,
        { achievementId: ach.id, name: ach.name },
      );
      profile.notifications.unshift(achNotif);
      if (profile.notifications.length > MAX_NOTIFICATIONS) {
        profile.notifications.length = MAX_NOTIFICATIONS;
      }
      if (sendNotifFn) {
        sendNotifFn(io, profile, achNotif);
      }
    }

    game.rewardBreakdowns[p.playerId] = {
      matchComplete: matchCompleteReward,
      victory: victoryReward,
      sequences: sequenceReward,
      streakBonus,
      totalEarned,
      xpEarned,
      levelUp: levelUpInfo,
      ratingDelta: rDelta,
    };

    if (p.socketId) {
      io.to(p.socketId).emit("profile-updated", { profile, newlyUnlocked, unlockedSeasonalRewards, seasonalXPEarned });
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
  const socketMeta = new Map<string, { roomId: string; playerId: string; isSpectator?: boolean }>();
  const cleanupTimers = new Map<string, NodeJS.Timeout>();
  const botTurnTimers = new Map<string, NodeJS.Timeout>();

  // --- Closure-scoped helper functions (need socketMeta reference) ---
  function getSocketIdForPlayer(playerId: string): string | null {
    const profile = playerProfiles.get(playerId);
    if (!profile || !profile.currentRoomId) return null;
    for (const [sockId, meta] of socketMeta.entries()) {
      if (meta.playerId === playerId && !meta.isSpectator) {
        return sockId;
      }
    }
    return null;
  }

  function sendNotificationToPlayer(
    io: Server,
    profile: PlayerProfile,
    notification: Notification,
  ) {
    profile.notifications.unshift(notification);
    if (profile.notifications.length > MAX_NOTIFICATIONS) {
      profile.notifications.length = MAX_NOTIFICATIONS;
    }
    const socketId = getSocketIdForPlayer(profile.playerId);
    if (socketId) {
      io.to(socketId).emit('notification-received', notification);
    }
  }
  // -----------------------------------------------------------------

  // Feature 21: In-memory Matchmaking Queue
  const matchmakingQueue: MatchmakingQueueEntry[] = [];

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
    game.ratingDeltas = undefined;
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
    triggerBotTurnIfNeeded(game);
  }

  // Feature 20: Bot Turn Automation (700 - 1500 ms delay)
  function triggerBotTurnIfNeeded(game: GameState) {
    if (game.status !== 'playing') return;

    // Clear any pending bot timer for this room
    const existingTimer = botTurnTimers.get(game.roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      botTurnTimers.delete(game.roomId);
    }

    const currentPlayer = game.players[game.turnIndex];
    if (!currentPlayer || !currentPlayer.isBot || currentPlayer.surrendered) return;

    const delay = Math.floor(Math.random() * 800) + 700; // 700 - 1500ms delay

    const timer = setTimeout(() => {
      botTurnTimers.delete(game.roomId);
      if (game.status !== 'playing') return;

      const bot = game.players[game.turnIndex];
      if (!bot || !bot.isBot || bot.playerId !== currentPlayer.playerId) return;

      const botMove = evaluateBotMove(game, bot);
      if (botMove) {
        executeBotMove(game, bot, botMove);
      } else {
        // No move found (e.g. empty hand) -> advance turn
        game.turnIndex = nextTurnIndex(game);
        resetTurnDeadline(game);
        broadcastGame(game.roomId);
        triggerBotTurnIfNeeded(game);
      }
    }, delay);

    botTurnTimers.set(game.roomId, timer);
  }

  function executeBotMove(game: GameState, bot: Player, move: { cardId: string; row: number; col: number; type: 'place' | 'remove' }) {
    const cardIndex = bot.hand.findIndex(c => c.id === move.cardId);
    if (cardIndex === -1) return;

    const card = bot.hand[cardIndex];
    const cell = game.board[move.row][move.col];

    if (card.rank === 'J') {
      const isTwoEyed = card.suit === 'C' || card.suit === 'D';
      const isOneEyed = card.suit === 'H' || card.suit === 'S';
      if (isTwoEyed && !cell.chip && cell.card !== null) {
        cell.chip = bot.color;
      } else if (isOneEyed && cell.chip && cell.chip !== 'wild' && cell.chip !== bot.color && !cell.isLocked) {
        cell.chip = null;
      }
    } else {
      if (!cell.chip && cell.card && cell.card.rank === card.rank && cell.card.suit === card.suit) {
        cell.chip = bot.color;
      }
    }

    game.totalMoves = (game.totalMoves || 0) + 1;
    bot.hand.splice(cardIndex, 1);
    if (game.deck.length > 0) {
      bot.hand.push(game.deck.pop()!);
    }

    game.lastMove = {
      playerId: bot.playerId,
      row: move.row,
      col: move.col,
      type: move.type,
    };

    const { count, cells, sequences } = checkSequences(game.board, bot.color);
    cells.forEach(([r, c]) => {
      game.board[r][c].isLocked = true;
    });

    game.winningSequences = sequences;
    game.winningCells = cells;

    const winThreshold = (game.players.length === 2 || (game.isTeamGame && game.players.length === 4)) ? 2 : 1;
    if (count >= winThreshold) {
      game.status = "finished";
      game.winner = bot.name;
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
        const teamPlayers = game.players.filter(p => p.color === bot.color);
        game.winningPlayerNames = teamPlayers.map(p => p.name);
        game.winningTeam = bot.color === '#2563eb' ? 'Team Blue' : 'Team Red';
      } else {
        game.winningPlayerNames = [bot.name];
        game.winningTeam = null;
      }

      processMatchRewards(game, io);
    } else {
      game.turnIndex = nextTurnIndex(game);
      resetTurnDeadline(game);
      triggerBotTurnIfNeeded(game);
    }

    broadcastGame(game.roomId);
  }

  // Feature 21: Matchmaking Queue Worker (Ticks every 2 seconds)
  setInterval(() => {
    if (matchmakingQueue.length < 2) return;

    const modes: ('2p' | '4p')[] = ['2p', '4p'];
    const rankedOptions = [false, true];

    for (const mode of modes) {
      for (const isRanked of rankedOptions) {
        const targetCount = mode === '2p' ? 2 : 4;
        const matchingEntries = matchmakingQueue.filter(e => e.mode === mode && e.isRanked === isRanked);

        if (matchingEntries.length >= targetCount) {
          const matchedGroup = matchingEntries.splice(0, targetCount);

          // Remove matched players from global queue
          matchedGroup.forEach(m => {
            const idx = matchmakingQueue.findIndex(e => e.playerId === m.playerId);
            if (idx !== -1) matchmakingQueue.splice(idx, 1);
          });

          // Create auto room
          const roomId = `MATCH-${Math.floor(1000 + Math.random() * 9000)}`;
          const game: GameState = {
            roomId,
            board: createInitialBoard(),
            players: [],
            turnIndex: 0,
            deck: createDeck(),
            status: "playing",
            winner: null,
            lastMove: null,
            isRanked,
            allowSpectators: true,
            spectators: [],
            startTime: Date.now(),
            totalMoves: 0,
            startingTurnIndex: 0,
          };

          matchedGroup.forEach((entry, idx) => {
            const player: Player = {
              playerId: entry.playerId,
              socketId: entry.socketId,
              name: entry.name,
              color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
              hand: [],
              connected: true,
              surrendered: false,
            };
            game.players.push(player);

            const socket = io.sockets.sockets.get(entry.socketId);
            if (socket) {
              socket.join(roomId);
              socketMeta.set(entry.socketId, { roomId, playerId: entry.playerId });
              socket.emit("match-found", { roomId });
            }
          });

          if (game.players.length === 4) {
            game.isTeamGame = true;
            game.players[0].color = "#2563eb"; // Blue
            game.players[2].color = "#2563eb"; // Blue
            game.players[1].color = "#dc2626"; // Red
            game.players[3].color = "#dc2626"; // Red
          }

          const cardsPerPlayer = game.players.length === 2 ? 7 : 6;
          game.players.forEach(p => {
            p.hand = game.deck.splice(0, cardsPerPlayer);
          });

          resetTurnDeadline(game);
          games.set(roomId, game);
          broadcastGame(roomId);
        }
      }
    }
  }, 2000);

  // Authoritative turn timer & undo window check interval (1-second tick)
  setInterval(() => {
    const now = Date.now();
    for (const [roomId, game] of games.entries()) {
      if (game.undoDeadline && now >= game.undoDeadline) {
        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;
        if (game.status === 'playing') {
          game.turnIndex = nextTurnIndex(game);
          resetTurnDeadline(game);
          triggerBotTurnIfNeeded(game);
        }
        broadcastGame(roomId);
      } else if (game.status === 'playing' && game.turnDeadline && now >= game.turnDeadline && !game.undoDeadline) {
        game.turnIndex = nextTurnIndex(game);
        resetTurnDeadline(game);
        triggerBotTurnIfNeeded(game);
        broadcastGame(roomId);
      }
    }
  }, 1000);

  function broadcastGame(roomId: string) {
    const game = games.get(roomId);
    if (!game) return;

    // Broadcast to seated players
    for (const p of game.players) {
      if (p.socketId && !p.isBot) {
        io.to(p.socketId).emit("game-updated", toClientState(game, p.playerId, (pid) => playerProfiles.get(pid)));
      }
    }

    // Feature 19: Broadcast to spectators (redacted private hands)
    if (game.spectators) {
      for (const spec of game.spectators) {
        if (spec.socketId && spec.connected) {
          io.to(spec.socketId).emit("game-updated", toSpectatorState(game, spec.spectatorId, (pid) => playerProfiles.get(pid)));
        }
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
      if (game && game.players.every(p => !p.connected || p.isBot)) {
        games.delete(roomId);
      }
      cleanupTimers.delete(roomId);
    }, ROOM_EMPTY_TTL_MS);
    cleanupTimers.set(roomId, t);
  }

  // Feature 25: Broadcast online/offline status to all friends of a player
  function broadcastFriendOnlineStatus(io: Server, profile: PlayerProfile, isOnline: boolean) {
    for (const friendId of profile.friendIds) {
      const friendProfile = playerProfiles.get(friendId);
      if (!friendProfile) continue;
      const friendSocketId = getSocketIdForPlayer(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend-presence-updated', {
          playerId: profile.playerId,
          isOnline,
          inGame: isOnline && !!profile.currentRoomId,
          currentRoomId: profile.currentRoomId,
        });
      }
    }
  }

  // ============================================================================
  // Feature 28: Tournament Helper Functions
  // ============================================================================
  function generateTournamentBracket(tournament: Tournament) {
    const size = tournament.size;
    const rounds = size === 4 ? 2 : 3;
    const matches: typeof tournament.matches = [];

    const sortedParticipants = [...tournament.participants].sort((a, b) => a.seed - b.seed);

    if (size === 4) {
      // Semifinals (round 1): 2 matches
      for (let i = 0; i < 2; i++) {
        matches.push({
          matchId: `m_${tournament.tournamentId}_r1_p${i}`,
          round: 1,
          position: i,
          roomId: null,
          participantIds: [sortedParticipants[i * 2]?.playerId ?? null, sortedParticipants[i * 2 + 1]?.playerId ?? null],
          winnerId: null,
          status: 'waiting',
        });
      }
      // Final (round 2): 1 match
      matches.push({
        matchId: `m_${tournament.tournamentId}_r2_p0`,
        round: 2,
        position: 0,
        roomId: null,
        participantIds: [null, null], // winners from round 1
        winnerId: null,
        status: 'waiting',
      });
    } else {
      // Size 8: Quarterfinals (round 1) -> Semis (round 2) -> Final (round 3)
      // Seed matchup pattern for standard single elimination: 1v8, 4v5, 2v7, 3v6
      const seedMatchups = [[0, 7], [3, 4], [1, 6], [2, 5]];
      for (let i = 0; i < 4; i++) {
        matches.push({
          matchId: `m_${tournament.tournamentId}_r1_p${i}`,
          round: 1,
          position: i,
          roomId: null,
          participantIds: [
            sortedParticipants[seedMatchups[i][0]]?.playerId ?? null,
            sortedParticipants[seedMatchups[i][1]]?.playerId ?? null,
          ],
          winnerId: null,
          status: 'waiting',
        });
      }
      for (let r = 2; r <= rounds; r++) {
        const numMatches = Math.pow(2, rounds - r);
        for (let p = 0; p < numMatches; p++) {
          matches.push({
            matchId: `m_${tournament.tournamentId}_r${r}_p${p}`,
            round: r,
            position: p,
            roomId: null,
            participantIds: [null, null],
            winnerId: null,
            status: 'waiting',
          });
        }
      }
    }
    tournament.matches = matches;
  }

  function propogateTournamentWinner(tournament: Tournament, matchId: string, winnerId: string) {
    const match = tournament.matches.find(m => m.matchId === matchId);
    if (!match) return;
    match.winnerId = winnerId;
    match.status = 'completed';

    const participant = tournament.participants.find(p => p.playerId === winnerId);
    if (participant) {
      // Mark all losers as eliminated
      for (const pid of match.participantIds) {
        if (pid && pid !== winnerId) {
          const loser = tournament.participants.find(p => p.playerId === pid);
          if (loser) loser.eliminated = true;
        }
      }
    }

    const rounds = tournament.size === 4 ? 2 : 3;
    if (match.round === rounds) {
      // Final match - tournament complete
      tournament.status = 'completed';
      tournament.championId = winnerId;
      tournament.completedAt = Date.now();
      if (participant) participant.eliminated = false;
      return;
    }

    // Advance winner to next round
    const nextRound = match.round + 1;
    const nextPosition = Math.floor(match.position / 2);
    const nextSlot = match.position % 2;
    const nextMatch = tournament.matches.find(m => m.round === nextRound && m.position === nextPosition);
    if (nextMatch) {
      nextMatch.participantIds[nextSlot] = winnerId;
      if (nextMatch.participantIds.every(pid => pid !== null)) {
        nextMatch.status = 'waiting';
      }
    }
  }

  io.on("connection", (socket: Socket) => {
    // Feature 21: Matchmaking Entry
    socket.on("enter-matchmaking", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) return;
        const playerName = sanitizeName(payload?.playerName, "Player");
        const mode: '2p' | '4p' = payload?.mode === '4p' ? '4p' : '2p';
        const isRanked = !!payload?.isRanked;

        // Remove from existing queue if present
        const existingIdx = matchmakingQueue.findIndex(e => e.playerId === playerId);
        if (existingIdx !== -1) matchmakingQueue.splice(existingIdx, 1);

        const profile = getOrCreateProfile(playerId, playerName);
        matchmakingQueue.push({
          playerId,
          socketId: socket.id,
          name: playerName,
          mode,
          isRanked,
          rating: profile.rankedRating || 1000,
          joinedAt: Date.now(),
        });

        socket.emit("matchmaking-entered", { mode, isRanked });
      } catch (err) {
        console.error("enter-matchmaking error:", err);
      }
    });

    socket.on("cancel-matchmaking", (playerIdRaw) => {
      const playerId = sanitizePlayerId(playerIdRaw);
      if (playerId) {
        const idx = matchmakingQueue.findIndex(e => e.playerId === playerId);
        if (idx !== -1) matchmakingQueue.splice(idx, 1);
        socket.emit("matchmaking-cancelled");
      }
    });

    // Feature 19: Join as Spectator
    socket.on("join-spectator", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const spectatorId = sanitizePlayerId(payload?.spectatorId);
        if (!roomId || !spectatorId) {
          socket.emit("error", "Invalid spectator request.");
          return;
        }
        const spectatorName = sanitizeName(payload?.spectatorName, "Spectator");

        const game = games.get(roomId);
        if (!game) {
          socket.emit("error", "Room not found.");
          return;
        }

        if (game.allowSpectators === false) {
          socket.emit("error", "Spectator mode is disabled for this room.");
          return;
        }

        if (!game.spectators) game.spectators = [];

        let spec = game.spectators.find(s => s.spectatorId === spectatorId);
        if (!spec) {
          spec = {
            spectatorId,
            socketId: socket.id,
            name: spectatorName,
            connected: true,
          };
          game.spectators.push(spec);
        } else {
          spec.socketId = socket.id;
          spec.connected = true;
          spec.name = spectatorName;
        }

        socket.join(roomId);
        socketMeta.set(socket.id, { roomId, playerId: spectatorId, isSpectator: true });

        socket.emit("game-updated", toSpectatorState(game, spectatorId, (pid) => playerProfiles.get(pid)));
        broadcastGame(roomId);
      } catch (err) {
        console.error("join-spectator error:", err);
      }
    });

    socket.on("toggle-allow-spectators", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game) return;

        const meta = socketMeta.get(socket.id);
        if (meta && game.hostPlayerId === meta.playerId) {
          game.allowSpectators = !!payload?.allowSpectators;
          broadcastGame(roomId);
        }
      } catch (err) {
        console.error("toggle-allow-spectators error:", err);
      }
    });

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
        const wasInRoom = !!profile.currentRoomId;
        profile.lastOnline = Date.now();
        profile.currentRoomId = roomId;
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
            allowSpectators: true,
            spectators: [],
            hostPlayerId: playerId,
            activityFeed: [],
            tournamentId: null,
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
          // Feature 32: Activity event for reconnect
          if (game.status === 'playing') {
            addActivityEvent(game, 'player_reconnected', playerId, `${playerName} reconnected`);
          }
          broadcastGame(roomId);
          // Feature 25: Notify friends of online status
          broadcastFriendOnlineStatus(io, profile, true);
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
        // Feature 25: Notify friends of online status
        broadcastFriendOnlineStatus(io, profile, true);
      } catch (err) {
        console.error("join-room error:", err);
        socket.emit("error", "Something went wrong joining the room.");
      }
    });

    // Feature 20: Add AI / Bot Player to Lobby
    socket.on("add-bot", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const difficulty: BotDifficulty = payload?.difficulty === 'easy' ? 'easy' : 'medium';
        if (!roomId) return;

        const game = games.get(roomId);
        if (!game || game.status !== "waiting" || game.players.length >= 4) return;

        const meta = socketMeta.get(socket.id);
        if (!meta || game.hostPlayerId !== meta.playerId) {
          socket.emit("error", "Only the room host can add AI bots.");
          return;
        }

        const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const botName = difficulty === 'easy' ? `Bot (Easy #${game.players.length + 1})` : `Bot (Medium #${game.players.length + 1})`;

        const botPlayer: Player = {
          playerId: botId,
          socketId: null,
          name: botName,
          color: pickAvailableColor(game.players),
          hand: [],
          connected: true,
          surrendered: false,
          isBot: true,
          botDifficulty: difficulty,
        };

        game.players.push(botPlayer);
        broadcastGame(roomId);
      } catch (err) {
        console.error("add-bot error:", err);
      }
    });

    socket.on("remove-bot", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const botPlayerId = payload?.botPlayerId;
        if (!roomId || typeof botPlayerId !== "string") return;

        const game = games.get(roomId);
        if (!game || game.status !== "waiting") return;

        const meta = socketMeta.get(socket.id);
        if (!meta || game.hostPlayerId !== meta.playerId) return;

        const idx = game.players.findIndex(p => p.playerId === botPlayerId && p.isBot);
        if (idx !== -1) {
          game.players.splice(idx, 1);
          broadcastGame(roomId);
        }
      } catch (err) {
        console.error("remove-bot error:", err);
      }
    });

    socket.on("get-profile", (playerIdRaw) => {
      const playerId = sanitizePlayerId(playerIdRaw);
      if (playerId) {
        const profile = getOrCreateProfile(playerId, "Player");
        socket.emit("profile-updated", { profile, newlyUnlocked: [] });
      }
    });

    socket.on("update-profile-settings", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) return;

        const profile = getOrCreateProfile(playerId, "Player");

        if (typeof payload?.name === "string") {
          profile.name = sanitizeName(payload.name, profile.name);
        }

        if (typeof payload?.avatar === "string" && profile.ownedCosmetics.includes(payload.avatar)) {
          profile.avatar = payload.avatar;
          profile.equippedCosmetics.avatar = payload.avatar;
        }

        if (payload?.equippedCosmetics && typeof payload.equippedCosmetics === "object") {
          const eq = payload.equippedCosmetics;
          for (const key of Object.keys(eq)) {
            const itemId = eq[key];
            if (typeof itemId === "string" && profile.ownedCosmetics.includes(itemId)) {
              (profile.equippedCosmetics as any)[key] = itemId;
            }
          }
        }

        socket.emit("profile-updated", { profile, newlyUnlocked: [] });

        const meta = socketMeta.get(socket.id);
        if (meta) {
          const game = games.get(meta.roomId);
          if (game) {
            const p = game.players.find(pl => pl.playerId === playerId);
            if (p) p.name = profile.name;
            broadcastGame(meta.roomId);
          }
        }
      } catch (err) {
        console.error("update-profile-settings error:", err);
      }
    });

    socket.on("buy-cosmetic", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        const itemId = payload?.itemId;
        if (!playerId || typeof itemId !== "string") return;

        const profile = getOrCreateProfile(playerId, "Player");
        const shopItem = SHOP_CATALOG.find(i => i.id === itemId);

        if (!shopItem) {
          socket.emit("error", "Cosmetic item not found in catalog.");
          return;
        }

        if (profile.ownedCosmetics.includes(itemId)) {
          socket.emit("error", "You already own this item!");
          return;
        }

        if (profile.coins < shopItem.price) {
          socket.emit("error", `Not enough coins! You need ${shopItem.price} coins.`);
          return;
        }

        profile.coins -= shopItem.price;
        profile.ownedCosmetics.push(itemId);
        (profile.equippedCosmetics as any)[shopItem.category] = itemId;

        socket.emit("profile-updated", { profile, newlyUnlocked: [] });
        socket.emit("toast-message", `🛍️ Purchased & equipped ${shopItem.name}!`);

        const meta = socketMeta.get(socket.id);
        if (meta) broadcastGame(meta.roomId);
      } catch (err) {
        console.error("buy-cosmetic error:", err);
      }
    });

    socket.on("equip-cosmetic", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        const itemId = payload?.itemId;
        if (!playerId || typeof itemId !== "string") return;

        const profile = getOrCreateProfile(playerId, "Player");
        const shopItem = SHOP_CATALOG.find(i => i.id === itemId);

        if (!shopItem || !profile.ownedCosmetics.includes(itemId)) {
          socket.emit("error", "You do not own this item!");
          return;
        }

        (profile.equippedCosmetics as any)[shopItem.category] = itemId;

        socket.emit("profile-updated", { profile, newlyUnlocked: [] });
        socket.emit("toast-message", `🎨 Equipped ${shopItem.name}`);

        const meta = socketMeta.get(socket.id);
        if (meta) broadcastGame(meta.roomId);
      } catch (err) {
        console.error("equip-cosmetic error:", err);
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
            profile.dailyStreak = 1;
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

        // Feature 32: Game started activity event
        addActivityEvent(game, 'game_start', null, `🎮 Game started! (${game.players.length} players${game.isTeamGame ? ' · 2v2 Teams' : ''})`);

        broadcastGame(roomId);

        // Feature 20: Check if first player is a bot
        triggerBotTurnIfNeeded(game);
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

        if (game.undoDeadline) return;

        const player = game.players[game.turnIndex];
        if (!player || player.socketId !== socket.id || player.surrendered || player.isBot) return;

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

        const undoSnap: UndoSnapshot = {
          board: JSON.parse(JSON.stringify(game.board)),
          players: JSON.parse(JSON.stringify(game.players)),
          turnIndex: game.turnIndex,
          deck: JSON.parse(JSON.stringify(game.deck)),
          lastMove: game.lastMove ? { ...game.lastMove } : null,
          winner: game.winner,
          status: game.status,
          gameStats: game.gameStats ? { ...game.gameStats } : null,
          totalMoves: game.totalMoves || 0,
        };

        game.totalMoves = (game.totalMoves || 0) + 1;

        player.hand.splice(cardIndex, 1);
        if (game.deck.length > 0) {
          player.hand.push(game.deck.pop()!);
        }

        const moveType: 'place' | 'remove' = card.rank === "J" && (card.suit === "H" || card.suit === "S") ? "remove" : "place";

        game.lastMove = {
          playerId: player.playerId,
          row,
          col,
          type: moveType,
        };

        // Feature 32: Activity events for chip place/remove
        if (moveType === 'place') {
          addActivityEvent(game, 'chip_placed', player.playerId, `${player.name} placed a chip`, player.color);
        } else {
          addActivityEvent(game, 'chip_removed', player.playerId, `${player.name} removed a chip with a Jack`, player.color);
        }

        const { count, cells, sequences } = checkSequences(game.board, player.color);
        cells.forEach(([r, c]) => {
          game.board[r][c].isLocked = true;
        });

        game.winningSequences = sequences;
        game.winningCells = cells;

        // Feature 32: Sequence completed events
        if (count > 0 && moveType === 'place') {
          const teamName = game.isTeamGame
            ? (player.color === '#2563eb' ? 'Team Blue' : player.color === '#dc2626' ? 'Team Red' : player.color === '#16a34a' ? 'Team Green' : 'Team Gold')
            : undefined;
          addActivityEvent(
            game,
            'sequence_completed',
            player.playerId,
            `✨ ${teamName ? teamName + ': ' : ''}${player.name} completed ${count} sequence${count > 1 ? 's' : ''}!`,
            player.color,
          );
        }

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

          // Feature 32: Game end activity event
          addActivityEvent(
            game,
            'game_end',
            player.playerId,
            `🏆 ${game.winningTeam ?? player.name} wins!`,
          );

          processMatchRewards(game, io, sendNotificationToPlayer);

          // Feature 28: Tournament result propagation
          if (game.tournamentId) {
            const tournament = tournaments.get(game.tournamentId);
            if (tournament) {
              // Find the match this room corresponds to
              const match = tournament.matches.find(m => m.roomId === roomId);
              if (match && match.status !== 'completed') {
                // Determine winner: in team games, pick one winner (first team player for now)
                const winnerPlayer = game.winningPlayerNames && game.winningPlayerNames.length > 0
                  ? game.players.find(p => p.name === game.winningPlayerNames![0])
                  : player;
                if (winnerPlayer) {
                  propogateTournamentWinner(tournament, match.matchId, winnerPlayer.playerId);
                  // Notify all tournament participants
                  for (const p of tournament.participants) {
                    const sockId = getSocketIdForPlayer(p.playerId);
                    if (sockId) io.to(sockId).emit('tournament-updated', tournament);
                  }
                }
              }
            }
          }
        } else {
          game.undoSnapshot = undoSnap;
          game.undoAvailableForPlayerId = player.playerId;
          game.undoDeadline = Date.now() + GAME_CONFIG.UNDO_DURATION_MS;
          game.turnDeadline = null;
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
        game.totalMoves = snap.totalMoves ?? (game.totalMoves ? game.totalMoves - 1 : 0);

        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;

        // Feature 32: Undo activity event
        const player = game.players.find(p => p.playerId === meta.playerId);
        if (player) {
          addActivityEvent(game, 'undo_used', meta.playerId, `↩️ ${player.name} used Undo`);
        }

        resetTurnDeadline(game);
        triggerBotTurnIfNeeded(game);

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

        const activeConnected = game.players.filter(p => p.connected && !p.isBot);
        if (activeConnected.length >= 1 && activeConnected.every(p => game.rematchVotes?.includes(p.playerId))) {
          executeRematchStart(game);
        }
        broadcastGame(roomId);
      } catch (err) {
        console.error("vote-rematch error:", err);
      }
    });

    socket.on("swap-dead-card", (payload) => {
      try {
        const roomId = sanitizeRoomId(payload?.roomId);
        const cardId = payload?.cardId;
        if (!roomId || typeof cardId !== "string") return;

        const game = games.get(roomId);
        if (!game || game.status !== "playing" || game.undoDeadline) return;

        const player = game.players[game.turnIndex];
        if (!player || player.socketId !== socket.id || player.surrendered || player.isBot) return;

        const cardIdx = player.hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return;

        const card = player.hand[cardIdx];
        if (card.rank === "J") return;

        let isDead = true;
        for (let r = 0; r < 10; r++) {
          for (let c = 0; c < 10; c++) {
            const cell = game.board[r][c];
            if (cell.card && cell.card.rank === card.rank && cell.card.suit === card.suit) {
              if (cell.chip === null) {
                isDead = false;
                break;
              }
            }
          }
          if (!isDead) break;
        }

        if (!isDead) {
          socket.emit("error", "This card still has open spots on the board!");
          return;
        }

        player.hand.splice(cardIdx, 1);
        if (game.deck.length > 0) {
          player.hand.push(game.deck.pop()!);
        }
        socket.emit("toast-message", `🔄 Dead Card (${card.rank}${card.suit}) swapped for a new card!`);
        broadcastGame(roomId);
      } catch (err) {
        console.error("swap-dead-card error:", err);
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

        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;

        player.surrendered = true;

        // Feature 32: Surrender activity event
        addActivityEvent(game, 'surrender', player.playerId, `🏳️ ${player.name} surrendered`, player.color);

        const remaining = game.players.filter(p => !p.surrendered);

        if (game.isTeamGame && game.players.length === 4) {
          const winnerTeamColor = player.color === '#2563eb' ? '#dc2626' : '#2563eb';
          const winningTeamPlayers = game.players.filter(p => p.color === winnerTeamColor);
          game.status = "finished";
          game.winner = winningTeamPlayers.map(p => p.name).join(' & ');
          game.winningPlayerNames = winningTeamPlayers.map(p => p.name);
          game.winningTeam = winnerTeamColor === '#2563eb' ? 'Team Blue' : 'Team Red';
          game.turnDeadline = null;

          addActivityEvent(game, 'game_end', null, `🏆 ${game.winningTeam} wins by surrender!`);
          processMatchRewards(game, io, sendNotificationToPlayer);

          // Tournament integration
          if (game.tournamentId) {
            const tournament = tournaments.get(game.tournamentId);
            if (tournament) {
              const match = tournament.matches.find(m => m.roomId === roomId);
              if (match && match.status !== 'completed') {
                const winnerPlayer = winningTeamPlayers[0];
                if (winnerPlayer) {
                  propogateTournamentWinner(tournament, match.matchId, winnerPlayer.playerId);
                  for (const p of tournament.participants) {
                    const sockId = getSocketIdForPlayer(p.playerId);
                    if (sockId) io.to(sockId).emit('tournament-updated', tournament);
                  }
                }
              }
            }
          }
        } else if (remaining.length <= 1) {
          const winner = remaining[0] ?? player;
          game.status = "finished";
          game.winner = winner.name;
          game.winningPlayerNames = [winner.name];
          game.winningTeam = null;
          game.turnDeadline = null;

          addActivityEvent(game, 'game_end', winner.playerId, `🏆 ${winner.name} wins by surrender!`);
          processMatchRewards(game, io, sendNotificationToPlayer);

          // Tournament integration
          if (game.tournamentId && winner.playerId) {
            const tournament = tournaments.get(game.tournamentId);
            if (tournament) {
              const match = tournament.matches.find(m => m.roomId === roomId);
              if (match && match.status !== 'completed') {
                propogateTournamentWinner(tournament, match.matchId, winner.playerId);
                for (const p of tournament.participants) {
                  const sockId = getSocketIdForPlayer(p.playerId);
                  if (sockId) io.to(sockId).emit('tournament-updated', tournament);
                }
              }
            }
          }
        } else {
          if (game.players[game.turnIndex].playerId === player.playerId) {
            game.turnIndex = nextTurnIndex(game);
            resetTurnDeadline(game);
            triggerBotTurnIfNeeded(game);
          }
        }

        broadcastGame(roomId);
      } catch (err) {
        console.error("surrender-game error:", err);
      }
    });

    socket.on("skip-turn", (roomIdRaw) => {
      try {
        const roomId = sanitizeRoomId(roomIdRaw);
        if (!roomId) return;
        const game = games.get(roomId);
        if (!game || game.status !== "playing") return;

        const requesterMeta = socketMeta.get(socket.id);
        if (!requesterMeta || requesterMeta.roomId !== roomId) return;

        const currentPlayer = game.players[game.turnIndex];
        if (!currentPlayer || (currentPlayer.connected && !currentPlayer.isBot)) return;

        const requester = game.players.find(p => p.playerId === requesterMeta.playerId);
        if (!requester || !requester.connected) return;

        game.undoSnapshot = null;
        game.undoAvailableForPlayerId = null;
        game.undoDeadline = null;

        // Feature 32: Skip turn activity event
        if (currentPlayer && !currentPlayer.isBot) {
          addActivityEvent(game, 'turn_skipped', currentPlayer.playerId, `⏭️ ${currentPlayer.name}'s turn was skipped`);
        }

        game.turnIndex = nextTurnIndex(game);
        resetTurnDeadline(game);
        triggerBotTurnIfNeeded(game);
        broadcastGame(roomId);
      } catch (err) {
        console.error("skip-turn error:", err);
      }
    });

    // ========================================================================
    // FEATURE 24: LEADERBOARDS - Server-side sorted queries
    // ========================================================================
    socket.on("get-leaderboard", (payload, ack) => {
      try {
        const category: LeaderboardCategory = payload?.category === 'wins' || payload?.category === 'streak' || payload?.category === 'sequences'
          ? payload.category
          : 'rating';
        const currentPlayerId = sanitizePlayerId(payload?.playerId);
        const { entries, userRank, userEntry } = getLeaderboard(category, currentPlayerId ?? null);
        if (ack && typeof ack === 'function') {
          ack({ success: true, category, entries, userRank, userEntry });
        } else {
          socket.emit('leaderboard-data', { category, entries, userRank, userEntry });
        }
      } catch (err) {
        console.error("get-leaderboard error:", err);
        socket.emit('error', 'Failed to fetch leaderboard');
      }
    });

    // ========================================================================
    // FEATURE 25: FRIENDS SYSTEM
    // ========================================================================
    socket.on("search-players", (payload, ack) => {
      try {
        const query = typeof payload?.query === 'string' ? payload.query.trim().toLowerCase() : '';
        const requesterId = sanitizePlayerId(payload?.playerId);
        if (!query || query.length < 1) {
          ack?.({ success: true, results: [] });
          return;
        }
        const results: Array<{
          playerId: string;
          name: string;
          rankedRating: number;
          avatar: string;
          isOnline: boolean;
          friendshipStatus: 'none' | 'request_sent' | 'request_received' | 'friends';
        }> = [];
        const requesterProfile = requesterId ? playerProfiles.get(requesterId) : null;
        let count = 0;
        for (const p of playerProfiles.values()) {
          if (p.playerId === requesterId) continue;
          if (p.name.toLowerCase().includes(query)) {
            let status: 'none' | 'request_sent' | 'request_received' | 'friends' = 'none';
            if (requesterProfile) {
              if (requesterProfile.friendIds.includes(p.playerId)) status = 'friends';
              else {
                for (const reqId of requesterProfile.pendingFriendRequestsSent) {
                  const req = friendRequests.get(reqId);
                  if (req && req.toPlayerId === p.playerId) { status = 'request_sent'; break; }
                }
                if (status === 'none') {
                  for (const reqId of requesterProfile.pendingFriendRequestsReceived) {
                    const req = friendRequests.get(reqId);
                    if (req && req.fromPlayerId === p.playerId) { status = 'request_received'; break; }
                  }
                }
              }
            }
            results.push({
              playerId: p.playerId,
              name: p.name,
              rankedRating: p.rankedRating,
              avatar: p.avatar,
              isOnline: !!p.currentRoomId || (Date.now() - p.lastOnline < 5 * 60 * 1000),
              friendshipStatus: status,
            });
            count++;
            if (count >= 20) break;
          }
        }
        ack?.({ success: true, results });
      } catch (err) {
        console.error("search-players error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    socket.on("send-friend-request", (payload) => {
      try {
        const fromId = sanitizePlayerId(payload?.fromPlayerId);
        const toId = sanitizePlayerId(payload?.toPlayerId);
        if (!fromId || !toId || fromId === toId) return;
        const fromProfile = getOrCreateProfile(fromId, '');
        const toProfile = playerProfiles.get(toId);
        if (!toProfile) return;
        // Already friends?
        if (fromProfile.friendIds.includes(toId)) return;
        // Check for duplicate pending request
        const existingRequest = Array.from(friendRequests.values()).find(r =>
          ((r.fromPlayerId === fromId && r.toPlayerId === toId) || (r.fromPlayerId === toId && r.toPlayerId === fromId)) &&
          r.status === 'pending'
        );
        if (existingRequest) return;
        const requestId = `fr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const request: FriendRequest = {
          requestId,
          fromPlayerId: fromId,
          toPlayerId: toId,
          fromPlayerName: fromProfile.name,
          toPlayerName: toProfile.name,
          createdAt: Date.now(),
          status: 'pending',
        };
        friendRequests.set(requestId, request);
        fromProfile.pendingFriendRequestsSent.push(requestId);
        toProfile.pendingFriendRequestsReceived.push(requestId);

        // Send notification to recipient
        const notif = createNotification(
          'friend_request',
          `👋 ${fromProfile.name} sent you a friend request!`,
          { requestId, fromPlayerId: fromId, fromPlayerName: fromProfile.name },
        );
        sendNotificationToPlayer(io, toProfile, notif);

        const fromSock = getSocketIdForPlayer(fromId);
        if (fromSock) io.to(fromSock).emit("profile-updated", { profile: fromProfile, newlyUnlocked: [] });
        socket.emit("friend-request-sent", { requestId, toPlayerId: toId });
      } catch (err) {
        console.error("send-friend-request error:", err);
      }
    });

    socket.on("accept-friend-request", (payload) => {
      try {
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
        const accepterId = sanitizePlayerId(payload?.playerId);
        if (!requestId || !accepterId) return;
        const request = friendRequests.get(requestId);
        if (!request || request.status !== 'pending') return;
        if (request.toPlayerId !== accepterId) return;

        request.status = 'accepted';
        const fromProfile = getOrCreateProfile(request.fromPlayerId, request.fromPlayerName);
        const toProfile = getOrCreateProfile(request.toPlayerId, request.toPlayerName);

        if (!fromProfile.friendIds.includes(toProfile.playerId)) fromProfile.friendIds.push(toProfile.playerId);
        if (!toProfile.friendIds.includes(fromProfile.playerId)) toProfile.friendIds.push(fromProfile.playerId);

        fromProfile.pendingFriendRequestsSent = fromProfile.pendingFriendRequestsSent.filter(id => id !== requestId);
        toProfile.pendingFriendRequestsReceived = toProfile.pendingFriendRequestsReceived.filter(id => id !== requestId);

        // Send accepted notification to requester
        const notif = createNotification(
          'friend_accepted',
          `🤝 ${toProfile.name} accepted your friend request!`,
          { friendId: toProfile.playerId, friendName: toProfile.name },
        );
        sendNotificationToPlayer(io, fromProfile, notif);

        const accepterSock = getSocketIdForPlayer(accepterId);
        if (accepterSock) io.to(accepterSock).emit("profile-updated", { profile: toProfile, newlyUnlocked: [] });
        const fromSock = getSocketIdForPlayer(fromProfile.playerId);
        if (fromSock) io.to(fromSock).emit("profile-updated", { profile: fromProfile, newlyUnlocked: [] });
        socket.emit("friend-request-accepted", { requestId });
      } catch (err) {
        console.error("accept-friend-request error:", err);
      }
    });

    socket.on("reject-friend-request", (payload) => {
      try {
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : null;
        const rejecterId = sanitizePlayerId(payload?.playerId);
        if (!requestId || !rejecterId) return;
        const request = friendRequests.get(requestId);
        if (!request || request.status !== 'pending') return;
        if (request.toPlayerId !== rejecterId) return;
        request.status = 'rejected';
        const toProfile = getOrCreateProfile(rejecterId, '');
        const fromProfile = getOrCreateProfile(request.fromPlayerId, request.fromPlayerName);
        fromProfile.pendingFriendRequestsSent = fromProfile.pendingFriendRequestsSent.filter(id => id !== requestId);
        toProfile.pendingFriendRequestsReceived = toProfile.pendingFriendRequestsReceived.filter(id => id !== requestId);
        const rejecterSock = getSocketIdForPlayer(rejecterId);
        if (rejecterSock) io.to(rejecterSock).emit("profile-updated", { profile: toProfile, newlyUnlocked: [] });
        const fromSock = getSocketIdForPlayer(fromProfile.playerId);
        if (fromSock) io.to(fromSock).emit("profile-updated", { profile: fromProfile, newlyUnlocked: [] });
        socket.emit("friend-request-rejected", { requestId });
      } catch (err) {
        console.error("reject-friend-request error:", err);
      }
    });

    socket.on("remove-friend", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        const friendId = sanitizePlayerId(payload?.friendId);
        if (!playerId || !friendId) return;
        const profile = getOrCreateProfile(playerId, '');
        const friendProfile = playerProfiles.get(friendId);
        profile.friendIds = profile.friendIds.filter(id => id !== friendId);
        if (friendProfile) {
          friendProfile.friendIds = friendProfile.friendIds.filter(id => id !== playerId);
          const friendSock = getSocketIdForPlayer(friendId);
          if (friendSock) io.to(friendSock).emit("profile-updated", { profile: friendProfile, newlyUnlocked: [] });
          broadcastFriendOnlineStatus(io, friendProfile, false);
        }
        const sock = getSocketIdForPlayer(playerId);
        if (sock) io.to(sock).emit("profile-updated", { profile, newlyUnlocked: [] });
        socket.emit("friend-removed", { friendId });
      } catch (err) {
        console.error("remove-friend error:", err);
      }
    });

    socket.on("get-friends-list", (payload, ack) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) { ack?.({ success: false, error: 'Invalid player' }); return; }
        const profile = getOrCreateProfile(playerId, '');
        const friends: FriendEntry[] = [];
        for (const fid of profile.friendIds) {
          const fp = playerProfiles.get(fid);
          if (!fp) continue;
          const sockId = getSocketIdForPlayer(fid);
          const isOnline = !!sockId;
          friends.push({
            playerId: fp.playerId,
            name: fp.name,
            avatar: fp.avatar,
            rankedRating: fp.rankedRating,
            isOnline,
            inGame: isOnline && !!fp.currentRoomId,
            currentRoomId: fp.currentRoomId,
            friendshipSince: Date.now(),
          });
        }
        const receivedRequests: FriendRequest[] = [];
        for (const reqId of profile.pendingFriendRequestsReceived) {
          const req = friendRequests.get(reqId);
          if (req && req.status === 'pending') receivedRequests.push(req);
        }
        const sentRequests: FriendRequest[] = [];
        for (const reqId of profile.pendingFriendRequestsSent) {
          const req = friendRequests.get(reqId);
          if (req && req.status === 'pending') sentRequests.push(req);
        }
        ack?.({ success: true, friends, receivedRequests, sentRequests });
      } catch (err) {
        console.error("get-friends-list error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    // ========================================================================
    // FEATURE 26: DIRECT GAME INVITES
    // ========================================================================
    socket.on("send-game-invite", (payload) => {
      try {
        const fromId = sanitizePlayerId(payload?.fromPlayerId);
        const toId = sanitizePlayerId(payload?.toPlayerId);
        const roomId = sanitizeRoomId(payload?.roomId);
        if (!fromId || !toId || !roomId || fromId === toId) return;
        const game = games.get(roomId);
        if (!game) return;
        const fromProfile = getOrCreateProfile(fromId, '');
        const toProfile = playerProfiles.get(toId);
        if (!toProfile) return;
        // Clean up any existing pending invites between these two for the same room
        for (const [invId, inv] of gameInvites) {
          if (inv.fromPlayerId === fromId && inv.toPlayerId === toId && inv.roomId === roomId && inv.status === 'pending') {
            inv.status = 'expired';
          }
        }
        const inviteId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const invite: GameInvite = {
          inviteId,
          fromPlayerId: fromId,
          fromPlayerName: fromProfile.name,
          toPlayerId: toId,
          toPlayerName: toProfile.name,
          roomId,
          roomMode: game.players.length === 4 ? '4 Players (2v2)' : `${Math.max(2, game.players.length)} Players`,
          isRanked: !!game.isRanked,
          playerCount: game.players.length,
          maxPlayers: 4,
          createdAt: now,
          expiresAt: now + GAME_INVITE_TTL_MS,
          status: 'pending',
        };
        gameInvites.set(inviteId, invite);
        const notif = createNotification(
          'game_invite',
          `🎮 ${fromProfile.name} invited you to a Sequence match${game.isRanked ? ' (RANKED)' : ''}!`,
          { inviteId, roomId, fromPlayerId: fromId, fromPlayerName: fromProfile.name, isRanked: game.isRanked },
        );
        sendNotificationToPlayer(io, toProfile, notif);
        socket.emit("game-invite-sent", { inviteId, toPlayerId: toId });
      } catch (err) {
        console.error("send-game-invite error:", err);
      }
    });

    socket.on("accept-game-invite", (payload) => {
      try {
        const inviteId = typeof payload?.inviteId === 'string' ? payload.inviteId : null;
        const acceptorId = sanitizePlayerId(payload?.playerId);
        if (!inviteId || !acceptorId) return;
        const invite = gameInvites.get(inviteId);
        if (!invite) { socket.emit("toast-message", "❌ Invite not found."); return; }
        if (invite.status !== 'pending') { socket.emit("toast-message", "❌ Invite is no longer available."); return; }
        if (invite.toPlayerId !== acceptorId) return;
        if (Date.now() > invite.expiresAt) {
          invite.status = 'expired';
          socket.emit("toast-message", "⏰ Invite has expired.");
          return;
        }
        const game = games.get(invite.roomId);
        if (!game) { socket.emit("toast-message", "❌ This room no longer exists."); return; }
        if (game.status !== "waiting") { socket.emit("toast-message", "❌ This game has already started."); return; }
        if (game.players.length >= 4) { socket.emit("toast-message", "❌ This room is no longer available."); return; }
        invite.status = 'accepted';
        socket.emit("game-invite-accepted", { inviteId, roomId: invite.roomId });
      } catch (err) {
        console.error("accept-game-invite error:", err);
      }
    });

    socket.on("decline-game-invite", (payload) => {
      try {
        const inviteId = typeof payload?.inviteId === 'string' ? payload.inviteId : null;
        if (!inviteId) return;
        const invite = gameInvites.get(inviteId);
        if (invite && invite.status === 'pending') invite.status = 'declined';
        socket.emit("game-invite-declined", { inviteId });
      } catch (err) {
        console.error("decline-game-invite error:", err);
      }
    });

    // ========================================================================
    // FEATURE 27: NOTIFICATIONS MANAGEMENT
    // ========================================================================
    socket.on("get-notifications", (payload, ack) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) { ack?.({ success: false }); return; }
        const profile = getOrCreateProfile(playerId, '');
        ack?.({ success: true, notifications: profile.notifications, unreadCount: profile.notifications.filter(n => !n.read).length });
      } catch (err) {
        console.error("get-notifications error:", err);
      }
    });

    socket.on("mark-notification-read", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        const notifId = typeof payload?.notificationId === 'string' ? payload.notificationId : null;
        if (!playerId || !notifId) return;
        const profile = getOrCreateProfile(playerId, '');
        const notif = profile.notifications.find(n => n.id === notifId);
        if (notif) notif.read = true;
        const sock = getSocketIdForPlayer(playerId);
        if (sock) io.to(sock).emit("profile-updated", { profile, newlyUnlocked: [] });
      } catch (err) {
        console.error("mark-notification-read error:", err);
      }
    });

    socket.on("mark-all-notifications-read", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) return;
        const profile = getOrCreateProfile(playerId, '');
        profile.notifications.forEach(n => n.read = true);
        const sock = getSocketIdForPlayer(playerId);
        if (sock) io.to(sock).emit("profile-updated", { profile, newlyUnlocked: [] });
      } catch (err) {
        console.error("mark-all-notifications-read error:", err);
      }
    });

    // ========================================================================
    // FEATURE 28: TOURNAMENT MODE
    // ========================================================================
    socket.on("create-tournament", (payload, ack) => {
      try {
        const hostId = sanitizePlayerId(payload?.hostPlayerId);
        const hostName = sanitizeName(payload?.hostPlayerName, 'Host');
        const size: TournamentSize = payload?.size === 8 ? 8 : 4;
        const name = sanitizeName(payload?.name, `${hostName}'s Tournament`);
        if (!hostId) return;
        const hostProfile = getOrCreateProfile(hostId, hostName);
        const tournamentId = `TRN-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const tournament: Tournament = {
          tournamentId,
          name,
          size,
          status: 'registration',
          participants: [{
            playerId: hostId,
            name: hostProfile.name,
            avatar: hostProfile.avatar,
            rankedRating: hostProfile.rankedRating,
            seed: 1,
            eliminated: false,
          }],
          matches: [],
          currentRound: 0,
          championId: null,
          createdAt: Date.now(),
          startedAt: null,
          completedAt: null,
          hostPlayerId: hostId,
        };
        tournaments.set(tournamentId, tournament);
        ack?.({ success: true, tournament });
      } catch (err) {
        console.error("create-tournament error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    socket.on("join-tournament", (payload) => {
      try {
        const tournamentId = typeof payload?.tournamentId === 'string' ? payload.tournamentId : null;
        const playerId = sanitizePlayerId(payload?.playerId);
        const playerName = sanitizeName(payload?.playerName, 'Player');
        if (!tournamentId || !playerId) return;
        const tournament = tournaments.get(tournamentId);
        if (!tournament || tournament.status !== 'registration') return;
        if (tournament.participants.length >= tournament.size) return;
        if (tournament.participants.find(p => p.playerId === playerId)) return;
        const profile = getOrCreateProfile(playerId, playerName);
        tournament.participants.push({
          playerId,
          name: profile.name,
          avatar: profile.avatar,
          rankedRating: profile.rankedRating,
          seed: tournament.participants.length + 1,
          eliminated: false,
        });
        // Notify all participants
        for (const p of tournament.participants) {
          const sockId = getSocketIdForPlayer(p.playerId);
          if (sockId) io.to(sockId).emit('tournament-updated', tournament);
        }
        socket.emit('tournament-joined', { tournamentId });
      } catch (err) {
        console.error("join-tournament error:", err);
      }
    });

    socket.on("leave-tournament", (payload) => {
      try {
        const tournamentId = typeof payload?.tournamentId === 'string' ? payload.tournamentId : null;
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!tournamentId || !playerId) return;
        const tournament = tournaments.get(tournamentId);
        if (!tournament || tournament.status !== 'registration') return;
        tournament.participants = tournament.participants.filter(p => p.playerId !== playerId);
        for (const p of tournament.participants) {
          const sockId = getSocketIdForPlayer(p.playerId);
          if (sockId) io.to(sockId).emit('tournament-updated', tournament);
        }
        socket.emit('tournament-left', { tournamentId });
      } catch (err) {
        console.error("leave-tournament error:", err);
      }
    });

    socket.on("start-tournament", (payload) => {
      try {
        const tournamentId = typeof payload?.tournamentId === 'string' ? payload.tournamentId : null;
        const hostId = sanitizePlayerId(payload?.playerId);
        if (!tournamentId || !hostId) return;
        const tournament = tournaments.get(tournamentId);
        if (!tournament || tournament.status !== 'registration') return;
        if (tournament.hostPlayerId !== hostId) return;
        const minPlayers = tournament.size === 4 ? 2 : 4;
        if (tournament.participants.length < minPlayers) return;
        // Re-seed by ranked rating
        tournament.participants.sort((a, b) => b.rankedRating - a.rankedRating);
        tournament.participants.forEach((p, i) => p.seed = i + 1);
        // Pad with byes if short of players
        while (tournament.participants.length < tournament.size) {
          tournament.participants.push({
            playerId: `bye_${tournament.participants.length}`,
            name: '[BYE]',
            avatar: 'avatar_default',
            rankedRating: 0,
            seed: tournament.participants.length + 1,
            eliminated: true,
          });
        }
        generateTournamentBracket(tournament);
        tournament.status = 'in_progress';
        tournament.currentRound = 1;
        tournament.startedAt = Date.now();
        // Auto-advance byes to next round
        for (const match of tournament.matches) {
          const valid = match.participantIds.filter(pid => pid && !pid.startsWith('bye_'));
          if (match.round === 1 && valid.length === 1) {
            const winnerId = valid[0]!;
            propogateTournamentWinner(tournament, match.matchId, winnerId);
          }
        }
        for (const p of tournament.participants) {
          if (p.playerId.startsWith('bye_')) continue;
          const sockId = getSocketIdForPlayer(p.playerId);
          if (sockId) io.to(sockId).emit('tournament-updated', tournament);
        }
        socket.emit('tournament-started', { tournamentId });
      } catch (err) {
        console.error("start-tournament error:", err);
      }
    });

    socket.on("get-tournament", (payload, ack) => {
      try {
        const tournamentId = typeof payload?.tournamentId === 'string' ? payload.tournamentId : null;
        if (!tournamentId) return;
        const tournament = tournaments.get(tournamentId);
        ack?.({ success: !!tournament, tournament: tournament ?? null });
      } catch (err) {
        console.error("get-tournament error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    socket.on("start-tournament-match", (payload, ack) => {
      try {
        const tournamentId = typeof payload?.tournamentId === 'string' ? payload.tournamentId : null;
        const matchId = typeof payload?.matchId === 'string' ? payload.matchId : null;
        if (!tournamentId || !matchId) return;
        const tournament = tournaments.get(tournamentId);
        if (!tournament) { ack?.({ success: false }); return; }
        const match = tournament.matches.find(m => m.matchId === matchId);
        if (!match || match.status !== 'waiting') { ack?.({ success: false }); return; }
        const pids = match.participantIds.filter(pid => pid && !pid.startsWith('bye_'));
        if (pids.length < 2) { ack?.({ success: false }); return; }
        const roomId = `${tournamentId}-R${match.round}M${match.position}`;
        const existing = games.get(roomId);
        if (existing) {
          ack?.({ success: true, roomId });
          return;
        }
        const game: GameState = {
          roomId,
          board: createInitialBoard(),
          players: [],
          turnIndex: 0,
          deck: createDeck(),
          status: "waiting",
          winner: null,
          lastMove: null,
          allowSpectators: true,
          spectators: [],
          hostPlayerId: pids[0]!,
          tournamentId,
          activityFeed: [],
          isRanked: false,
        };
        for (const pid of pids) {
          if (!pid) continue;
          const participant = tournament.participants.find(pt => pt.playerId === pid);
          if (!participant) continue;
          game.players.push({
            playerId: pid,
            socketId: null,
            name: participant.name,
            color: pickAvailableColor(game.players),
            hand: [],
            connected: true,
            surrendered: false,
          });
        }
        games.set(roomId, game);
        match.roomId = roomId;
        match.status = 'in_progress';
        ack?.({ success: true, roomId });
        for (const p of tournament.participants) {
          if (p.playerId.startsWith('bye_')) continue;
          const sockId = getSocketIdForPlayer(p.playerId);
          if (sockId) io.to(sockId).emit('tournament-updated', tournament);
        }
      } catch (err) {
        console.error("start-tournament-match error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    socket.on("get-tournaments-list", (_, ack) => {
      try {
        const list = Array.from(tournaments.values()).slice(0, 50).map(t => ({
          tournamentId: t.tournamentId,
          name: t.name,
          size: t.size,
          status: t.status,
          participantCount: t.participants.length,
          hostPlayerId: t.hostPlayerId,
          currentRound: t.currentRound,
          championId: t.championId,
        }));
        ack?.({ success: true, tournaments: list });
      } catch (err) {
        console.error("get-tournaments-list error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    // ========================================================================
    // FEATURE 29: SEASONAL PROGRESSION
    // ========================================================================
    socket.on("get-season-info", (_, ack) => {
      try {
        ack?.({
          success: true,
          season: ACTIVE_SEASON,
          rewards: SEASONAL_REWARDS,
        });
      } catch (err) {
        console.error("get-season-info error:", err);
      }
    });

    socket.on("claim-seasonal-reward", (payload, ack) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        const level = typeof payload?.level === 'number' ? payload.level : null;
        if (!playerId || level === null) { ack?.({ success: false }); return; }
        const profile = getOrCreateProfile(playerId, '');
        const currentSeasonalLevel = getSeasonalLevelFromXP(profile.seasonalXP);
        if (currentSeasonalLevel < level) { ack?.({ success: false, error: 'Level not reached yet' }); return; }
        if (profile.claimedSeasonalRewards.includes(level)) { ack?.({ success: false, error: 'Already claimed' }); return; }
        const reward = SEASONAL_REWARDS.find(r => r.level === level);
        if (!reward) { ack?.({ success: false, error: 'Reward not found' }); return; }
        profile.claimedSeasonalRewards.push(level);
        let rewardValue: number | string | null = null;
        if (reward.rewardType === 'coins' && typeof reward.value === 'number') {
          profile.coins += reward.value;
          rewardValue = reward.value;
        } else if (reward.rewardType === 'cosmetic' && typeof reward.value === 'string') {
          if (!profile.ownedCosmetics.includes(reward.value)) {
            profile.ownedCosmetics.push(reward.value);
          }
          rewardValue = reward.value;
        }
        const sock = getSocketIdForPlayer(playerId);
        if (sock) io.to(sock).emit("profile-updated", { profile, newlyUnlocked: [] });
        ack?.({ success: true, reward, rewardValue });
      } catch (err) {
        console.error("claim-seasonal-reward error:", err);
        ack?.({ success: false, error: String(err) });
      }
    });

    // ========================================================================
    // FEATURE 31: GAME SETTINGS
    // ========================================================================
    socket.on("update-game-settings", (payload) => {
      try {
        const playerId = sanitizePlayerId(payload?.playerId);
        if (!playerId) return;
        const profile = getOrCreateProfile(playerId, '');
        const s = payload?.settings;
        if (!s || typeof s !== 'object') return;
        if (!profile.settings) {
          profile.settings = {
            showMoveIndicators: true,
            animationsEnabled: true,
            confirmBeforeSurrender: true,
            reducedAnimations: false,
          };
        }
        if (typeof s.showMoveIndicators === 'boolean') profile.settings.showMoveIndicators = s.showMoveIndicators;
        if (typeof s.animationsEnabled === 'boolean') profile.settings.animationsEnabled = s.animationsEnabled;
        if (typeof s.confirmBeforeSurrender === 'boolean') profile.settings.confirmBeforeSurrender = s.confirmBeforeSurrender;
        if (typeof s.reducedAnimations === 'boolean') profile.settings.reducedAnimations = s.reducedAnimations;
        const sock = getSocketIdForPlayer(playerId);
        if (sock) io.to(sock).emit("profile-updated", { profile, newlyUnlocked: [] });
      } catch (err) {
        console.error("update-game-settings error:", err);
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

        // Remove from matchmaking queue if present
        const mmIdx = matchmakingQueue.findIndex(e => e.socketId === socket.id);
        if (mmIdx !== -1) matchmakingQueue.splice(mmIdx, 1);

        if (!meta) return;

        const { roomId, playerId, isSpectator } = meta;
        const game = games.get(roomId);

        // Feature 25 & 29: Update player presence on any disconnect (even if game gone)
        const profile = playerProfiles.get(playerId);
        if (profile) {
          profile.lastOnline = Date.now();
          if (profile.currentRoomId === roomId) {
            profile.currentRoomId = null;
          }
          // Broadcast offline status to friends
          broadcastFriendOnlineStatus(io, profile, false);
        }

        if (!game) return;

        if (isSpectator && game.spectators) {
          const spec = game.spectators.find(s => s.spectatorId === playerId);
          if (spec) spec.connected = false;
          broadcastGame(roomId);
          return;
        }

        const idx = game.players.findIndex(p => p.playerId === playerId);
        if (idx === -1) return;

        const player = game.players[idx];

        if (game.status === "waiting") {
          game.players.splice(idx, 1);
        } else {
          game.players[idx].connected = false;
          game.players[idx].socketId = null;

          // Feature 32: Disconnect activity event
          if (game.status === 'playing' && player && !player.isBot) {
            addActivityEvent(game, 'player_disconnected', playerId, `📡 ${player.name} disconnected`);
          }

          if (game.status === "finished" && game.rematchVotes && game.rematchVotes.length > 0) {
            const activeConnected = game.players.filter(p => p.connected && !p.isBot);
            if (activeConnected.length >= 1 && activeConnected.every(p => game.rematchVotes?.includes(p.playerId))) {
              executeRematchStart(game);
            }
          }
        }

        if (game.players.length === 0 || game.players.every(p => !p.connected || p.isBot)) {
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
    (process.env.NODE_ENV !== "development" && (fs.existsSync(path.join(process.cwd(), "dist", "index.html")) || fs.existsSync(path.join(process.cwd(), "client", "dist", "index.html"))));

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
      configFile: path.join(process.cwd(), "client", "vite.config.ts"),
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), "dist"))
      ? path.join(process.cwd(), "dist")
      : path.join(process.cwd(), "client", "dist");
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
