import { SoundEffectType, AudioSettings } from '@shared/constants/rewards';

type OscShape = OscillatorType;

interface SoundPreset {
  shape: OscShape;
  startFreq: number;
  endFreq?: number;
  duration: number;
  volume: number;
  delay?: number;
}

const ACHIEVEMENT_PRESET: SoundPreset[] = [
  { shape: 'triangle', startFreq: 659, duration: 0.12, volume: 0.2 },
  { shape: 'triangle', startFreq: 784, duration: 0.12, volume: 0.2, delay: 0.1 },
  { shape: 'triangle', startFreq: 988, duration: 0.12, volume: 0.2, delay: 0.2 },
  { shape: 'triangle', startFreq: 1318, duration: 0.26, volume: 0.24, delay: 0.3 },
];

const PRESETS: Record<string, SoundPreset[]> = {
  card_select: [
    { shape: 'sine', startFreq: 620, endFreq: 780, duration: 0.07, volume: 0.18 },
  ],
  chip_place: [
    { shape: 'triangle', startFreq: 440, endFreq: 330, duration: 0.1, volume: 0.22 },
    { shape: 'sine', startFreq: 880, duration: 0.04, volume: 0.12, delay: 0.04 },
  ],
  chip_remove: [
    { shape: 'square', startFreq: 360, endFreq: 220, duration: 0.12, volume: 0.14 },
  ],
  sequence_complete: [
    { shape: 'triangle', startFreq: 523, duration: 0.14, volume: 0.22 },
    { shape: 'triangle', startFreq: 659, duration: 0.14, volume: 0.22, delay: 0.12 },
    { shape: 'triangle', startFreq: 784, duration: 0.14, volume: 0.22, delay: 0.24 },
    { shape: 'sine', startFreq: 1046, duration: 0.28, volume: 0.25, delay: 0.38 },
  ],
  turn_start: [
    { shape: 'sine', startFreq: 880, duration: 0.06, volume: 0.16 },
    { shape: 'sine', startFreq: 1174, duration: 0.08, volume: 0.16, delay: 0.05 },
  ],
  timer_warning: [
    { shape: 'square', startFreq: 880, duration: 0.08, volume: 0.18 },
    { shape: 'square', startFreq: 880, duration: 0.08, volume: 0.18, delay: 0.16 },
  ],
  win: [
    { shape: 'triangle', startFreq: 523, duration: 0.18, volume: 0.22 },
    { shape: 'triangle', startFreq: 659, duration: 0.18, volume: 0.22, delay: 0.16 },
    { shape: 'triangle', startFreq: 784, duration: 0.18, volume: 0.22, delay: 0.32 },
    { shape: 'triangle', startFreq: 1046, duration: 0.32, volume: 0.25, delay: 0.48 },
    { shape: 'sine', startFreq: 1318, duration: 0.42, volume: 0.22, delay: 0.66 },
  ],
  loss: [
    { shape: 'sawtooth', startFreq: 330, endFreq: 180, duration: 0.42, volume: 0.18 },
  ],
  coin_reward: [
    { shape: 'square', startFreq: 988, duration: 0.08, volume: 0.18 },
    { shape: 'square', startFreq: 1318, duration: 0.14, volume: 0.18, delay: 0.08 },
  ],
  achievement: ACHIEVEMENT_PRESET,
  achievement_unlock: ACHIEVEMENT_PRESET,
  click: [
    { shape: 'sine', startFreq: 520, endFreq: 420, duration: 0.05, volume: 0.12 },
  ],
  notification: [
    { shape: 'triangle', startFreq: 880, duration: 0.1, volume: 0.16 },
    { shape: 'triangle', startFreq: 1046, duration: 0.1, volume: 0.16, delay: 0.08 },
  ],
};

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private lastPlayed: Record<string, number> = {};
  private minIntervalMs = 40;
  private masterAudioSettings: AudioSettings = {
    masterMuted: false,
    masterVolume: 80,
    sfxMuted: false,
    sfxVolume: 70,
  };

  public applySettings(s: AudioSettings) {
    this.masterAudioSettings = { ...s };
  }

  public getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try { this.ctx.resume().catch(() => {}); } catch {}
    }
    return this.ctx;
  }

  public unlock() {
    this.getCtx();
  }

  private canPlay(type: SoundEffectType): boolean {
    const key = `${type}`;
    const now = performance.now();
    const last = this.lastPlayed[key] || 0;
    if (now - last < this.minIntervalMs) return false;
    this.lastPlayed[key] = now;
    return true;
  }

  public play(type: SoundEffectType): void {
    if (!this.canPlay(type)) return;
    const settings = this.masterAudioSettings;
    if (settings.masterMuted || settings.sfxMuted) return;
    const masterGain = (settings.masterVolume / 100);
    const sfxGain = (settings.sfxVolume / 100);
    const overall = Math.max(0, Math.min(1, masterGain * sfxGain));
    if (overall <= 0.01) return;
    const presets = PRESETS[type];
    if (!presets || presets.length === 0) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    presets.forEach(p => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = ctx.currentTime + (p.delay || 0);
        const endAt = startAt + p.duration;

        osc.type = p.shape;
        osc.frequency.setValueAtTime(p.startFreq, startAt);
        if (typeof p.endFreq === 'number' && p.endFreq !== p.startFreq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(30, p.endFreq), endAt);
        }
        const peakVol = p.volume * overall;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peakVol, startAt + Math.min(0.012, p.duration / 4));
        gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
        osc.connect(gain).connect(ctx.destination);
        osc.start(startAt);
        osc.stop(endAt + 0.02);
      } catch {}
    });
  }
}

export const AudioManager = new AudioManagerImpl();

// Global unlock: on first user gesture, try to unlock audio
if (typeof window !== 'undefined') {
  const tryUnlock = () => {
    AudioManager.unlock();
    try {
      window.removeEventListener('pointerdown', tryUnlock);
      window.removeEventListener('keydown', tryUnlock);
    } catch {}
  };
  try {
    window.addEventListener('pointerdown', tryUnlock, { passive: true });
    window.addEventListener('keydown', tryUnlock, { passive: true });
  } catch {}
}
