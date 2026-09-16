import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ClientGameState, Card, PlayerProfile, LevelUpInfo, BotDifficulty, MatchmakingMode } from '@shared/types';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, RotateCcw, Trophy, ChevronRight, Copy, Check, SkipForward, WifiOff, Layers, Clock, Flag, Scissors, Coins, User, Undo2, Eye, Bot, Swords, Search, X, Shield, Sparkles, Settings } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GameOverModal } from './components/GameOverModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ProfileModal } from './components/ProfileModal';
import { AchievementToast } from './components/AchievementToast';
import { isWinningCell, getSequenceOrder, WinningSequenceBadge } from './components/WinningSequenceHighlight';
import { AchievementDef } from '@shared/constants/rewards';
import { LevelUpModal } from './components/LevelUpModal';
import { RankBadge } from './components/RankBadge';
import { LeaderboardModal } from './components/LeaderboardModal';
import { FriendsModal } from './components/FriendsModal';
import { NotificationBell } from './components/NotificationBell';
import { TournamentModal } from './components/TournamentModal';
import { ActivityFeed } from './components/ActivityFeed';
import { SettingsModal, loadAudioSettings, saveAudioSettings } from './components/SettingsModal';
import { AudioSettings, DEFAULT_AUDIO_SETTINGS, GameSettings, SoundEffectType } from '@shared/constants/rewards';
import { AudioManager } from './lib/AudioManager';

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
  const [levelUpModalInfo, setLevelUpModalInfo] = useState<LevelUpInfo | null>(null);

  // Feature 21: Matchmaking state
  const [showMatchmakingModal, setShowMatchmakingModal] = useState(false);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [matchMode, setMatchMode] = useState<MatchmakingMode>('2p');
  const [isRankedMatch, setIsRankedMatch] = useState(false);
  const [searchTimer, setSearchTimer] = useState(0);

  // Feature 24: Leaderboard state
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // Feature 25: Friends state
  const [showFriendsModal, setShowFriendsModal] = useState(false);

  // Feature 28: Tournaments state
  const [showTournamentModal, setShowTournamentModal] = useState(false);

  // Features 30 & 31: Settings & Audio state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => loadAudioSettings());

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      localStorage.removeItem(LAST_ROOM_KEY);
    } catch {}
    location.reload();
  }, []);

  // Feature 30: Apply audio settings to manager
  useEffect(() => {
    AudioManager.applySettings(audioSettings);
  }, [audioSettings]);

  // Feature 30: Play sounds based on game & activity events
  const lastGameStatusRef = useRef<string | undefined>(game?.status);
  const lastTurnPlayerIdRef = useRef<string | null>(null);
  const lastTimerRef = useRef<number | null>(null);
  const lastActivityLenRef = useRef<number>(0);
  const lastActivityTypeRef = useRef<Set<string>>(new Set());

  const getCurrentTurnPlayerId = (g: ClientGameState): string | null => {
    if (g.turnIndex >= 0 && g.turnIndex < g.players.length) {
      return g.players[g.turnIndex]?.playerId ?? null;
    }
    return null;
  };

  const countUnlockedAchievements = (p: PlayerProfile): number => {
    if (!p.achievements) return 0;
    return Object.values(p.achievements).filter(a => a.unlocked).length;
  };

  const didIWin = (g: ClientGameState): boolean => {
    if (!g.winner) return false;
    const myPlayer = g.players.find(p => p.playerId === playerIdRef.current);
    if (!myPlayer) return false;

    if (g.isTeamGame && g.winningTeam) {
      const myIdx = g.players.findIndex(p => p.playerId === playerIdRef.current);
      if (myIdx < 0) return false;
      const myTeamIdx = myIdx % 2; // 0 = Team Blue/Red alternating: indices 0,2 = team 1; 1,3 = team 2
      const winColor = g.winningTeam.toLowerCase();
      const myColor = myPlayer.color.toLowerCase();
      const colorNames = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'];
      const teamColors: Record<string, string[]> = {
        'blue': ['#2563eb', '#16a34a'],
        'red': ['#dc2626', '#ca8a04'],
      };
      for (const [teamName, colors] of Object.entries(teamColors)) {
        if (colors.includes(myColor) && winColor.includes(teamName)) return true;
        if (myColor.includes(winColor) || winColor.includes(myColor.replace('#', ''))) return true;
      }
      if (g.winningPlayerNames?.includes(myPlayer.name)) return true;
      return false;
    }

    return g.winner === playerIdRef.current || g.winningPlayerNames?.includes(myPlayer.name) || false;
  };

  useEffect(() => {
    if (!game) return;
    const play = (s: SoundEffectType) => AudioManager.play(s);
    const prevStatus = lastGameStatusRef.current;
    const prevTurn = lastTurnPlayerIdRef.current;
    const currentTurnPlayerId = getCurrentTurnPlayerId(game);

    // Win/loss detection
    if (prevStatus !== 'finished' && game.status === 'finished') {
      if (game.winner) {
        const iWon = didIWin(game);
        if (iWon) play('win');
        else play('loss');
      } else {
        play('coin_reward');
      }
    }

    // Turn start sound for my turn
    if (game.status === 'playing' && currentTurnPlayerId !== prevTurn && currentTurnPlayerId === playerIdRef.current) {
      play('turn_start');
    }

    // Timer warning when time remaining <= 5 seconds
    if (timeRemaining !== null && timeRemaining <= 5 && currentTurnPlayerId === playerIdRef.current && game.status === 'playing') {
      const prevTimer = lastTimerRef.current;
      if (prevTimer === null || prevTimer > 5 || (prevTimer !== timeRemaining && timeRemaining === Math.floor(timeRemaining))) {
        play('timer_warning');
      }
    }
    lastTimerRef.current = timeRemaining ?? null;

    // Sounds from activity feed (chip place/remove/sequence/undo/surrender)
    const feed = game.activityFeed || [];
    if (feed.length !== lastActivityLenRef.current) {
      const newCount = Math.max(0, feed.length - lastActivityLenRef.current);
      for (let i = 0; i < Math.min(newCount, feed.length); i++) {
        const ev = feed[i];
        const key = `${ev.id}`;
        if (lastActivityTypeRef.current.has(key)) continue;
        lastActivityTypeRef.current.add(key);
        switch (ev.type) {
          case 'chip_placed': play('chip_place'); break;
          case 'chip_removed': play('chip_remove'); break;
          case 'sequence_completed': play('sequence_complete'); break;
          case 'undo_used': play('chip_remove'); break;
          case 'game_start': play('turn_start'); break;
          case 'surrender': play('loss'); break;
        }
      }
      if (lastActivityTypeRef.current.size > 200) lastActivityTypeRef.current.clear();
    }
    lastActivityLenRef.current = feed.length;

    lastGameStatusRef.current = game.status;
    lastTurnPlayerIdRef.current = currentTurnPlayerId;
  }, [game, timeRemaining]);

  // Achievement & coin sounds
  const prevCoinsRef = useRef<number | undefined>(profile?.coins);
  const prevAchievementsRef = useRef<number>(profile ? countUnlockedAchievements(profile) : 0);
  useEffect(() => {
    if (!profile) return;
    const play = (s: SoundEffectType) => AudioManager.play(s);
    const coins = profile.coins ?? 0;
    if (prevCoinsRef.current !== undefined && coins > prevCoinsRef.current) play('coin_reward');
    const achCount = countUnlockedAchievements(profile);
    if (achCount > prevAchievementsRef.current) play('achievement_unlock');
    prevCoinsRef.current = coins;
    prevAchievementsRef.current = achCount;
  }, [profile]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(cur => (cur === msg ? null : cur)), 4000);
  }, []);

  const joinExistingRoom = useCallback((roomId: string, sourceLabel: string) => {
    const trimmedRoom = roomId.trim();
    const trimmedName = playerName.trim() || 'Player';
    if (!trimmedRoom || !trimmedName) return;
    try {
      localStorage.setItem(PLAYER_NAME_KEY, trimmedName);
      localStorage.setItem(LAST_ROOM_KEY, trimmedRoom);
    } catch {}
    socket.emit('join-room', {
      roomId: trimmedRoom,
      playerName: trimmedName,
      playerId: playerIdRef.current,
    });
    setRoomId(trimmedRoom);
    setInRoom(true);
    showToast(`🎮 ${sourceLabel} room ${trimmedRoom}...`);
  }, [playerName, showToast]);

  // Feature 26: Auto-join room when invite is accepted from notifications
  const handleInviteAccepted = useCallback((roomId: string) => {
    joinExistingRoom(roomId, 'Joining invited');
  }, [joinExistingRoom]);

  // Feature 28: Auto-join a tournament match room
  const handleEnterTournamentRoom = useCallback((roomId: string) => {
    joinExistingRoom(roomId, 'Entering tournament');
    setShowTournamentModal(false);
  }, [joinExistingRoom]);

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
          if (updatedGame.rewardBreakdown?.levelUp?.didLevelUp) {
            setLevelUpModalInfo(updatedGame.rewardBreakdown.levelUp);
          }
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

    // Feature 21 Matchmaking Socket Events
    socket.on('matchmaking-entered', () => {
      setIsSearchingMatch(true);
      setSearchTimer(0);
    });

    socket.on('matchmaking-cancelled', () => {
      setIsSearchingMatch(false);
      setShowMatchmakingModal(false);
    });

    socket.on('match-found', ({ roomId: foundRoomId }: { roomId: string }) => {
      setIsSearchingMatch(false);
      setShowMatchmakingModal(false);
      setRoomId(foundRoomId);
      showToast(`🎮 Match Found! Joining ${foundRoomId}...`);
      setInRoom(true);
    });

    return () => {
      socket.off('game-updated');
      socket.off('profile-updated');
      socket.off('toast-message');
      socket.off('error');
      socket.off('matchmaking-entered');
      socket.off('matchmaking-cancelled');
      socket.off('match-found');
    };
  }, [showToast]);

  // Matchmaking elapsed search timer tick
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSearchingMatch) {
      interval = setInterval(() => {
        setSearchTimer(t => t + 1);
      }, 1000);
    } else {
      setSearchTimer(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSearchingMatch]);

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
  const isUndoAvailable = game?.undoAvailableForPlayerId === playerIdRef.current && !!game?.undoDeadline && !game?.isSpectator;

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

  // Feature 19: Join Spectator
  const joinSpectator = () => {
    const trimmedRoom = roomId.trim();
    const trimmedName = playerName.trim();
    if (!trimmedRoom || !trimmedName) return;
    socket.emit('join-spectator', {
      roomId: trimmedRoom,
      spectatorName: trimmedName,
      spectatorId: playerIdRef.current,
    });
    setInRoom(true);
  };

  // Feature 21: Matchmaking actions
  const startMatchmaking = () => {
    const trimmedName = playerName.trim() || 'Player';
    socket.emit('enter-matchmaking', {
      playerId: playerIdRef.current,
      playerName: trimmedName,
      mode: matchMode,
      isRanked: isRankedMatch,
    });
  };

  const cancelMatchmaking = () => {
    socket.emit('cancel-matchmaking', playerIdRef.current);
    setIsSearchingMatch(false);
  };

  const startGame = () => {
    if (game) socket.emit('start-game', game.roomId);
  };

  const restartGame = () => {
    if (game) socket.emit('restart-game', game.roomId);
  };

  const skipDisconnectedTurn = () => {
    if (game && !game.isSpectator) socket.emit('skip-turn', game.roomId);
  };

  // Feature 20: Add / Remove Bots
  const handleAddBot = (difficulty: BotDifficulty) => {
    if (game) socket.emit('add-bot', { roomId: game.roomId, difficulty });
  };

  const handleRemoveBot = (botPlayerId: string) => {
    if (game) socket.emit('remove-bot', { roomId: game.roomId, botPlayerId });
  };

  const handleToggleAllowSpectators = (allowed: boolean) => {
    if (game) socket.emit('toggle-allow-spectators', { roomId: game.roomId, allowSpectators: allowed });
  };

  const playCard = (row: number, col: number) => {
    if (game && game.status === 'playing' && selectedCard && !game.isSpectator) {
      socket.emit('play-card', {
        roomId: game.roomId,
        cardId: selectedCard.id,
        row,
        col,
      });
      setSelectedCard(null);
    }
  };

  const isCardDead = useCallback((card: Card | null): boolean => {
    if (!card || card.rank === 'J' || !game) return false;
    let dead = true;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const cell = game.board[r][c];
        if (cell.card && cell.card.rank === card.rank && cell.card.suit === card.suit) {
          if (cell.chip === null) {
            dead = false;
            break;
          }
        }
      }
      if (!dead) break;
    }
    return dead;
  }, [game]);

  const handleSwapDeadCard = (card: Card) => {
    if (game && game.status === 'playing' && !game.isSpectator) {
      socket.emit('swap-dead-card', {
        roomId: game.roomId,
        cardId: card.id,
      });
      setSelectedCard(null);
    }
  };

  const handleRematch = () => {
    if (game && !game.isSpectator) socket.emit('vote-rematch', game.roomId);
  };

  const handleNewGame = () => {
    restartGame();
  };

  const handleSurrender = () => {
    if (game && !game.isSpectator) socket.emit('surrender-game', game.roomId);
    setShowSurrenderModal(false);
  };

  const handleUndoMove = () => {
    if (game && !game.isSpectator) socket.emit('undo-move', game.roomId);
  };

  const handleClaimDailyBonus = () => {
    socket.emit('claim-daily-bonus', playerIdRef.current);
  };

  const handleUpdateProfileName = (newName: string) => {
    socket.emit('update-profile-settings', {
      playerId: playerIdRef.current,
      name: newName,
    });
    setPlayerName(newName);
    try {
      localStorage.setItem(PLAYER_NAME_KEY, newName);
    } catch {
      /* ignore */
    }
  };

  const handleBuyCosmetic = (itemId: string) => {
    socket.emit('buy-cosmetic', {
      playerId: playerIdRef.current,
      itemId,
    });
  };

  const handleEquipCosmetic = (itemId: string) => {
    socket.emit('equip-cosmetic', {
      playerId: playerIdRef.current,
      itemId,
    });
  };

  const getBoardThemeStyles = () => {
    const theme = profile?.equippedCosmetics?.boardTheme || 'board_classic';
    switch (theme) {
      case 'board_dark':
        return 'bg-black/95 border-slate-900 shadow-[0_0_50px_rgba(0,0,0,0.9)]';
      case 'board_neon':
        return 'bg-slate-950/95 border-cyan-500/60 shadow-[0_0_50px_rgba(6,182,212,0.4)] ring-2 ring-cyan-500/30';
      case 'board_space':
        return 'bg-indigo-950/95 border-purple-500/50 shadow-[0_0_50px_rgba(168,85,247,0.3)] ring-2 ring-purple-500/20';
      case 'board_gold':
        return 'bg-amber-950/90 border-amber-400/60 shadow-[0_0_50px_rgba(245,158,11,0.35)] ring-2 ring-amber-400/30';
      case 'board_classic':
      default:
        return 'bg-slate-900/95 border-slate-800 shadow-2xl';
    }
  };

  const getChipSkinStyles = (chipColor: string, isWinCell: boolean, isLocked: boolean) => {
    const skin = profile?.equippedCosmetics?.chipSkin || 'chip_classic';
    if (chipColor === 'wild') return { backgroundColor: '#94a3b8' };

    switch (skin) {
      case 'chip_glass':
        return {
          backgroundColor: chipColor,
          backdropFilter: 'blur(4px)',
          boxShadow: `inset 0 2px 4px rgba(255,255,255,0.6), 0 4px 10px ${chipColor}80`,
          opacity: 0.85,
        };
      case 'chip_neon':
        return {
          backgroundColor: chipColor,
          boxShadow: `0 0 15px ${chipColor}, 0 0 30px ${chipColor}aa`,
        };
      case 'chip_metallic':
        return {
          background: `linear-gradient(135deg, ${chipColor} 0%, #ffffff 50%, ${chipColor} 100%)`,
          boxShadow: `0 4px 8px rgba(0,0,0,0.5)`,
        };
      case 'chip_classic':
      default:
        return { backgroundColor: chipColor };
    }
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

  const formatTimerSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  // Login / Join Room / Matchmaking View
  if (!inRoom || !game) {
    return (
      <div className="h-screen h-[100dvh] w-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4 relative">
        <Toast />

        {/* Top Header: Social / Notifications Bar */}
        <div className="fixed top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-2 z-30">
          <button
            onClick={() => setShowFriendsModal(true)}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Friends"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setShowTournamentModal(true)}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Tournaments"
          >
            <Swords size={16} />
          </button>
          <button
            onClick={() => setShowLeaderboardModal(true)}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Leaderboards"
          >
            <Trophy size={16} />
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center justify-center p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Settings"
          >
            <Settings size={16} />
          </button>
          {profile && (
            <NotificationBell
              socket={socket}
              playerId={playerIdRef.current}
              playerName={playerName}
              profile={profile}
              onInviteAccepted={handleInviteAccepted}
            />
          )}
        </div>

        {/* Feature 21: Matchmaking Queue Modal */}
        <AnimatePresence>
          {showMatchmakingModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-md bg-slate-900 border-2 border-indigo-500/50 rounded-3xl p-6 shadow-2xl text-white text-center space-y-5"
              >
                {!isSearchingMatch ? (
                  <>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <h3 className="text-lg font-black flex items-center gap-2">
                        <Search size={20} className="text-indigo-400" /> Public Matchmaking
                      </h3>
                      <button onClick={() => setShowMatchmakingModal(false)} className="text-slate-400 hover:text-white">
                        <X size={20} />
                      </button>
                    </div>

                    {profile && (
                      <div className="flex items-center justify-between bg-slate-850/80 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Your Rank</span>
                        <RankBadge rating={profile.rankedRating} size="sm" showIcon showName showRating />
                      </div>
                    )}

                    <div className="space-y-4">
                      {/* Mode Selection */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Game Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setIsRankedMatch(false)}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                              !isRankedMatch ? 'bg-indigo-600 border-indigo-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            🎮 Casual
                          </button>
                          <button
                            onClick={() => setIsRankedMatch(true)}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                              isRankedMatch ? 'bg-amber-500 border-amber-300 text-slate-950 font-black shadow-md' : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            🏆 Ranked Elo
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Players Count</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setMatchMode('2p')}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                              matchMode === '2p' ? 'bg-indigo-600 border-indigo-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            👥 1v1 (2 Players)
                          </button>
                          <button
                            onClick={() => setMatchMode('4p')}
                            className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                              matchMode === '4p' ? 'bg-indigo-600 border-indigo-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            👥 2v2 Teams (4 Players)
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={startMatchmaking}
                        className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Play size={18} /> Find Match Now
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="py-6 space-y-5">
                    <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                      <Search size={32} className="text-indigo-400 animate-pulse" />
                    </div>

                    <div>
                      <h3 className="text-xl font-black text-white">Finding players...</h3>
                      <p className="text-xs text-indigo-300 font-medium mt-1">
                        Searching for {isRankedMatch ? 'Ranked Elo' : 'Casual'} opponent ({matchMode})
                      </p>
                      <p className="text-2xl font-black font-mono text-amber-400 mt-2">
                        {formatTimerSeconds(searchTimer)}
                      </p>
                    </div>

                    <button
                      onClick={cancelMatchmaking}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl border border-slate-700 cursor-pointer"
                    >
                      Cancel Search
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-800 text-white"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-600/30">
              <Play className="text-white fill-current" size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Sequence</h1>
              <p className="text-xs text-indigo-300 font-medium">Multiplayer Board Game</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={20}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-sm"
                placeholder="Enter your nickname..."
              />
            </div>

            {/* Feature 21: Public Matchmaking Button */}
            <button
              onClick={() => setShowMatchmakingModal(true)}
              disabled={!playerName.trim()}
              className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-black py-3 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer border border-indigo-400/30"
            >
              <Search size={18} /> Find Public Match
            </button>

            {/* Feature 24: Global Leaderboard Button */}
            <button
              onClick={() => setShowLeaderboardModal(true)}
              className="w-full bg-gradient-to-r from-amber-600 to-yellow-700 hover:from-amber-500 hover:to-yellow-600 text-white font-black py-2.5 rounded-xl shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer border border-amber-400/30 text-xs"
            >
              <Trophy size={16} /> Global Leaderboards
            </button>

            {/* Feature 25: Friends Button */}
            <button
              onClick={() => setShowFriendsModal(true)}
              disabled={!playerName.trim()}
              className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-indigo-300 font-bold py-2.5 rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer border border-slate-700 text-xs transition-all"
            >
              <Users size={16} /> Friends & Social
            </button>

            {/* Feature 28: Tournaments Button */}
            <button
              onClick={() => setShowTournamentModal(true)}
              disabled={!playerName.trim()}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-purple-700 hover:from-purple-500 hover:via-pink-500 hover:to-purple-600 disabled:opacity-50 text-white font-black py-2.5 rounded-xl shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer border border-purple-400/30 text-xs transition-all"
            >
              <Trophy size={16} /> Tournaments
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800" />
              <span className="flex-shrink mx-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider">Or Custom Room</span>
              <div className="flex-grow border-t border-slate-800" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Room Code</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                maxLength={20}
                onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(); }}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none uppercase tracking-wider font-mono text-sm"
                placeholder="e.g. ROOM123"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={joinRoom}
                disabled={!roomId.trim() || !playerName.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed text-xs"
              >
                Join Play <ChevronRight size={16} />
              </button>

              {/* Feature 19: Join Spectator */}
              <button
                onClick={joinSpectator}
                disabled={!roomId.trim() || !playerName.trim()}
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-600 text-indigo-300 font-bold py-3 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <Eye size={16} /> Watch Match
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentPlayer = game.players[game.turnIndex];
  const isMyTurn = game.status === 'playing' && currentPlayer?.playerId === playerIdRef.current && !game.isSpectator;
  const me = game.players.find(p => p.playerId === playerIdRef.current);
  const isHost = game.hostPlayerId === playerIdRef.current;
  const currentTurnDisconnected = game.status === 'playing' && currentPlayer && (!currentPlayer.connected || currentPlayer.isBot);

  // Helper to render card element in Hand
  const renderHandCard = (card: Card, isMobile = false) => {
    const isSelected = selectedCard?.id === card.id;
    const isTwoEyedJack = card.rank === 'J' && (card.suit === 'C' || card.suit === 'D');
    const isOneEyedJack = card.rank === 'J' && (card.suit === 'H' || card.suit === 'S');
    const dead = isCardDead(card);

    return (
      <motion.div
        key={card.id}
        whileHover={isMyTurn ? { scale: 1.05 } : {}}
        whileTap={isMyTurn ? { scale: 0.95 } : {}}
        onClick={() => {
          if (isMyTurn) {
            setSelectedCard(isSelected ? null : card);
            if (!isSelected) AudioManager.play('card_select');
          }
        }}
        className={`relative shrink-0 rounded-xl bg-white shadow-md border-2 transition-all cursor-pointer select-none flex flex-col items-center justify-between p-1
          ${isMobile ? 'w-12 h-16' : 'w-full h-20 xl:h-22'}
          ${isSelected ? 'border-indigo-500 ring-4 ring-indigo-500/40 -translate-y-1 bg-indigo-50/95 shadow-indigo-500/20' : dead ? 'border-amber-400 bg-amber-50/30' : 'border-slate-300 hover:border-indigo-400'}
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
        ) : dead ? (
          <span className="text-[7px] xl:text-[8px] font-black uppercase px-1 py-0.2 rounded leading-tight bg-amber-200 text-amber-900 border border-amber-400">
            Dead Card
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

    const isPossible = !!(game.status === 'playing' && isMyTurn && selectedCard && !game.isSpectator && (
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
                style={getChipSkinStyles(cell.chip, isWinCell, cell.isLocked)}
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

      {/* Feature 19: Spectator Header Banner */}
      {game.isSpectator && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-900 border-b border-indigo-400/40 py-1.5 px-4 text-center text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-lg">
          <Eye size={15} className="text-amber-400 animate-pulse" />
          <span>SPECTATOR MODE — WATCHING LIVE MATCH</span>
          <span className="bg-purple-950 px-2 py-0.5 rounded text-[10px] font-mono text-purple-300 border border-purple-700">
            Spectators: {game.spectatorCount || 1}
          </span>
        </div>
      )}

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
        onUpdateProfileName={handleUpdateProfileName}
        onBuyCosmetic={handleBuyCosmetic}
        onEquipCosmetic={handleEquipCosmetic}
        onClaimSeasonalReward={(rewardLevel) => {
          socket.emit('claim-seasonal-reward', { playerId: playerIdRef.current, rewardLevel });
        }}
        socket={socket}
        playerId={playerIdRef.current}
      />

      {/* Level Up Celebration Modal */}
      <LevelUpModal
        info={levelUpModalInfo}
        onClose={() => setLevelUpModalInfo(null)}
      />

      {/* Achievement Unlocked Notification Toast */}
      <AchievementToast
        achievement={unlockedToast}
        onClose={() => setUnlockedToast(null)}
      />

      {/* Feature 24: Global Leaderboards */}
      <LeaderboardModal
        isOpen={showLeaderboardModal}
        onClose={() => setShowLeaderboardModal(false)}
        socket={socket}
        playerId={playerIdRef.current}
      />

      {/* Features 25 & 26: Friends & Game Invites */}
      <FriendsModal
        isOpen={showFriendsModal}
        onClose={() => setShowFriendsModal(false)}
        socket={socket}
        playerId={playerIdRef.current}
        playerName={playerName}
        currentRoomId={game?.roomId ?? null}
        isHost={!!(game && game.hostPlayerId === playerIdRef.current)}
      />

      {/* Feature 28: Tournaments */}
      <TournamentModal
        isOpen={showTournamentModal}
        onClose={() => setShowTournamentModal(false)}
        socket={socket}
        playerId={playerIdRef.current}
        playerName={playerName}
        onEnterRoom={handleEnterTournamentRoom}
      />

      {/* Features 30 & 31: Settings + Audio */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        socket={socket}
        playerId={playerIdRef.current}
        profileSettings={profile?.settings}
        onSettingsUpdate={(settings) => {
          setProfile(prev => prev ? { ...prev, settings } : prev);
        }}
        onLogout={handleLogout}
        audioSettings={audioSettings}
        onAudioSettingsChange={setAudioSettings}
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
      <aside className={`hidden lg:flex w-72 xl:w-80 h-full p-4 flex-col justify-between shrink-0 bg-slate-900/90 backdrop-blur-md border-r border-slate-800 overflow-y-auto z-20 ${
        game.isSpectator ? 'pt-8' : ''
      }`}>
        <div className="space-y-4">
          {/* Logo & Room Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg shadow-md shadow-indigo-600/30">
                <Play className="text-white fill-current" size={16} />
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">Sequence</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowFriendsModal(true)}
                title="Friends"
                className="flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-indigo-300 transition-all cursor-pointer"
              >
                <Users size={13} />
              </button>
              <button
                onClick={() => setShowTournamentModal(true)}
                title="Tournaments"
                className="flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-purple-300 transition-all cursor-pointer"
              >
                <Swords size={13} />
              </button>
              <button
                onClick={() => setShowLeaderboardModal(true)}
                title="Leaderboards"
                className="flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-amber-300 transition-all cursor-pointer"
              >
                <Trophy size={13} />
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                title="Settings"
                className="flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
              >
                <Settings size={13} />
              </button>
              {profile && (
                <NotificationBell
                  socket={socket}
                  playerId={playerIdRef.current}
                  playerName={playerName}
                  profile={profile}
                  onInviteAccepted={handleInviteAccepted}
                />
              )}
              <button
                onClick={copyInviteLink}
                title="Copy Room Link"
                className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-mono font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
              >
                {linkCopied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                <span className="hidden xl:inline">{game.roomId}</span>
              </button>
            </div>
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

          {/* Feature 19 & 22: Room Info Badge (Ranked & Spectators Count) */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-850 rounded-xl border border-slate-800 text-xs font-bold">
            <span className="flex items-center gap-1 text-slate-300">
              {game.isRanked ? (
                <span className="text-amber-400 flex items-center gap-1 font-black"><Swords size={13} /> RANKED</span>
              ) : (
                <span className="text-indigo-300 flex items-center gap-1"><Shield size={13} /> CASUAL</span>
              )}
            </span>
            <span className="text-slate-400 text-[11px] font-mono flex items-center gap-1">
              <Eye size={13} className="text-purple-400" /> {game.spectatorCount || 0} Spectator{(game.spectatorCount || 0) === 1 ? '' : 's'}
            </span>
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
                          {p.isBot ? <Bot size={14} /> : p.name[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span
                          title={p.surrendered ? 'Surrendered' : p.connected ? 'Connected' : 'Offline'}
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                            p.surrendered ? 'bg-rose-500' : p.connected ? 'bg-emerald-500' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className={`text-xs font-bold truncate flex items-center gap-1 ${isCurrentTurn ? 'text-indigo-300' : 'text-slate-200'}`}>
                          {p.name} {p.playerId === playerIdRef.current && <span className="text-slate-400 text-[11px] font-normal">(You)</span>}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400">
                          {p.isBot ? (
                            <span className="text-amber-400 font-bold uppercase font-mono">
                              BOT ({p.botDifficulty || 'medium'})
                            </span>
                          ) : game.status === 'playing' ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>
                                {p.surrendered ? 'Surrendered' : `${p.handCount} card${p.handCount === 1 ? '' : 's'}${!p.connected ? ' · offline' : ''}`}
                              </span>
                              <RankBadge rating={p.rankedRating} size="xs" showIcon showName={false} />
                            </div>
                          ) : (
                            <RankBadge rating={p.rankedRating} size="xs" showIcon showRating />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Remove Bot option for host in lobby */}
                    {game.status === 'waiting' && isHost && p.isBot && (
                      <button
                        onClick={() => handleRemoveBot(p.playerId)}
                        className="text-rose-400 hover:text-rose-300 p-1 text-xs font-bold"
                        title="Remove Bot"
                      >
                        <X size={14} />
                      </button>
                    )}

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

          {/* Feature 20: Add Bot Buttons in Lobby */}
          {game.status === 'waiting' && isHost && game.players.length < 4 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fill Open Seats with AI Bots</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAddBot('easy')}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold py-1.5 rounded-lg border border-slate-700 text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Bot size={13} /> + Bot (Easy)
                </button>
                <button
                  onClick={() => handleAddBot('medium')}
                  className="bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold py-1.5 rounded-lg border border-slate-700 text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Bot size={13} /> + Bot (Medium)
                </button>
              </div>
            </div>
          )}

          {/* Feature 19: Allow Spectators Toggle for Host */}
          {game.status === 'waiting' && isHost && (
            <div className="flex items-center justify-between p-2.5 bg-slate-850 rounded-xl border border-slate-800 text-xs font-bold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Eye size={14} className="text-indigo-400" /> Allow Spectators
              </span>
              <input
                type="checkbox"
                checked={game.allowSpectators !== false}
                onChange={(e) => handleToggleAllowSpectators(e.target.checked)}
                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
              />
            </div>
          )}

          {/* Feature 32: Game Activity Feed */}
          <ActivityFeed events={game.activityFeed || []} />

          {/* Game Controls / Status Area */}
          {game.status === 'waiting' && !game.isSpectator && (
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

          {game.status === 'playing' && !game.isSpectator && (
            <button
              onClick={() => setShowSurrenderModal(true)}
              className="w-full bg-slate-800 hover:bg-rose-950/80 hover:border-rose-700 text-slate-300 hover:text-rose-300 font-bold py-2 rounded-lg transition-all border border-slate-700 flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <Flag size={14} /> Surrender Match
            </button>
          )}

          {currentTurnDisconnected && !game.isSpectator && (
            <div className="bg-amber-950/40 p-3 rounded-xl border border-amber-800/80 space-y-2">
              <p className="text-xs text-amber-300 flex items-center gap-1.5">
                <WifiOff size={14} /> {currentPlayer?.name} is unresponsive.
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
              {!game.isSpectator && (
                <button
                  onClick={handleRematch}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  <RotateCcw size={14} /> Request Rematch
                </button>
              )}
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
      <header className={`lg:hidden shrink-0 px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-20 ${
        game.isSpectator ? 'mt-7' : ''
      }`}>
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
                {p.isBot ? <Bot size={12} /> : p.name[0]?.toUpperCase()}
              </div>
            );
          })}
        </div>

        {/* Action Button */}
        <div>
          {game.status === 'waiting' && !game.isSpectator && (
            <button
              onClick={startGame}
              disabled={game.players.length < 2}
              className="bg-emerald-600 disabled:bg-slate-700 text-white font-bold text-xs px-2.5 py-1 rounded"
            >
              Start ({game.players.length}/2+)
            </button>
          )}
          {game.status === 'playing' && !game.isSpectator && (
            <button
              onClick={() => setShowSurrenderModal(true)}
              className="bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1"
            >
              <Flag size={12} /> Surrender
            </button>
          )}
          {game.status === 'finished' && !game.isSpectator && (
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
      {/* MOBILE TOP DOCK: Hand Cards                                               */}
      {/* ========================================================================= */}
      {me && game.status === 'playing' && !game.isSpectator && (
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
      {/* CENTER STAGE: 10x10 Game Board                                             */}
      {/* ========================================================================= */}
      <main className={`flex-1 min-h-0 min-w-0 p-1 sm:p-2 lg:p-3 flex flex-col items-center justify-center overflow-hidden relative ${
        game.isSpectator ? 'pt-8 lg:pt-8' : ''
      }`}>
        {/* Turn helper status banner on Desktop */}
        <div className="hidden lg:flex items-center justify-center mb-2 shrink-0">
          {game.isSpectator ? (
            <div className="text-xs text-purple-300 bg-purple-950/80 px-4 py-1 rounded-full border border-purple-700 flex items-center gap-2">
              <Eye size={13} /> You are spectating live • {currentPlayer?.name || 'Player'}'s turn
            </div>
          ) : game.status === 'playing' ? (
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

        {/* DESKTOP BOARD */}
        <div className="hidden lg:flex w-full h-full items-center justify-center min-h-0 min-w-0">
          <div
            className={`p-2 xl:p-3 rounded-2xl grid grid-cols-10 grid-rows-10 gap-1 xl:gap-1.5 ${getBoardThemeStyles()}`}
            style={{
              width: 'min(calc(100% - 16px), calc((100vh - 86px) * 1.22))',
              height: 'min(calc(100vh - 86px), calc((100% - 16px) / 1.22))',
              aspectRatio: '1.22 / 1',
            }}
          >
            {game.board.map((row, rIdx) =>
              row.map((cell, cIdx) => renderCell(cell, rIdx, cIdx, true))
            )}
          </div>
        </div>

        {/* MOBILE BOARD */}
        <div className="flex lg:hidden w-full h-full items-center justify-center min-h-0 min-w-0 p-1">
          <div
            className={`p-1 sm:p-1.5 rounded-xl grid grid-cols-10 grid-rows-10 gap-0.5 ${getBoardThemeStyles()}`}
            style={{
              width: 'min(calc(100vw - 10px), calc(100dvh - 175px))',
              height: 'min(calc(100vw - 10px), calc(100dvh - 175px))',
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
          {isUndoAvailable && undoCountdown !== null && !game.isSpectator && (
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
      {!game.isSpectator ? (
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
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span>Selected:</span>
              {selectedCard ? (
                <span className="font-bold text-indigo-300 font-mono bg-indigo-950 px-2 py-0.5 rounded border border-indigo-800">
                  {selectedCard.rank}{getSuitSymbol(selectedCard.suit)}
                </span>
              ) : (
                <span className="text-slate-600 font-mono">None</span>
              )}
            </div>

            {selectedCard && isCardDead(selectedCard) && isMyTurn && (
              <button
                onClick={() => handleSwapDeadCard(selectedCard)}
                className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black py-1.5 rounded-lg transition-all text-xs flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-amber-600/30"
              >
                <RotateCcw size={13} /> Swap Dead Card
              </button>
            )}
          </div>
        </aside>
      ) : (
        <aside className="hidden lg:flex w-64 xl:w-72 h-full p-4 flex-col justify-between shrink-0 bg-slate-900/90 backdrop-blur-md border-l border-slate-800 overflow-y-auto z-20 pt-8">
          <div className="space-y-4">
            <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/40 text-center space-y-2">
              <Eye className="mx-auto text-purple-300 animate-pulse" size={28} />
              <h3 className="text-xs font-black text-purple-200 uppercase tracking-wider">Live Spectator Mode</h3>
              <p className="text-[11px] text-slate-400">
                You are viewing this match in real-time. Player hands are kept private to ensure fair competitive play.
              </p>
            </div>
          </div>

          <button
            onClick={handleLeaveLobby}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 rounded-xl border border-slate-700 text-xs cursor-pointer"
          >
            Leave Spectator Mode
          </button>
        </aside>
      )}
    </div>
  );
}
