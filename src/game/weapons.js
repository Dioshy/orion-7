// Projectiles : obus (traçantes instanciées), missiles, missiles ennemis, leurres et torpilles.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { model } from '../render/models.js';
import { G } from './state.js';
import { player, damagePlayer } from './player.js';
import { stationCollide, damageStation } from './station.js';
import { damageHostile, bossSegHit } from './enemies.js';
import { explode, sparks, smokePuff, engineTrail, fire, flash, popup } from './effects.js';
import { addBonus } from './score.js';
import { comms } from '../ui/comms.js';
import { sfx } from '../core/audio.js';
import { rand, randUnit, segSphere, ZAXIS, NEGZ, ZERO, fwdOf } from '../core/util.js';

/* ---------- Traçantes ---------- */
class Tracers {
  constructor(max, color, k, width, length) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.max = max; this.w = width; this.len = length; this.n = 0;
    R.scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(b, camPos) {
    if (this.n >= this.max) return;
    const d = b.pos.distanceTo(camPos), w = Math.max(this.w, d * 0.0016);
    _q.setFromUnitVectors(ZAXIS, _v.copy(b.vel).normalize());
    _m.compose(b.pos, _q, _s.set(w, w, this.len * (1 + d * 0.0004)));
    this.mesh.setMatrixAt(this.n++, _m);
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
let TR = null;
export function initWeapons() {
  TR = { p: new Tracers(700, 0xffe0a0, 4, 0.32, 13), g: new Tracers(400, 0xffc040, 6, 0.42, 16), e: new Tracers(700, 0xff4a30, 4, 0.36, 10), pd: new Tracers(300, 0x8fdcff, 4, 0.3, 9) };
}

/* ---------- Obus ---------- */
export const bullets = [];
const pool = [];
export function spawnBullet(team, pos, vel, dmg, gold = false) {
  const b = pool.pop() || { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3() };
  b.pos.copy(pos); b.prev.copy(pos); b.vel.copy(vel); b.team = team; b.dmg = dmg; b.gold = gold;
  b.life = team === 'e' ? 2.2 : team === 'pd' ? 1.6 : 2.6;
  bullets.push(b); return b;
}

export function updateBullets(dt) {
  const pAlive = player.alive && G.state === 'flight';
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.prev.copy(b.pos); b.pos.addScaledVector(b.vel, dt); b.life -= dt;
    let hit = false;
    if (b.team !== 'e') {
      for (const h of G.targets) {
        if (h.dead) continue;
        if (h.kind === 'boss') { const r = bossSegHit(b.prev, b.pos); if (r) { hit = true; if (b.team === 'p') { G.stats.hits++; G.hitMarkT = 0.12; } damageHostile(h, b.dmg, b.team === 'pd' ? 'pd' : 'gun', b.pos); break; } continue; }
        if (segSphere(b.prev, b.pos, h.pos, h.radius)) {
          hit = true;
          if (b.team === 'p') { G.stats.hits++; G.hitMarkT = 0.12; }
          sparks(b.pos, h.vel, b.gold ? 0xffc040 : 0xffe2a0, 7, 50, 0.5); sfx('spark', 0.5, b.pos);
          damageHostile(h, b.dmg, b.team === 'pd' ? 'pd' : 'gun', b.pos);
          break;
        }
      }
    } else if (pAlive && segSphere(b.prev, b.pos, player.pos, player.radius)) {
      hit = true; damagePlayer(b.dmg * G.diff.enemyDmg, _v.copy(b.vel).negate());
    }
    if (!hit && Math.abs(b.pos.z) < 300 && Math.hypot(b.pos.x, b.pos.y) < 300 && stationCollide(b.pos, 0)) {
      hit = true; if (b.team === 'e') damageStation(0.8 * G.diff.enemyDmg);
      sparks(b.pos, ZERO, b.team === 'e' ? 0xff7050 : 0xffe2a0, 5, 30, 0.6);
    }
    if (hit || b.life <= 0) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); pool.push(b); }
  }
}
export function syncTracers() {
  for (const k in TR) TR[k].begin();
  const cp = R.camera.position;
  for (const b of bullets) TR[b.team === 'p' ? (b.gold ? 'g' : 'p') : b.team].push(b, cp);
  for (const k in TR) TR[k].end();
}

/* ---------- Missiles du joueur ---------- */
export function launchMissile(target, offset) {
  const p = player, obj = model('missile'), f = fwdOf(p.obj, new THREE.Vector3());
  obj.position.set(offset, -1.3, -1).applyQuaternion(p.obj.quaternion).add(p.pos); R.scene.add(obj);
  G.missiles.push({ obj, pos: obj.position, dir: f, speed: Math.max(120, p.vel.dot(f) + 40), target, life: 12, vel: new THREE.Vector3(), age: 0 });
  sfx('missile');
}
const _aim = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _back = new THREE.Vector3();
function steerDir(dir, to, maxAng) {
  const ang = dir.angleTo(to);
  if (ang > 1e-4) { _t2.crossVectors(dir, to); if (_t2.lengthSq() < 1e-10) return; _t2.normalize(); dir.applyAxisAngle(_t2, Math.min(ang, maxAng)).normalize(); }
}
export function updateMissiles(dt) {
  for (let i = G.missiles.length - 1; i >= 0; i--) {
    const m = G.missiles[i]; m.life -= dt; m.age += dt;
    if (m.target && m.target.dead) m.target = reacquire(m);
    const t = m.target;
    if (t) {
      const d = m.pos.distanceTo(t.pos); _aim.copy(t.pos).addScaledVector(t.vel, d / Math.max(m.speed, 200));
      steerDir(m.dir, _t1.copy(_aim).sub(m.pos).normalize(), 3.2 * dt);
    }
    m.speed = Math.min(m.speed + 420 * dt, 850); m.vel.copy(m.dir).multiplyScalar(m.speed);
    const prev = _t1.copy(m.pos); m.pos.addScaledVector(m.vel, dt); m.obj.quaternion.setFromUnitVectors(NEGZ, m.dir);
    _back.copy(m.dir).negate();
    if (Math.random() < dt * 70) smokePuff(_aim.copy(m.pos).addScaledVector(_back, 1.5), _t2.copy(_back).multiplyScalar(8), 1.2, 1.4, 0.2, 0.35);
    for (let k = 0; k < 3; k++) engineTrail(_aim.copy(m.pos).addScaledVector(_back, 1.4).addScaledVector(m.vel, -Math.random() * dt), _back, ZERO, 3, 2.6, 2.2, 1, 0.9);
    let boom = false;
    for (const h of G.targets) {
      if (h.dead || h.kind === 'emissile') continue;
      if (h.kind === 'boss') { if (bossSegHit(prev, m.pos, 4)) { boom = true; break; } continue; }
      if (segSphere(prev, m.pos, h.pos, h.radius + 7)) { boom = true; break; }
    }
    if (!boom && m.pos.lengthSq() < 300 * 300 && stationCollide(m.pos, 0)) boom = true;
    if (boom || m.life <= 0) {
      const S = player.S, R1 = 45 * S.splash;
      explode(m.pos, ZERO, 16 * Math.sqrt(S.splash), { color: 0xffc890 });
      if (boom) for (const h of G.targets.slice()) {
        if (h.dead) continue;
        const d = h.kind === 'boss' ? (bossSegHit(prev, m.pos, R1 * 0.5) ? 10 : Infinity) : h.pos.distanceTo(m.pos);
        if (d < R1 + h.radius) damageHostile(h, d < 12 + h.radius ? 170 : 60, 'missile', m.pos);
      }
      R.scene.remove(m.obj); G.missiles.splice(i, 1);
    }
  }
}
function reacquire(m) {
  let best = null, bd = Infinity;
  for (const h of G.targets) {
    if (h.dead || h.kind === 'emissile') continue;
    _t2.copy(h.pos).sub(m.pos); const d = _t2.length();
    if (d < 3000 && m.dir.dot(_t2) / d > 0.8 && d < bd) { bd = d; best = h; }
  }
  return best;
}

/* ---------- Missiles ennemis et leurres ---------- */
export function launchEnemyMissile(from) {
  const obj = model('emissile'); obj.position.copy(from.pos).addScaledVector(fwdOf(from.obj, _t1), from.radius + 3); R.scene.add(obj);
  const em = { kind: 'emissile', label: 'MISSILE', obj, pos: obj.position, vel: from.vel.clone(), dir: fwdOf(from.obj, new THREE.Vector3()), speed: Math.max(120, from.vel.length()), target: player, life: 11, hp: 1, maxHp: 1, radius: 2.4, dead: false, decoyed: false };
  G.eMissiles.push(em);
  sfx('emissile', 1, em.pos);
  comms('Missile ennemi en approche ! Leurres ou virage serré.', 'danger', 'Ordinateur de bord');
}
export function updateEnemyMissiles(dt) {
  for (const em of G.eMissiles) {
    em.life -= dt;
    let t = em.target;
    if (t === player && (!player.alive || G.state !== 'flight')) t = em.target = null;
    if (t && t.dead) t = em.target = null;
    if (t) {
      const d = em.pos.distanceTo(t.pos); _aim.copy(t.pos).addScaledVector(t.vel, d / Math.max(em.speed, 150) * 0.7);
      steerDir(em.dir, _t1.copy(_aim).sub(em.pos).normalize(), 1.7 * dt);
    }
    em.speed = Math.min(em.speed + 170 * dt, 500); em.vel.copy(em.dir).multiplyScalar(em.speed);
    em.pos.addScaledVector(em.vel, dt); em.obj.quaternion.setFromUnitVectors(NEGZ, em.dir);
    _back.copy(em.dir).negate();
    for (let k = 0; k < 2; k++) engineTrail(_aim.copy(em.pos).addScaledVector(_back, 1.4).addScaledVector(em.vel, -Math.random() * dt), _back, ZERO, 3, 1, 0.5, 1, 0.9);
    if (Math.random() < dt * 40) smokePuff(_aim, _t2.copy(_back).multiplyScalar(6), 1, 1.2, 0.18, 0.3);
    if (t === player && em.pos.distanceTo(player.pos) < 9) {
      em.dead = true; explode(em.pos, player.vel, 9); damagePlayer(38 * G.diff.enemyDmg, _t1.copy(em.vel).negate());
    } else if (t && t.isFlare && em.pos.distanceTo(t.pos) < 10) { em.dead = true; explode(em.pos, ZERO, 7); popup(em.pos, `LEURRÉ +${addBonus(60)}`, '#ffd76a', true); }
    else if (em.life <= 0) {
      em.dead = true; explode(em.pos, em.vel, 5);
      if (player.alive && em.pos.distanceTo(player.pos) < 600) popup(em.pos, `ESQUIVÉ +${addBonus(100)}`, '#7dffb0', true);
    }
    if (em.dead) R.scene.remove(em.obj);
  }
  if (G.eMissiles.some(e => e.dead)) G.eMissiles = G.eMissiles.filter(e => !e.dead);
}
export function destroyEnemyMissile(em, byPlayer) {
  if (em.dead) return; em.dead = true; R.scene.remove(em.obj); explode(em.pos, em.vel, 6);
  if (byPlayer) G.stats.missilesDown++;
}

export function deployFlares() {
  const p = player, list = [];
  const back = fwdOf(p.obj, _t1).negate();
  for (let i = 0; i < 6; i++) {
    const v = randUnit(new THREE.Vector3()).multiplyScalar(rand(40, 90)).addScaledVector(back, 60).add(p.vel);
    const f = { isFlare: true, pos: p.pos.clone(), vel: v, life: 3.2, dead: false };
    G.flares.push(f); list.push(f);
  }
  for (const em of G.eMissiles) if (em.target === player && em.pos.distanceTo(p.pos) < 2600 && Math.random() < 0.88) { em.target = list[(Math.random() * list.length) | 0]; em.decoyed = true; }
  flash(p.pos, 30, 0xffe0a0, 0.3);
  sfx('flare');
}
export function updateFlares(dt) {
  for (const f of G.flares) {
    f.life -= dt; f.vel.multiplyScalar(1 - 0.6 * dt); f.pos.addScaledVector(f.vel, dt);
    fire.emit(f.pos.x, f.pos.y, f.pos.z, rand(-3, 3), rand(-3, 3), rand(-3, 3), 0.5, 3.5, 0.6, 6, 5, 3, 3, 0.8, 0.2, 1, 1);
    if (Math.random() < dt * 20) smokePuff(f.pos, ZERO, 1.5, 1.6, 0.3, 0.25);
    if (f.life <= 0) f.dead = true;
  }
  if (G.flares.some(f => f.dead)) G.flares = G.flares.filter(f => !f.dead);
}

/* ---------- Torpilles ---------- */
export function stationAimPoint() {
  if (Math.random() < 0.5) return new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-60, 10));
  const a = rand(0, Math.PI * 2); return new THREE.Vector3(Math.cos(a) * 220, Math.sin(a) * 220, 0);
}
export function launchTorpedo(from, heavy = false, offset = null) {
  const obj = model(heavy ? 'htorp' : 'torp');
  obj.position.copy(offset || from.pos); if (!offset) obj.position.addScaledVector(fwdOf(from.obj, _t1), from.radius + 4);
  R.scene.add(obj);
  const aim = stationAimPoint();
  const hp = (heavy ? 70 : 26) * G.diff.enemyHp;
  const t = { kind: 'torp', heavy, label: heavy ? 'TORPILLE LOURDE' : 'TORPILLE', obj, pos: obj.position, vel: from.vel.clone(), dir: fwdOf(from.obj, new THREE.Vector3()), speed: Math.max(40, from.vel.length()), aim, hp, maxHp: hp, radius: heavy ? 5 : 3.4, dead: false, life: 80, eta: 99 };
  G.torps.push(t);
  comms(heavy ? 'Torpille lourde lancée sur la station ! Priorité absolue.' : 'Torpille lancée sur la station ! Interceptez-la.', 'danger');
  sfx('torp', 1, t.pos);
  return t;
}
export function updateTorpedoes(dt) {
  for (const t of G.torps) {
    t.life -= dt;
    steerDir(t.dir, _t1.copy(t.aim).sub(t.pos).normalize(), 0.7 * dt);
    t.speed = Math.min(t.speed + 22 * dt, t.heavy ? 120 : 140); t.vel.copy(t.dir).multiplyScalar(t.speed); t.pos.addScaledVector(t.vel, dt);
    t.obj.quaternion.setFromUnitVectors(NEGZ, t.dir);
    t.eta = t.pos.distanceTo(t.aim) / Math.max(t.speed, 1);
    _back.copy(t.dir).negate();
    engineTrail(_aim.copy(t.pos).addScaledVector(_back, t.heavy ? 4 : 2.4), _back, ZERO, 3, 1.6, 0.6, 0.8, t.heavy ? 2.2 : 1.4);
    if (Math.random() < dt * 25) smokePuff(_aim, _t2.copy(_back).multiplyScalar(5), t.heavy ? 3 : 1.8, 2.5, 0.15, 0.3);
    if ((t.pos.lengthSq() < 400 * 400 && stationCollide(t.pos, 1.5)) || t.pos.lengthSq() < 900) {
      t.dead = true; R.scene.remove(t.obj);
      explode(t.pos, ZERO, t.heavy ? 50 : 34, { color: 0xffc070, debrisN: 8 });
      damageStation((t.heavy ? 170 : 85) * (0.8 + 0.2 * G.diff.enemyDmg));
      G.stats.torpHits++;
      comms(t.heavy ? 'Impact de torpille lourde ! Dégâts majeurs.' : 'Impact de torpille sur la station.', 'danger');
    } else if (t.life <= 0) { t.dead = true; R.scene.remove(t.obj); }
  }
  if (G.torps.some(t => t.dead)) G.torps = G.torps.filter(t => !t.dead);
}
export function destroyTorpedo(t, src) {
  if (t.dead) return; t.dead = true; R.scene.remove(t.obj); explode(t.pos, t.vel, t.heavy ? 16 : 10, { color: 0xffd080, debrisN: 2 });
  return src !== 'pd';
}

export function clearProjectiles() {
  for (const b of bullets) pool.push(b); bullets.length = 0;
  for (const m of G.missiles) R.scene.remove(m.obj);
  for (const m of G.eMissiles) R.scene.remove(m.obj);
  for (const t of G.torps) R.scene.remove(t.obj);
  G.missiles = []; G.eMissiles = []; G.torps = []; G.flares = [];
  syncTracers();
}
