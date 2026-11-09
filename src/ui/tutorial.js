// Conseils contextuels : tutoriel de première sortie puis rappels ponctuels.
import { G } from '../game/state.js';
import { player } from '../game/player.js';
import { boss } from '../game/boss.js';
import { input } from '../core/input.js';
import { settings, flags, saveFlags } from '../core/settings.js';
import { keyLabel } from './keys.js';

const k = keyLabel;
const CORE = [
  { id: 'steer', text: () => input.usingPad ? 'Stick gauche : orienter le vaisseau' : 'Déplacez la souris pour orienter le nez du vaisseau' },
  { id: 'throttle', text: () => input.usingPad ? 'Stick droit : gaz et roulis · RB : postcombustion' : `${k('KeyW')} / ${k('KeyS')} : gaz · ${k('ShiftLeft')} : postcombustion · ${k('KeyQ')} / ${k('KeyE')} : roulis` },
  { id: 'fire', text: () => input.usingPad ? 'Gâchette droite : canons' : `Clic gauche ou ${k('Space')} : canons` },
  { id: 'target', text: () => input.usingPad ? 'A : cibler l\'ennemi sous le réticule' : `${k('KeyT')} : cibler l'ennemi sous le réticule` },
  { id: 'missile', text: () => input.usingPad ? 'Gardez la cible au centre, puis gâchette gauche : missile verrouillé' : `Gardez la cible au centre pour verrouiller, puis clic droit ou ${k('KeyG')} : missile` },
];
const CONTEXT = [
  { id: 'torp', when: () => G.torps.length > 0, text: () => `Les torpilles (losanges orange) visent la station : ${k('Tab')} les cible, abattez-les vite !` },
  { id: 'emissile', when: () => G.eMissiles.some(m => m.target === player), text: () => `Missile entrant ! ${k('KeyC')} lâche des leurres, ou virez serré en postcombustion` },
  { id: 'dock', when: () => player.hull < player.S.maxHull * 0.6, text: () => 'Revenez devant le hangar à moins de 30 m/s pour réparer et réarmer' },
  { id: 'pickup', when: () => G.pickups.some(p => p.pos.distanceTo(player.pos) < 2500), text: () => 'Caisson repéré : traversez-le pour le ramasser (réparation, munitions, bouclier, surcharge)' },
  { id: 'boss', when: () => !!boss, text: () => 'Détruisez les deux générateurs (dômes bleus) pour faire tomber le bouclier de la frégate' },
  { id: 'ability', when: () => G.waveActive && G.enemies.length > 0, text: () => `${input.usingPad ? 'Y' : k('KeyZ')} : capacité spéciale (choisie au hangar) — utilisez-la dans les moments chauds !` },
  { id: 'combo', when: () => G.combo.chain >= 2, text: () => 'Enchaînez les destructions pour augmenter le multiplicateur de score' },
];

const T = { step: 0, done: new Set(), cur: null, curT: 0, steerT: 0, thr0: 0, shots0: 0, miss0: 0 };
export function resetTutorial() {
  T.step = flags.tutorialDone ? CORE.length : 0; T.done.clear(); T.cur = null; T.curT = 0; T.steerT = 0;
  T.thr0 = 0; T.shots0 = 0; T.miss0 = 0;
}

export function updateTutorial(dt) {
  if (!settings.hints || G.state !== 'flight') return;
  if (T.cur) { T.curT -= dt; if (T.curT <= 0) T.cur = null; }
  if (T.step < CORE.length) {
    const id = CORE[T.step].id, p = player;
    let ok = false;
    if (id === 'steer') { if (Math.hypot(input.stick.x, input.stick.y) > 0.3 || Math.abs(input.ax.lx) + Math.abs(input.ax.ly) > 0.4) T.steerT += dt; ok = T.steerT > 1; }
    else if (id === 'throttle') ok = Math.abs(p.throttle - T.thr0) > 0.25 || p.boosting;
    else if (id === 'fire') ok = G.stats.shots - T.shots0 > 30;
    else if (id === 'target') ok = !!p.target;
    else if (id === 'missile') ok = p.missiles < p.S.maxMissiles;
    if (T.step === 0 && T.thr0 === 0) { T.thr0 = p.throttle || 0.0001; T.shots0 = G.stats.shots; }
    if (ok) { T.step++; if (T.step === CORE.length) { flags.tutorialDone = true; saveFlags(); } }
    return;
  }
  if (T.cur) return;
  for (const c of CONTEXT) if (!T.done.has(c.id) && c.when()) { T.done.add(c.id); T.cur = c; T.curT = 7; break; }
}

export function tutorialHint() {
  if (!settings.hints || G.state !== 'flight') return null;
  if (T.step < CORE.length) return CORE[T.step].text();
  return T.cur ? T.cur.text() : null;
}
