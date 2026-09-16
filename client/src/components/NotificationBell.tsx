import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Check, CheckCheck, Gamepad2, Clock, UserPlus, Award, Coins, TrendingUp, Trophy, Info } from 'lucide-react';
import { Socket as SocketType } from 'socket.io-client';
import { Notification } from '@shared/types';

interface NotificationBellProps {
  socket: SocketType;
  playerId: string;
  playerName: string;
  profile: any;
  onProfileUpdate?: (profile: any) => void;
  onInviteAccepted?: (roomId: string) => void;
}

const getIconForType = (type: Notification['type']) => {
  switch (type) {
    case 'friend_request': return <UserPlus size={14} className="text-indigo-400" />;
    case 'friend_accepted': return <Check size={14} className="text-emerald-400" />;
    case 'game_invite': return <Gamepad2 size={14} className="text-amber-400" />;
    case 'achievement': return <Award size={14} className="text-purple-400" />;
    case 'daily_reward': return <Coins size={14} className="text-yellow-400" />;
    case 'rank_promotion': return <TrendingUp size={14} className="text-emerald-400" />;
    case 'tournament': return <Trophy size={14} className="text-amber-400" />;
    case 'info':
    default: return <Info size={14} className="text-slate-400" />;
  }
};

const formatTime = (ts: number): string => {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const NotificationBell: React.FC<NotificationBellProps> = ({
  socket,
  playerId,
  playerName,
  profile,
  onProfileUpdate,
  onInviteAccepted,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const unreadCount = notifications.filter(n => !n.read).length;

  const refreshNotifications = useCallback((prof: any) => {
    const list = prof?.notifications || [];
    setNotifications(list);
  }, []);

  useEffect(() => {
    refreshNotifications(profile);
  }, [profile, refreshNotifications]);

  useEffect(() => {
    const handler = (notif: Notification) => {
      setNotifications(prev => [notif, ...prev].slice(0, 50));
    };
    socket.on('notification-received', handler);
    return () => socket.off('notification-received', handler);
  }, [socket]);

  const handleMarkRead = (notifId: string) => {
    socket.emit('mark-notification-read', { playerId, notificationId: notifId });
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
  };

  const handleMarkAllRead = () => {
    socket.emit('mark-all-notifications-read', { playerId });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleAcceptGameInvite = (notif: Notification) => {
    const inviteId = notif.actionPayload?.inviteId;
    const roomId = notif.actionPayload?.roomId;
    if (!inviteId || !roomId) return;
    socket.emit('accept-game-invite', { inviteId, playerId });
    handleMarkRead(notif.id);
    setTimeout(() => onInviteAccepted?.(roomId), 300);
  };

  const handleDeclineGameInvite = (notif: Notification) => {
    const inviteId = notif.actionPayload?.inviteId;
    if (!inviteId) return;
    socket.emit('decline-game-invite', { inviteId });
    handleMarkRead(notif.id);
  };

  const handleAcceptFriendRequest = (notif: Notification) => {
    const requestId = notif.actionPayload?.requestId;
    if (!requestId) return;
    socket.emit('accept-friend-request', { requestId, playerId });
    handleMarkRead(notif.id);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(v => !v)}
          className={`relative flex items-center justify-center p-2 rounded-xl transition-all border cursor-pointer ${
            isOpen
              ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
          }`}
          title="Notifications"
        >
          <Bell size={16} className={unreadCount > 0 ? 'animate-pulse' : ''} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-slate-900 shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="fixed top-14 right-2 sm:right-4 z-50 w-[94vw] sm:w-96 max-h-[70vh] bg-slate-900/98 backdrop-blur-xl border-2 border-indigo-500/40 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] text-white overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-600 p-1.5 rounded-lg">
                    <Bell size={14} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-tight">Notifications</h3>
                    <p className="text-[10px] text-slate-400 font-medium">{unreadCount} unread · {notifications.length} total</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <CheckCheck size={11} /> All Read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 cursor-pointer transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="py-16 px-4 text-center text-slate-500">
                    <Clock size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-bold text-slate-400 mb-1">No notifications yet</p>
                    <p className="text-[11px]">Friend requests, game invites, and achievements will appear here!</p>
                  </div>
                ) : (
                  notifications.map(notif => (
                    <motion.div
                      key={notif.id}
                      layout
                      className={`px-4 py-3 transition-all cursor-default ${
                        !notif.read ? 'bg-indigo-950/40 border-l-4 border-l-indigo-500' : 'hover:bg-slate-850/50'
                      }`}
                      onClick={() => !notif.read && handleMarkRead(notif.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700">
                          {getIconForType(notif.type)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className={`text-xs leading-snug ${
                            !notif.read ? 'font-bold text-slate-100' : 'font-medium text-slate-300'
                          }`}>
                            {notif.message}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock size={9} /> {formatTime(notif.createdAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              {notif.type === 'game_invite' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAcceptGameInvite(notif); }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow"
                                  >
                                    <Gamepad2 size={10} /> Join
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleDeclineGameInvite(notif); }}
                                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer border border-slate-600"
                                  >
                                    <X size={10} />
                                  </button>
                                </>
                              )}
                              {notif.type === 'friend_request' && (
                                <>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAcceptFriendRequest(notif); }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow"
                                  >
                                    <Check size={10} /> Accept
                                  </button>
                                </>
                              )}
                              {!notif.read && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                                  className="text-[10px] text-slate-500 hover:text-emerald-400 px-1.5 py-0.5 rounded cursor-pointer transition-all"
                                  title="Mark as read"
                                >
                                  <Check size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
