export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export interface BoardCell {
  card: Card | null; // null for corners
  chip: string | null; // player color, or 'wild' for corners
  isLocked: boolean;
}

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface LastMove {
  playerId: string;
  row: number;
  col: number;
  type: 'place' | 'remove';
}

export type BotDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Server-side, authoritative player record.
 */
export interface Player {
  playerId: string;
  socketId: string | null;
  name: string;
  color: string;
  hand: Card[];
  connected: boolean;
  surrendered?: boolean;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
}

export interface Spectator {
  spectatorId: string;
  socketId: string;
  name: string;
  connected: boolean;
}

export type Coord = [number, number];

export interface GameStats {
  startTime: number;
  endTime: number;
  durationSeconds: number;
  totalMoves: number;
  sequencesCount: number;
}

export interface EquippedCosmetics {
  boardTheme: string;
  chipSkin: string;
  cardBack: string;
  avatar: string;
  victoryEffect: string;
  emote: string;
}

export interface LevelUpInfo {
  didLevelUp: boolean;
  oldLevel: number;
  newLevel: number;
  bonusCoins: number;
}

export interface RatingDelta {
  oldRating: number;
  newRating: number;
  delta: number;
}

export interface RewardBreakdown {
  matchComplete: number;
  victory: number;
  sequences: number;
  streakBonus: number;
  totalEarned: number;
  xpEarned: number;
  levelUp?: LevelUpInfo | null;
  ratingDelta?: RatingDelta | null;
}

export interface MatchHistoryRecord {
  matchId: string;
  timestamp: number;
  roomCode: string;
  mode: string;
  isTeam: boolean;
  winningTeam?: string | null;
  winnerName: string;
  isWin: boolean;
  sequencesCount: number;
  durationSeconds: number;
  coinsEarned: number;
  xpEarned?: number;
  isRanked?: boolean;
  ratingDelta?: number;
}

export interface PlayerAchievement {
  achievementId: string;
  unlocked: boolean;
  unlockedAt: number | null;
  claimed: boolean;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  avatar: string;
  coins: number;
  xp: number;
  level: number;
  equippedCosmetics: EquippedCosmetics;
  ownedCosmetics: string[];
  totalGames: number;
  wins: number;
  losses: number;
  currentWinStreak: number;
  bestWinStreak: number;
  totalSequences: number;
  lastDailyClaim?: number; // epoch ms
  dailyStreak?: number; // 0..7
  matchHistory: MatchHistoryRecord[];
  achievements: Record<string, PlayerAchievement>;

  // Feature 22: Ranked Mode Ratings
  rankedRating: number;
  rankedGames: number;
  rankedWins: number;
  rankedLosses: number;

  // Feature 25: Friends System
  friendIds: string[]; // playerIds of confirmed friends
  pendingFriendRequestsSent: string[]; // requestIds
  pendingFriendRequestsReceived: string[]; // requestIds

  // Feature 27: Notifications
  notifications: Notification[];

  // Feature 29: Seasonal Progression
  seasonalXP: number;
  claimedSeasonalRewards: number[]; // levels claimed

  // Feature 31: Game Settings (server-side persisted account-level)
  settings?: {
    showMoveIndicators: boolean;
    animationsEnabled: boolean;
    confirmBeforeSurrender: boolean;
    reducedAnimations: boolean;
  };

  // Metadata
  lastOnline: number;
  currentRoomId: string | null;
}

/** Undo snapshot stored on server to reverse moves */
export interface UndoSnapshot {
  board: BoardCell[][];
  players: Player[];
  turnIndex: number;
  deck: Card[];
  lastMove: LastMove | null;
  winner: string | null;
  status: GameStatus;
  gameStats: GameStats | null;
  totalMoves?: number;
}

/** Server-side, authoritative game state. Never sent to clients as-is. */
export interface GameState {
  roomId: string;
  board: BoardCell[][];
  players: Player[];
  turnIndex: number;
  deck: Card[];
  status: GameStatus;
  winner: string | null;
  lastMove: LastMove | null;
  winningSequences?: Coord[][];
  winningCells?: Coord[];
  isTeamGame?: boolean;
  winningTeam?: string | null;
  winningPlayerNames?: string[];
  gameStats?: GameStats | null;
  startTime?: number;
  totalMoves?: number;
  rematchVotes?: string[];
  startingTurnIndex?: number;
  turnDeadline?: number | null;
  turnDurationSeconds?: number;
  undoAvailableForPlayerId?: string | null;
  undoDeadline?: number | null;
  undoSnapshot?: UndoSnapshot | null;
  rewardBreakdowns?: Record<string, RewardBreakdown>;

  // Feature 19 & 22
  allowSpectators?: boolean;
  spectators?: Spectator[];
  isRanked?: boolean;
  hostPlayerId?: string;
  ratingDeltas?: Record<string, RatingDelta>;

  // Feature 28: Tournament Mode
  tournamentId?: string | null;

  // Feature 32: Game Activity Feed
  activityFeed?: ActivityEvent[];
}

/**
 * Redacted, per-recipient view of a player.
 */
export interface ClientPlayer {
  playerId: string;
  name: string;
  color: string;
  avatar?: string;
  equippedCosmetics?: EquippedCosmetics;
  handCount: number;
  hand: Card[];
  connected: boolean;
  surrendered?: boolean;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
  rankedRating?: number;
}

/** Redacted, per-recipient view of the game. This is what actually goes over the wire. */
export interface ClientGameState {
  roomId: string;
  board: BoardCell[][];
  players: ClientPlayer[];
  turnIndex: number;
  deckCount: number;
  status: GameStatus;
  winner: string | null;
  lastMove: LastMove | null;
  youPlayerId: string;
  winningSequences?: Coord[][];
  winningCells?: Coord[];
  isTeamGame?: boolean;
  winningTeam?: string | null;
  winningPlayerNames?: string[];
  gameStats?: GameStats | null;
  rematchVotes?: string[];
  turnDeadline?: number | null;
  turnDurationSeconds?: number;
  undoAvailableForPlayerId?: string | null;
  undoDeadline?: number | null;
  rewardBreakdown?: RewardBreakdown | null;

  // Feature 19, 21 & 22 additions
  allowSpectators?: boolean;
  spectatorCount?: number;
  isSpectator?: boolean;
  isRanked?: boolean;
  hostPlayerId?: string;
  ratingDeltas?: Record<string, RatingDelta>;

  // Feature 28: Tournament Mode
  tournamentId?: string | null;

  // Feature 32: Game Activity Feed (public events only)
  activityFeed?: ActivityEvent[];
}

export type MatchmakingMode = '2p' | '4p';

export interface MatchmakingQueueEntry {
  playerId: string;
  socketId: string;
  name: string;
  mode: MatchmakingMode;
  isRanked: boolean;
  rating: number;
  joinedAt: number;
}

// ============================================================================
// Feature 24: Leaderboards
// ============================================================================

export type LeaderboardCategory = 'rating' | 'wins' | 'streak' | 'sequences';
export type LeaderboardTimeFrame = 'allTime' | 'weekly' | 'seasonal';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  avatar: string;
  rankedRating: number;
  wins: number;
  bestWinStreak: number;
  totalSequences: number;
  isCurrentUser: boolean;
}

// ============================================================================
// Feature 25: Friends System
// ============================================================================

export type FriendshipStatus =
  | 'none'
  | 'request_sent'
  | 'request_received'
  | 'friends';

export interface FriendRequest {
  requestId: string;
  fromPlayerId: string;
  toPlayerId: string;
  fromPlayerName: string;
  toPlayerName: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface FriendEntry {
  playerId: string;
  name: string;
  avatar: string;
  rankedRating: number;
  isOnline: boolean;
  inGame: boolean;
  currentRoomId: string | null;
  friendshipSince: number;
}

// ============================================================================
// Feature 26: Direct Game Invites
// ============================================================================

export interface GameInvite {
  inviteId: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  roomId: string;
  roomMode: string;
  isRanked: boolean;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
}

export const GAME_INVITE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Feature 27: Notifications (already defined in rewards.ts, here for type exports)
// ============================================================================

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'game_invite'
  | 'achievement'
  | 'daily_reward'
  | 'rank_promotion'
  | 'tournament'
  | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: number;
  read: boolean;
  actionPayload?: any;
}

// ============================================================================
// Feature 28: Tournament Mode
// ============================================================================

export type TournamentStatus =
  | 'registration'
  | 'in_progress'
  | 'completed';

export type TournamentSize = 4 | 8;

export interface TournamentParticipant {
  playerId: string;
  name: string;
  avatar: string;
  rankedRating: number;
  seed: number;
  eliminated: boolean;
}

export interface TournamentMatch {
  matchId: string;
  round: number;
  position: number; // bracket position
  roomId: string | null;
  participantIds: (string | null)[]; // playerId or null (bye)
  winnerId: string | null;
  status: 'waiting' | 'in_progress' | 'completed';
}

export interface Tournament {
  tournamentId: string;
  name: string;
  size: TournamentSize;
  status: TournamentStatus;
  participants: TournamentParticipant[];
  matches: TournamentMatch[];
  currentRound: number;
  championId: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  hostPlayerId: string;
}

// ============================================================================
// Feature 29: Seasonal Progression
// ============================================================================

export interface SeasonInfo {
  seasonId: string;
  name: string;
  number: number;
  startDate: number;
  endDate: number;
  isActive: boolean;
}

export interface SeasonalReward {
  level: number;
  rewardType: 'coins' | 'cosmetic';
  value: number | string; // coins amount or cosmetic id
  name: string;
  icon: string;
  description: string;
}

export const SEASONAL_REWARDS: SeasonalReward[] = [
  { level: 1, rewardType: 'coins', value: 50, name: 'Season Starter', icon: '🪙', description: 'Welcome bonus coins' },
  { level: 2, rewardType: 'coins', value: 75, name: 'Progress Bonus', icon: '🪙', description: 'Keep playing!' },
  { level: 3, rewardType: 'cosmetic', value: 'avatar_crown', name: 'Crowned Avatar', icon: '👑', description: 'Royal crown avatar icon' },
  { level: 5, rewardType: 'cosmetic', value: 'card_dragon', name: 'Dragon Card Back', icon: '🐉', description: 'Dragon scale card pattern' },
  { level: 7, rewardType: 'coins', value: 200, name: 'Mid Season', icon: '🪙', description: 'Halfway bonus' },
  { level: 10, rewardType: 'cosmetic', value: 'board_gold', name: 'Royal Board', icon: '👑', description: 'Luxurious palace theme' },
  { level: 15, rewardType: 'coins', value: 500, name: 'Legendary Bonus', icon: '🪙', description: 'Massive coin drop' },
  { level: 20, rewardType: 'cosmetic', value: 'victory_goldrain', name: 'Golden Shower', icon: '💰', description: 'Raining gold celebration' },
];

export function getSeasonalXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(200 * Math.pow(level - 1, 1.4));
}

export function getSeasonalLevelFromXP(xp: number): number {
  if (xp <= 0) return 1;
  let lvl = 1;
  while (getSeasonalXPForLevel(lvl + 1) <= xp) {
    lvl++;
  }
  return Math.min(lvl, 25);
}

// ============================================================================
// Feature 32: Game Activity Feed
// ============================================================================

export type ActivityEventType =
  | 'chip_placed'
  | 'chip_removed'
  | 'sequence_completed'
  | 'player_disconnected'
  | 'player_reconnected'
  | 'undo_used'
  | 'turn_skipped'
  | 'surrender'
  | 'game_start'
  | 'game_end';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  playerId: string | null; // null for system events
  playerName: string | null;
  message: string;
  timestamp: number;
  team?: string;
}

export const PLAYER_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'] as const;
export const COLOR_NAMES: Record<string, string> = {
  '#2563eb': 'Blue',
  '#dc2626': 'Red',
  '#16a34a': 'Green',
  '#ca8a04': 'Gold',
};

export const BOARD_LAYOUT: (string | null)[][] = [
  [null, '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', null],
  ['6C', '5C', '4C', '3C', '2C', 'AH', 'KH', 'QH', '10H', '10S'],
  ['7C', 'AS', '2D', '3D', '4D', '5D', '6D', '7D', '9H', 'QS'],
  ['8C', 'KS', '6C', '5C', '4C', '3C', '2C', '8D', '8H', 'KS'],
  ['9C', 'QS', '7C', '6H', '5H', '4H', 'AH', '9D', '7H', 'AS'],
  ['10C', '10S', '8C', '7H', '2H', '3H', 'KH', '10D', '6H', '2D'],
  ['QC', '9S', '9C', '8H', '9H', '10H', 'QH', 'QD', '5H', '3D'],
  ['KC', '8S', '10C', 'QC', 'KC', 'AC', 'AD', 'KD', '4H', '4D'],
  ['AC', '7S', '6S', '5S', '4S', '3S', '2S', '2H', '3H', '5D'],
  [null, 'AD', 'KD', 'QD', '10D', '9D', '8D', '7D', '6D', null]
];

export function parseCardString(s: string | null): Card | null {
  if (!s) return null;
  const rank = s.slice(0, -1) as Rank;
  const suit = s.slice(-1) as Suit;
  return { rank, suit, id: s };
}

export function createDeck(): Card[] {
  const suits: Suit[] = ['H', 'D', 'C', 'S'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (let i = 0; i < 2; i++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank, id: `${rank}${suit}-${i}` });
      }
    }
  }
  return shuffle(deck);
}

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
