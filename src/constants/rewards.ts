export const REWARD_CONFIG = {
  MATCH_COMPLETE: 10,
  MATCH_WIN: 25,
  SEQUENCE_COMPLETE: 5,
  WIN_STREAK_3_BONUS: 15,
  DAILY_REWARDS: [20, 30, 40, 50, 60, 75, 100],
} as const;

export const GAME_CONFIG = {
  UNDO_DURATION_MS: 2000, // 2 seconds undo window
  TURN_DURATION_MS: 30000, // 30 seconds turn timer
} as const;

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
