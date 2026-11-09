// Ennemis : chasseurs, intercepteurs, drones-suicides, bombardiers. IA, dégâts, destruction.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { model } from '../render/models.js';
import { G } from './state.js';
import { player, damagePlayer } from './player.js';
import { stationCollide, stationNormal, damageStation } from './station.js';
import { spawnBullet, launchTorpedo, launchEnemyMissile, destroyTorpedo, destroyEnemyMissile, stationAimPoint } from './weapons.js';
import { explode, engineTrail, smokePuff, firePuff, wreck } from './effects.js';
import { registerKill } from './score.js';
import { maybeDrop } from './pickups.js';
import { boss, damagePart, damageBossHull } from './boss.js';
import { comms } from '../ui/comms.js';
import { sfx } from '../core/audio.js';
import { clamp, lead, rand, randUnit, fwdOf, ZERO, UP } from '../core/util.js';
export { bossSegHit } from './boss.js';

export const SPEC = {
  fighter: { hp: 70, radius: 5.5, speed: [190, 215], turn: 1.5, accel: 95, label: 'CHASSEUR', trail: [3, 1.3, 0.45], trailSize: 1.3 },
  interceptor: { hp: 60, radius: 5, speed: [265, 295], turn: 2.3, accel: 150, label: 'INTERCEPTEUR', trail: [2.4, 0.7, 3], trailSize: 1.1 },
  drone: { hp: 22, radius: 2.8, speed: [220, 245], turn: 1.9, accel: 140, label: 'DRONE', trail: [3, 0.8, 0.2], trailSize: 0.8 },
  bomber: { hp: 260, radius: 11, speed: [105, 112], turn: 0.45, accel: 26, label: 'BOMBARDIER', trail: [3, 1.3, 0.45], trailSize: 2.4 },
};

const _m = new THREE.Matrix4();
const FLASH = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 2.0) });
export function spawnEnemy(kind, pos, goal = 'station', opts = {}) {
  const s = SPEC[kind], obj = model(kind); obj.position.copy(pos); R.scene.add(obj);
  _m.lookAt(pos, opts.lookAt || ZERO, UP); obj.quaternion.setFromRotationMatrix(_m);
  const hp = s.hp * G.diff.enemyHp * (1 + Math.max(0, G.wave - 10) * 0.05);
  const e = {
    kind, label: s.label, obj, pos: obj.position, vel: new THREE.Vector3(), radius: s.radius, hp, maxHp: hp,
    state: 'attack', stateT: 0, fireCd: rand(1, 3), burst: 0, goal, aggro: 0, aimOff: stationAimPoint(),
    turn: s.turn, accel: s.accel, speed: rand(s.speed[0], s.speed[1]), torpCd: rand(2, 5), turretCd: 1, missileCd: rand(4, 9),
    breakDir: new THREE.Vector3(), des: new THREE.Vector3(), jink: rand(0, 6.28), thr: 1, orbitAxis: randUnit(new THREE.Vector3()),
    dead: false, flashT: 0, flashing: false, flybyT: 0, meshes: [], hunter: kind === 'drone' && Math.random() < 0.3, engines: obj.userData.engines || [], turret: obj.userData.turret || null, trailAcc: 0,
  };
  obj.traverse(m => { if (m.isMesh) e.meshes.push([m, m.material]); });
  fwdOf(obj, e.vel).multiplyScalar(opts.speed ?? e.speed * 0.9);
  G.enemies.push(e); return e;
}

const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _sq = new THREE.Quaternion();
function steer(e, desired, dt) {
  _s1.copy(e.pos).add(desired); _s2.set(0, 1, 0).applyQuaternion(e.obj.quaternion);
  _m.lookAt(e.pos, _s1, _s2); _sq.setFromRotationMatrix(_m); e.obj.quaternion.rotateTowards(_sq, e.turn * dt);
}
function thrust(e, speed, dt) {
  fwdOf(e.obj, _s1); _s3.copy(_s1).multiplyScalar(speed).sub(e.vel);
  const max = e.accel * dt, l = _s3.length(); if (l > max) _s3.multiplyScalar(max / l);
  e.vel.add(_s3); e.thr = clamp(l / max, 0.25, 1);
}
function enemyFire(e, dir, speed, spread, dmg) {
  spread *= G.diff.spread;
  _b.copy(dir); _b.x += rand(-spread, spread); _b.y += rand(-spread, spread); _b.z += rand(-spread, spread); _b.normalize();
  _mz.copy(e.pos).addScaledVector(_b, e.radius + 2);
  spawnBullet('e', _mz, _a.copy(e.vel).addScaledVector(_b, speed), dmg);
  sfx('egun', 0.6, e.pos);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mz = new THREE.Vector3();
const _aim = new THREE.Vector3(), _to = new THREE.Vector3(), _ef = new THREE.Vector3(), _pf = new THREE.Vector3(), _n = new THREE.Vector3(), _pp = new THREE.Vector3(), _w = new THREE.Vector3();

/** Évitement de la station et séparation entre ennemis : modifie e.des. */
function avoid(e) {
  _pp.copy(e.pos).addScaledVector(e.vel, 1.6);
  if (Math.abs(_pp.z) < 320 && Math.hypot(_pp.x, _pp.y) < 260 && stationCollide(_pp, e.radius + 22)) {
    stationNormal(_pp, _n); e.des.addScaledVector(_n, 2.2).normalize();
  }
  if (boss && !boss.dead) {
    _w.copy(e.pos).sub(boss.pos); const d = _w.length();
    if (d < 170 && e.kind !== 'drone') e.des.addScaledVector(_w.divideScalar(d || 1), 1.5 * (1 - d / 170)).normalize();
  }
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    _w.copy(e.pos).sub(o.pos); const d2 = _w.lengthSq(), r = 22 + e.radius + o.radius;
    if (d2 < r * r && d2 > 0.01) { const d = Math.sqrt(d2); e.des.addScaledVector(_w.divideScalar(d), 0.6 * (1 - d / r)).normalize(); }
  }
}

export function updateEnemies(dt) {
  const pl = player.alive && G.state === 'flight';
  if (pl) fwdOf(player.obj, _pf);
  const cam = R.camera.position;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.fireCd -= dt; e.stateT -= dt; e.aggro -= dt; e.missileCd -= dt; e.flybyT -= dt;
    if (e.flashing && (e.flashT -= dt) <= 0) { e.flashing = false; for (const [m, mat] of e.meshes) m.material = mat; }
    const dPl = pl ? e.pos.distanceTo(player.pos) : Infinity;
    if (dPl < 90 && e.flybyT <= 0 && _w.copy(e.vel).sub(player.vel).length() > 120) { e.flybyT = 2.5; sfx('flyby', 1 - dPl / 120, e.pos); }
    fwdOf(e.obj, _ef);
    let speed = e.speed;
    if (e.kind === 'fighter' || e.kind === 'interceptor') {
      const ic = e.kind === 'interceptor';
      if (pl && (ic || e.aggro > 0 || dPl < 900 * G.diff.aggr)) e.goal = 'player';
      const goal = e.goal === 'player' && pl ? 'player' : 'station';
      const tPos = goal === 'player' ? player.pos : e.aimOff, tVel = goal === 'player' ? player.vel : ZERO;
      const bs = ic ? 900 : 850;
      lead(e.pos, e.vel, tPos, tVel, bs, _aim);
      _to.copy(_aim).sub(e.pos); const dist = _to.length(); _to.divideScalar(dist || 1);
      if (e.state === 'attack') {
        e.des.copy(_to);
        if (dist < (goal === 'player' ? (ic ? 170 : 240) : 380)) {
          e.state = 'break'; e.stateT = rand(2.2, 4.2) * (ic ? 0.7 : 1);
          e.breakDir.copy(e.pos).sub(tPos).normalize().add(randUnit(_s2).multiplyScalar(0.9)).normalize();
        }
        if (pl && dPl < 1300) { // esquive quand le joueur l'a dans l'axe
          _s2.copy(e.pos).sub(player.pos).divideScalar(dPl);
          if (_pf.dot(_s2) > (ic ? 0.94 : 0.965)) {
            _s3.crossVectors(_ef, UP).normalize();
            e.des.addScaledVector(_s3, Math.sin(G.time * (ic ? 3.4 : 2.6) + e.jink) * (ic ? 0.7 : 0.45)).normalize(); speed *= 1.15;
          }
        }
        const rng = ic ? 1300 : 1500, ali = ic ? 0.996 : 0.994;
        if (dist < rng && _ef.dot(_to) > ali && e.fireCd <= 0) {
          enemyFire(e, _ef, bs, ic ? 0.01 : 0.014, ic ? 3.5 : 4); e.burst++;
          e.fireCd = e.burst % (ic ? 4 : 6) === 0 ? rand(0.9, 1.8) : 0.1;
        }
        if (ic && pl && G.wave >= 5 && e.missileCd <= 0 && dPl > 450 && dPl < 2400 && _ef.dot(_to) > 0.9 && G.eMissiles.length < 2 + (G.wave >= 9 ? 1 : 0)) {
          launchEnemyMissile(e); e.missileCd = rand(13, 20) / G.diff.aggr;
        }
      } else {
        e.des.copy(e.breakDir); speed *= 1.25;
        if (e.stateT <= 0) { e.state = 'attack'; if (Math.random() < 0.3) e.aimOff = stationAimPoint(); }
      }
      avoid(e);
      steer(e, e.des, dt); thrust(e, speed, dt);
    } else if (e.kind === 'drone') {
      const hunt = pl && e.hunter && dPl < 600;
      const tPos = hunt ? player.pos : e.aimOff;
      lead(e.pos, e.vel, tPos, hunt ? player.vel : ZERO, e.speed, _aim);
      e.des.copy(_aim).sub(e.pos).normalize();
      _s3.crossVectors(e.des, UP).normalize();
      e.des.addScaledVector(_s3, Math.sin(G.time * 3 + e.jink) * 0.25).normalize();
      if (pl && dPl < 1000) { _s2.copy(e.pos).sub(player.pos).divideScalar(dPl); if (_pf.dot(_s2) > 0.97) { _s3.crossVectors(_ef, UP).normalize(); e.des.addScaledVector(_s3, Math.sin(G.time * 4 + e.jink) * 0.5).normalize(); } }
      steer(e, e.des, dt); thrust(e, e.speed, dt);
      e.obj.rotateZ(dt * 4);
    } else { // bombardier
      _to.copy(e.pos).negate(); const d = _to.length(); _to.divideScalar(d);
      if (d > 2100) e.des.copy(_to);
      else { _s2.crossVectors(_to, e.orbitAxis).normalize(); e.des.copy(_s2).addScaledVector(_to, (d - 1800) / 400).normalize(); }
      avoid(e);
      steer(e, e.des, dt); thrust(e, e.speed, dt);
      e.torpCd -= dt;
      if (d < 2700 && e.torpCd <= 0) { launchTorpedo(e); e.torpCd = rand(10, 14) / G.diff.aggr; }
      e.turretCd -= dt;
      if (pl && dPl < 1100) {
        lead(e.pos, e.vel, player.pos, player.vel, 800, _aim); _s2.copy(_aim).sub(e.pos).normalize();
        if (e.turret) e.turret.lookAt(_w.copy(e.pos).addScaledVector(_s2, 100));
        if (e.turretCd <= 0) { enemyFire(e, _s2, 800, 0.025, 4); e.burst++; e.turretCd = e.burst % 5 === 0 ? 1.4 : 0.16; }
      }
    }
    e.pos.addScaledVector(e.vel, dt);
    // traînées de moteur et fumée de dégâts (seulement à portée de vue)
    const dc = e.pos.distanceTo(cam);
    if (dc < 3000) {
      const s = SPEC[e.kind]; e.trailAcc += dt * (dc < 900 ? 90 : 30);
      _s1.copy(_ef).negate();
      while (e.trailAcc >= 1) {
        e.trailAcc--;
        for (const en of e.engines) { _w.copy(en).applyQuaternion(e.obj.quaternion).add(e.pos).addScaledVector(e.vel, -Math.random() * dt); engineTrail(_w, _s1, e.vel, s.trail[0], s.trail[1], s.trail[2], e.thr, s.trailSize); }
      }
      if (e.hp < e.maxHp * 0.5 && Math.random() < dt * 20) { smokePuff(e.pos, _w.copy(e.vel).multiplyScalar(0.3), e.radius * 0.5, 1.5, 0.1, 0.4); if (e.hp < e.maxHp * 0.25) firePuff(e.pos, e.vel, e.radius * 0.4); }
    }
    // collisions
    if (Math.abs(e.pos.z) < 320 && Math.hypot(e.pos.x, e.pos.y) < 260 && stationCollide(e.pos, e.radius * 0.6)) {
      damageStation(e.kind === 'drone' ? 32 : e.kind === 'bomber' ? 60 : 25);
      if (e.kind === 'drone') comms('Un drone s\'est écrasé sur la station !', 'danger');
      destroyEnemy(e, null); continue;
    }
    if (pl && dPl < e.radius + player.radius) { damagePlayer(e.kind === 'drone' ? 40 : 70, _w.copy(e.pos).sub(player.pos), true); destroyEnemy(e, null); }
  }
  if (G.enemies.some(e => e.dead)) G.enemies = G.enemies.filter(e => !e.dead);
}

export function damageEnemy(e, d, src) {
  if (e.dead) return;
  e.hp -= d; e.aggro = 8;
  e.flashT = 0.06; if (!e.flashing) { e.flashing = true; for (const [m] of e.meshes) if (!m.parent?.isSprite) m.material = FLASH; }
  if (e.hp <= 0) destroyEnemy(e, src);
}
export function destroyEnemy(e, src) {
  if (e.dead) return; e.dead = true;
  const size = { bomber: 30, fighter: 15, interceptor: 14, drone: 8 }[e.kind], color = e.kind === 'interceptor' ? 0xd080ff : 0xffa255;
  if (e.flashing) { e.flashing = false; for (const [m, mat] of e.meshes) m.material = mat; }
  if (src && e.kind !== 'drone') {
    // touché à mort : petite explosion, puis l'épave part en vrille avant d'exploser
    explode(e.pos, e.vel, size * 0.45, { color, ring: false, light: true });
    wreck(e.obj, e.vel, size, color, e.kind === 'bomber' ? rand(1.0, 1.4) : rand(0.45, 0.8));
  } else {
    R.scene.remove(e.obj);
    explode(e.pos, e.vel, size, { color, debrisN: e.kind === 'bomber' ? 12 : e.kind === 'drone' ? 2 : 6 });
  }
  if (src) {
    if (src !== 'pd') { G.stats.kills++; G.stats[e.kind + 's'] = (G.stats[e.kind + 's'] || 0) + 1; }
    registerKill(e.kind, e.pos, src);
    maybeDrop(e);
  }
  if (player.target === e) { player.target = null; player.lock = 0; }
}

/** Dégâts infligés par le joueur (ou les tourelles) à n'importe quel hostile. */
export function damageHostile(h, dmg, src, pos) {
  if (h.dead) return;
  switch (h.kind) {
    case 'torp':
      h.hp -= dmg;
      if (h.hp <= 0) {
        destroyTorpedo(h, src);
        if (src !== 'pd') { G.stats.torps++; comms(h.heavy ? 'Torpille lourde neutralisée. Superbe !' : 'Torpille détruite. Bien joué.', 'good'); }
        else comms('Tourelle de défense : torpille abattue.', 'good');
        registerKill(h.heavy ? 'htorp' : 'torp', h.pos, src);
      }
      break;
    case 'emissile': destroyEnemyMissile(h, src !== 'pd'); registerKill('emissile', h.pos, src); break;
    case 'part': damagePart(h, dmg, src, pos); break;
    case 'boss': damageBossHull(h, dmg, src, pos); break;
    default: damageEnemy(h, dmg, src);
  }
}

export function rebuildTargets() {
  const T = G.targets; T.length = 0;
  for (const e of G.enemies) if (!e.dead) T.push(e);
  for (const t of G.torps) if (!t.dead) T.push(t);
  for (const m of G.eMissiles) if (!m.dead) T.push(m);
  if (boss && !boss.dead) { for (const p of boss.parts) if (!p.dead) T.push(p); T.push(boss); }
}

export function clearEnemies() { for (const e of G.enemies) R.scene.remove(e.obj); G.enemies = []; }
