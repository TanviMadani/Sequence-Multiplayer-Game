import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Trophy, Coins, Flame, Award, Calendar, History, X, Check, Gift, Sparkles, Clock, ShieldCheck, ShoppingBag, Palette, Edit3, Zap, Lock, Swords, Snowflake, PartyPopper } from 'lucide-react';
import { PlayerProfile, EquippedCosmetics, SeasonInfo, SeasonalReward, SEASONAL_REWARDS, getSeasonalXPForLevel, getSeasonalLevelFromXP } from '@shared/types';
import { ACHIEVEMENT_DEFINITIONS, REWARD_CONFIG, SHOP_CATALOG, ShopItem, CosmeticCategory, getMinXPForLevel, getLevelFromXP } from '@shared/constants/rewards';
import { RankBadge } from './RankBadge';
import { Socket as SocketType } from 'socket.io-client';

interface ProfileModalProps {
  isOpen: boolean;
  profile: PlayerProfile | null;
  onClose: () => void;
  onClaimDailyBonus: () => void;
  onUpdateProfileName?: (newName: string) => void;
  onBuyCosmetic?: (itemId: string) => void;
  onEquipCosmetic?: (itemId: string) => void;
  onClaimSeasonalReward?: (rewardLevel: number) => void;
  socket?: SocketType;
  playerId?: string;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  profile,
  onClose,
  onClaimDailyBonus,
  onUpdateProfileName,
  onBuyCosmetic,
  onEquipCosmetic,
  onClaimSeasonalReward,
  socket,
  playerId,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'inventory' | 'shop' | 'daily' | 'achievements' | 'history' | 'season'>('stats');
  const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null>(null);

  useEffect(() => {
    if (!isOpen || !socket || !playerId) return;
    socket.emit('get-season-info', {}, (res: any) => {
      if (res?.success) {
        setSeasonInfo(res.season || null);
      }
    });
  }, [isOpen, socket, playerId, activeTab]);
  const [shopCategory, setShopCategory] = useState<CosmeticCategory>('board_theme');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  if (!profile) return null;

  const level = profile.level || getLevelFromXP(profile.xp || 0);
  const currentLevelMinXP = getMinXPForLevel(level);
  const nextLevelMinXP = getMinXPForLevel(level + 1);
  const xpInCurrentLevel = Math.max(0, (profile.xp || 0) - currentLevelMinXP);
  const xpSpanCurrentLevel = Math.max(1, nextLevelMinXP - currentLevelMinXP);
  const xpProgressPercent = Math.min(100, Math.max(0, Math.floor((xpInCurrentLevel / xpSpanCurrentLevel) * 100)));

  // Feature 29: Seasonal progression
  const seasonalXP = profile.seasonalXP || 0;
  const seasonalLevel = getSeasonalLevelFromXP(seasonalXP);
  const seasonLvlMinXP = getSeasonalXPForLevel(seasonalLevel);
  const seasonLvlNextXP = getSeasonalXPForLevel(seasonalLevel + 1);
  const seasonXPInLvl = Math.max(0, seasonalXP - seasonLvlMinXP);
  const seasonXPSpan = Math.max(1, seasonLvlNextXP - seasonLvlMinXP);
  const seasonProgressPct = Math.min(100, Math.max(0, Math.floor((seasonXPInLvl / seasonXPSpan) * 100)));
  const claimedRewards = new Set<number>(profile.claimedSeasonalRewards || []);
  const maxRewardLevel = Math.max(...SEASONAL_REWARDS.map(r => r.level), 0);

  const winRate = profile.totalGames > 0
    ? ((profile.wins / profile.totalGames) * 100).toFixed(1)
    : '0.0';

  const rankedGames = profile.rankedGames || 0;
  const rankedWins = profile.rankedWins || 0;
  const rankedLosses = profile.rankedLosses || 0;
  const rankedRating = profile.rankedRating || 1000;
  const rankedWinRate = rankedGames > 0 ? ((rankedWins / rankedGames) * 100).toFixed(1) : '0.0';

  const now = Date.now();
  const todayMidnight = new Date(now).setHours(0, 0, 0, 0);
  const lastClaimMidnight = profile.lastDailyClaim
    ? new Date(profile.lastDailyClaim).setHours(0, 0, 0, 0)
    : 0;

  const canClaimDaily = lastClaimMidnight !== todayMidnight;
  const currentStreakDay = profile.dailyStreak ?? 1;

  const handleStartEditName = () => {
    setNameInput(profile.name);
    setEditingName(true);
  };

  const handleSaveName = () => {
    if (nameInput.trim() && onUpdateProfileName) {
      onUpdateProfileName(nameInput.trim());
    }
    setEditingName(false);
  };

  const equipped = profile.equippedCosmetics || {
    boardTheme: 'board_classic',
    chipSkin: 'chip_classic',
    cardBack: 'card_classic',
    avatar: 'avatar_default',
    victoryEffect: 'victory_confetti',
    emote: 'emote_thumbsup',
  };

  const ownedSet = new Set(profile.ownedCosmetics || []);

  const getAvatarIcon = (avatarId: string) => {
    const item = SHOP_CATALOG.find(i => i.id === avatarId);
    return item?.icon || profile.name[0]?.toUpperCase() || '👤';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-indigo-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(99,102,241,0.25)] text-white flex flex-col my-auto relative max-h-[92vh] overflow-hidden"
          >
            {/* Header & Close Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-600/30 border border-indigo-400/30 shrink-0">
                  {getAvatarIcon(profile.avatar || equipped.avatar)}
                </div>
                <div className="min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        maxLength={20}
                        className="bg-slate-800 border border-indigo-500 rounded-lg px-2.5 py-1 text-sm font-bold text-white outline-none"
                      />
                      <button
                        onClick={handleSaveName}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded-lg"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-black text-white truncate">{profile.name}</h2>
                      <button
                        onClick={handleStartEditName}
                        title="Edit Name"
                        className="text-slate-400 hover:text-indigo-300 transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <span>Level {level} Master</span>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">{rankedRating} Elo</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <div className="flex items-center gap-1 bg-amber-950/80 px-3 py-1.5 rounded-xl border border-amber-800/80 text-amber-400 font-extrabold text-xs">
                  <Coins size={15} />
                  <span>{profile.coins}</span>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div className="py-2.5 px-3 bg-slate-850/80 rounded-xl border border-slate-800 my-3">
              <div className="flex items-center justify-between text-xs font-bold mb-1">
                <span className="text-indigo-300 flex items-center gap-1">
                  <Zap size={13} className="text-amber-400 fill-current" /> Level {level} Progression
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {profile.xp || 0} / {nextLevelMinXP} XP ({xpProgressPercent}%)
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${xpProgressPercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 rounded-full"
                />
              </div>
            </div>

            {/* Nav Tabs */}
            <div className="flex items-center overflow-x-auto gap-1 bg-slate-850 p-1 rounded-xl border border-slate-800 mb-3 text-xs font-bold no-scrollbar shrink-0">
              <button
                onClick={() => setActiveTab('stats')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Trophy size={13} /> Stats & Ranked
              </button>

              <button
                onClick={() => setActiveTab('inventory')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'inventory' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Palette size={13} /> Customization
              </button>

              <button
                onClick={() => setActiveTab('shop')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'shop' ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShoppingBag size={13} /> Shop
              </button>

              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer relative ${
                  activeTab === 'daily' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar size={13} /> Daily
                {canClaimDaily && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1 right-1" />
                )}
              </button>

              <button
                onClick={() => setActiveTab('achievements')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'achievements' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Award size={13} /> Badges
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'history' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History size={13} /> History
              </button>

              <button
                onClick={() => setActiveTab('season')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'season' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Snowflake size={13} /> Season
              </button>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 text-left">
              {/* TAB 1: STATS & RANKED OVERVIEW */}
              {activeTab === 'stats' && (
                <div className="space-y-4">
                  {/* Ranked Card */}
                  <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-indigo-950/60 p-4 rounded-2xl border border-amber-500/40 shadow-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Swords className="text-amber-400" size={18} />
                        <h3 className="text-xs font-black text-amber-300 uppercase tracking-wider">Competitive Ranked Rating</h3>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow">
                        RANKED
                      </span>
                    </div>

                    <div className="mb-3">
                      <RankBadge rating={rankedRating} size="lg" showIcon showName showRating showProgress />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Elo Rating</div>
                        <div className="text-lg font-black font-mono text-amber-300">{rankedRating}</div>
                      </div>
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Ranked Games</div>
                        <div className="text-lg font-black font-mono text-white">{rankedGames}</div>
                      </div>
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase">Ranked Wins</div>
                        <div className="text-lg font-black font-mono text-emerald-300">{rankedWins}</div>
                      </div>
                      <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                        <div className="text-[10px] text-indigo-400 font-bold uppercase">Ranked Win Rate</div>
                        <div className="text-lg font-black font-mono text-indigo-300">{rankedWinRate}%</div>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overall Statistics</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Games</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-white">{profile.totalGames}</div>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-1">Victories</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-emerald-300">{profile.wins}</div>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-indigo-400 text-[10px] font-bold uppercase tracking-wider mb-1">Win Rate</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-indigo-300">{winRate}%</div>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-amber-400 text-[10px] font-bold uppercase tracking-wider mb-1">Sequences Formed</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-amber-300">{profile.totalSequences}</div>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-rose-400 text-[10px] font-bold uppercase tracking-wider mb-1">Current Streak</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-rose-300 flex items-center gap-1">
                        {profile.currentWinStreak} <Flame size={16} className="fill-current" />
                      </div>
                    </div>

                    <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                      <div className="text-amber-500 text-[10px] font-bold uppercase tracking-wider mb-1">Best Win Streak</div>
                      <div className="text-xl sm:text-2xl font-black font-mono text-amber-400 flex items-center gap-1">
                        {profile.bestWinStreak} <Flame size={16} className="fill-current" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CUSTOMIZATION & INVENTORY */}
              {activeTab === 'inventory' && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equipped Cosmetics</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['board_theme', 'chip_skin', 'card_back', 'avatar'] as CosmeticCategory[]).map(cat => {
                      const currentEquippedId = (equipped as any)[cat === 'board_theme' ? 'boardTheme' : cat === 'chip_skin' ? 'chipSkin' : cat === 'card_back' ? 'cardBack' : 'avatar'];
                      const currentItem = SHOP_CATALOG.find(i => i.id === currentEquippedId);
                      const categoryOwned = SHOP_CATALOG.filter(i => i.category === cat && ownedSet.has(i.id));

                      return (
                        <div key={cat} className="bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase">
                            <span>{cat.replace('_', ' ')}</span>
                            <span className="text-amber-400">{currentItem?.name}</span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            {categoryOwned.map(item => {
                              const isEq = item.id === currentEquippedId;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => onEquipCosmetic && onEquipCosmetic(item.id)}
                                  className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                    isEq
                                      ? 'bg-indigo-950 border-indigo-500 ring-2 ring-indigo-500/50 text-white'
                                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-600'
                                  }`}
                                >
                                  <span className="text-xs font-semibold truncate flex items-center gap-1">
                                    <span>{item.icon}</span> {item.name}
                                  </span>
                                  {isEq && <Check size={13} className="text-indigo-400 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: SHOP */}
              {activeTab === 'shop' && (
                <div className="space-y-4">
                  <div className="flex items-center overflow-x-auto gap-1.5 pb-1 no-scrollbar">
                    {(['board_theme', 'chip_skin', 'card_back', 'avatar', 'victory_effect', 'emote'] as CosmeticCategory[]).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setShopCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize whitespace-nowrap ${
                          shopCategory === cat ? 'bg-amber-500 text-slate-950 shadow' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {cat.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SHOP_CATALOG.filter(item => item.category === shopCategory).map(item => {
                      const isOwned = ownedSet.has(item.id);
                      const isEquipped = (equipped as any)[item.category === 'board_theme' ? 'boardTheme' : item.category === 'chip_skin' ? 'chipSkin' : item.category === 'card_back' ? 'cardBack' : 'avatar'] === item.id;
                      const canAfford = profile.coins >= item.price;

                      return (
                        <div key={item.id} className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{item.icon}</span>
                              <div>
                                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                  {item.name}
                                  {item.rarity && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                      item.rarity === 'Legendary' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                                      item.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40' :
                                      item.rarity === 'Rare' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' :
                                      'bg-slate-700 text-slate-300'
                                    }`}>
                                      {item.rarity}
                                    </span>
                                  )}
                                </h4>
                                <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{item.description}</p>
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                            <div className="font-extrabold text-xs text-amber-400 flex items-center gap-1">
                              {item.price > 0 ? (
                                <>
                                  <Coins size={14} />
                                  <span>{item.price} Coins</span>
                                </>
                              ) : (
                                <span className="text-emerald-400">Free / Default</span>
                              )}
                            </div>

                            {isOwned ? (
                              isEquipped ? (
                                <span className="text-[10px] font-black text-indigo-400 bg-indigo-950 px-2.5 py-1 rounded-lg border border-indigo-800">
                                  EQUIPPED
                                </span>
                              ) : (
                                <button
                                  onClick={() => onEquipCosmetic && onEquipCosmetic(item.id)}
                                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-3 py-1 rounded-lg transition-all border border-slate-700 cursor-pointer"
                                >
                                  Equip
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => onBuyCosmetic && onBuyCosmetic(item.id)}
                                disabled={!canAfford}
                                className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-black text-xs px-3 py-1 rounded-lg transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:cursor-not-allowed"
                              >
                                {canAfford ? 'Buy' : 'Not Enough'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 4: DAILY REWARDS */}
              {activeTab === 'daily' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 p-4 rounded-2xl border border-indigo-500/40 text-center space-y-2">
                    <Gift size={32} className="mx-auto text-amber-400 animate-bounce" />
                    <h3 className="text-base font-black text-white">7-Day Daily Login Streak</h3>
                    <p className="text-xs text-indigo-200">Claim your daily coin rewards every 24 hours to keep your streak alive!</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {REWARD_CONFIG.DAILY_REWARDS.map((coins, idx) => {
                      const dayNum = idx + 1;
                      const isPast = dayNum < currentStreakDay;
                      const isCurrent = dayNum === currentStreakDay;
                      const isClaimedToday = isCurrent && !canClaimDaily;

                      return (
                        <div
                          key={dayNum}
                          className={`p-3 rounded-2xl border flex flex-col items-center text-center justify-between space-y-2 transition-all ${
                            isCurrent
                              ? canClaimDaily
                                ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/30'
                                : 'bg-emerald-950/80 border-emerald-500/60'
                              : isPast
                              ? 'bg-slate-900/60 border-slate-800 opacity-60'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Day {dayNum}</div>
                          <div className="text-lg font-black text-amber-400 flex items-center gap-1 font-mono">
                            <Coins size={16} /> +{coins}
                          </div>

                          {isCurrent ? (
                            canClaimDaily ? (
                              <button
                                onClick={onClaimDailyBonus}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-1 rounded-lg text-xs transition-all shadow cursor-pointer"
                              >
                                Claim!
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check size={12} /> Claimed
                              </span>
                            )
                          ) : isPast ? (
                            <span className="text-[10px] font-bold text-slate-500">Done</span>
                          ) : (
                            <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                              <Lock size={10} /> Locked
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 5: ACHIEVEMENTS / BADGES */}
              {activeTab === 'achievements' && (
                <div className="space-y-3">
                  {ACHIEVEMENT_DEFINITIONS.map(def => {
                    const playerAch = profile.achievements?.[def.id];
                    const unlocked = !!playerAch?.unlocked;

                    return (
                      <div
                        key={def.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          unlocked
                            ? 'bg-slate-900 border-amber-500/40 shadow-md shadow-amber-950/20'
                            : 'bg-slate-900/50 border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">{def.icon}</span>
                          <div>
                            <h4 className="text-xs font-bold text-white flex items-center gap-2">
                              {def.name}
                              {unlocked && (
                                <span className="text-[10px] font-black text-amber-400 bg-amber-950 px-2 py-0.2 rounded border border-amber-800">
                                  UNLOCKED
                                </span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-400">{def.description}</p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-xs font-extrabold text-amber-400 flex items-center gap-1 justify-end">
                            <Coins size={13} /> +{def.coinReward}
                          </div>
                          <div className="text-[10px] text-indigo-300 font-semibold mt-0.5">+25 XP</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 6: MATCH HISTORY */}
              {activeTab === 'history' && (
                <div className="space-y-2">
                  {profile.matchHistory && profile.matchHistory.length > 0 ? (
                    profile.matchHistory.map(rec => (
                      <div
                        key={rec.matchId}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                          rec.isWin ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <span className={rec.isWin ? 'text-emerald-400' : 'text-rose-400'}>
                              {rec.isWin ? 'VICTORY' : 'DEFEAT'}
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-300">{rec.mode}</span>
                            {rec.isRanked && (
                              <span className="text-[9px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded">
                                RANKED
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Winner: {rec.winnerName} • Room {rec.roomCode}
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-amber-400 font-mono">+{rec.coinsEarned} coins</div>
                          {rec.ratingDelta !== undefined && (
                            <div className={`text-[10px] font-bold font-mono ${rec.ratingDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {rec.ratingDelta >= 0 ? `+${rec.ratingDelta}` : rec.ratingDelta} Elo
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center p-8 text-slate-500 text-xs rounded-2xl border border-dashed border-slate-800">
                      No match history recorded yet. Play a game to view stats!
                    </div>
                  )}
                </div>
              )}

              {/* TAB 7: SEASONAL PROGRESSION */}
              {activeTab === 'season' && (
                <div className="space-y-4">
                  {seasonInfo && (
                    <div className="bg-gradient-to-r from-emerald-950/80 via-teal-950/60 to-cyan-950/80 rounded-2xl border border-emerald-500/40 p-4 shadow-lg shadow-emerald-900/20">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-xl shadow-md shadow-emerald-600/30">
                            <Snowflake size={18} className="text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-emerald-200 uppercase tracking-wider">{seasonInfo.name}</h3>
                            <p className="text-[11px] text-emerald-400/70 font-semibold">
                              {seasonInfo.isActive ? 'Season Active' : 'Season Ended'} · #{seasonInfo.number}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
                          seasonInfo.isActive
                            ? 'bg-emerald-500/30 border-emerald-400/60 text-emerald-200'
                            : 'bg-slate-700 border-slate-600 text-slate-300'
                        }`}>
                          {seasonInfo.isActive ? 'IN PROGRESS' : 'COMPLETED'}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-slate-950/50 rounded-xl p-2 text-center border border-slate-800/70">
                          <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Seasonal XP</div>
                          <div className="text-base font-black text-white font-mono mt-0.5">{seasonalXP}</div>
                        </div>
                        <div className="bg-slate-950/50 rounded-xl p-2 text-center border border-slate-800/70">
                          <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Season Lvl</div>
                          <div className="text-base font-black text-white font-mono mt-0.5">{seasonalLevel}</div>
                        </div>
                        <div className="bg-slate-950/50 rounded-xl p-2 text-center border border-slate-800/70">
                          <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Rewards</div>
                          <div className="text-base font-black text-white font-mono mt-0.5">
                            {claimedRewards.size}/{SEASONAL_REWARDS.length}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900/60 rounded-xl p-2.5 border border-emerald-900/60">
                        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span className="text-emerald-300 flex items-center gap-1">
                            <PartyPopper size={11} /> Level {seasonalLevel} → {seasonalLevel + 1}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {seasonXPInLvl}/{seasonXPSpan} XP ({seasonProgressPct}%)
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${seasonProgressPct}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full shadow-inner"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2.5 px-1">
                      <div className="flex items-center gap-1.5">
                        <Gift size={13} className="text-amber-400" />
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-300">Season Rewards Track</h4>
                      </div>
                      <span className="text-[10px] text-slate-500 font-semibold">Unlock by playing games</span>
                    </div>
                    <div className="space-y-2">
                      {SEASONAL_REWARDS.map((reward, idx) => {
                        const unlocked = seasonalLevel >= reward.level;
                        const claimed = claimedRewards.has(reward.level);
                        const isNext = !unlocked && SEASONAL_REWARDS.find(r => r.level > seasonalLevel)?.level === reward.level;
                        const prevReward = idx > 0 ? SEASONAL_REWARDS[idx - 1] : null;
                        const gapHasConnector = prevReward && reward.level - (prevReward?.level || 0) <= 3;

                        return (
                          <div key={reward.level} className="relative">
                            {gapHasConnector && (
                              <div className="absolute left-5 -top-2 w-0.5 h-2 bg-gradient-to-b from-slate-700 to-slate-800" />
                            )}
                            <div
                              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                                claimed
                                  ? 'bg-emerald-950/50 border-emerald-500/50 shadow-sm shadow-emerald-900/20'
                                  : unlocked
                                    ? 'bg-amber-950/40 border-amber-500/60 ring-2 ring-amber-500/20 shadow-md shadow-amber-900/30'
                                    : isNext
                                      ? 'bg-slate-900 border-slate-700 ring-1 ring-emerald-500/30'
                                      : 'bg-slate-900/60 border-slate-800 opacity-75'
                              }`}
                            >
                              <div className="relative shrink-0">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shadow-md transition-all ${
                                  claimed
                                    ? 'bg-gradient-to-br from-emerald-600 to-teal-600'
                                    : unlocked
                                      ? 'bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse'
                                      : 'bg-slate-800 border border-slate-700'
                                }`}>
                                  {unlocked ? reward.icon : <Lock size={15} className="text-slate-500" />}
                                </div>
                                {claimed && (
                                  <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full border-2 border-slate-900 p-0.5">
                                    <Check size={9} className="text-white" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${
                                    unlocked
                                      ? 'bg-emerald-900/60 border-emerald-600/60 text-emerald-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-500'
                                  }`}>
                                    LVL {reward.level}
                                  </span>
                                  <span className={`text-sm font-black truncate ${
                                    unlocked ? 'text-white' : 'text-slate-500'
                                  }`}>
                                    {reward.name}
                                  </span>
                                </div>
                                <div className={`text-[11px] mt-0.5 font-medium ${
                                  unlocked ? 'text-slate-400' : 'text-slate-600'
                                }`}>
                                  {reward.description} ·{' '}
                                  <span className={reward.rewardType === 'coins' ? 'text-amber-400' : 'text-purple-400'}>
                                    {reward.rewardType === 'coins' ? `🪙 ${reward.value} Coins` : `✨ Cosmetic`}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {claimed ? (
                                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-800/60 flex items-center gap-1">
                                    <Check size={10} /> Claimed
                                  </span>
                                ) : unlocked ? (
                                  <button
                                    onClick={() => onClaimSeasonalReward?.(reward.level)}
                                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-[10px] font-black px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-md shadow-amber-600/30 flex items-center gap-1"
                                  >
                                    <Gift size={11} /> Claim
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-800/70 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1">
                                    <Lock size={10} /> {reward.level - seasonalLevel} lvls
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
