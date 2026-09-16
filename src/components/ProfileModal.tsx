import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Trophy, Coins, Flame, Award, Calendar, History, X, Check, Gift, Sparkles, Clock, ShieldCheck } from 'lucide-react';
import { PlayerProfile } from '../types';
import { ACHIEVEMENT_DEFINITIONS, REWARD_CONFIG } from '../constants/rewards';

interface ProfileModalProps {
  isOpen: boolean;
  profile: PlayerProfile | null;
  onClose: () => void;
  onClaimDailyBonus: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  profile,
  onClose,
  onClaimDailyBonus,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'daily' | 'achievements' | 'history'>('stats');

  if (!profile) return null;

  const winRate = profile.totalGames > 0
    ? ((profile.wins / profile.totalGames) * 100).toFixed(1)
    : '0.0';

  const now = Date.now();
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const lastClaimMidnight = profile.lastDailyClaim
    ? new Date(profile.lastDailyClaim).setHours(0, 0, 0, 0)
    : 0;

  const canClaimDaily = lastClaimMidnight !== todayMidnight;
  const currentStreakDay = profile.dailyStreak ?? 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-3xl p-5 sm:p-7 shadow-[0_0_50px_rgba(99,102,241,0.25)] text-white flex flex-col my-auto relative max-h-[90vh] overflow-hidden"
          >
            {/* Header & Close Button */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-indigo-600/30">
                  {profile.name[0]?.toUpperCase() ?? <User size={20} />}
                </div>
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight leading-tight flex items-center gap-2">
                    {profile.name}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-amber-400 font-bold font-mono">
                    <span className="flex items-center gap-1"><Coins size={13} /> {profile.coins} Coins</span>
                    <span className="text-slate-600">•</span>
                    <span className="flex items-center gap-1 text-rose-400"><Flame size={13} /> {profile.currentWinStreak} Streak</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav Tabs */}
            <div className="flex items-center justify-around bg-slate-850 p-1.5 rounded-xl border border-slate-800 my-4 text-xs font-bold">
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Trophy size={14} /> Stats
              </button>

              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer relative ${
                  activeTab === 'daily' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar size={14} /> Daily Bonus
                {canClaimDaily && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1 right-1" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('achievements')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'achievements' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Award size={14} /> Achievements
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History size={14} /> Match History
              </button>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-left">
              {/* TAB 1: STATS OVERVIEW */}
              {activeTab === 'stats' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">Total Games</div>
                    <div className="text-2xl font-black font-mono text-white">{profile.totalGames}</div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-1">Victories</div>
                    <div className="text-2xl font-black font-mono text-emerald-300">{profile.wins}</div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-1">Win Rate</div>
                    <div className="text-2xl font-black font-mono text-indigo-300">{winRate}%</div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-amber-400 text-[11px] font-bold uppercase tracking-wider mb-1">Sequences Formed</div>
                    <div className="text-2xl font-black font-mono text-amber-300">{profile.totalSequences}</div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-rose-400 text-[11px] font-bold uppercase tracking-wider mb-1">Current Streak</div>
                    <div className="text-2xl font-black font-mono text-rose-300 flex items-center gap-1">
                      {profile.currentWinStreak} <Flame size={16} className="fill-current" />
                    </div>
                  </div>

                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                    <div className="text-amber-500 text-[11px] font-bold uppercase tracking-wider mb-1">Best Win Streak</div>
                    <div className="text-2xl font-black font-mono text-amber-400 flex items-center gap-1">
                      {profile.bestWinStreak} <Flame size={16} className="fill-current" />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DAILY LOGIN BONUS */}
              {activeTab === 'daily' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-amber-950/60 to-yellow-950/60 p-4 rounded-2xl border border-amber-500/40 flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-amber-300 flex items-center gap-1.5">
                        <Gift size={18} /> 7-Day Login Rewards
                      </h3>
                      <p className="text-xs text-slate-300 font-medium mt-0.5">
                        Claim free coins every calendar day! Missed days reset streak to Day 1.
                      </p>
                    </div>

                    <button
                      onClick={onClaimDailyBonus}
                      disabled={!canClaimDaily}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-lg ${
                        canClaimDaily
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300 shadow-amber-500/30'
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <Sparkles size={14} />
                      {canClaimDaily ? 'Claim Reward' : 'Claimed Today'}
                    </button>
                  </div>

                  {/* 7-Day Tracker Grid */}
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {REWARD_CONFIG.DAILY_REWARDS.map((rewardAmount, idx) => {
                      const dayNumber = idx + 1;
                      const isClaimed = !canClaimDaily ? dayNumber <= currentStreakDay : dayNumber < currentStreakDay;
                      const isCurrentActive = canClaimDaily && dayNumber === currentStreakDay;

                      return (
                        <div
                          key={dayNumber}
                          className={`p-3 rounded-2xl border flex flex-col items-center text-center transition-all ${
                            isCurrentActive
                              ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/20'
                              : isClaimed
                              ? 'bg-slate-850 border-slate-800 opacity-60'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Day {dayNumber}</span>
                          <div className="text-xl my-1">
                            {isClaimed ? '✓' : isCurrentActive ? '🎁' : '🔒'}
                          </div>
                          <span className="text-xs font-black text-amber-300 font-mono">+{rewardAmount}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: ACHIEVEMENTS */}
              {activeTab === 'achievements' && (
                <div className="space-y-2.5">
                  {ACHIEVEMENT_DEFINITIONS.map(def => {
                    const playerAch = profile.achievements[def.id];
                    const isUnlocked = playerAch?.unlocked;

                    return (
                      <div
                        key={def.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                          isUnlocked
                            ? 'bg-amber-950/40 border-amber-500/50 shadow-md shadow-amber-900/10'
                            : 'bg-slate-900/80 border-slate-800 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold border ${
                            isUnlocked ? 'bg-amber-500/20 text-amber-300 border-amber-400/40' : 'bg-slate-800 text-slate-500 border-slate-700'
                          }`}>
                            {def.icon}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white flex items-center gap-1.5">
                              {def.name}
                              {isUnlocked && <ShieldCheck size={14} className="text-emerald-400" />}
                            </div>
                            <div className="text-xs text-slate-400 font-medium">{def.description}</div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-amber-300 font-mono">+{def.coinReward} Coins</span>
                          <div className="text-[10px] font-bold mt-0.5">
                            {isUnlocked ? (
                              <span className="text-emerald-400">Unlocked</span>
                            ) : (
                              <span className="text-slate-500">Locked</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 4: MATCH HISTORY */}
              {activeTab === 'history' && (
                <div className="space-y-2.5">
                  {profile.matchHistory.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800">
                      No recent match history found. Complete a match to record results!
                    </div>
                  ) : (
                    profile.matchHistory.map(rec => (
                      <div
                        key={rec.matchId}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                          rec.isWin ? 'bg-emerald-950/30 border-emerald-800/60' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                            rec.isWin ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {rec.isWin ? 'Victory' : 'Loss'}
                          </div>

                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-2">
                              <span>{rec.mode}</span>
                              {rec.winningTeam && <span className="text-amber-400">({rec.winningTeam})</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                              <span className="flex items-center gap-1"><Clock size={10} /> {Math.floor(rec.durationSeconds / 60)}m {rec.durationSeconds % 60}s</span>
                              <span>•</span>
                              <span>Room {rec.roomCode}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-amber-300 font-mono">+{rec.coinsEarned} Coins</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
