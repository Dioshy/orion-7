// Vagues : composition, arrivées échelonnées, primes, intermissions.
import * as THREE from 'three';
import { G, CAMPAIGN_WAVES } from './state.js';
import { spawnEnemy } from './enemies.js';
import { spawnBoss, boss } from './boss.js';
import { station, repairStation } from './station.js';
import { addBonus, banner } from './score.js';
import { comms } from '../ui/comms.js';
import { sfx, music } from '../core/audio.js';
import { fr, rand, randUnit } from '../core/util.js';

export const INTERMISSION = 20;

export function composition(n) {
  const boss = n % 5 === 0;
  const over = Math.max(0, n - 10);
  let f = Math.min(2 + n, 12) + Math.floor(over / 2);
  let b = n >= 2 ? Math.min(Math.floor(n / 2), 5) + Math.floor(over / 4) : 0;
  let i = n >= 3 ? Math.min(Math.floor((n - 1) / 2), 6) + Math.floor(over / 3) : 0;
  let d = n >= 4 && n % 2 === 0 ? Math.min(4 + n, 18) + over : 0;
  if (boss) { f = Math.ceil(f * 0.5); b = Math.floor(b * 0.5); i = Math.floor(i * 0.6); d = 0; }
  return { f, b, i, d, boss };
}

const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
export function describe(c) {
  const parts = [];
  if (c.boss) parts.push('une frégate lourde');
  if (c.f) parts.push(plural(c.f, 'chasseur'));
  if (c.i) parts.push(plural(c.i, 'intercepteur'));
  if (c.b) parts.push(plural(c.b, 'bombardier'));
  if (c.d) parts.push(plural(c.d, 'drone'));
  return parts.join(', ');
}

export function startWave(n) {
  G.wave = n; G.waveActive = true; G.waveT = 0; G.waveDamage = 0; G.stationAtWaveStart = station.hp;
  const c = composition(n), groups = n >= 7 ? 3 : n >= 4 ? 2 : 1, q = [];
  const dirs = [];
  for (let g = 0; g < groups; g++) { const d = randUnit(new THREE.Vector3()); d.y *= 0.35; d.normalize(); dirs.push(d); }
  const at = (g, r0, r1, spread) => dirs[g].clone().multiplyScalar(rand(r0, r1)).add(randUnit(new THREE.Vector3()).multiplyScalar(rand(spread * 0.3, spread)));
  const delay = g => g * 22 + rand(0, 3);
  let k = 0;
  for (let i = 0; i < c.f; i++, k++) { const g = k % groups; q.push({ t: delay(g), kind: 'fighter', g, pos: at(g, 7000, 8200, 400), goal: i % 3 === 1 ? 'player' : 'station' }); }
  for (let i = 0; i < c.i; i++, k++) { const g = k % groups; q.push({ t: delay(g) + 2, kind: 'interceptor', g, pos: at(g, 7400, 8000, 300), goal: 'player' }); }
  for (let i = 0; i < c.b; i++, k++) { const g = k % groups; q.push({ t: delay(g), kind: 'bomber', g, pos: at(g, 8500, 9500, 500), goal: 'station' }); }
  if (c.d) { const g = (k++) % groups; for (let i = 0; i < c.d; i++) q.push({ t: delay(g) + 6 + i * 0.25, kind: 'drone', g, pos: at(g, 6500, 7000, 250), goal: 'station' }); }
  if (c.boss) q.push({ t: 4, kind: 'boss', g: 0, pos: dirs[0].clone().multiplyScalar(10500) });
  q.sort((a, b) => a.t - b.t);
  G.spawnQueue = q; G.waveSize = q.length;
  G.reinforceShown = new Set([0]);
  banner(`VAGUE ${n}${n === CAMPAIGN_WAVES ? ' · FINALE' : n > CAMPAIGN_WAVES ? ' · MODE INFINI' : ''}`, describe(c), c.boss ? '#ff5a4a' : '#ffb347');
  comms(`Vague ${n} : ${describe(c)}. Contact à ${fr(c.b ? 9 : 8)} km.`, 'warn'); sfx('waveStart');
}

export function updateWaves(dt) {
  if (G.waveActive) {
    G.waveT += dt;
    while (G.spawnQueue.length && G.spawnQueue[0].t <= G.waveT) {
      const s = G.spawnQueue.shift();
      if (s.kind === 'boss') spawnBoss(s.pos);
      else spawnEnemy(s.kind, s.pos, s.goal);
      if (!G.reinforceShown.has(s.g)) { G.reinforceShown.add(s.g); comms('Renforts ennemis détectés sur un autre axe !', 'warn'); sfx('alarm', 0.6); }
    }
    if (!G.spawnQueue.length && !G.enemies.length && !G.torps.length && !boss) waveCleared();
  } else if (G.clearedInfo) {
    G.clearedDelay -= dt;
    if (G.clearedDelay <= 0 && G.state !== 'dead') { const info = G.clearedInfo; G.clearedInfo = null; if (G.hooks.waveCleared) G.hooks.waveCleared(info); }
  } else if (G.interT > 0 && G.state !== 'upgrade') {
    G.interT -= dt;
    if (G.interT <= 0) startWave(G.wave + 1);
  }
}

function waveCleared() {
  G.waveActive = false; G.stats.wavesCleared++;
  const lines = [], perfect = (G.waveDamage || 0) === 0, safe = station.hp >= G.stationAtWaveStart;
  let bonus = addBonus(500 * G.wave); lines.push(`Prime de vague : ${fr(bonus)}`);
  const sb = addBonus(Math.round(station.hp / station.maxHp * 400 * (1 + G.wave * 0.1))); lines.push(`Intégrité de la station : ${fr(sb)}`); bonus += sb;
  if (perfect) { const pb = addBonus(300 * G.wave); bonus += pb; lines.push(`Sans une égratignure : ${fr(pb)}`); G.stats.waveNoDamage++; }
  if (safe) { const p2 = addBonus(250 * G.wave); bonus += p2; lines.push(`Station intacte : ${fr(p2)}`); }
  repairStation(0.05);
  sfx('waveClear'); music.stinger('clear');
  comms(`Vague ${G.wave} repoussée. Primes : ${fr(bonus)} points. La station se répare légèrement (+5 %).`, 'good');
  G.interT = INTERMISSION;
  G.clearedInfo = { wave: G.wave, bonus, lines, victory: G.wave === CAMPAIGN_WAVES && !G.endless }; G.clearedDelay = 2.6;
}

export function launchWaveNow() {
  if (G.waveActive || G.clearedInfo || G.interT <= 0 || G.state !== 'flight') return false;
  const left = Math.ceil(G.interT), b = addBonus(left * 20 * Math.max(1, G.wave));
  comms(`Lancement anticipé de la vague : +${fr(b)} points.`, 'good');
  G.interT = 0.01; return true;
}
