// Couloir de balises lumineuses après le décollage : on les traverse pour rejoindre le combat.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { glowSprite } from '../render/models.js';
import { G } from './state.js';
import { player } from './player.js';
import { addBonus, announce } from './score.js';
import { flash, popup } from './effects.js';
import { sfx } from '../core/audio.js';
import { fr } from '../core/util.js';

const N = 9, RADIUS = 17;
export const gates = [];
const IDLE = new THREE.Color(0.35, 0.9, 1.6), NEXT = new THREE.Color(1.6, 2.6, 3.2), OK = new THREE.Color(0.4, 3, 0.9), MISS = new THREE.Color(3, 0.5, 0.3);
export const gateRun = { active: false, idx: 0, passed: 0, t: 0, fade: 1 };

export function initGates() {
  const ringGeo = new THREE.TorusGeometry(RADIUS, 0.45, 8, 64), chevGeo = new THREE.BoxGeometry(0.7, 3.2, 0.4);
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: IDLE.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    g.add(new THREE.Mesh(ringGeo, mat));
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(chevGeo, mat); const a = k / 4 * Math.PI * 2 + Math.PI / 4; c.position.set(Math.cos(a) * (RADIUS - 2.4), Math.sin(a) * (RADIUS - 2.4), 0); c.rotation.z = a + Math.PI / 2; g.add(c); }
    const halo = glowSprite(0x7fd4ff, RADIUS * 2.6, 0.18, false); g.add(halo);
    const z = 340 + i * 200, y = -14 + i * 7 + i * i * 0.9, x = Math.sin(i * 0.55) * i * 7;
    g.position.set(x, y, z); g.visible = false; R.scene.add(g);
    gates.push({ g, mat, halo, pos: g.position, state: 'idle', t: 0 });
  }
}

export function resetGates() {
  Object.assign(gateRun, { active: true, idx: 0, passed: 0, t: 0, fade: 1 });
  for (const gt of gates) { gt.state = 'idle'; gt.t = 0; gt.g.visible = true; gt.g.scale.setScalar(1); }
  prevZ = player.pos ? player.pos.z : 0;
}
export function hideGates() { gateRun.active = false; for (const gt of gates) gt.g.visible = false; }

let prevZ = 0;
export function updateGates(dt) {
  if (!gateRun.active) return;
  gateRun.t += dt;
  const p = player, flying = G.state === 'flight';
  // franchissement du plan de la balise suivante
  const next = gates[gateRun.idx];
  if (flying && next && prevZ < next.pos.z && p.pos.z >= next.pos.z) {
    const dx = p.pos.x - next.pos.x, dy = p.pos.y - next.pos.y, ok = dx * dx + dy * dy < (RADIUS + 2) * (RADIUS + 2);
    next.state = ok ? 'ok' : 'miss'; next.t = 0;
    if (ok) { gateRun.passed++; sfx('combo', 0.8, null, 3 + gateRun.idx); flash(next.pos, 18, 0x60ff9a, 0.25, undefined, 1.5); }
    else sfx('beep', 0.5);
    gateRun.idx++;
    if (gateRun.idx >= N) finish();
  }
  prevZ = p.pos.z;
  // abandon si on s'éloigne trop du couloir ou si on traîne
  if (flying && next && (p.pos.distanceTo(next.pos) > 2600 || gateRun.t > 60)) gateRun.fade = Math.min(gateRun.fade, 0.999);
  if (gateRun.fade < 1) { gateRun.fade -= dt * 0.8; if (gateRun.fade <= 0) { hideGates(); return; } }
  const pulse = 0.75 + 0.25 * Math.sin(gateRun.t * 7);
  gates.forEach((gt, i) => {
    gt.t += dt;
    let c, a = gateRun.fade;
    if (gt.state === 'ok') { c = OK; a *= Math.max(0, 1 - gt.t / 0.8); gt.g.scale.setScalar(1 + gt.t * 0.4); }
    else if (gt.state === 'miss') { c = MISS; a *= Math.max(0, 1 - gt.t / 1.2); }
    else if (i === gateRun.idx) { c = NEXT; a *= pulse; }
    else { c = IDLE; a *= 0.55 * Math.max(0.25, 1 - (i - gateRun.idx) * 0.12); }
    gt.mat.color.copy(c); gt.mat.opacity = a; gt.halo.material.opacity = gt.state === 'idle' ? a * 0.5 : 0;
    gt.g.visible = a > 0.01;
    gt.g.rotation.z += dt * (i === gateRun.idx ? 0.8 : 0.2);
  });
}

function finish() {
  const all = gateRun.passed === N;
  if (all) {
    const b = addBonus(400); player.boost = player.S.maxBoost;
    announce('DÉCOLLAGE PARFAIT', '#7dffb0'); popup(player.pos.clone().addScaledVector(player.vel, 0.6), `BALISES ${N}/${N} +${fr(b)}`, '#7dffb0', true);
    sfx('upgrade');
  } else if (gateRun.passed > 0) popup(player.pos.clone().addScaledVector(player.vel, 0.6), `BALISES ${gateRun.passed}/${N}`, '#7fd4ff', true);
  gateRun.fade = 0.999;
}

export const nextGate = () => (gateRun.active && gateRun.fade >= 1 ? gates[gateRun.idx] || null : null);
export const GATE_COUNT = N;
