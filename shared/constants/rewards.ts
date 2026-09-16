export const REWARD_CONFIG = {
  MATCH_COMPLETE: 10,
  MATCH_WIN: 25,
  SEQUENCE_COMPLETE: 5,
  WIN_STREAK_3_BONUS: 15,
  DAILY_REWARDS: [20, 30, 40, 50, 60, 75, 100],
} as const;

export const XP_CONFIG = {
  MATCH_COMPLETE: 50,
  MATCH_WIN: 100,
  SEQUENCE_COMPLETE: 20,
  ACHIEVEMENT_UNLOCKED: 25,
  LEVEL_UP_BONUS_COINS: 50,
} as const;

export const GAME_CONFIG = {
  UNDO_DURATION_MS: 2000, // 2 seconds undo window
  TURN_DURATION_MS: 30000, // 30 seconds turn timer
} as const;

// ============================================================================
// Feature 23: Rank Badge Definitions & Thresholds
// ============================================================================

export type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

export interface RankDefinition {
  tier: RankTier;
  name: string;
  minRating: number;
  maxRating: number | null; // null = unbounded (Master tier)
  color: string;
  backgroundColor: string;
  borderColor: string;
  icon: string;
  abbreviation: string;
}

export const RANK_DEFINITIONS: RankDefinition[] = [
  {
    tier: 'bronze',
    name: 'Bronze',
    minRating: 0,
    maxRating: 999,
    color: '#d97706',
    backgroundColor: '#78350f',
    borderColor: '#b45309',
    icon: '🥉',
    abbreviation: 'BRZ',
  },
  {
    tier: 'silver',
    name: 'Silver',
    minRating: 1000,
    maxRating: 1199,
    color: '#94a3b8',
    backgroundColor: '#475569',
    borderColor: '#64748b',
    icon: '🥈',
    abbreviation: 'SLV',
  },
  {
    tier: 'gold',
    name: 'Gold',
    minRating: 1200,
    maxRating: 1399,
    color: '#eab308',
    backgroundColor: '#713f12',
    borderColor: '#ca8a04',
    icon: '🥇',
    abbreviation: 'GLD',
  },
  {
    tier: 'platinum',
    name: 'Platinum',
    minRating: 1400,
    maxRating: 1599,
    color: '#06b6d4',
    backgroundColor: '#164e63',
    borderColor: '#0891b2',
    icon: '💎',
    abbreviation: 'PLT',
  },
  {
    tier: 'diamond',
    name: 'Diamond',
    minRating: 1600,
    maxRating: 1799,
    color: '#3b82f6',
    backgroundColor: '#1e3a8a',
    borderColor: '#2563eb',
    icon: '💠',
    abbreviation: 'DIA',
  },
  {
    tier: 'master',
    name: 'Master',
    minRating: 1800,
    maxRating: null,
    color: '#f59e0b',
    backgroundColor: '#78350f',
    borderColor: '#d97706',
    icon: '👑',
    abbreviation: 'MST',
  },
];

/**
 * Returns the rank definition for a given Elo rating.
 * All ratings map to exactly one rank tier.
 */
export function getRankFromRating(rating: number | undefined | null): RankDefinition {
  const r = rating ?? 1000;
  for (let i = RANK_DEFINITIONS.length - 1; i >= 0; i--) {
    const rank = RANK_DEFINITIONS[i];
    if (r >= rank.minRating) {
      if (rank.maxRating === null || r <= rank.maxRating) {
        return rank;
      }
    }
  }
  return RANK_DEFINITIONS[0];
}

/**
 * Returns the next rank up from the current rating, or null if already at Master.
 */
export function getNextRank(rating: number | undefined | null): RankDefinition | null {
  const current = getRankFromRating(rating);
  const currentIdx = RANK_DEFINITIONS.findIndex(r => r.tier === current.tier);
  if (currentIdx < 0 || currentIdx >= RANK_DEFINITIONS.length - 1) return null;
  return RANK_DEFINITIONS[currentIdx + 1];
}

/**
 * Returns the 0-100% progress toward the next rank tier.
 * Returns 100 if already at the top rank.
 */
export function getRatingProgress(rating: number | undefined | null): number {
  const r = rating ?? 1000;
  const current = getRankFromRating(r);
  const next = getNextRank(r);

  if (!next) return 100;
  if (current.maxRating === null) return 100;

  const range = next.minRating - current.minRating;
  const progress = r - current.minRating;
  const pct = Math.max(0, Math.min(100, (progress / range) * 100));
  return Math.round(pct * 10) / 10;
}

// ============================================================================
// Feature 27: Notification System Types
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
// Feature 30: Sound System Types
// ============================================================================

export type SoundEffectType =
  | 'card_select'
  | 'chip_place'
  | 'chip_remove'
  | 'sequence_complete'
  | 'turn_start'
  | 'timer_warning'
  | 'win'
  | 'loss'
  | 'coin_reward'
  | 'achievement_unlock'
  | 'achievement'
  | 'click'
  | 'notification';

export interface AudioSettings {
  masterVolume: number; // 0-100
  masterMuted: boolean;
  sfxVolume: number; // 0-100
  sfxMuted: boolean;
  muted?: boolean; // backward compatibility
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 80,
  masterMuted: false,
  sfxVolume: 70,
  sfxMuted: false,
};

// ============================================================================
// Feature 31: Game Settings
// ============================================================================

export interface GameSettings {
  showMoveIndicators: boolean;
  animationsEnabled: boolean;
  confirmBeforeSurrender: boolean;
  reducedAnimations: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  showMoveIndicators: true,
  animationsEnabled: true,
  confirmBeforeSurrender: true,
  reducedAnimations: false,
};

/**
 * Formula: requiredXP = Math.floor(100 * Math.pow(level - 1, 1.5))
 * Level 1: 0 XP
 * Level 2: 100 XP
 * Level 3: 282 XP
 * Level 4: 519 XP
 * Level 5: 800 XP
 * Level 6: 1118 XP
 * Level 10: 2700 XP
 */
export function getMinXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
}

export function getLevelFromXP(xp: number): number {
  if (xp <= 0) return 1;
  let lvl = 1;
  while (getMinXPForLevel(lvl + 1) <= xp) {
    lvl++;
  }
  return lvl;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon identifier or emoji
  type: 'wins' | 'sequences' | 'games' | 'win_streak';
  targetValue: number;
  coinReward: number;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  {
    id: 'first_victory',
    name: 'First Victory',
    description: 'Win your first game',
    icon: '🏆',
    type: 'wins',
    targetValue: 1,
    coinReward: 50,
  },
  {
    id: 'sequence_starter',
    name: 'Sequence Starter',
    description: 'Complete your first Sequence',
    icon: '✨',
    type: 'sequences',
    targetValue: 1,
    coinReward: 25,
  },
  {
    id: 'regular_player',
    name: 'Regular Player',
    description: 'Complete 10 games',
    icon: '🎮',
    type: 'games',
    targetValue: 10,
    coinReward: 100,
  },
  {
    id: 'winning_streak',
    name: 'Winning Streak',
    description: 'Win 3 matches consecutively',
    icon: '🔥',
    type: 'win_streak',
    targetValue: 3,
    coinReward: 100,
  },
  {
    id: 'experienced_player',
    name: 'Experienced Player',
    description: 'Complete 50 games',
    icon: '⭐',
    type: 'games',
    targetValue: 50,
    coinReward: 250,
  },
  {
    id: 'sequence_master',
    name: 'Sequence Master',
    description: 'Complete 50 total Sequences',
    icon: '👑',
    type: 'sequences',
    targetValue: 50,
    coinReward: 300,
  },
];

export type CosmeticCategory = 'board_theme' | 'chip_skin' | 'card_back' | 'avatar' | 'victory_effect' | 'emote';

export interface ShopItem {
  id: string;
  name: string;
  category: CosmeticCategory;
  price: number; // 0 for default/free
  icon: string; // emoji or icon reference
  description: string;
  previewClass?: string; // CSS style preview representation
  isDefault?: boolean;
  rarity?: 'Common' | 'Rare' | 'Epic' | 'Legendary';
}

export const SHOP_CATALOG: ShopItem[] = [
  // Board Themes
  { id: 'board_classic', name: 'Classic Indigo', category: 'board_theme', price: 0, icon: '🟦', description: 'Standard dark slate theme', isDefault: true, rarity: 'Common' },
  { id: 'board_dark', name: 'Midnight Onyx', category: 'board_theme', price: 500, icon: '🖤', description: 'Deep stealth black board', rarity: 'Rare' },
  { id: 'board_neon', name: 'Cyber Neon', category: 'board_theme', price: 1000, icon: '⚡', description: 'Vibrant neon grid aesthetic', rarity: 'Epic' },
  { id: 'board_space', name: 'Cosmic Galaxy', category: 'board_theme', price: 1500, icon: '🌌', description: 'Deep space starry theme', rarity: 'Epic' },
  { id: 'board_gold', name: 'Royal Gold', category: 'board_theme', price: 2500, icon: '👑', description: 'Luxurious royal palace board', rarity: 'Legendary' },

  // Chip Skins
  { id: 'chip_classic', name: 'Classic Solid', category: 'chip_skin', price: 0, icon: '⚪', description: 'Standard smooth plastic chips', isDefault: true, rarity: 'Common' },
  { id: 'chip_glass', name: 'Glass Gem', category: 'chip_skin', price: 400, icon: '💎', description: 'Translucent crystal finish', rarity: 'Rare' },
  { id: 'chip_neon', name: 'Neon Glow', category: 'chip_skin', price: 800, icon: '🌟', description: 'High-luminance glowing tokens', rarity: 'Epic' },
  { id: 'chip_metallic', name: 'Metallic Sheen', category: 'chip_skin', price: 1200, icon: '🪙', description: 'Reflective polished metal chips', rarity: 'Legendary' },

  // Card Backs
  { id: 'card_classic', name: 'Classic Blue', category: 'card_back', price: 0, icon: '🎴', description: 'Standard playing card back', isDefault: true, rarity: 'Common' },
  { id: 'card_velvet', name: 'Midnight Velvet', category: 'card_back', price: 400, icon: '🍷', description: 'Rich burgundy velvet card pattern', rarity: 'Rare' },
  { id: 'card_cyber', name: 'Cyber Gold', category: 'card_back', price: 800, icon: '💳', description: 'Futuristic golden circuitry pattern', rarity: 'Epic' },
  { id: 'card_dragon', name: 'Dragon Crimson', category: 'card_back', price: 1200, icon: '🐉', description: 'Empowered dragon scale print', rarity: 'Legendary' },

  // Avatars
  { id: 'avatar_default', name: 'Default Letter', category: 'avatar', price: 0, icon: '👤', description: 'Initial letter avatar', isDefault: true, rarity: 'Common' },
  { id: 'avatar_crown', name: 'Monarch Crown', category: 'avatar', price: 300, icon: '👑', description: 'Royal crown avatar icon', rarity: 'Rare' },
  { id: 'avatar_ninja', name: 'Shadow Ninja', category: 'avatar', price: 600, icon: '🥷', description: 'Stealthy ninja avatar icon', rarity: 'Rare' },
  { id: 'avatar_wizard', name: 'Arcane Wizard', category: 'avatar', price: 900, icon: '🧙‍♂️', description: 'Mystical wizard avatar icon', rarity: 'Epic' },
  { id: 'avatar_dragon', name: 'Fire Dragon', category: 'avatar', price: 1500, icon: '🐲', description: 'Majestic fire dragon avatar', rarity: 'Legendary' },

  // Victory Effects
  { id: 'victory_confetti', name: 'Classic Confetti', category: 'victory_effect', price: 0, icon: '🎉', description: 'Multi-colored paper celebration', isDefault: true, rarity: 'Common' },
  { id: 'victory_fireworks', name: 'Firework Burst', category: 'victory_effect', price: 800, icon: '🎆', description: 'Explosive victory fireworks', rarity: 'Epic' },
  { id: 'victory_goldrain', name: 'Golden Shower', category: 'victory_effect', price: 1200, icon: '💰', description: 'Raining gold coins and sparkles', rarity: 'Legendary' },

  // Emotes
  { id: 'emote_thumbsup', name: 'Thumbs Up', category: 'emote', price: 0, icon: '👍', description: 'Good game gesture', isDefault: true, rarity: 'Common' },
  { id: 'emote_gg', name: 'GG Trophy', category: 'emote', price: 200, icon: '🏆', description: 'Good game trophy emote', rarity: 'Common' },
  { id: 'emote_fire', name: 'On Fire', category: 'emote', price: 400, icon: '🔥', description: 'Hot streak fire emote', rarity: 'Rare' },
  { id: 'emote_mindblown', name: 'Mind Blown', category: 'emote', price: 600, icon: '🤯', description: 'Unbelievable play reaction', rarity: 'Epic' },
];
