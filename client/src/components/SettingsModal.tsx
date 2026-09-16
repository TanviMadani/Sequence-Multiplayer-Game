import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, X, Volume2, VolumeX, Volume1, Gamepad2, Palette, LogOut, Eye, Sparkles, Flag, Check, Sun, Moon } from 'lucide-react';
import { Socket as SocketType } from 'socket.io-client';
import { GameSettings, DEFAULT_GAME_SETTINGS, SoundEffectType, AudioSettings, DEFAULT_AUDIO_SETTINGS } from '@shared/constants/rewards';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  socket: SocketType;
  playerId: string;
  profileSettings: GameSettings | undefined;
  onSettingsUpdate?: (settings: GameSettings) => void;
  onLogout?: () => void;
  audioSettings: AudioSettings;
  onAudioSettingsChange: (settings: AudioSettings) => void;
}

const AUDIO_STORAGE_KEY = 'sequence.audioSettings';

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw) return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_AUDIO_SETTINGS;
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  socket,
  playerId,
  profileSettings,
  onSettingsUpdate,
  onLogout,
  audioSettings,
  onAudioSettingsChange,
}) => {
  const [tab, setTab] = useState<'gameplay' | 'audio' | 'appearance' | 'account'>('gameplay');
  const [localGameplay, setLocalGameplay] = useState<GameSettings>(profileSettings || DEFAULT_GAME_SETTINGS);
  const [localAudio, setLocalAudio] = useState<AudioSettings>(audioSettings);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalGameplay(profileSettings || DEFAULT_GAME_SETTINGS);
      setLocalAudio(audioSettings);
    }
  }, [isOpen, profileSettings, audioSettings]);

  const updateGameplay = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const next = { ...localGameplay, [key]: value };
    setLocalGameplay(next);
    socket.emit('update-game-settings', { playerId, settings: next });
    onSettingsUpdate?.(next);
    triggerSavedFlash();
  };

  const updateAudio = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    const next = { ...localAudio, [key]: value };
    setLocalAudio(next);
    saveAudioSettings(next);
    onAudioSettingsChange(next);
    triggerSavedFlash();
  };

  const triggerSavedFlash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 900);
  };

  const toggleMasterMute = () => updateAudio('masterMuted', !localAudio.masterMuted);
  const toggleSfxMute = () => updateAudio('sfxMuted', !localAudio.sfxMuted);

  const tabs = [
    { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 size={12} /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 size={12} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={12} /> },
    { id: 'account', label: 'Account', icon: <Settings size={12} /> },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-lg bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-600/50 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] text-white my-auto max-h-[92vh] overflow-hidden flex flex-col relative"
          >
            {savedFlash && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg z-10 flex items-center gap-1"
              >
                <Check size={11} /> Saved
              </motion.div>
            )}

            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-slate-600 to-slate-700 p-2.5 rounded-xl shadow-md border border-slate-500/40">
                  <Settings size={19} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">Settings</h2>
                  <p className="text-xs text-slate-400 font-medium">Customize your experience</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700 cursor-pointer shrink-0"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-850 p-1 rounded-xl border border-slate-800 my-3 text-xs font-bold overflow-x-auto no-scrollbar shrink-0">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap cursor-pointer flex-1 justify-center ${
                    tab === t.id ? 'bg-slate-700 text-white shadow-md border border-slate-600' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {tab === 'gameplay' && (
                <div className="space-y-3">
                  <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Gamepad2 size={12} /> Gameplay Preferences
                    </h3>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Eye size={12} className="text-indigo-400" /> Valid Move Indicators
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">Highlight valid board cells when selecting cards.</p>
                      </div>
                      <button
                        onClick={() => updateGameplay('showMoveIndicators', !localGameplay.showMoveIndicators)}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          localGameplay.showMoveIndicators ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5.5 h-5.5 rounded-full bg-white shadow-md transition-all w-[22px] h-[22px] ${
                          localGameplay.showMoveIndicators ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Sparkles size={12} className="text-purple-400" /> Animations
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">Enable chip, card, and board motion animations.</p>
                      </div>
                      <button
                        onClick={() => updateGameplay('animationsEnabled', !localGameplay.animationsEnabled)}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          localGameplay.animationsEnabled ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all ${
                          localGameplay.animationsEnabled ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Flag size={12} className="text-rose-400" /> Confirm Before Surrender
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">Show confirmation prompt before surrendering.</p>
                      </div>
                      <button
                        onClick={() => updateGameplay('confirmBeforeSurrender', !localGameplay.confirmBeforeSurrender)}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          localGameplay.confirmBeforeSurrender ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all ${
                          localGameplay.confirmBeforeSurrender ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Sun size={12} className="text-amber-400" /> Reduced Animations
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">Reduce motion effects for accessibility.</p>
                      </div>
                      <button
                        onClick={() => updateGameplay('reducedAnimations', !localGameplay.reducedAnimations)}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          localGameplay.reducedAnimations ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all ${
                          localGameplay.reducedAnimations ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'audio' && (
                <div className="space-y-3">
                  <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Volume2 size={12} /> Audio Preferences
                    </h3>

                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          {localAudio.masterMuted ? <VolumeX size={12} className="text-rose-400" /> : <Volume2 size={12} className="text-indigo-400" />}
                          Master Volume
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5">Global sound control.</p>
                      </div>
                      <button
                        onClick={toggleMasterMute}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          !localAudio.masterMuted ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all ${
                          !localAudio.masterMuted ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Master Level</span>
                        <span className="text-[10.5px] font-mono text-slate-300">{localAudio.masterVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={localAudio.masterVolume}
                        onChange={(e) => updateAudio('masterVolume', parseInt(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          {localAudio.sfxMuted ? <VolumeX size={12} className="text-rose-400" /> : <Volume1 size={12} className="text-amber-400" />}
                          Sound Effects
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5">Card select, chip place, win/loss, etc.</p>
                      </div>
                      <button
                        onClick={toggleSfxMute}
                        className={`w-12 h-7 rounded-full transition-all shrink-0 relative border ${
                          !localAudio.sfxMuted ? 'bg-indigo-600 border-indigo-400/60' : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-md transition-all ${
                          !localAudio.sfxMuted ? 'left-[26px]' : 'left-0.5'
                        }`} />
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">SFX Level</span>
                        <span className="text-[10.5px] font-mono text-slate-300">{localAudio.sfxVolume}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={localAudio.sfxVolume}
                        onChange={(e) => updateAudio('sfxVolume', parseInt(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    <div className="bg-slate-850/80 rounded-xl p-3 border border-slate-700/80 mt-2">
                      <div className="flex items-start gap-2">
                        <Volume1 size={14} className="text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-[10.5px] font-bold text-slate-300">🔊 Respects Autoplay Rules</div>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">No sound until you first interact with the page, following browser autoplay restrictions. Some sounds may be synthetic tones.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'appearance' && (
                <div className="space-y-3">
                  <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-4">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Palette size={12} /> Visual Theme
                    </h3>

                    <div className="text-center text-[11px] text-slate-400 font-semibold py-4 bg-slate-850/60 rounded-xl border border-slate-800">
                      <Sun size={20} className="mx-auto mb-2 opacity-60 text-slate-500" />
                      Theme & cosmetics are available in <span className="text-indigo-300 font-bold">Profile → Customization</span>.<br />
                      Open Profile, select Customization tab to equip unlocked themes!
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <Moon size={12} className="text-indigo-400" /> System Theme
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">Currently using dark interface theme.</p>
                      </div>
                      <span className="text-[10px] font-black bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-2.5 py-1 rounded-lg">
                        DARK
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'account' && (
                <div className="space-y-3">
                  <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800 space-y-3">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Settings size={12} /> Account Actions
                    </h3>

                    <div className="bg-slate-850/70 rounded-xl p-3 border border-slate-700/80">
                      <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">Player ID</div>
                      <div className="font-mono text-[11px] text-indigo-300 break-all">{playerId}</div>
                    </div>

                    <div className="bg-slate-850/70 rounded-xl p-3 border border-slate-700/80 text-[10.5px] text-slate-400 leading-relaxed">
                      <div className="font-bold text-slate-300 mb-1 text-[10.5px] uppercase tracking-wider">💾 Sync Info</div>
                      Account-level settings are stored server-wide. Audio & device preferences are saved on this browser.
                    </div>

                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to log out? Your player ID and name will be cleared from this browser.')) {
                          onLogout?.();
                        }
                      }}
                      className="w-full bg-gradient-to-r from-rose-900 to-rose-950 hover:from-rose-800 hover:to-rose-900 text-rose-200 hover:text-rose-100 font-black py-3 rounded-xl border border-rose-700/60 flex items-center justify-center gap-2 cursor-pointer transition-all text-xs shadow-md shadow-rose-900/20"
                    >
                      <LogOut size={14} /> Log Out (Clear Profile on this Device)
                    </button>
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
