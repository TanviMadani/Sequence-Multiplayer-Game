import React from 'react';
import { motion } from 'motion/react';
import { RankDefinition, getRankFromRating, getNextRank, getRatingProgress } from '@shared/constants/rewards';

interface RankBadgeProps {
  rating: number | undefined | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showName?: boolean;
  showIcon?: boolean;
  showProgress?: boolean;
  showRating?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'text-[9px] px-1.5 py-0.5 gap-1',
  sm: 'text-[10px] px-2 py-1 gap-1',
  md: 'text-xs px-2.5 py-1.5 gap-1.5',
  lg: 'text-sm px-3 py-2 gap-2',
  xl: 'text-base px-4 py-2.5 gap-2.5',
};

const iconSizes = {
  xs: 'text-sm',
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
  xl: 'text-2xl',
};

export const RankBadge: React.FC<RankBadgeProps> = ({
  rating,
  size = 'sm',
  showName = true,
  showIcon = true,
  showProgress = false,
  showRating = false,
  className = '',
}) => {
  const rank: RankDefinition = getRankFromRating(rating);
  const nextRank = getNextRank(rating);
  const progress = getRatingProgress(rating);
  const actualRating = rating ?? 1000;

  return (
    <div className={`flex flex-col ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={`inline-flex items-center font-black rounded-lg shadow-md ${sizeClasses[size]}`}
        style={{
          backgroundColor: rank.backgroundColor,
          border: `2px solid ${rank.borderColor}`,
          color: rank.color,
        }}
      >
        {showIcon && <span className={iconSizes[size]}>{rank.icon}</span>}
        {showName && <span className="whitespace-nowrap tracking-wide">{rank.name}</span>}
        {showRating && (
          <span className="font-mono font-bold opacity-90">
            {actualRating}
          </span>
        )}
      </motion.div>

      {showProgress && nextRank && (
        <div className="mt-1.5 w-full">
          <div className="flex justify-between text-[9px] font-bold mb-0.5">
            <span style={{ color: rank.color }}>{rank.name}</span>
            <span style={{ color: nextRank.color }}>
              {progress.toFixed(0)}% → {nextRank.name}
            </span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${rank.color}, ${nextRank.color})`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export { getRankFromRating, getNextRank, getRatingProgress };
export type { RankDefinition };
