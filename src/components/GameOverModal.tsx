import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Home, Eye, Play, Sparkles, Clock, MoveHorizontal, Layers, Award } from 'lucide-react';
import { ClientGameState } from '../types';

interface GameOverModalProps {
  game: ClientGameState;
  onRematch: () => void;
  onNewGame: () => void;
  onLeaveLobby: () => void;
}

function formatDuration(seconds: number = 0): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  game,
  onRematch,
  onNewGame,
  onLeaveLobby,
}) => {
  const [minimized, setMinimized] = useState(false);

  const isTeam = game.isTeamGame || !!game.winningTeam;
  const winnerTitle = isTeam ? (game.winningTeam ?? 'Winning Team') : (game.winner ?? 'Winner');
  const winnerSubtitle = isTeam
    ? game.winningPlayerNames && game.winningPlayerNames.length > 0
      ? `Victors: ${game.winningPlayerNames.join(' & ')}`
      : 'Team Sequence Master'
    : 'Sequence Champion';

  const winningPlayers = game.players.filter(p =>
    isTeam
      ? game.winningPlayerNames?.includes(p.name)
      : p.name === game.winner
  );

  const stats = game.gameStats;

  return (
    <>
      {/* Floating Toggle Button when modal is minimized */}
      {minimized && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setMinimized(false)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 border-2 border-amber-300 hover:scale-105 transition-all cursor-pointer"
        >
          <Trophy size={18} /> Show Results
        </motion.button>
      )}

      {/* Main Overlay Modal */}
      <AnimatePresence>
        {!minimized && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-white flex flex-col items-center text-center my-auto"
            >
              {/* Header Badges / Sparkles */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button
                  onClick={() => setMinimized(true)}
                  title="Inspect Board"
                  className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye size={16} />
                  <span className="hidden sm:inline">Inspect Board</span>
                </button>
              </div>

              {/* Glowing Trophy Badge */}
              <div className="relative mb-5 mt-2">
                <div className="absolute inset-0 bg-amber-500/30 rounded-full blur-2xl animate-pulse" />
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 p-0.5 shadow-xl shadow-amber-500/30 flex items-center justify-center"
                >
                  <div className="w-full h-full bg-slate-950/90 rounded-[22px] flex items-center justify-center border border-amber-400/40">
                    <Trophy size={48} className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
                  </div>
                </motion.div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider px-3 py-0.5 rounded-full shadow border border-amber-300 flex items-center gap-1 whitespace-nowrap">
                  <Sparkles size={11} /> VICTORY!
                </div>
              </div>

              {/* Winner Title & Names */}
              <h1 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-1 flex items-center justify-center gap-1.5">
                <Sparkles size={14} /> CONGRATULATIONS! <Sparkles size={14} />
              </h1>

              <h2 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent mb-1">
                {winnerTitle} Wins!
              </h2>

              <p className="text-xs sm:text-sm text-slate-400 font-medium mb-5">
                {winnerSubtitle}
              </p>

              {/* Winning Player Avatars & Rematch Status */}
              {game.players.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                  {game.players.map(p => {
                    const votedRematch = game.rematchVotes?.includes(p.playerId);
                    const isWinner = isTeam
                      ? game.winningPlayerNames?.includes(p.name)
                      : p.name === game.winner;

                    return (
                      <div
                        key={p.playerId}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-all ${
                          isWinner ? 'bg-amber-950/80 border-amber-500/60' : 'bg-slate-800/90 border-slate-700'
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name[0]?.toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-slate-200">{p.name}</span>
                        {votedRematch && (
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800 flex items-center gap-0.5">
                            ✓ Ready
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Game Statistics Grid */}
              <div className="w-full bg-slate-850/80 rounded-2xl p-4 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-left">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <Clock size={12} className="text-amber-400" /> Duration
                  </div>
                  <div className="text-sm sm:text-base font-black font-mono text-amber-200">
                    {formatDuration(stats?.durationSeconds)}
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <MoveHorizontal size={12} className="text-indigo-400" /> Moves
                  </div>
                  <div className="text-sm sm:text-base font-black font-mono text-indigo-200">
                    {stats?.totalMoves ?? '-'}
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <Award size={12} className="text-emerald-400" /> Sequences
                  </div>
                  <div className="text-sm sm:text-base font-black font-mono text-emerald-200">
                    {stats?.sequencesCount ?? 1} Formed
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                    <Layers size={12} className="text-rose-400" /> Deck Left
                  </div>
                  <div className="text-sm sm:text-base font-black font-mono text-rose-200">
                    {game.deckCount} cards
                  </div>
                </div>
              </div>

              {/* Match Rewards Breakdown */}
              {game.rewardBreakdown && (
                <div className="w-full bg-gradient-to-r from-amber-950/40 via-slate-900 to-yellow-950/40 rounded-2xl p-3.5 border border-amber-500/30 mb-6 text-left space-y-1.5 text-xs font-semibold">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Match Completed:</span>
                    <span className="font-mono font-bold text-amber-300">+{game.rewardBreakdown.matchComplete} coins</span>
                  </div>
                  {game.rewardBreakdown.victory > 0 && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Victory Bonus:</span>
                      <span className="font-mono font-bold text-amber-300">+{game.rewardBreakdown.victory} coins</span>
                    </div>
                  )}
                  {game.rewardBreakdown.sequences > 0 && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Sequence Bonus:</span>
                      <span className="font-mono font-bold text-amber-300">+{game.rewardBreakdown.sequences} coins</span>
                    </div>
                  )}
                  {game.rewardBreakdown.streakBonus > 0 && (
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Win Streak Bonus:</span>
                      <span className="font-mono font-bold text-amber-300">+{game.rewardBreakdown.streakBonus} coins</span>
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-amber-500/20 flex items-center justify-between font-black text-amber-300 text-sm">
                    <span>Total Earned:</span>
                    <span className="font-mono text-base">+{game.rewardBreakdown.totalEarned} coins</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="w-full space-y-2.5">
                {(() => {
                  const connectedCount = game.players.filter(p => p.connected).length;
                  const voteCount = game.rematchVotes?.length ?? 0;
                  const hasVoted = game.rematchVotes?.includes(game.youPlayerId);

                  return (
                    <button
                      onClick={onRematch}
                      className={`w-full font-black py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm cursor-pointer border ${
                        hasVoted
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-900/30'
                          : 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 border-amber-300 shadow-amber-500/20'
                      }`}
                    >
                      <RotateCcw size={18} />
                      {hasVoted
                        ? `✓ Rematch Ready (${voteCount}/${connectedCount})`
                        : `Request Rematch (${voteCount}/${connectedCount} Ready)`}
                    </button>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={onNewGame}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <Play size={16} /> New Game
                  </button>

                  <button
                    onClick={onLeaveLobby}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold py-3 rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2 text-xs cursor-pointer"
                  >
                    <Home size={16} /> Back to Home
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
