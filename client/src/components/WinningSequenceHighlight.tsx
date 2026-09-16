import React from 'react';
import { motion } from 'motion/react';
import { Crown } from 'lucide-react';
import { Coord } from '@shared/types';

export function isWinningCell(r: number, c: number, winningCells?: Coord[]): boolean {
  if (!winningCells) return false;
  return winningCells.some(([wr, wc]) => wr === r && wc === c);
}

export function getSequenceOrder(r: number, c: number, winningSequences?: Coord[][]): number {
  if (!winningSequences) return 0;
  for (const seq of winningSequences) {
    const idx = seq.findIndex(([wr, wc]) => wr === r && wc === c);
    if (idx !== -1) return idx;
  }
  return 0;
}

interface WinningSequenceBadgeProps {
  order?: number;
}

export const WinningSequenceBadge: React.FC<WinningSequenceBadgeProps> = ({ order = 0 }) => {
  return (
    <motion.div
      initial={{ scale: 0, rotate: -45 }}
      animate={{ scale: [1, 1.25, 1], rotate: 0 }}
      transition={{
        duration: 0.6,
        delay: order * 0.12,
        repeat: Infinity,
        repeatDelay: 2.5,
      }}
      className="absolute -top-1 -right-1 z-30 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 p-1 rounded-full shadow-lg border-2 border-amber-200"
    >
      <Crown size={10} className="fill-current text-slate-950" />
    </motion.div>
  );
};
