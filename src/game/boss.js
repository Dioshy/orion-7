// Frégate « Léviathan » : boss à sous-systèmes (générateurs de bouclier, tourelles, moteurs).
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { bossTemplate, bossPart, shieldSkin, shadows } from '../render/models.js';
import { G } from './state.js';
import { player, damagePlayer } from './player.js';
import { spawnEnemy } from './enemies.js';
import { spawnBullet, launchTorpedo } from './weapons.js';
import { explode, sparks, engineTrail, firePuff, smokePuff, shockwave, lightFlash, addShake } from './effects.js';
import { registerKill, addPoints, announce } from './score.js';
import { spawnPickup } from './pickups.js';
import { comms } from '../ui/comms.js';
import { sfx, music } from '../core/audio.js';
import { lead, rand, randUnit, segAABB, ZERO, UP, fwdOf, pick } from '../core/util.js';

export let boss = null;
let bossCount = 0, deflectHint = false;

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _min = new THREE.Vector3(), _max = new THREE.Vector3();

export function spawnBoss(pos) {
  const obj = bossTemplate(); obj.position.copy(pos);
  _m.lookAt(pos, ZERO, UP); obj.quaternion.setFromRotationMatrix(_m);
  shadows(obj); const skin = shieldSkin(obj); obj.add(skin);
  R.scene.add(obj);
  const k = G.diff.enemyHp * (1 + bossCount * 0.35);
  const hp = 2600 * k;
  boss = {
    kind: 'boss', label: 'FRÉGATE LÉVIATHAN', obj, pos: obj.position, vel: new THREE.Vector3(), radius: 70, hp, maxHp: hp,
    shieldUp: true, skin, boxes: obj.userData.boxes, engines: obj.userData.engines, parts: [], inv: new THREE.Matrix4(),
    phase: 'approach', fighterT: 14, torpT: 10, dead: false, dying: false, dyingT: 0, trailAcc: 0, hitFlash: 0, speedK: 1,
  };
  const add = (sub, x, y, z, flip, hp, label, radius) => {
    const o = bossPart(sub); o.position.set(x, y, z); if (flip) o.rotation.z = Math.PI; obj.add(o);
    boss.parts.push({ kind: 'part', sub, label, obj: o, head: o.userData.head || null, local: new THREE.Vector3(x, y + (flip ? -3 : 3) * (sub !== 'engine'), z), pos: new THREE.Vector3(), vel: boss.vel, radius, hp: hp * k, maxHp: hp * k, dead: false, fireCd: rand(2, 4), burst: 0, boss });
  };
  add('gen', 0, 14.5, -20, false, 240, 'GÉNÉRATEUR DE BOUCLIER', 9);
  add('gen', 0, -14.5, -20, true, 240, 'GÉNÉRATEUR DE BOUCLIER', 9);
  add('turret', -12, 14.5, -55, false, 160, 'TOURELLE', 6.5);
  add('turret', 12, 14.5, -55, false, 160, 'TOURELLE', 6.5);
  add('turret', -12, -14.5, 45, true, 160, 'TOURELLE', 6.5);
  add('turret', 12, -14.5, 45, true, 160, 'TOURELLE', 6.5);
  add('engine', -10, 0, 90, false, 220, 'MOTEUR', 10);
  add('engine', 10, 0, 90, false, 220, 'MOTEUR', 10);
  fwdOf(obj, boss.vel).multiplyScalar(45);
  bossCount++; deflectHint = false;
  updatePartPositions();
  comms('Alerte : frégate lourde en approche ! Son bouclier protège la coque : détruisez d\'abord les deux générateurs (dômes bleus).', 'danger');
  sfx('bossAlarm'); music.stinger('boss');
  return boss;
}

function updatePartPositions() {
  boss.obj.updateMatrixWorld(true);
  boss.inv.copy(boss.obj.matrixWorld).invert();
  for (const p of boss.parts) p.pos.copy(p.local).applyMatrix4(boss.obj.matrixWorld);
}

export function updateBoss(dt) {
  const b = boss; if (!b) return;
  if (b.dying) { updateDying(dt); return; }
  if (b.stunT > 0) b.stunT -= dt;
  const pl = player.alive && G.state === 'flight' && !(b.stunT > 0);
  const engAlive = b.parts.filter(p => p.sub === 'engine' && !p.dead).length;
  b.speedK = engAlive === 2 ? 1 : engAlive === 1 ? 0.55 : 0.15;
  // déplacement : approche puis orbite lente autour de la station
  _v.copy(b.pos).negate(); const d = _v.length(); _v.divideScalar(d);
  if (b.phase === 'approach' && d < 2700) b.phase = 'orbit';
  let want, spd;
  if (b.phase === 'approach') { want = _w.copy(_v); spd = 45; }
  else { want = _w.crossVectors(_v, UP).normalize().addScaledVector(_v, (d - 2500) / 600).normalize(); spd = 22; }
  _m.lookAt(b.pos, _a.copy(b.pos).add(want), UP); _q.setFromRotationMatrix(_m); b.obj.quaternion.rotateTowards(_q, 0.1 * dt);
  fwdOf(b.obj, _a); b.vel.lerp(_a.multiplyScalar(spd * b.speedK), Math.min(1, dt * 0.5));
  b.pos.addScaledVector(b.vel, dt);
  updatePartPositions();
  // bouclier
  const u = b.skin.userData.mat.uniforms; u.time.value += dt; b.hitFlash = Math.max(0, b.hitFlash - dt * 3); u.hit.value = b.hitFlash;
  u.up.value += ((b.shieldUp ? 1 : 0) - u.up.value) * Math.min(1, dt * 2); b.skin.visible = u.up.value > 0.01;
  // tourelles
  for (const p of b.parts) {
    if (p.dead) { if (Math.random() < dt * 12) firePuff(p.pos, b.vel, 3); if (Math.random() < dt * 5) smokePuff(p.pos, _a.copy(b.vel), 5, 3, 0.08, 0.4); continue; }
    if (p.sub !== 'turret' || !pl) continue;
    const dp = p.pos.distanceTo(player.pos); if (dp > 2400) continue;
    lead(p.pos, b.vel, player.pos, player.vel, 950, _a); _b.copy(_a).sub(p.pos).normalize();
    p.head.lookAt(_a);
    p.fireCd -= dt;
    if (p.fireCd <= 0) {
      const sp = 0.022 * G.diff.spread;
      _b.x += rand(-sp, sp); _b.y += rand(-sp, sp); _b.z += rand(-sp, sp); _b.normalize();
      spawnBullet('e', _a.copy(p.pos).addScaledVector(_b, 9), _w.copy(b.vel).addScaledVector(_b, 950), 5);
      sfx('flak', 0.7, p.pos); p.burst++; p.fireCd = p.burst % 5 === 0 ? rand(1.2, 1.8) / G.diff.aggr : 0.12;
    }
  }
  // chasseurs et torpilles lourdes
  b.fighterT -= dt; b.torpT -= dt;
  if (b.fighterT <= 0 && !(b.stunT > 0)) {
    b.fighterT = rand(20, 26) / G.diff.aggr;
    if (G.enemies.filter(e => e.kind === 'fighter').length < 8) {
      for (const s of [-1, 1]) {
        _a.set(s * 8, -16, -40).applyMatrix4(b.obj.matrixWorld); fwdOf(b.obj, _b);
        spawnEnemy('fighter', _a, 'player', { lookAt: _w.copy(_a).addScaledVector(_b, 100), speed: 120 });
      }
      comms('La frégate catapulte deux chasseurs !', 'warn');
    }
  }
  if (b.torpT <= 0 && d < 4500) { b.torpT = rand(18, 24) / G.diff.aggr; launchTorpedo(b, true, _a.set(0, -6, -110).applyMatrix4(b.obj.matrixWorld)); }
  // traînées
  if (b.pos.distanceTo(R.camera.position) < 6000) {
    b.trailAcc += dt * 30; fwdOf(b.obj, _a).negate();
    while (b.trailAcc >= 1) { b.trailAcc--; for (const p of b.parts) if (p.sub === 'engine' && !p.dead) engineTrail(p.pos, _a, b.vel, 3, 1.2, 0.4, b.speedK, 9); }
  }
  // collision avec le joueur
  if (pl && pointInBoss(player.pos, player.radius)) {
    _a.copy(player.pos).sub(b.pos).normalize();
    player.pos.addScaledVector(_a, 6); player.vel.copy(_a).multiplyScalar(Math.max(40, player.vel.length() * 0.4)).add(b.vel);
    damagePlayer(Math.max(15, player.vel.length() * 0.3), _a.clone().negate(), true);
  }
}

function pointInBoss(p, r) {
  _a.copy(p).applyMatrix4(boss.inv);
  for (const bx of boss.boxes) if (_a.x > bx.min.x - r && _a.x < bx.max.x + r && _a.y > bx.min.y - r && _a.y < bx.max.y + r && _a.z > bx.min.z - r && _a.z < bx.max.z + r) return true;
  return false;
}
const _la = new THREE.Vector3(), _lb = new THREE.Vector3();
export function bossSegHit(a, b, margin = 0) {
  if (!boss || boss.dead || boss.dying) return false;
  _la.copy(a).applyMatrix4(boss.inv); _lb.copy(b).applyMatrix4(boss.inv);
  const m = margin + (boss.shieldUp ? 3 : 0);
  for (const bx of boss.boxes) { _min.copy(bx.min).subScalar(m); _max.copy(bx.max).addScalar(m); if (segAABB(_la, _lb, _min, _max)) return true; }
  return false;
}

export function damagePart(p, dmg, src, pos) {
  if (p.dead || boss.dying) return;
  p.hp -= dmg;
  sparks(pos || p.pos, boss.vel, p.sub === 'gen' ? 0x80e0ff : 0xffd080, 8, 60, 0.7);
  if (p.hp > 0) return;
  p.dead = true; p.obj.visible = false;
  explode(p.pos, boss.vel, p.sub === 'engine' ? 30 : 22, { color: p.sub === 'gen' ? 0x80d8ff : 0xffa255, debrisN: 6 });
  registerKill('part', p.pos, src === 'pd' ? 'gun' : src);
  if (player.target === p) { player.target = null; player.lock = 0; }
  if (p.sub === 'gen') {
    if (boss.parts.every(q => q.sub !== 'gen' || q.dead)) {
      boss.shieldUp = false; boss.hitFlash = 2;
      comms('Boucliers de la frégate effondrés ! La coque est vulnérable : feu à volonté !', 'good');
      announce('BOUCLIER ABATTU', '#7fd4ff'); sfx('shieldDown', 1.2);
    } else comms('Un générateur détruit. Encore un !', 'good');
  } else if (p.sub === 'turret') { if (Math.random() < 0.6) spawnPickup(pick(['repair', 'ammo', 'shield']), p.pos, boss.vel); }
  else if (p.sub === 'engine') comms('Moteur de la frégate détruit : elle ralentit.', 'good');
}

export function damageBossHull(b, dmg, src, pos) {
  if (b.dying) return;
  if (b.shieldUp) {
    b.hitFlash = Math.min(1.5, b.hitFlash + 0.35);
    if (pos) sparks(pos, b.vel, 0x60d0ff, 4, 40, 0.6);
    sfx('deflect', 0.6, pos || b.pos);
    if (!deflectHint && src !== 'pd') { deflectHint = true; comms('Vos tirs sont absorbés par le bouclier. Détruisez les deux générateurs (dômes bleus, dessus et dessous).', 'warn', 'Ordinateur de bord'); }
    return;
  }
  b.hp -= dmg;
  if (pos) sparks(pos, b.vel, 0xffd080, 6, 60, 0.7);
  if (b.hp <= 0) { b.dying = true; b.dyingT = 3.4; b.lastSrc = src; comms('La frégate se disloque ! Éloignez-vous !', 'good'); if (player.target === b) { player.target = null; player.lock = 0; } }
}

function updateDying(dt) {
  const b = boss; b.dyingT -= dt;
  b.pos.addScaledVector(b.vel, dt); b.obj.rotateZ(dt * 0.08); b.obj.rotateX(dt * 0.03);
  updatePartPositions();
  if (Math.random() < dt * 9) {
    const bx = pick(b.boxes);
    _a.set(rand(bx.min.x, bx.max.x), rand(bx.min.y, bx.max.y), rand(bx.min.z, bx.max.z)).applyMatrix4(b.obj.matrixWorld);
    explode(_a, b.vel, rand(14, 30), { debrisN: 3 });
  }
  if (b.dyingT > 0) return;
  explode(b.pos, b.vel, 140, { color: 0xffb070, debrisN: 30 });
  shockwave(b.pos, 1800, 0xffd0a0, 1.6); shockwave(b.pos, 1100, 0x80c8ff, 1.2);
  lightFlash(b.pos, 5e5, 0xffc080, 1.5, 5000); addShake(2.5);
  for (let i = 0; i < 3; i++) spawnPickup(pick(['repair', 'ammo', 'shield', 'overdrive']), _a.copy(b.pos).add(randUnit(_w).multiplyScalar(40)), b.vel);
  G.stats.bosses++;
  G.timeScale = 0.3; G.slowT = 1.1;
  addPoints(3000 + 300 * G.wave, b.pos, 'FRÉGATE DÉTRUITE');
  announce('FRÉGATE DÉTRUITE', '#ffd76a');
  R.scene.remove(b.obj); b.dead = true; boss = null;
}

export function clearBoss() { if (boss) { R.scene.remove(boss.obj); boss.dead = true; boss = null; } bossCount = 0; }
