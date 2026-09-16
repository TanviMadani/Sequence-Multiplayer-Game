import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Coins, Sparkles } from 'lucide-react';
import { LevelUpInfo } from '@shared/types';

interface LevelUpModalProps {
  info: LevelUpInfo | null;
  onClose: () => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ info, onClose }) => {
  if (!info || !info.didLevelUp) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 30 }}
          className="relative w-full max-w-sm bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 border-2 border-indigo-500/60 rounded-3xl p-6 shadow-[0_0_50px_rgba(99,102,241,0.4)] text-white text-center flex flex-col items-center"
        >
          {/* Glowing Icon */}
          <div className="relative mb-4 mt-2">
            <div className="absolute inset-0 bg-indigo-500/40 rounded-full blur-xl animate-pulse" />
            <motion.div
              animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-0.5 shadow-lg flex items-center justify-center"
            >
              <div className="w-full h-full bg-slate-950/90 rounded-[14px] flex items-center justify-center border border-indigo-300/40">
                <Zap size={40} className="text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)] fill-current" />
              </div>
            </motion.div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs font-black text-indigo-300 uppercase tracking-widest mb-1">
            <Sparkles size={14} /> LEVEL UP! <Sparkles size={14} />
          </div>

          <h2 className="text-3xl font-black text-white tracking-tight mb-2">
            Level {info.oldLevel} → <span className="text-indigo-400 font-mono">{info.newLevel}</span>
          </h2>

          <p className="text-xs text-slate-300 font-medium mb-4">
            Congratulations! You've reached Level {info.newLevel}!
          </p>

          {info.bonusCoins > 0 && (
            <div className="w-full bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 flex items-center justify-center gap-2 mb-5">
              <Coins className="text-amber-400" size={18} />
              <span className="text-sm font-black text-amber-300">+{info.bonusCoins} Level Bonus Coins!</span>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/30 text-xs cursor-pointer active:scale-95"
          >
            Awesome!
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
