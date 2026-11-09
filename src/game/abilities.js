// Capacités spéciales : Égide, Onde IEM, Saut de phase, Drone ailier.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { model } from '../render/models.js';
import { G } from './state.js';
import { player } from './player.js';
import { ABILITIES } from './loadout.js';
import { stationCollide } from './station.js';
import { asteroidHit } from './asteroids.js';
import { damageHostile } from './enemies.js';
import { spawnBullet } from './weapons.js';
import { flash, shockwave, sparks, fire, addShake, lightFlash, engineTrail } from './effects.js';
import { comms } from '../ui/comms.js';
import { sfx } from '../core/audio.js';
import { rumble } from '../core/input.js';
import { fwdOf, lead, rand } from '../core/util.js';

export const ability = { cd: 0, active: 0, wing: null };
export const abilityDef = () => ABILITIES[player.S.ability] || ABILITIES.aegis;
export function resetAbility() { ability.cd = 0; ability.active = 0; removeWingman(); }

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();

export function useAbility() {
  const p = player; if (!p.alive || G.state !== 'flight') return;
  if (ability.cd > 0) { sfx('deny', 0.6); return; }
  const id = p.S.ability, def = abilityDef();
  ability.cd = def.cd;
  if (id === 'aegis') {
    p.shield = p.S.maxShield; p.invulnT = 3; ability.active = 3;
    p.bubble.material.uniforms.hit.value = 1.5; flash(p.pos, 50, 0xffd76a, 0.4);
    sfx('aegis'); rumble(0.4, 0.4, 300); comms('Égide active : invulnérable pendant 3 secondes.', 'good', 'Ordinateur de bord');
  } else if (id === 'emp') {
    const R0 = 450;
    shockwave(p.pos, R0 * 1.1, 0x7fd4ff, 0.9); shockwave(p.pos, R0 * 0.6, 0xffffff, 0.6); flash(p.pos, 160, 0x7fd4ff, 0.45, undefined, 2);
    lightFlash(p.pos, 3e5, 0x7fd4ff, 0.6, 1200); addShake(0.8); sfx('emp'); rumble(1, 0.8, 500);
    let n = 0;
    for (const h of G.targets.slice()) {
      if (h.dead || h.pos.distanceTo(p.pos) > R0) continue;
      n++;
      if (h.kind === 'torp' || h.kind === 'emissile') damageHostile(h, 9999, 'gun', h.pos);
      else if (h.kind === 'part') damageHostile(h, 80, 'gun', h.pos);
      else if (h.kind === 'boss') { h.stunT = 4; }
      else { h.stunT = 4; damageHostile(h, 25, 'gun', h.pos); sparks(h.pos, h.vel, 0x8fdcff, 14, 50, 0.6); }
    }
    comms(n ? `Onde IEM : ${n} contact${n > 1 ? 's' : ''} neutralisé${n > 1 ? 's' : ''}.` : 'Onde IEM déclenchée : aucun contact à portée.', n ? 'good' : '', 'Ordinateur de bord');
  } else if (id === 'blink') {
    fwdOf(p.obj, _f); const start = _v.copy(p.pos); let dist = 0;
    for (let d = 20; d <= 700; d += 20) { _w.copy(start).addScaledVector(_f, d); if ((_w.lengthSq() < 330 * 330 && stationCollide(_w, 6)) || asteroidHit(_w, 8)) break; dist = d; }
    for (let k = 0; k < 60; k++) { _w.copy(start).addScaledVector(_f, dist * k / 60); fire.emit(_w.x, _w.y, _w.z, rand(-6, 6), rand(-6, 6), rand(-6, 6), rand(0.4, 0.9), 3.2, 0.5, 0.6, 1.6, 3, 0.2, 0.4, 1, 0.9, 1); }
    flash(start, 40, 0x7fd4ff, 0.3);
    p.pos.addScaledVector(_f, dist); p.invulnT = Math.max(p.invulnT, 0.6);
    flash(p.pos, 50, 0xbfe8ff, 0.35); shockwave(p.pos, 60, 0x7fd4ff, 0.5);
    G.fovKick = 14; addShake(0.4); sfx('blink'); rumble(0.6, 1, 250);
  } else if (id === 'wingman') {
    spawnWingman(); sfx('wingman'); comms('Drone ailier en position. Il engage vos ennemis pendant 25 secondes.', 'good', 'Drone ailier');
  }
}

/* ---------- Drone ailier ---------- */
const ALLY = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 0.6, roughness: 0.35 }), ALLY_GLOW = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fc8ff).multiplyScalar(4) });
function spawnWingman() {
  removeWingman();
  const obj = model('interceptor');
  obj.traverse(m => { if (m.isMesh) m.material = m.material.isMeshBasicMaterial ? ALLY_GLOW : ALLY; });
  obj.scale.setScalar(0.8);
  fwdOf(player.obj, _f);
  obj.position.copy(player.pos).add(_v.set(30, 6, 20).applyQuaternion(player.obj.quaternion)); obj.quaternion.copy(player.obj.quaternion);
  R.scene.add(obj); flash(obj.position, 40, 0x6fc8ff, 0.4);
  ability.wing = { obj, pos: obj.position, vel: player.vel.clone(), life: 25, fireCd: 0, burst: 0, target: null };
}
function removeWingman() { if (ability.wing) { flash(ability.wing.pos, 40, 0x6fc8ff, 0.3); R.scene.remove(ability.wing.obj); ability.wing = null; } }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _aim = new THREE.Vector3(), _back = new THREE.Vector3();
export function updateAbilities(dt) {
  if (ability.cd > 0) ability.cd = Math.max(0, ability.cd - dt);
  if (ability.active > 0) { ability.active -= dt; player.bubble.material.uniforms.hit.value = Math.max(player.bubble.material.uniforms.hit.value, 0.8); player.bubble.visible = G.camMode === 'chase'; }
  const wg = ability.wing; if (!wg) return;
  wg.life -= dt;
  if (wg.life <= 0 || !player.alive) { removeWingman(); return; }
  // cible : l'ennemi le plus proche du joueur (hors frégate)
  let best = null, bd = 1800;
  for (const h of G.targets) { if (h.dead || h.kind === 'boss' || h.kind === 'part') continue; const d = h.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = h; } }
  wg.target = best;
  const goal = best ? lead(wg.pos, wg.vel, best.pos, best.vel, 1100, _aim) : _aim.copy(player.pos).add(_v.set(28, 5, 18).applyQuaternion(player.obj.quaternion));
  _v.copy(goal).sub(wg.pos); const dist = _v.length(); _v.divideScalar(dist || 1);
  _m.lookAt(wg.pos, goal, _w.set(0, 1, 0).applyQuaternion(wg.obj.quaternion)); _q.setFromRotationMatrix(_m); wg.obj.quaternion.rotateTowards(_q, 2.6 * dt);
  fwdOf(wg.obj, _f);
  const speed = best ? Math.min(330, Math.max(180, dist * 0.6)) : Math.max(60, player.vel.length() + Math.min(150, dist * 0.8));
  wg.vel.lerp(_w.copy(_f).multiplyScalar(speed), Math.min(1, dt * 2)); wg.pos.addScaledVector(wg.vel, dt);
  _back.copy(_f).negate(); engineTrail(_w.copy(wg.pos).addScaledVector(_back, 4), _back, wg.vel, 0.5, 1.2, 2.6, 0.8, 0.8);
  wg.fireCd -= dt;
  if (best && dist < 1300 && _f.dot(_v) > 0.985 && wg.fireCd <= 0) {
    spawnBullet('w', _w.copy(wg.pos).addScaledVector(_f, 6), _aim.copy(wg.vel).addScaledVector(_f, 1100), 9);
    sfx('pd', 0.5, wg.pos); wg.burst++; wg.fireCd = wg.burst % 6 === 0 ? 0.6 : 0.09;
  }
  if (wg.life < 3 && Math.floor(wg.life * 6) % 2 === 0) wg.obj.visible = !wg.obj.visible; else wg.obj.visible = true;
}
