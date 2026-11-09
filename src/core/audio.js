// Son entièrement synthétisé : effets spatialisés (panoramique + distance), moteur et musique générative.
import * as THREE from 'three';
import { settings } from './settings.js';
import { clamp, smooth } from './util.js';

const A = { ctx: null, master: null, sfxBus: null, musicBus: null, noise: null, listener: null, last: {}, eng: null };
export const audio = A;

const RANGE = { flyby: 160, rockby: 200, gun: 1500, egun: 1800, flak: 2200, boom: 6000, bigboom: 12000, hit: 2500, spark: 900, missile: 1800, emissile: 3000, torp: 4000, deflect: 1500, pd: 2500 };
const LIMIT = { laser: 0.09, plasmaHit: 0.04, rcs: 0.075, gun: 0.03, egun: 0.035, flak: 0.05, hit: 0.03, spark: 0.025, boom: 0.06, deflect: 0.05, pd: 0.05, kill: 0.04 };

export function audioInit() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext; const c = new C(); A.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    A.master = c.createGain(); A.master.connect(comp).connect(c.destination);
    A.sfxBus = c.createGain(); A.sfxBus.connect(A.master);
    A.musicBus = c.createGain(); A.musicBus.connect(A.master);
    applyVolumes();
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;
    // moteur : souffle filtré + sifflement de turbine
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(lp).connect(g).connect(A.sfxBus); src.start();
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 90;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    const og = c.createGain(); og.gain.value = 0;
    osc.connect(bp).connect(og).connect(A.sfxBus); osc.start();
    A.eng = { g, lp, osc, og, bp };
    // ronronnement de la station
    const hum = c.createOscillator(); hum.frequency.value = 52; const hg = c.createGain(); hg.gain.value = 0.02; hum.connect(hg).connect(A.sfxBus); hum.start();
    music.init();
  } catch (e) { A.ctx = null; }
}

export function applyVolumes() {
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  A.master.gain.setTargetAtTime(settings.master, t, 0.05);
  A.sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
  A.musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.05);
}

export function setEngine(level, boost = 0) {
  if (!A.eng) return;
  const t = A.ctx.currentTime, e = A.eng;
  e.g.gain.setTargetAtTime(level * 0.3, t, 0.08);
  e.lp.frequency.setTargetAtTime(120 + level * 420 + boost * 500, t, 0.1);
  e.og.gain.setTargetAtTime(level * 0.012 + boost * 0.03, t, 0.1);
  e.osc.frequency.setTargetAtTime(70 + level * 60 + boost * 90, t, 0.2);
  e.bp.frequency.setTargetAtTime(700 + level * 500 + boost * 1400, t, 0.2);
}

const _d = new THREE.Vector3(), _r = new THREE.Vector3();
/** Joue un effet. `pos` (monde) active la spatialisation par rapport à la caméra. */
export function sfx(type, vol = 1, pos = null, arg = 0) {
  const c = A.ctx; if (!c || c.state !== 'running') return;
  let pan = 0;
  if (pos && A.listener) {
    _d.copy(pos).sub(A.listener.position); const dist = _d.length(), range = RANGE[type] || 3000;
    vol *= Math.pow(clamp(1 - dist / range, 0, 1), 1.6);
    if (dist > 2) { _r.set(1, 0, 0).applyQuaternion(A.listener.quaternion); pan = clamp(_d.dot(_r) / dist, -1, 1) * 0.75; }
  }
  if (vol < 0.015) return;
  const t = c.currentTime;
  const lim = LIMIT[type]; if (lim) { if (t - (A.last[type] || 0) < lim) return; A.last[type] = t; }
  let out = A.sfxBus;
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(A.sfxBus); out = p; }
  const noise = (dur, ftype, f0, f1, g0, q = 0.7, delay = 0) => {
    const s = c.createBufferSource(); s.buffer = A.noise;
    const f = c.createBiquadFilter(); f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t + delay); f.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.setValueAtTime(g0 * vol, t + delay); g.gain.exponentialRampToValueAtTime(0.0008, t + delay + dur);
    s.connect(f).connect(g).connect(out); s.start(t + delay, Math.random() * 1.5, dur + 0.05);
  };
  const tone = (dur, type, f0, f1, g0, delay = 0, attack = 0) => {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    if (attack) { g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(g0 * vol, t + delay + attack); }
    else g.gain.setValueAtTime(g0 * vol, t + delay);
    g.gain.exponentialRampToValueAtTime(0.0008, t + delay + dur);
    o.connect(g).connect(out); o.start(t + delay); o.stop(t + delay + dur + 0.03);
  };
  switch (type) {
    case 'gun': noise(0.07, 'bandpass', 1500, 500, 0.2, 0.9); tone(0.05, 'square', 160, 60, 0.045); break;
    case 'gunOD': noise(0.07, 'bandpass', 2400, 700, 0.2, 1.1); tone(0.06, 'sawtooth', 420, 120, 0.05); break;
    case 'egun': noise(0.07, 'bandpass', 2200, 900, 0.12, 1.2); break;
    case 'flak': noise(0.12, 'bandpass', 900, 300, 0.2, 1); tone(0.08, 'square', 110, 50, 0.04); break;
    case 'pd': noise(0.05, 'bandpass', 3000, 1400, 0.1, 1.4); break;
    case 'boom': noise(1.4, 'lowpass', 1200, 50, 0.85); tone(0.8, 'sine', 80, 28, 0.35); break;
    case 'bigboom': noise(3.2, 'lowpass', 900, 30, 1.0); tone(2.4, 'sine', 60, 18, 0.55); noise(0.5, 'highpass', 3000, 800, 0.3); break;
    case 'hit': noise(0.22, 'lowpass', 800, 120, 0.45); break;
    case 'spark': noise(0.05, 'highpass', 4000, 2500, 0.12); tone(0.04, 'square', 1800, 1200, 0.025); break;
    case 'deflect': tone(0.12, 'sine', 2400, 900, 0.06); noise(0.06, 'highpass', 5000, 3000, 0.08); break;
    case 'hurt': noise(0.35, 'lowpass', 600, 80, 0.7); tone(0.25, 'square', 90, 40, 0.12); break;
    case 'shieldHit': tone(0.22, 'sine', 900, 320, 0.12); noise(0.15, 'bandpass', 2500, 900, 0.12, 2); break;
    case 'shieldDown': tone(0.5, 'sawtooth', 600, 90, 0.09); break;
    case 'missile': noise(0.9, 'bandpass', 300, 2400, 0.35, 1.5); break;
    case 'emissile': noise(0.9, 'bandpass', 500, 2800, 0.3, 2); tone(0.4, 'sawtooth', 300, 900, 0.03); break;
    case 'beep': tone(0.06, 'sine', 980, 980, 0.1); break;
    case 'lock': tone(0.16, 'sine', 1560, 1560, 0.14); break;
    case 'warn': tone(0.09, 'square', 1250, 1250, 0.07); tone(0.09, 'square', 1250, 1250, 0.07, 0.12); break;
    case 'alarm': tone(0.22, 'square', 720, 520, 0.06); break;
    case 'clang': noise(0.5, 'lowpass', 600, 80, 0.6); tone(0.4, 'triangle', 110, 55, 0.2); break;
    case 'launch': noise(1.4, 'bandpass', 200, 2200, 0.5, 0.8); tone(1.2, 'sawtooth', 60, 220, 0.05); break;
    case 'torp': tone(0.5, 'sawtooth', 300, 120, 0.06); break;
    case 'kill': tone(0.08, 'sine', 1320, 1320, 0.09); tone(0.12, 'sine', 1980, 1980, 0.07, 0.06); break;
    case 'pickup': tone(0.1, 'triangle', 660, 660, 0.12); tone(0.1, 'triangle', 880, 880, 0.12, 0.07); tone(0.18, 'triangle', 1320, 1320, 0.12, 0.14); break;
    case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => tone(0.3, 'triangle', f, f, 0.1, i * 0.07)); break;
    case 'combo': { const f = 600 * Math.pow(1.122, Math.min(12, arg)); tone(0.12, 'square', f, f * 1.5, 0.05); break; }
    case 'flare': noise(0.4, 'highpass', 2000, 6000, 0.25, 1); tone(0.2, 'sine', 500, 1500, 0.04); break;
    case 'dock': tone(0.3, 'sine', 440, 880, 0.08); break;
    case 'waveStart': tone(1.1, 'sawtooth', 110, 110, 0.06, 0, 0.08); tone(1.1, 'sawtooth', 165, 165, 0.05, 0, 0.08); tone(0.6, 'square', 220, 220, 0.03, 0.4); break;
    case 'waveClear': [392, 523, 659, 784].forEach((f, i) => tone(0.5, 'triangle', f, f, 0.1, i * 0.1)); break;
    case 'bossAlarm': for (let i = 0; i < 3; i++) tone(0.45, 'sawtooth', 300, 180, 0.07, i * 0.55); break;
    case 'click': tone(0.04, 'sine', 1200, 1200, 0.05); break;
    case 'flyby': noise(0.75, 'bandpass', 2400, 260, 0.45, 1.6); tone(0.6, 'sawtooth', 420, 140, 0.035); break;
    case 'boostOn': noise(0.9, 'bandpass', 180, 1400, 0.6, 1.2); tone(0.5, 'sine', 70, 160, 0.25); break;
    case 'retroOn': noise(0.7, 'bandpass', 1600, 220, 0.55, 1.2); tone(0.45, 'sine', 160, 60, 0.22); break;
    case 'laser': tone(0.13, 'sawtooth', 880, 860, 0.025); tone(0.13, 'sine', 1760, 1700, 0.02); noise(0.12, 'bandpass', 5200, 4800, 0.03, 4); break;
    case 'plasma': tone(0.25, 'square', 320, 90, 0.07); noise(0.2, 'bandpass', 900, 200, 0.25, 1.2); break;
    case 'plasmaHit': noise(0.5, 'lowpass', 1600, 120, 0.5); tone(0.3, 'sine', 240, 60, 0.15); break;
    case 'aegis': [392, 587, 784].forEach((f, i) => tone(0.6, 'sine', f, f * 1.01, 0.08, i * 0.05)); noise(0.6, 'highpass', 3000, 6000, 0.08); break;
    case 'emp': tone(1.2, 'sawtooth', 1200, 40, 0.12); noise(1.2, 'lowpass', 3000, 60, 0.7); break;
    case 'blink': tone(0.35, 'sine', 200, 2400, 0.12); noise(0.4, 'bandpass', 600, 5000, 0.3, 2); break;
    case 'wingman': [523, 659, 880].forEach((f, i) => tone(0.25, 'triangle', f, f, 0.08, i * 0.08)); break;
    case 'buy': [660, 880, 1320].forEach((f, i) => tone(0.18, 'triangle', f, f, 0.1, i * 0.06)); break;
    case 'deny': tone(0.2, 'square', 200, 150, 0.06); break;
    case 'rcs': noise(0.09, 'highpass', 3500, 2200, 0.09, 0.7); break;
    case 'rockby': noise(0.6, 'lowpass', 900, 120, 0.4, 0.9); break;
  }
}

/* ---------- Musique générative ---------- */
const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
const CHORDS = [
  { root: 38, notes: [50, 53, 57, 62, 64] }, // Ré mineur (add9)
  { root: 34, notes: [50, 53, 57, 58, 62] }, // Si♭ maj7
  { root: 43, notes: [50, 55, 58, 62, 65] }, // Sol mineur 7
  { root: 45, notes: [49, 52, 57, 61, 64] }, // La majeur (tension)
];
const BASS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
const ARP = [0, 2, 1, 3, 2, 4, 3, 1];

export const music = {
  intensity: 0, target: 0, step: 0, nextT: 0, bpm: 108, timer: null, g: {}, delay: null, padF: null, enabled: true,
  init() {
    const c = A.ctx; if (!c) return;
    for (const k of ['pad', 'bass', 'arp', 'kick', 'hat', 'snare']) { const g = c.createGain(); g.gain.value = 0; g.connect(A.musicBus); this.g[k] = g; }
    this.padF = c.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 800; this.padF.Q.value = 0.6; this.padF.connect(this.g.pad);
    const dl = c.createDelay(1); dl.delayTime.value = 60 / this.bpm * 0.75; const fb = c.createGain(); fb.gain.value = 0.35;
    const dlf = c.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2400;
    dl.connect(dlf).connect(fb).connect(dl); dlf.connect(this.g.arp); this.delay = dl;
    this.nextT = c.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },
  setIntensity(x) { this.target = clamp(x, 0, 1); },
  schedule() {
    const c = A.ctx; if (!c || c.state !== 'running') return;
    this.intensity += (this.target - this.intensity) * 0.02;
    const I = this.intensity, t0 = c.currentTime;
    const lv = { pad: 0.55 - I * 0.15, bass: smooth(0.08, 0.3, I), arp: smooth(0.2, 0.45, I) * 0.8, kick: smooth(0.35, 0.55, I), hat: smooth(0.4, 0.6, I) * 0.7, snare: smooth(0.65, 0.85, I) };
    for (const k in lv) this.g[k].gain.setTargetAtTime(lv[k], t0, 0.6);
    this.padF.frequency.setTargetAtTime(600 + I * 1600, t0, 0.8);
    const spb = 60 / this.bpm / 4;
    while (this.nextT < t0 + 0.12) { this.play(this.step, this.nextT, spb, I); this.step = (this.step + 1) % 128; this.nextT += spb; }
  },
  play(step, t, spb, I) {
    const c = A.ctx, ch = CHORDS[(step >> 5) % 4], s = step % 32;
    if (s === 0) for (const n of ch.notes.slice(0, 4)) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      const g = c.createGain(), dur = spb * 32;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 1.4); g.gain.setValueAtTime(0.03, t + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.2);
      o.connect(g).connect(this.padF); o.start(t); o.stop(t + dur + 1.3);
    }
    if (I > 0.06 && s % 2 === 0 && BASS[(s >> 1) % 16]) {
      const n = ch.root + ((s >> 1) % 8 === 6 ? 12 : 0);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300 + I * 700, t); f.frequency.exponentialRampToValueAtTime(120, t + spb * 1.8); f.Q.value = 4;
      const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.9);
      o.connect(f).connect(g).connect(this.g.bass); o.start(t); o.stop(t + spb * 2);
    }
    if (I > 0.18) {
      const n = ch.notes[ARP[step % 8] % ch.notes.length] + 12 + (step % 16 >= 8 && I > 0.7 ? 12 : 0);
      const o = c.createOscillator(); o.type = I > 0.6 ? 'square' : 'triangle'; o.frequency.value = mtof(n);
      const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.6);
      o.connect(g); g.connect(this.g.arp); g.connect(this.delay); o.start(t); o.stop(t + spb * 1.7);
    }
    if (I > 0.3 && (s % 8 === 0 || (I > 0.75 && s % 4 === 0))) {
      const o = c.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      const g = c.createGain(); g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(this.g.kick); o.start(t); o.stop(t + 0.32);
    }
    if (I > 0.35 && s % 2 === 0) this.noiseHit(t, 'highpass', 7000, s % 4 === 2 ? 0.12 : 0.05, 0.04, this.g.hat);
    if (I > 0.6 && s % 8 === 4) { this.noiseHit(t, 'bandpass', 1800, 0.35, 0.16, this.g.snare); const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); const g = c.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1); o.connect(g).connect(this.g.snare); o.start(t); o.stop(t + 0.12); }
  },
  noiseHit(t, type, f, vol, dur, dest) {
    const c = A.ctx, s = c.createBufferSource(); s.buffer = A.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random(), dur + 0.02);
  },
  /** Courte phrase musicale jouée par-dessus la boucle. */
  stinger(kind) {
    const c = A.ctx; if (!c) return; const t = c.currentTime + 0.02;
    const seq = { clear: [62, 65, 69, 74], victory: [62, 66, 69, 74, 78, 81], defeat: [62, 61, 58, 50], boss: [38, 39, 38, 39] }[kind]; if (!seq) return;
    seq.forEach((n, i) => {
      const o = c.createOscillator(); o.type = kind === 'boss' ? 'sawtooth' : 'triangle'; o.frequency.value = mtof(n + (kind === 'boss' ? 12 : 0));
      const g = c.createGain(), st = t + i * (kind === 'boss' ? 0.3 : 0.13), d = kind === 'boss' ? 0.28 : 0.5;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.12, st + 0.02); g.gain.exponentialRampToValueAtTime(0.001, st + d);
      o.connect(g).connect(A.musicBus); o.start(st); o.stop(st + d + 0.05);
    });
  },
};
