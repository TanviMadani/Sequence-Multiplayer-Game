import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientGameState, Card, PlayerProfile } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, RotateCcw, Trophy, ChevronRight, Copy, Check, SkipForward, WifiOff, Layers, Clock, Flag, Scissors, Coins, User, Undo2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GameOverModal } from './components/GameOverModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ProfileModal } from './components/ProfileModal';
import { AchievementToast } from './components/AchievementToast';
import { isWinningCell, getSequenceOrder, WinningSequenceBadge } from './components/WinningSequenceHighlight';
import { AchievementDef } from './constants/rewards';

const PLAYER_ID_KEY = 'sequence.playerId';
const PLAYER_NAME_KEY = 'sequence.playerName';
const LAST_ROOM_KEY = 'sequence.lastRoomId';

function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

function getStoredName(): string {
  try {
    return localStorage.getItem(PLAYER_NAME_KEY) || '';
  } catch {
    return '';
  }
}

function getStoredRoom(): string {
  try {
    return localStorage.getItem(LAST_ROOM_KEY) || '';
  } catch {
    return '';
  }
}

function getRoomFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('room') || '';
  } catch {
    return '';
  }
}

const socket: Socket = io();

export default function App() {
  const playerIdRef = useRef<string>(getOrCreatePlayerId());
  const processedFinishRef = useRef<boolean>(false);
  const [roomId, setRoomId] = useState(getRoomFromUrl() || getStoredRoom());
  const [playerName, setPlayerName] = useState(getStoredName());
  const [inRoom, setInRoom] = useState(false);
  const [game, setGame] = useState<ClientGameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [unlockedToast, setUnlockedToast] = useState<AchievementDef | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(cur => (cur === msg ? null : cur)), 4000);
  }, []);

  // Auto-reconnect on mount & request profile
  useEffect(() => {
    socket.emit('get-profile', playerIdRef.current);
    const initialRoom = getRoomFromUrl() || getStoredRoom();
    const name = getStoredName();
    if (initialRoom && name) {
      socket.emit('join-room', {
        roomId: initialRoom,
        playerName: name,
        playerId: playerIdRef.current,
      });
      setInRoom(true);
    }
  }, []);

  useEffect(() => {
    socket.on('game-updated', (updatedGame: ClientGameState) => {
      setGame(updatedGame);
      setInRoom(true);
      try {
        localStorage.setItem(LAST_ROOM_KEY, updatedGame.roomId);
      } catch {
        /* ignore */
      }

      if (updatedGame.status === 'finished' && updatedGame.winner) {
        if (!processedFinishRef.current) {
          processedFinishRef.current = true;
          confetti({ particleCount: 180, spread: 80, origin: { y: 0.6 } });
        }
      } else if (updatedGame.status === 'playing' || updatedGame.status === 'waiting') {
        processedFinishRef.current = false;
      }
    });

    socket.on('profile-updated', ({ profile: updatedProfile, newlyUnlocked }: { profile: PlayerProfile; newlyUnlocked?: AchievementDef[] }) => {
      setProfile(updatedProfile);
      if (newlyUnlocked && newlyUnlocked.length > 0) {
        setUnlockedToast(newlyUnlocked[0]);
      }
    });

    socket.on('toast-message', (msg: string) => {
      showToast(msg);
    });

    socket.on('error', (msg: string) => {
      showToast(msg);
      setInRoom(false);
    });

    return () => {
      socket.off('game-updated');
      socket.off('profile-updated');
      socket.off('toast-message');
      socket.off('error');
    };
  }, [showToast]);

  // Turn Timer countdown tick
  useEffect(() => {
    if (!game || game.status !== 'playing' || !game.turnDeadline) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((game.turnDeadline! - Date.now()) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [game?.turnDeadline, game?.status]);

  // 2-Second Undo timer countdown tick
  const isUndoAvailable = game?.undoAvailableForPlayerId === playerIdRef.current && !!game?.undoDeadline;

  useEffect(() => {
    if (!isUndoAvailable || !game?.undoDeadline) {
      setUndoCountdown(null);
      return;
    }

    const updateUndoTimer = () => {
      const remainingMs = game.undoDeadline! - Date.now();
      if (remainingMs <= 0) {
        setUndoCountdown(null);
      } else {
        setUndoCountdown(Math.ceil(remainingMs / 1000));
      }
    };

    updateUndoTimer();
    const interval = setInterval(updateUndoTimer, 200);
    return () => clearInterval(interval);
  }, [isUndoAvailable, game?.undoDeadline]);

  const joinRoom = () => {
    const trimmedRoom = roomId.trim();
    const trimmedName = playerName.trim();
    if (!trimmedRoom || !trimmedName) return;
    try {
      localStorage.setItem(PLAYER_NAME_KEY, trimmedName);
      localStorage.setItem(LAST_ROOM_KEY, trimmedRoom);
    } catch {
      /* ignore */
    }
    socket.emit('join-room', {
      roomId: trimmedRoom,
      playerName: trimmedName,
      playerId: playerIdRef.current,
    });
    setInRoom(true);
  };

  const startGame = () => {
    if (game) socket.emit('start-game', game.roomId);
  };

  const restartGame = () => {
    if (game) socket.emit('restart-game', game.roomId);
  };

  const skipDisconnectedTurn = () => {
    if (game) socket.emit('skip-turn', game.roomId);
  };

  const playCard = (row: number, col: number) => {
    if (game && game.status === 'playing' && selectedCard) {
      socket.emit('play-card', {
        roomId: game.roomId,
        cardId: selectedCard.id,
        row,
        col,
      });
      setSelectedCard(null);
    }
  };

  const handleRematch = () => {
    if (game) socket.emit('vote-rematch', game.roomId);
  };

  const handleNewGame = () => {
    restartGame();
  };

  const handleSurrender = () => {
    if (game) socket.emit('surrender-game', game.roomId);
    setShowSurrenderModal(false);
  };

  const handleUndoMove = () => {
    if (game) socket.emit('undo-move', game.roomId);
  };

  const handleClaimDailyBonus = () => {
    socket.emit('claim-daily-bonus', playerIdRef.current);
  };

  const handleLeaveLobby = () => {
    try {
      localStorage.removeItem(LAST_ROOM_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url.toString());
    } catch {
      /* ignore */
    }
    setInRoom(false);
    setGame(null);
    setRoomId('');
  };

  const copyInviteLink = async () => {
    if (!game) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${game.roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      showToast('Could not copy link — copy the room code instead.');
    }
  };

  const getSuitSymbol = (suit: string) => {
    switch (suit) {
      case 'H': return '♥';
      case 'D': return '♦';
      case 'C': return '♣';
      case 'S': return '♠';
      default: return '';
    }
  };

  const getSuitColor = (suit: string) => (suit === 'H' || suit === 'D') ? 'text-red-500' : 'text-slate-900';

  const Toast = () => (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-950/90 backdrop-blur-md text-white border border-slate-700 px-5 py-2.5 rounded-xl shadow-2xl text-sm font-medium max-w-sm text-center"
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
  );

  // Login / Join Room view
  if (!inRoom || !game) {
    return (
      <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
        <Toast />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-800 text-white"
        >
          <div className="flex items-center gap-3 mb-6 sm:mb-8">
            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-600/30">
              <Play className="text-white fill-current" size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Sequence</h1>
              <p className="text-xs text-indigo-300 font-medium">Multiplayer Board Game</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-sm"
                placeholder="Enter your nickname..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Room Code</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                maxLength={20}
                onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); }}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none uppercase tracking-wider font-mono text-sm"
                placeholder="e.g. ROOM123"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Share this room code with friends to play together on any screen!
              </p>
            </div>
            <button
              onClick={joinRoom}
              disabled={!roomId.trim() || !playerName.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              Join Room <ChevronRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentPlayer = game.players[game.turnIndex];
  const isMyTurn = game.status === 'playing' && currentPlayer?.playerId === playerIdRef.current;
  const me = game.players.find(p => p.playerId === playerIdRef.current);
  const currentTurnDisconnected = game.status === 'playing' && currentPlayer && !currentPlayer.connected;

  // Helper to render card element in Hand
  const renderHandCard = (card: Card, isMobile = false) => {
    const isSelected = selectedCard?.id === card.id;
    const isTwoEyedJack = card.rank === 'J' && (card.suit === 'C' || card.suit === 'D');
    const isOneEyedJack = card.rank === 'J' && (card.suit === 'H' || card.suit === 'S');

    return (
      <motion.div
        key={card.id}
        whileHover={isMyTurn ? { scale: 1.05 } : {}}
        whileTap={isMyTurn ? { scale: 0.95 } : {}}
        onClick={() => isMyTurn && setSelectedCard(isSelected ? null : card)}
        className={`relative shrink-0 rounded-xl bg-white shadow-md border-2 transition-all cursor-pointer select-none flex flex-col items-center justify-between p-1
          ${isMobile ? 'w-12 h-16' : 'w-full h-20 xl:h-22'}
          ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/40 -translate-y-1 bg-indigo-50/95 shadow-indigo-500/20' : 'border-slate-300 hover:border-indigo-400'}
          ${!isMyTurn ? 'opacity-60 grayscale-[0.4] cursor-not-allowed' : ''}
        `}
      >
        <div className="w-full flex items-center justify-between px-1">
          <span className={`text-xs font-black ${getSuitColor(card.suit)}`}>{card.rank}</span>
          <span className={`text-xs font-bold ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
        </div>

        <div className={`text-lg xl:text-2xl leading-none font-bold ${getSuitColor(card.suit)}`}>
          {getSuitSymbol(card.suit)}
        </div>

        {card.rank === 'J' ? (
          <span className={`text-[7px] xl:text-[8px] font-black uppercase px-1 py-0.2 rounded leading-tight ${
            isTwoEyedJack ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}>
            {isTwoEyedJack ? 'Wild' : 'Remove'}
          </span>
        ) : (
          <div className="w-full flex items-center justify-between px-1 rotate-180">
            <span className={`text-[10px] font-black ${getSuitColor(card.suit)}`}>{card.rank}</span>
            <span className={`text-[10px] font-bold ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
          </div>
        )}
      </motion.div>
    );
  };

  // Helper for rendering a board cell
  const renderCell = (cell: (typeof game.board)[0][0], rIdx: number, cIdx: number, isDesktop = true) => {
    const isWinCell = isWinningCell(rIdx, cIdx, game.winningCells);
    const seqOrder = getSequenceOrder(rIdx, cIdx, game.winningSequences);

    const isPossible = !!(game.status === 'playing' && isMyTurn && selectedCard && (
      (selectedCard.rank === 'J' && (selectedCard.suit === 'C' || selectedCard.suit === 'D') && !cell.chip && cell.card) || // 2-eyed Jack
      (selectedCard.rank === 'J' && (selectedCard.suit === 'H' || selectedCard.suit === 'S') && cell.chip && cell.chip !== 'wild' && cell.chip !== me?.color && !cell.isLocked) || // 1-eyed Jack
      (!cell.chip && cell.card && cell.card.rank === selectedCard.rank && cell.card.suit === selectedCard.suit) // Normal card
    ));

    const isRemoveTarget = isPossible && selectedCard?.rank === 'J' && (selectedCard?.suit === 'H' || selectedCard?.suit === 'S');

    const isLastMove = game.lastMove?.row === rIdx && game.lastMove?.col === cIdx;
    const isRemoveMove = isLastMove && game.lastMove?.type === 'remove';
    const isCorner = !cell.card;

    return (
      <motion.div
        key={`${rIdx}-${cIdx}`}
        animate={isWinCell ? { scale: [1, 1.06, 1] } : {}}
        transition={isWinCell ? { duration: 1.8, repeat: Infinity, delay: seqOrder * 0.12, ease: "easeInOut" } : {}}
        whileHover={isPossible ? { scale: 1.08, zIndex: 30 } : {}}
        onClick={() => isPossible && playCard(rIdx, cIdx)}
        className={`relative w-full h-full rounded sm:rounded-md flex items-center justify-center select-none font-bold transition-all cursor-default overflow-hidden
          ${isCorner ? 'bg-gradient-to-br from-amber-500/20 to-slate-800 text-amber-400 border border-amber-500/30' : 'bg-slate-100 text-slate-900'}
          ${isWinCell ? 'ring-4 ring-amber-400 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.9)] z-20' : ''}
          ${isPossible ? (isRemoveTarget ? 'ring-4 ring-rose-500 bg-rose-50/80 cursor-pointer z-20 shadow-lg shadow-rose-500/50 animate-pulse' : 'ring-4 ring-emerald-400 bg-emerald-50/80 cursor-pointer z-20 shadow-lg shadow-emerald-500/50 animate-pulse') : ''}
          ${isLastMove && !isWinCell ? (isRemoveMove ? 'ring-4 ring-rose-500 border-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.8)] z-10' : 'ring-4 ring-amber-400 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.8)] z-10') : ''}
        `}
      >
        {isWinCell && <WinningSequenceBadge order={seqOrder} />}

        {isLastMove && isRemoveMove && !isWinCell && (
          <div className="absolute top-0.5 right-0.5 text-rose-500 z-20" title="Chip Removed">
            <Scissors size={10} className="animate-bounce" />
          </div>
        )}

        {isDesktop ? (
          /* Desktop Cell Layout: Wide Landscape Tile */
          <div className="flex items-center justify-center gap-1.5 w-full h-full px-1">
            {cell.card ? (
              <>
                <span className={`text-xs md:text-sm xl:text-base font-black leading-none ${getSuitColor(cell.card.suit)}`}>
                  {cell.card.rank}
                </span>
                <span className={`text-sm md:text-base xl:text-lg font-bold leading-none ${getSuitColor(cell.card.suit)}`}>
                  {getSuitSymbol(cell.card.suit)}
                </span>
              </>
            ) : (
              <div className="text-amber-400 text-sm xl:text-base font-black opacity-80">★</div>
            )}
          </div>
        ) : (
          /* Mobile Cell Layout: Clean Square Tile */
          <div className="flex flex-col items-center justify-center w-full h-full leading-none gap-0.5">
            {cell.card ? (
              <>
                <span className={`text-[10px] sm:text-xs font-black ${getSuitColor(cell.card.suit)}`}>
                  {cell.card.rank}
                </span>
                <span className={`text-[11px] sm:text-xs font-bold ${getSuitColor(cell.card.suit)}`}>
                  {getSuitSymbol(cell.card.suit)}
                </span>
              </>
            ) : (
              <div className="text-amber-400 text-xs sm:text-sm font-black opacity-80">★</div>
            )}
          </div>
        )}

        {/* Chip Overlay */}
        <AnimatePresence>
          {cell.chip && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center p-0.5 pointer-events-none"
            >
              <div
                className={`w-3/4 h-3/4 max-w-[32px] max-h-[32px] xl:max-w-[40px] xl:max-h-[40px] rounded-full shadow-lg border-2 border-white/90 flex items-center justify-center ${
                  isWinCell
                    ? 'ring-4 ring-amber-300 ring-offset-2 ring-offset-slate-900 shadow-amber-400/50'
                    : cell.isLocked
                    ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-slate-900'
                    : ''
                }`}
                style={{ backgroundColor: cell.chip === 'wild' ? '#94a3b8' : cell.chip }}
              >
                {(cell.isLocked || isWinCell) && <Trophy size={12} className="text-white drop-shadow" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col lg:flex-row select-none">
      <Toast />

      {/* Surrender Confirmation Modal */}
      <ConfirmModal
        isOpen={showSurrenderModal}
        title="Surrender Match?"
        message="Are you sure you want to surrender this match? Your opponent(s) will be declared the victors."
        confirmText="Surrender Match"
        cancelText="Keep Playing"
        onConfirm={handleSurrender}
        onCancel={() => setShowSurrenderModal(false)}
      />

      {/* Player Profile & Statistics Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profile={profile}
        onClaimDailyBonus={handleClaimDailyBonus}
      />

      {/* Achievement Unlocked Notification Toast */}
      <AchievementToast
        achievement={unlockedToast}
        onClose={() => setUnlockedToast(null)}
      />

      {/* Game Over Congratulations Modal */}
      {game.status === 'finished' && game.winner && (
        <GameOverModal
          game={game}
          onRematch={handleRematch}
          onNewGame={handleNewGame}
          onLeaveLobby={handleLeaveLobby}
        />
      )}

      {/* ========================================================================= */}
      {/* DESKTOP LEFT SIDEBAR: Room info, Players, Actions                         */}
      {/* ========================================================================= */}
      <aside className="hidden lg:flex w-72 xl:w-80 h-full p-4 flex-col justify-between shrink-0 bg-slate-900/90 backdrop-blur-md border-r border-slate-800 overflow-y-auto z-20">
        <div className="space-y-4">
          {/* Logo & Room Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-600/30">
                <Play className="text-white fill-current" size={16} />
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">Sequence</h2>
            </div>
            <button
              onClick={copyInviteLink}
              title="Copy Room Link"
              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-mono font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              {linkCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{game.roomId}</span>
            </button>
          </div>

          {/* Profile & Coins Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border border-slate-700/80 rounded-xl">
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              <User size={15} className="text-indigo-400" />
              <span className="truncate max-w-[110px]">{profile?.name || playerName || 'Profile'}</span>
            </button>
            <div
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-1 font-extrabold text-amber-400 text-xs bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-800/80 cursor-pointer hover:bg-amber-900/60 transition-all"
            >
              <Coins size={14} />
              <span>{profile?.coins ?? 0}</span>
            </div>
          </div>

          {/* Turn Timer & Active Match Status */}
          {game.status === 'playing' && timeRemaining !== null && (
            <div className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
              timeRemaining <= 10
                ? 'bg-rose-950/80 border-rose-500/80 animate-pulse text-rose-200'
                : 'bg-slate-800/80 border-slate-700 text-slate-200'
            }`}>
              <span className="text-xs font-bold flex items-center gap-1.5">
                <Clock size={14} className={timeRemaining <= 10 ? 'text-rose-400 animate-spin' : 'text-indigo-400'} /> Turn Timer
              </span>
              <span className="font-mono font-black text-sm">{timeRemaining}s</span>
            </div>
          )}

          {/* Players List */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              <span className="flex items-center gap-1.5"><Users size={14} /> Players</span>
              <span className="text-indigo-400 font-mono">({game.players.length}/4)</span>
            </div>

            <div className="space-y-2">
              {game.players.map((p, idx) => {
                const isCurrentTurn = game.turnIndex === idx && game.status === 'playing';
                return (
                  <div
                    key={p.playerId}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                      isCurrentTurn
                        ? 'bg-indigo-950/60 border-indigo-500/80 shadow-md shadow-indigo-900/20'
                        : 'bg-slate-800/60 border-slate-800'
                    } ${!p.connected || p.surrendered ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span
                          title={p.surrendered ? 'Surrendered' : p.connected ? 'Connected' : 'Offline'}
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                            p.surrendered ? 'bg-rose-500' : p.connected ? 'bg-emerald-500' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-bold truncate ${isCurrentTurn ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {p.name} {p.playerId === playerIdRef.current && <span className="text-slate-400 text-[11px] font-normal">(You)</span>}
                        </span>
                        {game.status === 'playing' && (
                          <span className="text-[10px] text-slate-400">
                            {p.surrendered ? 'Surrendered' : `${p.handCount} card${p.handCount === 1 ? '' : 's'}${!p.connected ? ' · offline' : ''}`}
                          </span>
                        )}
                      </div>
                    </div>

                    {isCurrentTurn && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500 text-white animate-pulse shrink-0">
                        TURN
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Game Controls / Status Area */}
          {game.status === 'waiting' && (
            <div className="bg-slate-800/70 p-3.5 rounded-xl border border-slate-700/80 space-y-2.5">
              <p className="text-xs text-slate-300 text-center font-medium">Waiting for players to join...</p>
              <button
                onClick={copyInviteLink}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 rounded-lg transition-all border border-slate-600 flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                {linkCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {linkCopied ? 'Link Copied!' : 'Copy Invite Link'}
              </button>
              <button
                onClick={startGame}
                disabled={game.players.length < 2}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-2.5 rounded-lg transition-all shadow-md shadow-emerald-900/30 text-xs cursor-pointer disabled:cursor-not-allowed"
              >
                Start Game ({game.players.length}/2+ ready)
              </button>
            </div>
          )}

          {game.status === 'playing' && (
            <button
              onClick={() => setShowSurrenderModal(true)}
              className="w-full bg-slate-800 hover:bg-rose-950/80 hover:border-rose-700 text-slate-300 hover:text-rose-300 font-bold py-2 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <Flag size={14} /> Surrender Match
            </button>
          )}

          {currentTurnDisconnected && (
            <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/80 space-y-2">
              <p className="text-xs text-amber-300 flex items-center gap-1.5">
                <WifiOff size={14} /> {currentPlayer?.name} is offline.
              </p>
              <button
                onClick={skipDisconnectedTurn}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                <SkipForward size={14} /> Skip Turn
              </button>
            </div>
          )}

          {game.status === 'finished' && (
            <div className="bg-amber-950/50 p-4 rounded-xl border border-amber-600/60 text-center space-y-3">
              <Trophy className="mx-auto text-amber-400 animate-bounce" size={36} />
              <div>
                <h3 className="text-base font-black text-amber-300">Match Finished!</h3>
                <p className="text-sm font-bold text-white mt-0.5">{game.winner} Won</p>
              </div>
              <button
                onClick={handleRematch}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <RotateCcw size={14} /> Request Rematch
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Footer / Legend */}
        <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between text-slate-300">
            <span className="flex items-center gap-1"><Layers size={12} /> Remaining Deck</span>
            <span className="font-mono font-bold text-white">{game.deckCount} cards</span>
          </div>
          <div className="text-[10px] text-slate-400 leading-tight">
            ★ Two-Eyed Jack = Wild &bull; ✂ One-Eyed Jack = Remove
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MOBILE TOP BAR (Hidden on lg): Room, Turn, Status                         */}
      {/* ========================================================================= */}
      <header className="lg:hidden shrink-0 px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Play className="text-white fill-current" size={12} />
          </div>
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded text-xs font-mono font-bold text-slate-200"
          >
            {linkCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{game.roomId}</span>
          </button>
        </div>

        {/* Turn Timer on Mobile */}
        {game.status === 'playing' && timeRemaining !== null && (
          <div className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 ${
            timeRemaining <= 10 ? 'bg-rose-950 text-rose-300 border border-rose-700 animate-pulse' : 'bg-slate-800 text-slate-300'
          }`}>
            <Clock size={11} /> {timeRemaining}s
          </div>
        )}

        {/* Players Turn Avatars */}
        <div className="flex items-center gap-1.5">
          {game.players.map((p, idx) => {
            const isTurn = game.turnIndex === idx && game.status === 'playing';
            return (
              <div
                key={p.playerId}
                className={`relative w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                  isTurn ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900 scale-110' : 'opacity-70'
                }`}
                style={{ backgroundColor: p.color }}
                title={`${p.name}${p.playerId === playerIdRef.current ? ' (You)' : ''}`}
              >
                {p.name[0]?.toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div>
          {game.status === 'waiting' && (
            <button
              onClick={startGame}
              disabled={game.players.length < 2}
              className="bg-emerald-600 disabled:bg-slate-700 text-white font-bold text-xs px-2.5 py-1 rounded"
            >
              Start ({game.players.length}/2+)
            </button>
          )}
          {game.status === 'playing' && (
            <button
              onClick={() => setShowSurrenderModal(true)}
              className="bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1"
            >
              <Flag size={12} /> Surrender
            </button>
          )}
          {game.status === 'finished' && (
            <button
              onClick={handleRematch}
              className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded"
            >
              Rematch
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MOBILE TOP DOCK: Hand Cards (Rendered BEFORE the board on mobile)         */}
      {/* ========================================================================= */}
      {me && game.status === 'playing' && (
        <div className="lg:hidden shrink-0 px-2 py-1.5 bg-slate-900/95 backdrop-blur border-b border-slate-800 z-20">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
              Your Cards {isMyTurn && <span className="text-indigo-400 font-normal animate-pulse">(Tap to select)</span>}
            </span>
            <div className="flex items-center gap-2">
              {selectedCard && (
                <span className="text-[10px] font-mono font-bold text-indigo-300 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800">
                  {selectedCard.rank}{getSuitSymbol(selectedCard.suit)}
                </span>
              )}
              <span className="text-[10px] text-slate-500 font-mono">{game.deckCount} in deck</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 overflow-x-auto py-0.5 px-0.5 no-scrollbar">
            {me.hand.map((card) => renderHandCard(card, true))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CENTER STAGE: 10x10 Game Board (Scaled to fill screen properly)            */}
      {/* ========================================================================= */}
      <main className="flex-1 min-h-0 min-w-0 p-1 sm:p-2 lg:p-3 flex flex-col items-center justify-center overflow-hidden relative">
        {/* Turn helper status banner on Desktop */}
        <div className="hidden lg:flex items-center justify-center mb-2 shrink-0">
          {game.status === 'playing' ? (
            <div className={`text-xs px-4 py-1 rounded-full font-bold transition-all border ${
              isMyTurn
                ? selectedCard
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/30'
                  : 'bg-indigo-950 text-indigo-200 border-indigo-700/60 animate-pulse'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}>
              {isMyTurn
                ? selectedCard
                  ? `Selected ${selectedCard.rank}${getSuitSymbol(selectedCard.suit)} — Click a highlighted cell on the board`
                  : 'Your turn! Select a card from your hand on the right'
                : `Waiting for ${currentPlayer?.name || 'opponent'} to play...`}
            </div>
          ) : game.status === 'waiting' ? (
            <div className="text-xs text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              Invite friends with room code <span className="text-indigo-300 font-mono font-bold">{game.roomId}</span> to begin
            </div>
          ) : null}
        </div>

        {/* DESKTOP BOARD (Landscape Sizing: fills available center stage height/width) */}
        <div className="hidden lg:flex w-full h-full items-center justify-center min-h-0 min-w-0">
          <div
            className="bg-slate-900/95 p-2 xl:p-3 rounded-2xl shadow-2xl border border-slate-800 grid grid-cols-10 grid-rows-10 gap-1 xl:gap-1.5"
            style={{
              width: 'min(calc(100% - 16px), calc((100vh - 76px) * 1.22))',
              height: 'min(calc(100vh - 76px), calc((100% - 16px) / 1.22))',
              aspectRatio: '1.22 / 1',
            }}
          >
            {game.board.map((row, rIdx) =>
              row.map((cell, cIdx) => renderCell(cell, rIdx, cIdx, true))
            )}
          </div>
        </div>

        {/* MOBILE BOARD (Square / Screen-Fit Sizing: fills mobile screen below cards) */}
        <div className="flex lg:hidden w-full h-full items-center justify-center min-h-0 min-w-0 p-1">
          <div
            className="bg-slate-900/95 p-1 sm:p-1.5 rounded-xl shadow-xl border border-slate-800 grid grid-cols-10 grid-rows-10 gap-0.5"
            style={{
              width: 'min(calc(100vw - 10px), calc(100dvh - 165px))',
              height: 'min(calc(100vw - 10px), calc(100dvh - 165px))',
              aspectRatio: '1 / 1',
            }}
          >
            {game.board.map((row, rIdx) =>
              row.map((cell, cIdx) => renderCell(cell, rIdx, cIdx, false))
            )}
          </div>
        </div>

        {/* 2-Second Undo Floating Banner */}
        <AnimatePresence>
          {isUndoAvailable && undoCountdown !== null && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="absolute bottom-4 z-40 bg-slate-900/95 backdrop-blur-md border border-indigo-500/80 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 text-white"
            >
              <div className="flex items-center gap-2">
                <Undo2 className="text-indigo-400" size={18} />
                <span className="text-xs font-bold hidden sm:inline">Made a mistake?</span>
              </div>
              <button
                onClick={handleUndoMove}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-lg shadow-indigo-600/40 flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Undo2 size={14} /> Undo Move ({undoCountdown}s)
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ========================================================================= */}
      {/* DESKTOP RIGHT SIDEBAR: "Your Hand" Cards Dock                             */}
      {/* ========================================================================= */}
      <aside className="hidden lg:flex w-64 xl:w-72 h-full p-4 flex-col justify-between shrink-0 bg-slate-900/90 backdrop-blur-md border-l border-slate-800 overflow-y-auto z-20">
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Hand</h3>
              <p className="text-[11px] text-slate-500 font-medium">
                {isMyTurn ? 'Select a card to place' : 'Waiting for turn'}
              </p>
            </div>
            {isMyTurn && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500 text-white animate-pulse shadow-md shadow-indigo-500/30">
                YOUR TURN
              </span>
            )}
          </div>

          {/* Cards Grid */}
          {me && game.status === 'playing' ? (
            <div className="grid grid-cols-2 gap-2">
              {me.hand.map((card) => renderHandCard(card, false))}
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs p-4 rounded-xl border border-dashed border-slate-800">
              <p>Cards will be dealt once the game begins.</p>
            </div>
          )}
        </div>

        {/* Hand Footer helper */}
        <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Selected:</span>
          {selectedCard ? (
            <span className="font-bold text-indigo-300 font-mono bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
              {selectedCard.rank}{getSuitSymbol(selectedCard.suit)}
            </span>
          ) : (
            <span className="text-slate-600 font-mono">None</span>
          )}
        </div>
      </aside>
    </div>
  );
}
