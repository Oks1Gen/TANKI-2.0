// ===== Программный синтез звука (Web Audio API) =====
import { loadSettings } from './settings';

const MUTE_KEY = 'steel-assault-muted-v1';

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  amb!: GainNode;
  private muted = false;
  private pausedDuck = false;
  private volume = 0.7;
  private noiseBuf: AudioBuffer | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private lastUi = 0;
  private battleGen = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  isMuted(): boolean {
    if (this.muted) return true;
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch { /* ignore */ }
    if (this.ctx) {
      const base = this.pausedDuck ? this.volume * 0.21 : this.volume;
      try {
        this.master.gain.setTargetAtTime(m ? 0 : base, this.ctx.currentTime, 0.05);
      } catch { /* */ }
    }
  }

  getVolume(): number {
    return this.volume;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.7));
    if (this.ctx) {
      const base = this.pausedDuck ? this.volume * 0.21 : this.volume;
      try {
        this.master.gain.setTargetAtTime(this.muted ? 0 : base, this.ctx.currentTime, 0.05);
      } catch { /* */ }
    }
  }

  init() {
    // подхватываем сохранённый мьют и громкость даже до создания контекста
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch { /* */ }
    try {
      this.volume = loadSettings().volume;
    } catch { /* */ }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = this.ctx.createGain();
    this.amb.connect(this.master);
    // буфер шума
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private noise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  // ---- Интерфейс ----
  ui(kind: 'click' | 'hover' | 'confirm' | 'deny' = 'click') {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (kind === 'hover' && now - this.lastUi < 0.04) return;
    this.lastUi = now;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    const f = kind === 'deny' ? 180 : kind === 'confirm' ? 880 : kind === 'hover' ? 1400 : 1100;
    o.frequency.setValueAtTime(f, now);
    if (kind === 'confirm') o.frequency.exponentialRampToValueAtTime(1600, now + 0.08);
    if (kind === 'deny') o.frequency.exponentialRampToValueAtTime(90, now + 0.15);
    g.gain.setValueAtTime(kind === 'hover' ? 0.03 : 0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'deny' ? 0.2 : kind === 'confirm' ? 0.14 : 0.05));
    o.connect(g).connect(this.sfx);
    o.start(now);
    o.stop(now + 0.25);
  }

  // ---- Выстрел ----
  shot(heavy = 1, distanceGain = 1, own = true) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const vol = (own ? 0.9 : 0.4) * distanceGain;
    // низкий удар
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90 * heavy, now);
    o.frequency.exponentialRampToValueAtTime(28, now + 0.35 * heavy);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45 * heavy);
    o.connect(g).connect(this.sfx);
    o.start(now);
    o.stop(now + 0.6 * heavy);
    // шумовой хлопок
    const n = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(own ? 3200 : 1200, now);
    f.frequency.exponentialRampToValueAtTime(200, now + 0.3 * heavy);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.7, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.35 * heavy);
    n.connect(f).connect(ng).connect(this.sfx);
    n.start(now);
    n.stop(now + 0.5 * heavy);
  }

  // ---- Попадание ----
  hit(gain = 1, metallic = true) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const n = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = metallic ? 2400 : 600;
    f.Q.value = metallic ? 6 : 1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5 * gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(now);
    n.stop(now + 0.25);
    if (metallic) {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1800, now);
      o.frequency.exponentialRampToValueAtTime(600, now + 0.12);
      og.gain.setValueAtTime(0.25 * gain, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      o.connect(og).connect(this.sfx);
      o.start(now);
      o.stop(now + 0.2);
    }
  }

  // ---- Взрыв ----
  explosion(size = 1, gain = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const n = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, now);
    f.frequency.exponentialRampToValueAtTime(60, now + 1.2 * size);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(1.0 * gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4 * size);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(now);
    n.stop(now + 1.6 * size);
    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, now);
    o.frequency.exponentialRampToValueAtTime(20, now + 0.9 * size);
    og.gain.setValueAtTime(0.9 * gain, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 1.0 * size);
    o.connect(og).connect(this.sfx);
    o.start(now);
    o.stop(now + 1.2 * size);
  }

  // ---- Пикап ----
  pickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.15, now + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.16);
      o.connect(g).connect(this.sfx);
      o.start(now + i * 0.07);
      o.stop(now + i * 0.07 + 0.2);
    });
  }

  // ---- Предупреждение / захват ----
  alert(high = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = high ? 720 : 360;
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    o.connect(f).connect(g).connect(this.sfx);
    o.start(now);
    o.stop(now + 0.4);
  }

  thunder() {
    if (!this.ctx) return;
    this.explosion(2.2, 0.5);
  }

  // ---- Двигатель ----
  startEngine() {
    if (!this.ctx) return;
    // отменяем отложенную остановку предыдущего боя — новый бой переиспользует/пересоздаёт узлы
    this.battleGen++;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.engineOsc) return;
    const ctx = this.ctx;
    // отключаем осиротевшие фильтр/гейн от прошлого боя, если они остались
    try {
      this.engineFilter?.disconnect();
      this.engineGain?.disconnect();
    } catch {
      /* */
    }
    this.engineFilter = null;
    this.engineGain = null;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 61;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 220;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.amb);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngine(throttle: number, speedNorm: number, alive: boolean) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const rpm = alive ? 38 + speedNorm * 55 + throttle * 12 : 0;
    this.engineOsc.frequency.setTargetAtTime(Math.max(1, rpm), t, 0.15);
    this.engineOsc2!.frequency.setTargetAtTime(Math.max(1, rpm * 1.51), t, 0.15);
    this.engineFilter!.frequency.setTargetAtTime(200 + speedNorm * 500 + throttle * 200, t, 0.2);
    this.engineGain!.gain.setTargetAtTime(alive ? 0.12 + throttle * 0.08 + speedNorm * 0.05 : 0, t, 0.2);
  }

  // ---- Ветер / дождь ----
  startAmbience(weather: 'clear' | 'rain' | 'fog' | 'snow' | 'storm') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.windSrc) {
      this.windSrc = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 400;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 180;
      lfo.connect(lfoG).connect(f.frequency);
      lfo.start();
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      this.windSrc.connect(f).connect(this.windGain).connect(this.amb);
      this.windSrc.start();
    }
    if (!this.rainSrc) {
      this.rainSrc = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      this.rainSrc.connect(f).connect(this.rainGain).connect(this.amb);
      this.rainSrc.start();
    }
    const t = ctx.currentTime;
    const wind = weather === 'storm' ? 0.16 : weather === 'snow' ? 0.1 : weather === 'fog' ? 0.05 : 0.06;
    const rain = weather === 'storm' ? 0.09 : weather === 'rain' ? 0.06 : 0;
    this.windGain!.gain.setTargetAtTime(wind, t, 1);
    this.rainGain!.gain.setTargetAtTime(rain, t, 1);
  }

  stopBattleAudio() {
    if (!this.ctx) return;
    const myGen = ++this.battleGen;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    const t = this.ctx.currentTime;
    this.engineGain?.gain.setTargetAtTime(0, t, 0.2);
    this.windGain?.gain.setTargetAtTime(0, t, 0.5);
    this.rainGain?.gain.setTargetAtTime(0, t, 0.5);
    // возвращаем громкость мастера — выход из паузы в ангар иначе оставляет всё тихим
    try {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.1);
    } catch {
      /* */
    }
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      // если за это время начался новый бой — чужие осцилляторы не трогаем
      if (myGen !== this.battleGen) return;
      try {
        this.engineOsc?.stop();
        this.engineOsc2?.stop();
      } catch {
        /* */
      }
      try {
        this.engineOsc?.disconnect();
        this.engineOsc2?.disconnect();
        this.engineFilter?.disconnect();
        this.engineGain?.disconnect();
      } catch {
        /* */
      }
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.engineFilter = null;
      this.engineGain = null;
    }, 600);
  }

  setPaused(p: boolean) {
    this.pausedDuck = p;
    if (!this.ctx || this.isMuted()) return;
    this.master.gain.setTargetAtTime(p ? this.volume * 0.21 : this.volume, this.ctx.currentTime, 0.1);
  }
}

export const audio = new AudioEngine();
