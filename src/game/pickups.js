// Caissons de récupération lâchés par les ennemis.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { model } from '../render/models.js';
import { G } from './state.js';
import { player } from './player.js';
import { popup, sparks, flash } from './effects.js';
import { announce } from './score.js';
import { sfx } from '../core/audio.js';
import { rand, randUnit } from '../core/util.js';

const DROP = { fighter: 0.16, interceptor: 0.25, drone: 0.05, bomber: 0.6 };
export const PICKUP_INFO = {
  repair: { label: 'RÉPARATION', color: '#6dff9a' },
  ammo: { label: 'MUNITIONS', color: '#d8e8ff' },
  shield: { label: 'BOUCLIER', color: '#60d0ff' },
  overdrive: { label: 'SURCHARGE', color: '#ffc840' },
};

export function maybeDrop(e) {
  if (Math.random() > (DROP[e.kind] || 0)) return;
  const p = player, S = p.S;
  const w = [['repair', p.hull < S.maxHull * 0.6 ? 3 : 1], ['ammo', p.missiles < 2 ? 3 : 1], ['shield', 1], ['overdrive', 0.8]];
  let r = Math.random() * w.reduce((s, x) => s + x[1], 0), type = 'repair';
  for (const [k, v] of w) { if ((r -= v) <= 0) { type = k; break; } }
  spawnPickup(type, e.pos, e.vel);
}

export function spawnPickup(type, pos, vel) {
  const obj = model('pk_' + type); obj.position.copy(pos); R.scene.add(obj);
  G.pickups.push({ type, obj, pos: obj.position, vel: vel.clone().multiplyScalar(0.25).add(randUnit(new THREE.Vector3()).multiplyScalar(8)), life: 30, dead: false, spin: rand(1, 2) });
}

const _d = new THREE.Vector3();
export function updatePickups(dt) {
  const p = player, alive = p.alive && G.state === 'flight';
  for (const k of G.pickups) {
    k.life -= dt; k.vel.multiplyScalar(1 - 0.4 * dt);
    if (alive) {
      _d.copy(p.pos).sub(k.pos); const d = _d.length();
      const mag = p.S.magnet;
      if (mag && d < mag) k.vel.addScaledVector(_d.divideScalar(d), 260 * dt * (1 - d / mag * 0.5));
      if (d < 16) { collect(k); continue; }
    }
    k.pos.addScaledVector(k.vel, dt);
    const u = k.obj.userData; u.core.rotation.y += dt * k.spin * 2; u.cage.rotation.y -= dt * k.spin; u.cage.rotation.x += dt * 0.7; u.ring.rotation.x += dt * 1.3;
    const s = 1 + Math.sin(G.time * 5 + k.spin) * 0.08; k.obj.scale.setScalar(s);
    k.obj.visible = k.life > 6 || Math.floor(k.life * 6) % 2 === 0;
    if (k.life <= 0) k.dead = true;
  }
  if (G.pickups.some(k => k.dead)) G.pickups = G.pickups.filter(k => { if (k.dead) R.scene.remove(k.obj); return !k.dead; });
}

function collect(k) {
  k.dead = true; const p = player, S = p.S, info = PICKUP_INFO[k.type];
  switch (k.type) {
    case 'repair': p.hull = Math.min(S.maxHull, p.hull + 40); break;
    case 'ammo': p.missiles = Math.min(S.maxMissiles, p.missiles + 3); p.flares = Math.min(S.maxFlares, p.flares + 2); p.ammo = 1200; break;
    case 'shield': p.shield = S.maxShield; p.shieldT = 0; break;
    case 'overdrive': p.odT = (G.up.ovd ? 20 : 12); announce('SURCHARGE DES CANONS', '#ffc840'); break;
  }
  G.stats.pickups++;
  popup(k.pos, info.label, info.color, true);
  sparks(k.pos, p.vel, parseInt(info.color.slice(1), 16), 16, 40, 0.8); flash(k.pos, 40, parseInt(info.color.slice(1), 16), 0.3);
  sfx('pickup');
}

export function clearPickups() { for (const k of G.pickups) R.scene.remove(k.obj); G.pickups = []; }
