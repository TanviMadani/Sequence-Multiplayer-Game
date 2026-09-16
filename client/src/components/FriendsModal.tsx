import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Search, X, UserPlus, UserCheck, UserX, Check, XCircle, Send, Gamepad2, Mail, Clock, UserMinus } from 'lucide-react';
import { Socket as SocketType } from 'socket.io-client';
import { FriendEntry, FriendRequest, FriendshipStatus } from '@shared/types';
import { RankBadge } from './RankBadge';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: SocketType;
  playerId: string;
  playerName: string;
  currentRoomId: string | null;
  isHost: boolean;
}

type FriendsTab = 'friends' | 'requests' | 'search';

interface SearchResult {
  playerId: string;
  name: string;
  rankedRating: number;
  avatar: string;
  isOnline: boolean;
  friendshipStatus: FriendshipStatus;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  socket,
  playerId,
  playerName,
  currentRoomId,
  isHost,
}) => {
  const [tab, setTab] = useState<FriendsTab>('friends');
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadFriends = useCallback(() => {
    socket.emit('get-friends-list', { playerId }, (res: any) => {
      if (res?.success) {
        setFriends(res.friends || []);
        setReceivedRequests(res.receivedRequests || []);
        setSentRequests(res.sentRequests || []);
      }
    });
  }, [socket, playerId]);

  useEffect(() => {
    if (!isOpen) return;
    loadFriends();
  }, [isOpen, loadFriends]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      socket.emit('search-players', { query: searchQuery, playerId }, (res: any) => {
        setSearching(false);
        if (res?.success) {
          setSearchResults(res.results || []);
        }
      });
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, socket, playerId]);

  const handleSendFriendRequest = (toPlayerId: string) => {
    socket.emit('send-friend-request', { fromPlayerId: playerId, toPlayerId });
    setTimeout(() => {
      loadFriends();
      if (tab === 'search') {
        setSearchResults(prev => prev.map(r =>
          r.playerId === toPlayerId ? { ...r, friendshipStatus: 'request_sent' as FriendshipStatus } : r
        ));
      }
    }, 200);
  };

  const handleAcceptRequest = (requestId: string) => {
    socket.emit('accept-friend-request', { requestId, playerId });
    setTimeout(loadFriends, 200);
  };

  const handleRejectRequest = (requestId: string) => {
    socket.emit('reject-friend-request', { requestId, playerId });
    setTimeout(loadFriends, 200);
  };

  const handleRemoveFriend = (friendId: string) => {
    socket.emit('remove-friend', { playerId, friendId });
    setTimeout(loadFriends, 200);
  };

  const handleInviteToGame = (toPlayerId: string) => {
    if (!currentRoomId) return;
    socket.emit('send-game-invite', {
      fromPlayerId: playerId,
      toPlayerId,
      roomId: currentRoomId,
    });
  };

  const pendingCount = receivedRequests.length;

  const statusIcon = (f: FriendEntry) => {
    if (f.inGame) return <Gamepad2 size={10} className="text-indigo-400" />;
    if (f.isOnline) return <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />;
    return <Clock size={10} className="text-slate-500" />;
  };

  const statusText = (f: FriendEntry) => {
    if (f.inGame) return 'In-Game';
    if (f.isOnline) return 'Online';
    return 'Offline';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(99,102,241,0.2)] text-white my-auto max-h-[92vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2.5 rounded-xl shadow-md shadow-indigo-600/30">
                  <Users size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Friends & Social</h2>
                  <p className="text-xs text-slate-400 font-medium">{friends.length} friend{friends.length !== 1 ? 's' : ''} · {pendingCount} pending</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-850 p-1 rounded-xl border border-slate-800 my-3 text-xs font-bold shrink-0">
              <button
                onClick={() => setTab('friends')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer flex-1 justify-center ${
                  tab === 'friends' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users size={13} /> Friends
              </button>
              <button
                onClick={() => setTab('requests')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer flex-1 justify-center relative ${
                  tab === 'requests' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mail size={13} /> Requests
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] rounded-full flex items-center justify-center font-black">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('search')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer flex-1 justify-center ${
                  tab === 'search' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Search size={13} /> Search
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
              {tab === 'friends' && (
                <>
                  {friends.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800 px-4">
                      <Users size={36} className="mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-bold text-slate-400 mb-1">No friends yet</p>
                      <p className="text-[11px] leading-relaxed">Search for players by username to add them and start playing together!</p>
                      <button
                        onClick={() => setTab('search')}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-lg text-xs cursor-pointer"
                      >
                        Find Players
                      </button>
                    </div>
                  ) : (
                    friends.map(f => (
                      <div
                        key={f.playerId}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all"
                      >
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-black shadow-md">
                            {f.name[0]?.toUpperCase() || '?'}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 flex items-center justify-center ${
                            f.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}>
                            {f.inGame && <Gamepad2 size={8} className="text-white" />}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-100 truncate">{f.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <RankBadge rating={f.rankedRating} size="xs" showIcon showName={false} />
                            <span className={`text-[10px] font-semibold flex items-center gap-1 ${
                              f.inGame ? 'text-indigo-400' : f.isOnline ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                              {statusIcon(f)} {statusText(f)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {currentRoomId && isHost && f.isOnline && !f.inGame && (
                            <button
                              onClick={() => handleInviteToGame(f.playerId)}
                              title="Invite to Game"
                              className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-[10px] font-bold px-2"
                            >
                              <Gamepad2 size={12} /> Invite
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveFriend(f.playerId)}
                            title="Remove Friend"
                            className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/50 transition-all cursor-pointer"
                          >
                            <UserMinus size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {tab === 'requests' && (
                <div className="space-y-4">
                  {receivedRequests.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Received ({receivedRequests.length})</div>
                      <div className="space-y-2">
                        {receivedRequests.map(req => (
                          <div
                            key={req.requestId}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/40"
                          >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-sm font-black shadow-md shrink-0">
                              {req.fromPlayerName[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-100 truncate">{req.fromPlayerName}</div>
                              <div className="text-[10px] text-indigo-300 font-medium">Wants to be your friend</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleAcceptRequest(req.requestId)}
                                title="Accept"
                                className="bg-emerald-600 hover:bg-emerald-500 text-white p-1.5 rounded-lg transition-all cursor-pointer"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req.requestId)}
                                title="Reject"
                                className="bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 p-1.5 rounded-lg transition-all cursor-pointer border border-slate-700"
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sentRequests.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Sent ({sentRequests.length})</div>
                      <div className="space-y-2">
                        {sentRequests.map(req => (
                          <div
                            key={req.requestId}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-900/60 border border-slate-800"
                          >
                            <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-black shrink-0">
                              {req.toPlayerName[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-200 truncate">{req.toPlayerName}</div>
                              <div className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                                <Send size={9} /> Friend request pending...
                              </div>
                            </div>
                            <button
                              onClick={() => handleRejectRequest(req.requestId)}
                              title="Cancel Request"
                              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-950/40 cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {receivedRequests.length === 0 && sentRequests.length === 0 && (
                    <div className="text-center py-12 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800 px-4">
                      <Mail size={36} className="mx-auto mb-3 opacity-40" />
                      <p className="text-sm font-bold text-slate-400 mb-1">No pending requests</p>
                      <p className="text-[11px] leading-relaxed">Check the Search tab to find and add friends!</p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'search' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search players by name..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-850/80 border border-slate-800 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none text-xs font-medium"
                    />
                  </div>

                  {searching && (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2" />
                      Searching...
                    </div>
                  )}

                  {!searching && searchQuery.trim() && searchResults.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800">
                      <Search size={28} className="mx-auto mb-2 opacity-40" />
                      No players found matching "{searchQuery}"
                    </div>
                  )}

                  {!searching && searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map(r => (
                        <div
                          key={r.playerId}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-slate-900/80 border border-slate-800"
                        >
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white text-sm font-black shadow-md">
                              {r.name[0]?.toUpperCase() || '?'}
                            </div>
                            {r.isOnline && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 bg-emerald-500" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-100 truncate">{r.name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <RankBadge rating={r.rankedRating} size="xs" showIcon showName={false} />
                              <span className={`text-[10px] font-semibold ${
                                r.isOnline ? 'text-emerald-400' : 'text-slate-500'
                              }`}>
                                {r.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {r.friendshipStatus === 'friends' ? (
                              <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/60 px-2.5 py-1.5 rounded-lg border border-emerald-800/60 flex items-center gap-1">
                                <UserCheck size={11} /> Friends
                              </span>
                            ) : r.friendshipStatus === 'request_sent' ? (
                              <span className="text-[10px] font-black text-amber-400 bg-amber-950/60 px-2.5 py-1.5 rounded-lg border border-amber-800/60 flex items-center gap-1">
                                <Send size={11} /> Sent
                              </span>
                            ) : r.friendshipStatus === 'request_received' ? (
                              <button
                                onClick={() => {
                                  const req = receivedRequests.find(rr => rr.fromPlayerId === r.playerId);
                                  if (req) handleAcceptRequest(req.requestId);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
                              >
                                <Check size={11} /> Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSendFriendRequest(r.playerId)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 shadow-md shadow-indigo-600/30"
                              >
                                <UserPlus size={11} /> Add Friend
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!searchQuery.trim() && (
                    <div className="text-center py-8 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800 px-4">
                      <Search size={28} className="mx-auto mb-2 opacity-40" />
                      <p className="font-semibold">Start typing a name to search for players</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!currentRoomId && tab === 'friends' && friends.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800 text-[10px] text-center text-slate-500 shrink-0">
                💡 Create or join a room to invite friends to your game!
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
