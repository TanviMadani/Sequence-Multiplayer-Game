import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Medal, Flame, Layers, X, Award, Crown, User, TrendingUp } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { LeaderboardCategory, LeaderboardEntry } from '@shared/types';
import { RankBadge } from './RankBadge';
import { Socket as SocketType } from 'socket.io-client';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: SocketType;
  playerId: string;
}

const CATEGORIES: { id: LeaderboardCategory; label: string; icon: React.ReactNode; key: keyof LeaderboardEntry }[] = [
  { id: 'rating', label: 'Ranked Rating', icon: <Award size={13} />, key: 'rankedRating' },
  { id: 'wins', label: 'Most Wins', icon: <Trophy size={13} />, key: 'wins' },
  { id: 'streak', label: 'Best Win Streak', icon: <Flame size={13} />, key: 'bestWinStreak' },
  { id: 'sequences', label: 'Most Sequences', icon: <Layers size={13} />, key: 'totalSequences' },
];

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  socket,
  playerId,
}) => {
  const [category, setCategory] = useState<LeaderboardCategory>('rating');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    socket.emit('get-leaderboard', { category, playerId }, (res: any) => {
      setLoading(false);
      if (res?.success) {
        setEntries(res.entries || []);
        setUserRank(res.userRank ?? null);
        setUserEntry(res.userEntry ?? null);
      }
    });
  }, [isOpen, category, socket, playerId]);

  const currentCat = CATEGORIES.find(c => c.id === category)!;

  const getMedalIcon = (rank: number) => {
    if (rank === 1) return <Crown size={16} className="text-amber-400 fill-amber-400" />;
    if (rank === 2) return <Medal size={16} className="text-slate-300" />;
    if (rank === 3) return <Medal size={16} className="text-orange-400" />;
    return <span className="w-4 text-center text-slate-500 font-black text-xs">{rank}</span>;
  };

  const displayValue = (e: LeaderboardEntry) => {
    switch (category) {
      case 'rating': return `${e.rankedRating} Elo`;
      case 'wins': return `${e.wins} Wins`;
      case 'streak': return `${e.bestWinStreak} Streak`;
      case 'sequences': return `${e.totalSequences} Seq`;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(245,158,11,0.2)] text-white my-auto max-h-[92vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-amber-500 to-yellow-600 p-2.5 rounded-xl shadow-md shadow-amber-600/30">
                  <Trophy size={20} className="text-slate-950" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Global Leaderboards</h2>
                  <p className="text-xs text-slate-400 font-medium">Top players across all categories</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-850 p-1 rounded-xl border border-slate-800 my-3 text-xs font-bold overflow-x-auto no-scrollbar shrink-0">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    category === cat.id
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-600/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {loading && (
                <div className="text-center py-10 text-slate-500 text-xs">Loading leaderboard...</div>
              )}

              {!loading && entries.length === 0 && (
                <div className="text-center py-10 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800">
                  No players on the leaderboard yet. Play a ranked match to get listed!
                </div>
              )}

              {!loading && entries.map((entry) => (
                <motion.div
                  key={entry.playerId}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all ${
                    entry.isCurrentUser
                      ? 'bg-indigo-950/80 border-indigo-500/60 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-900/30'
                      : entry.rank <= 3
                      ? 'bg-slate-900 border-amber-500/30 shadow-md'
                      : 'bg-slate-900/80 border-slate-800'
                  }`}
                >
                  <div className="shrink-0 w-7 flex items-center justify-center">
                    {getMedalIcon(entry.rank)}
                  </div>

                  <div
                    className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-black shadow shrink-0"
                    title={entry.name}
                  >
                    <User size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold truncate ${
                        entry.isCurrentUser ? 'text-indigo-200' : 'text-slate-100'
                      }`}>
                        {entry.name}
                        {entry.isCurrentUser && (
                          <span className="text-[9px] font-mono bg-indigo-600 text-white px-1.5 py-0.2 rounded ml-1">YOU</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <RankBadge rating={entry.rankedRating} size="xs" showIcon showName={false} />
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black font-mono text-amber-300 flex items-center gap-1 justify-end">
                      {displayValue(entry)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {!loading && userRank !== null && !entries.find(e => e.isCurrentUser) && (
              <div className="pt-3 mt-3 border-t border-slate-800 shrink-0">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Your Position</div>
                {userEntry && (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border bg-indigo-950/60 border-indigo-500/50 ring-2 ring-indigo-500/20">
                    <div className="shrink-0 w-7 flex items-center justify-center">
                      <TrendingUp size={14} className="text-indigo-400" />
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-black shadow shrink-0">
                      <User size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-indigo-200">{userEntry.name} <span className="text-[9px] font-mono bg-indigo-600 text-white px-1.5 py-0.2 rounded">YOU</span></span>
                      <div className="mt-0.5"><RankBadge rating={userEntry.rankedRating} size="xs" showIcon showName={false} /></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Rank #{userRank}</div>
                      <div className="text-sm font-black font-mono text-amber-300">{displayValue(userEntry)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
