import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Plus, X, Play, Users, Crown, ChevronRight, ArrowRight, Swords, Clock } from 'lucide-react';
import { Socket as SocketType } from 'socket.io-client';
import { Tournament, TournamentSize, TournamentMatch, TournamentStatus } from '@shared/types';
import { RankBadge } from './RankBadge';

interface TournamentModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: SocketType;
  playerId: string;
  playerName: string;
  onEnterRoom?: (roomId: string) => void;
}

interface TournamentSummary {
  tournamentId: string;
  name: string;
  size: TournamentSize;
  status: TournamentStatus;
  participantCount: number;
  hostPlayerId: string;
  currentRound: number;
  championId: string | null;
}

export const TournamentModal: React.FC<TournamentModalProps> = ({
  isOpen,
  onClose,
  socket,
  playerId,
  playerName,
  onEnterRoom,
}) => {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [createName, setCreateName] = useState('');
  const [createSize, setCreateSize] = useState<TournamentSize>(4);

  const refreshList = () => {
    socket.emit('get-tournaments-list', {}, (res: any) => {
      if (res?.success) setTournaments(res.tournaments || []);
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    setView('list');
    refreshList();
  }, [isOpen]);

  useEffect(() => {
    const handler = (t: Tournament) => {
      if (selectedTournament && selectedTournament.tournamentId === t.tournamentId) {
        setSelectedTournament(t);
      }
      refreshList();
    };
    socket.on('tournament-updated', handler);
    return () => socket.off('tournament-updated', handler);
  }, [socket, selectedTournament]);

  const handleCreate = () => {
    const name = createName.trim() || `${playerName}'s Tournament`;
    socket.emit('create-tournament', {
      hostPlayerId: playerId,
      hostPlayerName: playerName,
      size: createSize,
      name,
    }, (res: any) => {
      if (res?.success) {
        setSelectedTournament(res.tournament);
        setView('detail');
        setCreateName('');
        refreshList();
      }
    });
  };

  const handleJoin = (tournamentId: string) => {
    socket.emit('join-tournament', {
      tournamentId,
      playerId,
      playerName,
    });
    setTimeout(() => {
      socket.emit('get-tournament', { tournamentId }, (res: any) => {
        if (res?.success && res.tournament) {
          setSelectedTournament(res.tournament);
          setView('detail');
        }
      });
      refreshList();
    }, 200);
  };

  const handleLeave = (tournamentId: string) => {
    socket.emit('leave-tournament', { tournamentId, playerId });
    setTimeout(() => {
      setSelectedTournament(null);
      setView('list');
      refreshList();
    }, 200);
  };

  const handleStart = (tournamentId: string) => {
    socket.emit('start-tournament', { tournamentId, playerId });
    setTimeout(() => {
      socket.emit('get-tournament', { tournamentId }, (res: any) => {
        if (res?.success && res.tournament) setSelectedTournament(res.tournament);
      });
      refreshList();
    }, 300);
  };

  const handleStartMatch = (tournamentId: string, matchId: string) => {
    socket.emit('start-tournament-match', { tournamentId, matchId }, (res: any) => {
      if (res?.success && res.roomId && onEnterRoom) {
        onEnterRoom(res.roomId);
      }
    });
  };

  const openDetail = (t: TournamentSummary) => {
    socket.emit('get-tournament', { tournamentId: t.tournamentId }, (res: any) => {
      if (res?.success && res.tournament) {
        setSelectedTournament(res.tournament);
        setView('detail');
      }
    });
  };

  const getParticipant = (t: Tournament | null, pid: string | null) => {
    if (!t || !pid) return null;
    return t.participants.find(p => p.playerId === pid) || null;
  };

  const statusLabel = (s: TournamentStatus) => {
    if (s === 'registration') return { text: 'Registration', cls: 'bg-indigo-950 border-indigo-500/60 text-indigo-300' };
    if (s === 'in_progress') return { text: 'In Progress', cls: 'bg-amber-950 border-amber-500/60 text-amber-300' };
    return { text: 'Completed', cls: 'bg-emerald-950 border-emerald-500/60 text-emerald-300' };
  };

  const renderMatch = (match: TournamentMatch, t: Tournament) => {
    const p1 = getParticipant(t, match.participantIds[0]);
    const p2 = getParticipant(t, match.participantIds[1]);
    const isWinner1 = match.winnerId === match.participantIds[0];
    const isWinner2 = match.winnerId === match.participantIds[1];
    const isReady = match.status === 'waiting' && p1 && p2 && !match.roomId;
    const playerInMatch = match.participantIds.includes(playerId);
    const isHost = t.hostPlayerId === playerId;

    return (
      <div className={`bg-slate-900/90 rounded-xl border p-2.5 min-w-[160px] transition-all ${
        match.status === 'completed'
          ? 'border-emerald-500/40 shadow-sm shadow-emerald-900/20'
          : match.roomId
          ? 'border-indigo-500/50 shadow-sm shadow-indigo-900/30'
          : 'border-slate-800'
      }`}>
        <div className="text-[9px] font-mono text-slate-500 uppercase mb-1.5 flex items-center justify-between">
          <span>R{match.round} · Match {match.position + 1}</span>
          {match.status === 'completed' && <Crown size={9} className="text-amber-400" />}
        </div>

        <div className="space-y-1">
          {[0, 1].map(i => {
            const p = i === 0 ? p1 : p2;
            const isW = i === 0 ? isWinner1 : isWinner2;
            const isPlayer = p?.playerId === playerId;
            return (
              <div
                key={i}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  isW
                    ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-200'
                    : p
                    ? isPlayer
                      ? 'bg-indigo-950/60 border border-indigo-500/40 text-indigo-200'
                      : 'bg-slate-800/70 border border-slate-700 text-slate-300'
                    : 'bg-slate-800/30 border border-dashed border-slate-800 text-slate-600 italic'
                }`}
              >
                {p ? (
                  <>
                    <span className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-black">
                      {p.name[0]?.toUpperCase()}
                    </span>
                    <span className="truncate flex-1">{p.name}{isPlayer && <span className="ml-1 text-[8px]">(YOU)</span>}</span>
                    {isW && <Crown size={9} className="text-amber-400 shrink-0" />}
                  </>
                ) : (
                  <span className="italic text-slate-600">TBD</span>
                )}
              </div>
            );
          })}
        </div>

        {(match.status === 'in_progress' && match.roomId) && playerInMatch && (
          <button
            onClick={() => onEnterRoom?.(match.roomId!)}
            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-indigo-600/30"
          >
            <Play size={10} /> Enter Match
          </button>
        )}

        {isReady && (isHost || playerInMatch) && (
          <button
            onClick={() => handleStartMatch(t.tournamentId, match.matchId)}
            className="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black py-1.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-emerald-600/30"
          >
            <Swords size={10} /> Start Match
          </button>
        )}
      </div>
    );
  };

  const renderBracket = (t: Tournament) => {
    const rounds = t.size === 4 ? 2 : 3;
    const roundLabels = rounds === 2
      ? ['Semifinals', 'Final']
      : ['Quarterfinals', 'Semifinals', 'Final'];

    return (
      <div className="overflow-x-auto pb-4 -mx-2 px-2">
        <div className="flex items-stretch gap-3 min-w-max">
          {Array.from({ length: rounds }).map((_, rIdx) => {
            const roundNum = rIdx + 1;
            const roundMatches = t.matches.filter(m => m.round === roundNum);
            const isFinal = roundNum === rounds;
            const champion = t.championId ? getParticipant(t, t.championId) : null;

            return (
              <div key={rIdx} className="flex flex-col justify-around gap-3 min-w-[170px]">
                <div className={`text-center text-[10px] font-black uppercase tracking-wider pb-1 ${
                  isFinal ? 'text-amber-400' : 'text-slate-500'
                }`}>
                  {roundLabels[rIdx]}
                </div>
                {roundMatches.map(match => (
                  <div key={match.matchId} className="flex-1 flex items-center">
                    {renderMatch(match, t)}
                  </div>
                ))}
                {isFinal && t.status === 'completed' && champion && (
                  <div className="bg-gradient-to-b from-amber-950/80 to-amber-950/40 border border-amber-500/60 rounded-xl p-3 text-center shadow-lg shadow-amber-900/30">
                    <Crown size={22} className="mx-auto text-amber-400 mb-1 animate-bounce" />
                    <div className="text-[10px] text-amber-300 font-black uppercase tracking-widest">Champion</div>
                    <div className="text-sm font-black text-amber-200 mt-1">{champion.name}</div>
                    <RankBadge rating={champion.rankedRating} size="xs" showIcon showName={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-3xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-purple-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(168,85,247,0.2)] text-white my-auto max-h-[92vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2.5 rounded-xl shadow-md shadow-purple-600/30">
                  <Trophy size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    {view === 'create' ? 'Create Tournament' : view === 'detail' ? selectedTournament?.name : 'Tournaments'}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    {view === 'list' && `${tournaments.length} tournament${tournaments.length !== 1 ? 's' : ''} active`}
                    {view === 'detail' && selectedTournament && `${selectedTournament.participants.length}/${selectedTournament.size} players`}
                    {view === 'create' && 'Single elimination bracket'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {view === 'detail' && (
                  <button
                    onClick={() => { setView('list'); setSelectedTournament(null); refreshList(); }}
                    className="text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer transition-all"
                  >
                    ← Back
                  </button>
                )}
                {view === 'list' && (
                  <button
                    onClick={() => setView('create')}
                    className="flex items-center gap-1 text-[11px] font-black bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg shadow-md shadow-purple-600/30 cursor-pointer transition-all"
                  >
                    <Plus size={12} /> New
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 mt-4">
              {view === 'list' && (
                <div className="space-y-3">
                  {tournaments.length === 0 ? (
                    <div className="text-center py-14 text-slate-500 rounded-2xl border border-dashed border-slate-800 px-4">
                      <Trophy size={40} className="mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-bold text-slate-400 mb-1">No tournaments yet</p>
                      <p className="text-[11px] leading-relaxed mb-4">Be the first to create an elimination tournament and compete for the crown!</p>
                      <button
                        onClick={() => setView('create')}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer shadow-md shadow-purple-600/30"
                      >
                        <Plus size={12} className="inline mr-1" /> Create Tournament
                      </button>
                    </div>
                  ) : (
                    tournaments.map(t => {
                      const sl = statusLabel(t.status);
                      const isParticipating = t.participantCount > 0;
                      return (
                        <div
                          key={t.tournamentId}
                          onClick={() => openDetail(t)}
                          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition-all cursor-pointer group"
                        >
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-md shadow-purple-600/20 shrink-0">
                            <Trophy size={18} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-100 truncate">{t.name}</span>
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${sl.cls}`}>
                                {sl.text}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 font-semibold">
                              <span className="flex items-center gap-1"><Users size={10} /> {t.participantCount}/{t.size}</span>
                              <span className="flex items-center gap-1"><Swords size={10} /> {t.size === 4 ? '4-player' : '8-player'}</span>
                              {t.currentRound > 0 && <span className="flex items-center gap-1"><Clock size={10} /> Round {t.currentRound}</span>}
                              {t.championId && <span className="text-amber-400 flex items-center gap-1"><Crown size={10} /> Champion decided!</span>}
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all shrink-0" />
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {view === 'create' && (
                <div className="max-w-md mx-auto space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tournament Name</label>
                    <input
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder={`${playerName}'s Tournament`}
                      maxLength={30}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-850/80 border border-slate-800 text-white placeholder-slate-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bracket Size</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[4, 8].map(size => (
                        <button
                          key={size}
                          onClick={() => setCreateSize(size as TournamentSize)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                            createSize === size
                              ? 'bg-purple-950/60 border-purple-500/70 ring-2 ring-purple-500/30 shadow-lg shadow-purple-900/30'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">{size}-Player</div>
                          <div className="text-lg font-black text-slate-100 mt-1">{size === 4 ? 'Semis → Final' : 'Quarters → Semis → Final'}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {size === 4 ? '2 rounds, 3 matches' : '3 rounds, 7 matches'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-850/60 rounded-2xl p-3 border border-slate-800 space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Format</div>
                    <div className="text-[11px] text-slate-300 leading-relaxed">
                      • Single-elimination bracket<br />
                      • All matches use standard 1v1 Sequence rules<br />
                      • Winners automatically advance to the next round<br />
                      • Final match winner is crowned Champion 👑
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => setView('list')}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl border border-slate-700 text-xs cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black py-3 rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center gap-1.5 text-xs cursor-pointer transition-all"
                    >
                      <Plus size={14} /> Create & Host
                    </button>
                  </div>
                </div>
              )}

              {view === 'detail' && selectedTournament && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-2xl border border-slate-800">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-md shrink-0">
                        <Trophy size={22} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-black text-slate-100 truncate">{selectedTournament.name}</h3>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${statusLabel(selectedTournament.status).cls}`}>
                            {statusLabel(selectedTournament.status).text}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1"><Users size={10} /> {selectedTournament.participants.length}/{selectedTournament.size}</span>
                          <span>·</span>
                          <span>{selectedTournament.size}-Player Bracket</span>
                          <span>·</span>
                          <span>Hosted by {selectedTournament.participants.find(p => p.playerId === selectedTournament.hostPlayerId)?.name || 'Unknown'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(() => {
                        const joined = selectedTournament.participants.find(p => p.playerId === playerId);
                        const isHost = selectedTournament.hostPlayerId === playerId;
                        const full = selectedTournament.participants.length >= selectedTournament.size;
                        return (
                          <>
                            {selectedTournament.status === 'registration' && !joined && !full && (
                              <button
                                onClick={() => handleJoin(selectedTournament.tournamentId)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2 rounded-lg shadow-md shadow-emerald-600/30 cursor-pointer transition-all flex items-center gap-1"
                              >
                                <Plus size={12} /> Join
                              </button>
                            )}
                            {selectedTournament.status === 'registration' && joined && !isHost && (
                              <button
                                onClick={() => handleLeave(selectedTournament.tournamentId)}
                                className="bg-slate-800 hover:bg-rose-950 text-rose-300 hover:text-rose-200 text-xs font-bold px-3 py-2 rounded-lg border border-slate-700 cursor-pointer transition-all"
                              >
                                Leave
                              </button>
                            )}
                            {selectedTournament.status === 'registration' && isHost && (
                              <button
                                onClick={() => handleStart(selectedTournament.tournamentId)}
                                disabled={selectedTournament.participants.length < (selectedTournament.size === 4 ? 2 : 4)}
                                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-slate-950 disabled:text-slate-500 text-xs font-black px-4 py-2 rounded-lg shadow-md shadow-amber-600/30 cursor-pointer transition-all flex items-center gap-1 disabled:cursor-not-allowed disabled:shadow-none"
                              >
                                <Play size={12} /> Start Bracket
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl p-3 border border-slate-800">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">
                      Participants ({selectedTournament.participants.length}/{selectedTournament.size})
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {selectedTournament.participants.filter(p => !p.playerId.startsWith('bye_')).map((p, i) => {
                        const isMe = p.playerId === playerId;
                        const isHost = p.playerId === selectedTournament.hostPlayerId;
                        return (
                          <div
                            key={p.playerId}
                            className={`p-2 rounded-xl border text-center transition-all ${
                              p.eliminated && selectedTournament.status === 'in_progress'
                                ? 'bg-slate-900/40 border-slate-800 opacity-50'
                                : isMe
                                  ? 'bg-indigo-950/50 border-indigo-500/50 shadow-sm shadow-indigo-900/20'
                                  : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="relative w-9 h-9 mx-auto mb-1">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-black shadow">
                                {p.name[0]?.toUpperCase()}
                              </div>
                              {p.eliminated && selectedTournament.status !== 'registration' && (
                                <div className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded border border-slate-900">X</div>
                              )}
                              {isHost && (
                                <div className="absolute -top-1 -left-1 text-amber-400">
                                  <Crown size={11} />
                                </div>
                              )}
                            </div>
                            <div className={`text-[11px] font-bold truncate ${isMe ? 'text-indigo-200' : 'text-slate-200'}`}>
                              {p.name}{isMe && <span className="ml-1 text-[8px]">(You)</span>}
                            </div>
                            <div className="mt-0.5 flex items-center justify-center">
                              <RankBadge rating={p.rankedRating} size="xs" showIcon showName={false} showRating={false} />
                            </div>
                            <div className="text-[9px] text-slate-500 font-mono mt-0.5">#{p.seed} Seed</div>
                          </div>
                        );
                      })}
                      {Array.from({ length: Math.max(0, selectedTournament.size - selectedTournament.participants.length) }).map((_, i) => (
                        <div
                          key={`slot-${i}`}
                          className="p-2 rounded-xl border-2 border-dashed border-slate-800 text-center opacity-60"
                        >
                          <div className="w-9 h-9 mx-auto mb-1 rounded-full bg-slate-800 flex items-center justify-center text-slate-600 text-xs font-black">
                            ?
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold">Empty Slot</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedTournament.status !== 'registration' && (
                    <div className="bg-slate-900/30 rounded-2xl p-3.5 border border-slate-800">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tournament Bracket</div>
                        {selectedTournament.currentRound > 0 && selectedTournament.status === 'in_progress' && (
                          <div className="text-[10px] font-black text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-700/60">
                            Round {selectedTournament.currentRound}
                          </div>
                        )}
                      </div>
                      {renderBracket(selectedTournament)}
                    </div>
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
