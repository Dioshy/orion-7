// Score, combos, annonces.
import { G } from './state.js';
import { player } from './player.js';
import { popup } from './effects.js';
import { sfx } from '../core/audio.js';
import { fr } from '../core/util.js';

const BASE = { fighter: 100, interceptor: 160, drone: 40, bomber: 300, torp: 60, htorp: 150, emissile: 30, part: 250, boss: 0 };
const NAMES = { 2: 'DOUBLÉ', 3: 'TRIPLÉ', 4: 'QUADRUPLÉ', 5: 'CARNAGE' };

export function comboWindow() { return 4 * (G.up.combo ? 1.6 : 1); }

/** Points bruts multipliés par le combo et la difficulté, avec texte flottant. */
export function addPoints(n, pos, label) {
  const pts = Math.round(n * G.combo.mult * G.diff.score);
  G.score += pts;
  if (pos) popup(pos, label ? `${label} +${fr(pts)}` : `+${fr(pts)}`, G.combo.mult > 1 ? '#ffd76a' : '#cfe6ff', !!label);
  return pts;
}
export function addBonus(n) { const pts = Math.round(n * G.diff.score); G.score += pts; return pts; }

/** Destruction d'un hostile par le joueur : combo, annonces, score. */
export function registerKill(kind, pos, src) {
  const c = G.combo;
  if (src === 'pd') { G.score += Math.round((BASE[kind] || 50) * 0.5 * G.diff.score); return; }
  c.chain = c.t > 0 ? c.chain + 1 : 1; c.t = comboWindow();
  c.mult = Math.min(5, 1 + 0.5 * (c.chain - 1));
  if (c.mult > G.stats.bestCombo) G.stats.bestCombo = c.mult;
  c.quick = c.quickT > 0 ? c.quick + 1 : 1; c.quickT = 1.6;
  addPoints(BASE[kind] ?? 100, pos);
  G.killMarkT = 0.35;
  const big = kind === 'bomber' || kind === 'part', hs = big ? 0.11 : kind === 'torp' || kind === 'emissile' || kind === 'drone' ? 0.03 : 0.06;
  if (G.slowT <= 0) { G.timeScale = 0.08; G.slowT = hs; }
  G.fovKick = Math.max(G.fovKick || 0, big ? 6 : 3);
  if (kind !== 'torp' && kind !== 'htorp' && kind !== 'emissile') sfx('kill', 0.8);
  if (c.chain > 1) sfx('combo', 0.8, null, c.chain);
  if (c.quick >= 2) announce(NAMES[Math.min(5, c.quick)], c.quick >= 4 ? '#ff5a4a' : '#ffb347');
  else if (c.chain === 5) announce('SÉRIE ×3', '#ffd76a');
  else if (c.chain === 9) announce('SÉRIE ×5 — INARRÊTABLE', '#ffd76a');
  if (G.stats.kills >= 5 && !G.stats.ace) { G.stats.ace = true; if (c.quick < 2) announce('AS DE L\'ESCADRILLE', '#7dffb0'); }
  if (src === 'missile') G.stats.missileKills++;
  if (player.odT > 0) player.odT = Math.min(player.odT + 0.5, 30);
}

export function updateCombo(dt) {
  const c = G.combo;
  if (c.t > 0) { c.t -= dt; if (c.t <= 0) { c.chain = 0; c.mult = 1; } }
  if (c.quickT > 0) c.quickT -= dt;
  if (G.announce) { G.announce.t += dt; if (G.announce.t > 1.8) G.announce = null; }
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.life) G.banner = null; }
}
export function announce(text, color = '#ffb347') { G.announce = { text, color, t: 0 }; }
export function banner(title, sub, color = '#ffb347', life = 3.2) { G.banner = { title, sub, color, t: 0, life }; }
export function resetCombo() { Object.assign(G.combo, { chain: 0, t: 0, mult: 1, quick: 0, quickT: 0 }); }
