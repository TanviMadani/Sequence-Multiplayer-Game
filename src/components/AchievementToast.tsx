import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Sparkles } from 'lucide-react';
import { AchievementDef } from '../constants/rewards';

interface AchievementToastProps {
  achievement: AchievementDef | null;
  onClose: () => void;
}

export const AchievementToast: React.FC<AchievementToastProps> = ({ achievement, onClose }) => {
  return (
    <AnimatePresence>
      {achievement && (
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.8 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          onClick={onClose}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 px-5 py-3 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.5)] border-2 border-amber-200 flex items-center gap-3.5 cursor-pointer select-none max-w-md"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-950/90 text-amber-400 flex items-center justify-center text-xl font-bold border border-amber-400/40 shrink-0">
            {achievement.icon || <Trophy size={20} />}
          </div>

          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-900/80">
              <Sparkles size={11} /> Achievement Unlocked!
            </div>
            <div className="text-sm font-black text-slate-950 leading-tight">
              {achievement.name}
            </div>
            <div className="text-xs text-slate-900/90 font-medium leading-tight">
              {achievement.description} &bull; <span className="font-bold text-slate-950">+{achievement.coinReward} Coins</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
