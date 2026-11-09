// Vaisseau du joueur : départ au sol sur le pont d'envol, pilotage newtonien avec assistance, armes, ravitaillement.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { buildShip, setPaint, setGear, animateShip, GEAR_HEIGHT } from '../render/ship.js';
import { ship as shipDef, current, PAINTS } from './loadout.js';
import { updateLaser, laserActive } from './weapons.js';
import { G } from './state.js';
import { input, getStick, padHeld, rumble, neutralStick } from '../core/input.js';
import { settings } from '../core/settings.js';
import { sfx, setEngine } from '../core/audio.js';
import { comms } from '../ui/comms.js';
import { keyLabel } from '../ui/keys.js';
import { stationCollide, DOCK, DECK_TOP, DECK_END } from './station.js';
import { spawnBullet, launchMissile, deployFlares } from './weapons.js';
import { explode, engineTrail, fire, addShake, sparks, flash, smokePuff, shockwave } from './effects.js';
import { resetGates, hideGates } from './launch.js';
import { asteroidHit } from './asteroids.js';
import { clamp, rand, fwdOf, UP, smooth } from '../core/util.js';

/** Performances de vol (m/s, m/s²). */
export const SPD = { cruise: 320, boost: 720, main: 130, boostAcc: 330, retro: 165, retroBoost: 420, reverseMax: 160, lat: 55, latMax: 95, vr: 80 };

export const player = {
  obj: null, vel: new THREE.Vector3(), av: new THREE.Vector3(), radius: 5, hull: 100, shield: 100, shieldT: 0, heat: 0, overheat: false,
  ammo: 1200, missiles: 6, flares: 4, boost: 100, throttle: 0, fa: true, alive: false, lives: 3, gunIdx: 0, fireCd: 0, missileCd: 0, flareCd: 0,
  lock: 0, target: null, thr: 0, g: 0, docked: false, lastVel: new THREE.Vector3(), odT: 0, dockT: 0, invulnT: 0, hitT: 99,
  boosting: false, S: {}, pos: null, bubble: null, lockBeepT: 0, alarmT: 0, noMissileT: 0, deathPos: new THREE.Vector3(),
  gear: 1, accF: 0, lastFwd: 0, vis: { power: 0, boost: 0, retro: 0, rcs: {} }, autoLaunch: false, rockT: 0, inp: { pitch: 0, yaw: 0, roll: 0 },
};

export function refreshStats() {
  const u = G.up, n = k => u[k] || 0, sh = shipDef(), lo = current();
  const dmgK = Math.pow(1.2, n('dmg')), coolK = Math.pow(0.75, n('cool')), rofK = 1 + 0.15 * n('rof');
  const W = { cannon: { dmg: 12, heat: 3.1, cd: 0.072 }, plasma: { dmg: 46, heat: 12, cd: 0.32 }, laser: { dmg: 110, heat: 34, cd: 0 } }[lo.weapon] || { dmg: 12, heat: 3.1, cd: 0.072 };
  const B = { afterburner: { speed: 720, acc: 330, drain: 22 }, fusion: { speed: 570, acc: 250, drain: 6 }, dash: { speed: 720, acc: 330, drain: 0 } }[lo.boost] || { speed: 720, acc: 330, drain: 22 };
  player.S = {
    weapon: lo.weapon, boostType: lo.boost, ability: lo.ability, speed: sh.speed,
    maxHull: sh.hull + 25 * n('hull'), maxShield: sh.shield + 25 * n('shield'), shieldRegen: 7 * (1 + 0.4 * n('shield')), shieldDelay: 3.5 - 0.5 * n('shield'),
    gunDmg: W.dmg * dmgK, heat: W.heat * coolK, fireCd: W.cd / rofK, guns: Math.max(sh.guns, n('gun3') ? 3 : 2),
    maxMissiles: sh.missiles + 2 * n('missiles'), lockTime: 1.3 * Math.pow(0.65, n('lock')), splash: 1 + 0.4 * n('splash'), salvo: n('salvo') > 0,
    maxBoost: 100 * sh.boost * (1 + 0.35 * n('boost')), boostRegen: 9 * (1 + 0.3 * n('boost')), agility: sh.agility * (1 + 0.15 * n('agility')),
    boostSpeed: B.speed * sh.speed, boostAcc: B.acc, boostDrain: B.drain,
    magnet: n('magnet') ? 380 : 0, maxFlares: sh.flares + 2 * n('flares'), regen: 1.4 * n('regen'),
  };
}
refreshStats();

let landingLight = null, muzzleLight = null;
export function initPlayer() {
  const lo = current(), pt = PAINTS[lo.paint] || PAINTS.orion; setPaint(pt.hull, pt.accent);
  player.obj = buildShip(lo.ship); player.obj.userData.shipId = lo.ship; player.pos = player.obj.position; player.obj.visible = false; R.scene.add(player.obj);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.ShaderMaterial({
    uniforms: { hit: { value: 0 }, dir: { value: new THREE.Vector3(0, 0, -1) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vL; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition-wp.xyz; vL = normalize(position); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float hit; uniform vec3 dir; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN), normalize(vV))), 2.5); float spot = pow(max(dot(vL, dir),0.0), 6.0);
        float a = (f*0.6 + spot*1.6)*hit; gl_FragColor = vec4(vec3(0.4,0.8,1.6)*a, a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  bubble.visible = false; player.obj.add(bubble); player.bubble = bubble;
  // phare d'atterrissage (lumière réelle, éteinte train rentré)
  landingLight = new THREE.SpotLight(0xfff4e0, 0, 260, 0.45, 0.5, 2);
  landingLight.position.set(0, -1.2, -6); landingLight.target.position.set(0, -12, -60);
  player.obj.add(landingLight, landingLight.target);
  muzzleLight = new THREE.PointLight(0xffd08a, 0, 40, 2); muzzleLight.position.set(0, 0, -6); player.obj.add(muzzleLight);
}

/** Change de vaisseau et/ou de livrée (hangar) : reconstruit le modèle et y raccroche bulle et lumières. */
export function applyLoadout() {
  const lo = current(), pt = PAINTS[lo.paint] || PAINTS.orion; setPaint(pt.hull, pt.accent);
  refreshStats();
  if (player.obj.userData.shipId === lo.ship) return;
  const old = player.obj, nw = buildShip(lo.ship); nw.userData.shipId = lo.ship;
  nw.position.copy(old.position); nw.quaternion.copy(old.quaternion); nw.visible = old.visible;
  nw.add(player.bubble, landingLight, landingLight.target, muzzleLight);
  R.scene.remove(old); R.scene.add(nw);
  player.obj = nw; player.pos = nw.position; player.gear = 1; setGear(nw, 1, 0.3);
}

export function resetPlayerForGame() {
  const p = player; p.lives = G.diff.lives; p.fa = true; p.odT = 0; refreshStats();
}

/* ---------- Départ au sol ---------- */
const PARK_Z = 48;
export function prepareLaunch(first = false) {
  const p = player, S = p.S;
  p.pos.set(0, DECK_TOP + GEAR_HEIGHT, PARK_Z); p.obj.quaternion.setFromAxisAngle(UP, Math.PI); p.vel.set(0, 0, 0); p.av.set(0, 0, 0);
  p.hull = S.maxHull; p.shield = S.maxShield; p.heat = 0; p.overheat = false; p.ammo = 1200; p.missiles = S.maxMissiles; p.flares = S.maxFlares;
  p.boost = S.maxBoost; p.throttle = 0; p.lock = 0; p.target = null; p.odT = 0; p.hitT = 99; p.accF = 0; p.lastFwd = 0;
  p.alive = true; p.obj.visible = true; p.lastVel.set(0, 0, 0); p.docked = false; p.gear = 1; p.autoLaunch = false;
  setGear(p.obj, 1, 0.3);
  G.launchT = 0; G.state = 'launch'; G.hudBoot = 0; prevNozOk = false; input.steer = false;
  resetGates();
  const total = G.diff.lives, kw = keyLabel('KeyW');
  comms(first
    ? `Vaisseau ${total - p.lives + 1} sur ${total} sur le pont d'envol. Mettez les gaz (${kw}), décollage à ${SPD.vr} m/s, puis suivez les balises.`
    : `Vaisseau de réserve sur le pont. Gaz (${kw}) et retour au combat !`);
}
export function skipLaunch() { if (G.state === 'launch') player.autoLaunch = true; }

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _to = new THREE.Vector3(), _back = new THREE.Vector3(), _n = new THREE.Vector3();
const prevNoz = [new THREE.Vector3(), new THREE.Vector3()], _np = new THREE.Vector3();
let prevNozOk = false;
/** Émission répartie entre la position précédente et actuelle de chaque tuyère : traînée continue qui épouse la trajectoire. */
function emitEngines(dt, power, boost) {
  const p = player, q = p.obj.quaternion, engines = p.obj.userData.engines;
  fwdOf(p.obj, _back).negate();
  const step = boost ? 1.6 : 2.4;
  while (prevNoz.length < engines.length) prevNoz.push(new THREE.Vector3());
  engines.forEach((en, j) => {
    _w.copy(en).applyQuaternion(q).add(p.pos);
    const prev = prevNoz[j], d = prevNozOk ? prev.distanceTo(_w) : 0;
    if (!prevNozOk || d > 80) prev.copy(_w);
    const n = Math.min(40 / Math.max(1, engines.length / 2), Math.max(1, Math.ceil(Math.max(d / step, dt * (25 + power * 35)) * R.fxScale)));
    for (let i = 0; i < n; i++) {
      _np.lerpVectors(prev, _w, (i + Math.random()) / n);
      engineTrail(_np, _back, p.vel, boost ? 0.9 : 0.45, boost ? 1.1 : 0.7, 1.7, power, boost ? 0.7 : 0.45, boost ? 1.3 : 1);
    }
    prev.copy(_w);
  });
  prevNozOk = true;
}
export function resetTrails() { prevNozOk = false; }
const _lq = new THREE.Quaternion(), _px = new THREE.Vector3(1, 0, 0);
export function updateLaunch(dt) {
  const p = player, k = input.keys, ax = input.ax, padOn = !!input.pad;
  G.launchT += dt;
  const thrUp = k.KeyW || p.autoLaunch || (padOn && (ax.ry < -0.3 || ax.rt > 0.3)), thrDn = k.KeyS || (padOn && ax.ry > 0.3);
  if (thrUp) p.throttle = Math.min(1, p.throttle + 0.6 * dt);
  if (thrDn) p.throttle = Math.max(0, p.throttle - 0.9 * dt);
  const boosting = p.boosting = (k.ShiftLeft || k.ShiftRight || (padOn && padHeld(5))) && p.boost > 1;
  if (boosting) p.boost = Math.max(0, p.boost - 22 * dt);
  const a = (p.throttle > 0 ? 8 + p.throttle * 42 : 0) + (boosting ? 70 : 0);
  let v = p.vel.z + a * dt;
  if (a === 0) v = Math.max(0, v - 25 * dt);
  p.vel.set(0, 0, v); p.pos.z += v * dt;
  // roulage : vibrations, train comprimé, le nez se cabre à l'approche de la vitesse de rotation
  const rough = Math.min(1, v / 40), rot = smooth(SPD.vr * 0.6, SPD.vr, v);
  p.pos.y = DECK_TOP + GEAR_HEIGHT + Math.sin(G.launchT * 71) * 0.035 * rough + rot * 0.6;
  p.obj.quaternion.setFromAxisAngle(UP, Math.PI).multiply(_lq.setFromAxisAngle(_px, rot * 0.07));
  setGear(p.obj, 1, 0.3 + Math.sin(G.launchT * 53) * 0.08 * rough);
  p.thr = 0.12 + p.throttle * 0.9 + (boosting ? 0.6 : 0);
  p.vis.power = p.thr; p.vis.boost = boosting ? 1 : 0; p.vis.retro = thrDn && v > 1 ? 0.7 : 0;
  for (const key in p.vis.rcs) p.vis.rcs[key] = 0;
  emitEngines(dt, p.thr, boosting);
  if (v > 5 && Math.random() < dt * 20 * rough) for (const s of [-1, 1]) smokePuff(_w.set(s * 2.1, DECK_TOP + 0.3, p.pos.z + 2), _v.set(s * 4, 2, -v * 0.3), 1.2, 0.8, 0.25, 0.25);
  setEngine(0.2 + p.throttle * 0.8, boosting ? 0.8 : 0);
  p.accF = a; p.lastFwd = v;
  if ((p.pos.z > 140 && v >= SPD.vr) || p.pos.z > DECK_END - 6) liftoff(v);
}
function liftoff(v) {
  const p = player;
  G.state = 'flight'; input.steer = true; neutralStick();
  p.vel.set(0, 7, Math.max(v, 40)).applyAxisAngle(UP, 0);
  p.throttle = Math.max(0.8, clamp(v / SPD.cruise, 0, 1)); p.invulnT = 2.5; p.gear = 1;
  sfx('launch'); sfx('clang', 0.5); addShake(0.35); rumble(0.7, 0.4, 350);
  comms('Décollage ! Train rentré. Suivez les balises jusqu\'au combat.', 'good');
}

const _lv = new THREE.Vector3(), _tq = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _e = new THREE.Euler(), _prev = new THREE.Vector3();
export function updatePlayer(dt) {
  const p = player, q = p.obj.quaternion, S = p.S, k = input.keys, ax = input.ax, padOn = !!input.pad;
  // orientation
  let pitch = 0, yaw = 0;
  const st = getStick(R.W, R.H), dz = input.locked ? 0.04 : 0.06;
  const sh = v => Math.sign(v) * Math.pow(clamp((Math.abs(v) - dz) / (1 - dz), 0, 1), 1.25);
  pitch = -sh(st.y); yaw = -sh(st.x);
  if (k.ArrowUp) pitch += 1; if (k.ArrowDown) pitch -= 1; if (k.ArrowLeft) yaw += 1; if (k.ArrowRight) yaw -= 1;
  let roll = (k.KeyQ ? 1 : 0) - (k.KeyE ? 1 : 0);
  if (padOn) { pitch -= ax.ly; yaw -= ax.lx; roll -= ax.rx; }
  pitch = clamp(pitch, -1, 1) * (settings.invertPitch ? -1 : 1); yaw = clamp(yaw, -1, 1); roll = clamp(roll, -1, 1);
  p.inp.pitch = pitch; p.inp.yaw = yaw; p.inp.roll = roll;
  // rotation pilotée par les propulseurs d'attitude : accélération angulaire limitée → inertie perceptible
  const A = S.agility, want = _v.set(pitch * 1.3 * A, yaw * 0.9 * A, roll * 1.35 * A), acc = 4.2 * A * dt, accR = 2.3 * A * dt;
  p.av.x += clamp(want.x - p.av.x, -acc, acc); p.av.y += clamp(want.y - p.av.y, -acc, acc); p.av.z += clamp(want.z - p.av.z, -accR, accR);
  const rcsLoad = (Math.abs(want.x - p.av.x) + Math.abs(want.y - p.av.y) + Math.abs(want.z - p.av.z) * 1.5);
  if (rcsLoad > 0.25) sfx('rcs', Math.min(1, rcsLoad * 0.6));
  _tq.setFromEuler(_e.set(p.av.x * dt, p.av.y * dt, p.av.z * dt, 'XYZ')); q.multiply(_tq).normalize();
  // translation
  const wantBoost = k.ShiftLeft || k.ShiftRight || (padOn && padHeld(5));
  const thrUp = k.KeyW || (padOn && ax.ry < -0.3), thrDn = k.KeyS || (padOn && ax.ry > 0.3);
  // postcombustion inversée : Maj + S → rétrofusées à pleine puissance (freinage brutal, marche arrière)
  let retroBoost = wantBoost && thrDn && p.boost > 1;
  let boosting = wantBoost && !thrDn && p.boost > 1;
  let dashKick = 0;
  if (S.boostType === 'dash') {
    // propulseur à impulsions : un appui = un bond de vitesse (avant, ou freinage avec S)
    p.dashCharges = Math.min(3, (p.dashCharges ?? 3) + dt / 3.5);
    if (wantBoost && !p.prevWant && p.dashCharges >= 1) {
      p.dashCharges -= 1; dashKick = thrDn ? 1 : -1; p.dashT = 0.9; p.dashDir = dashKick;
      sfx(thrDn ? 'retroOn' : 'boostOn'); G.fovKick = thrDn ? -6 : 9; addShake(0.35); rumble(0.7, 0.9, 260);
      fwdOf(p.obj, _back).negate(); shockwave(_w.copy(p.pos).addScaledVector(_back, thrDn ? -9 : 9), 34, 0x9cc8ff, 0.4);
    }
    p.dashT = Math.max(0, (p.dashT || 0) - dt);
    boosting = p.dashT > 0 && p.dashDir < 0; retroBoost = p.dashT > 0 && p.dashDir > 0;
    p.boost = p.dashCharges / 3 * S.maxBoost;
    p.boosting = boosting; p.retroBoosting = retroBoost;
  }
  p.prevWant = wantBoost;
  if (S.boostType !== 'dash' && boosting && !p.boosting) { sfx('boostOn'); G.fovKick = Math.max(G.fovKick || 0, 7); addShake(0.25); rumble(0.5, 0.8, 300); fwdOf(p.obj, _back).negate(); shockwave(_w.copy(p.pos).addScaledVector(_back, 9), 30, 0x9cc8ff, 0.4); }
  if (S.boostType !== 'dash') {
    if (retroBoost && !p.retroBoosting) { sfx('retroOn'); G.fovKick = Math.min(G.fovKick || 0, -5); addShake(0.3); rumble(0.8, 0.4, 300); }
    p.retroBoosting = retroBoost; p.boosting = boosting;
    if (boosting || retroBoost) p.boost = Math.max(0, p.boost - (retroBoost ? S.boostDrain * 1.2 : S.boostDrain) * dt); else p.boost = Math.min(S.maxBoost, p.boost + S.boostRegen * dt);
  }
  let sx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), sy = (k.KeyR ? 1 : 0) - (k.KeyF ? 1 : 0);
  if (padOn) { sx += (padHeld(15) ? 1 : 0) - (padHeld(14) ? 1 : 0); sy += (padHeld(12) ? 1 : 0) - (padHeld(13) ? 1 : 0); }
  sx = clamp(sx, -1, 1); sy = clamp(sy, -1, 1);
  _iq.copy(q).invert(); _lv.copy(p.vel).applyQuaternion(_iq);
  const cruise = SPD.cruise * S.speed, dashing = S.boostType === 'dash' && p.dashT > 0;
  const main = (boosting ? S.boostAcc : SPD.main) * (0.85 + 0.15 * S.speed), retro = retroBoost ? SPD.retroBoost : SPD.retro, lat = SPD.lat * S.agility;
  if (dashKick) _lv.z += dashKick * 300;
  let thrustMag = 0, retroMag = 0;
  if (p.fa) {
    const rate = padOn && (ax.ry < -0.3 || ax.ry > 0.3) ? 0.7 * Math.abs(ax.ry) : 0.7;
    if (thrUp) p.throttle = Math.min(1, p.throttle + rate * dt);
    if (thrDn) p.throttle = Math.max(0, p.throttle - rate * 1.6 * dt);
    const tz = dashing ? _lv.z : boosting ? -S.boostSpeed : retroBoost ? SPD.reverseMax : -p.throttle * cruise, tx = sx * SPD.latMax, ty = sy * SPD.latMax;
    const dx = clamp(tx - _lv.x, -lat * dt, lat * dt), dy = clamp(ty - _lv.y, -lat * dt, lat * dt);
    const dzv = tz - _lv.z, dzz = dzv < 0 ? Math.max(dzv, -main * dt) : Math.min(dzv, retro * dt);
    _lv.x += dx; _lv.y += dy; _lv.z += dzz;
    thrustMag = dzz < 0 ? -dzz / (main * dt) : 0; retroMag = dzz > 0 ? dzz / (retro * dt) * (retroBoost ? 1.4 : 0.8) : 0;
    thrustMag = Math.max(thrustMag, -_lv.z / cruise * 0.35, dashing && p.dashDir < 0 ? 1.4 : 0);
  } else {
    if (thrUp || boosting) { _lv.z -= main * dt; thrustMag = boosting ? 1.6 : 1; }
    if (thrDn) { _lv.z += retro * dt; retroMag = retroBoost ? 1.4 : 0.8; }
    _lv.x += sx * lat * dt; _lv.y += sy * lat * dt;
  }
  p.vel.copy(_lv).applyQuaternion(q);
  p.thr = clamp(thrustMag, 0.08, 1) * (boosting ? 1.6 : 1);
  // accélération longitudinale lissée (caméra)
  const fwdSpd = -_lv.z; p.accF += ((fwdSpd - p.lastFwd) / Math.max(dt, 1e-3) - p.accF) * Math.min(1, dt * 5); p.lastFwd = fwdSpd;
  // propulseurs d'attitude
  const R_ = p.vis.rcs, dp = want.x - p.av.x, dyw = want.y - p.av.y, dr = want.z - p.av.z;
  const j = (key, v) => { R_[key] = Math.max(R_[key] || 0, clamp(v, 0, 1)); };
  for (const key in R_) R_[key] *= Math.max(0, 1 - dt * 14);
  j('noseDown', dp * 2 + sy * 0.8); j('noseUp', -dp * 2 - sy * 0.8);
  j('noseR', dyw * 2 - sx * 0.8); j('noseL', -dyw * 2 + sx * 0.8);
  j('rDown', dr * 2 + sy * 0.6); j('lUp', dr * 2 - sy * 0.6); j('rUp', -dr * 2 - sy * 0.6); j('lDown', -dr * 2 + sy * 0.6);
  p.vis.power = p.thr; p.vis.boost = boosting ? 1 : 0; p.vis.retro = Math.min(1.4, retroMag);
  if (retroBoost && retroMag > 0.2) addShake(0.06);
  _prev.copy(p.pos);
  p.pos.addScaledVector(p.vel, dt);
  const gNow = p.vel.distanceTo(p.lastVel) / Math.max(dt, 1e-3) / 9.81; p.g += (gNow - p.g) * Math.min(1, dt * 4); p.lastVel.copy(p.vel);
  // collisions : station et astéroïdes
  if (p.pos.lengthSq() < 330 * 330 && stationCollide(p.pos, 3.5)) {
    const sp = p.vel.length(); p.pos.copy(_prev); p.vel.multiplyScalar(-0.35);
    damagePlayer(Math.max(8, sp * 0.45), null, true); explode(p.pos, p.vel, 4, { color: 0xffd0a0, ring: false }); comms('Collision avec la station !', 'danger', 'Ordinateur de bord');
  }
  p.rockT -= dt; p.rockByT = (p.rockByT || 0) - dt;
  const rock = asteroidHit(p.pos, 4.5);
  if (!rock && p.rockByT <= 0 && p.vel.lengthSq() > 150 * 150) { const near = asteroidHit(p.pos, 50); if (near) { p.rockByT = 1.2; sfx('rockby', 0.9, near.pos); } }
  if (rock) {
    _n.copy(p.pos).sub(rock.pos).normalize();
    const vn = p.vel.dot(_n);
    p.pos.copy(rock.pos).addScaledVector(_n, rock.r + 5);
    if (vn < 0) p.vel.addScaledVector(_n, -1.6 * vn);
    if (p.rockT <= 0) { p.rockT = 0.5; damagePlayer(Math.max(6, -vn * 0.3), null, true); explode(p.pos, ZERO_V, 5, { color: 0xffd0a0, ring: false }); comms('Collision avec un astéroïde !', 'danger', 'Ordinateur de bord'); }
  }
  // armes
  p.fireCd -= dt; p.missileCd -= dt; p.flareCd -= dt; p.invulnT -= dt; p.hitT += dt; p.noMissileT -= dt;
  if (p.odT > 0) p.odT -= dt;
  const trigger = input.mouse.l || k.Space || (padOn && ax.rt > 0.3);
  if (S.weapon === 'laser') {
    const on = trigger && !p.overheat;
    updateLaser(dt, on);
    if (on && p.odT <= 0) p.heat += S.heat * dt * (S.guns > 2 ? 1.25 : 1);
  } else if (trigger && !p.overheat && p.ammo > 0 && p.fireCd <= 0) fireGuns();
  p.heat = Math.max(0, p.heat - 24 * dt);
  if (p.heat >= 100 && !p.overheat) { p.overheat = true; comms('Canons en surchauffe : refroidissement.', 'warn', 'Ordinateur de bord'); sfx('alarm', 0.5); }
  if (p.overheat && p.heat < 35) p.overheat = false;
  // boucliers et nanorobots
  p.shieldT -= dt; if (p.shieldT <= 0) p.shield = Math.min(S.maxShield, p.shield + S.shieldRegen * dt);
  if (S.regen && p.hitT > 4) p.hull = Math.min(S.maxHull, p.hull + S.regen * dt);
  const bu = p.bubble.material.uniforms.hit; bu.value = Math.max(0, bu.value - dt * 2.5); p.bubble.visible = bu.value > 0.01 && G.camMode === 'chase';
  // verrouillage
  const t = p.target;
  if (t && !t.dead) {
    _to.copy(t.pos).sub(p.pos); const d = _to.length(), ang = fwdOf(p.obj, _f).angleTo(_to);
    const was = p.lock;
    if (ang < 0.22 && d < 5000) p.lock = Math.min(1, p.lock + dt / S.lockTime); else p.lock = Math.max(0, p.lock - dt * 1.5);
    if (p.lock >= 1 && was < 1) sfx('lock');
    if (p.lock > 0 && p.lock < 1) { p.lockBeepT -= dt; if (p.lockBeepT <= 0) { sfx('beep', 0.5); p.lockBeepT = 0.2 * (1.2 - p.lock); } }
  } else { p.lock = 0; if (t && t.dead) p.target = null; }
  // ravitaillement devant le hangar (le train sort automatiquement à l'approche lente)
  const wasDocked = p.docked, spd = p.vel.length();
  p.docked = p.pos.distanceTo(DOCK) < 110 && spd < 30;
  if (p.docked) {
    p.hull = Math.min(S.maxHull, p.hull + 14 * dt); p.shield = Math.min(S.maxShield, p.shield + 30 * dt);
    p.ammo = Math.min(1200, p.ammo + 300 * dt); p.boost = Math.min(S.maxBoost, p.boost + 30 * dt); p.heat = 0;
    p.dockT += dt;
    if (p.dockT > 1.4 && (p.missiles < S.maxMissiles || p.flares < S.maxFlares)) { if (p.missiles < S.maxMissiles) p.missiles++; if (p.flares < S.maxFlares) p.flares++; p.dockT = 0; sfx('dock', 0.6); }
    if (!wasDocked) comms('Faisceau de ravitaillement accroché. Restez en position.');
    if (Math.random() < dt * 40) { // faisceau tracteur
      _w.set(rand(-20, 20), rand(-20, 20), 80); _v.copy(p.pos).sub(_w).multiplyScalar(rand(0.8, 1.2));
      fire.emit(_w.x, _w.y, _w.z, _v.x, _v.y, _v.z, 1, 1.4, 0.6, 0.6, 1.4, 2.4, 0.2, 0.5, 1, 0.8, 0);
    }
  } else p.dockT = 0;
  const gearWanted = (p.pos.distanceTo(DOCK) < 280 && spd < 45) ? 1 : 0;
  if (gearWanted !== p.gearWanted) { if (p.gearWanted !== undefined && G.time > 1) sfx('clang', 0.25); p.gearWanted = gearWanted; }
  // alarmes
  if (p.hull < S.maxHull * 0.3) { p.alarmT -= dt; if (p.alarmT <= 0) { sfx('alarm', 0.6); p.alarmT = 1.2; } }
  emitEngines(dt, p.thr, boosting);
  setEngine(clamp(Math.max(p.thr, retroMag * 0.8), 0, 1.6) * 0.8 + 0.12 + Math.min(0.3, spd / 2400), boosting || retroBoost ? 1 : 0);
}
const ZERO_V = new THREE.Vector3();

/** Animations du vaisseau (chaque image) : train, flammes, propulseurs, feux, missiles. */
const _rd = new THREE.Vector3();
export function updateShipVisuals(dt, time) {
  const p = player; if (!p.obj || !p.alive) return;
  if (muzzleLight) muzzleLight.intensity *= Math.max(0, 1 - dt * 30);
  const target = G.state === 'launch' ? 1 : (p.gearWanted || 0);
  if (G.state !== 'launch' && dt > 0) {
    p.gear += clamp(target - p.gear, -dt * 0.75, dt * 0.75);
    setGear(p.obj, p.gear, 0);
  }
  landingLight.intensity = p.gear > 0.9 ? 700 : 0;
  animateShip(p.obj, { power: p.vis.power, boost: p.vis.boost, retro: p.vis.retro, rcs: p.vis.rcs, time, missiles: Math.min(p.obj.userData.parts.missiles.length, p.missiles) });
  // bouffées des propulseurs d'attitude
  if (dt > 0 && G.state === 'flight') {
    const dirs = p.obj.userData.rcsDirs, parts = p.obj.userData.parts.rcs;
    for (const key in p.vis.rcs) {
      if (p.vis.rcs[key] < 0.35 || Math.random() > dt * 30) continue;
      _w.copy(parts[key].position).applyQuaternion(p.obj.quaternion).add(p.pos);
      _rd.set(...dirs[key]).applyQuaternion(p.obj.quaternion).multiplyScalar(18).add(p.vel);
      smokePuff(_w, _rd, 0.5, 0.5, 0.6, 0.3);
    }
  }
}

function fireGuns() {
  const p = player, S = p.S, f = fwdOf(p.obj, _f), od = p.odT > 0, q = p.obj.quaternion, guns = p.obj.userData.guns, plasma = S.weapon === 'plasma';
  const shots = S.guns >= 3 ? [p.gunIdx, 2] : [p.gunIdx];
  p.gunIdx = 1 - p.gunIdx;
  _to.copy(p.pos).addScaledVector(f, plasma ? 500 : 650); // convergence
  for (const gi of shots) {
    const m = _w.copy(guns[gi]).applyQuaternion(q).add(p.pos);
    const dir = _v.copy(_to).sub(m).normalize();
    const sp = plasma ? 0.001 : 0.002;
    dir.x += rand(-sp, sp); dir.y += rand(-sp, sp); dir.z += rand(-sp, sp); dir.normalize();
    const b = spawnBullet('p', m, _back.copy(p.vel).addScaledVector(dir, plasma ? 760 : 1100), S.gunDmg * (od ? 1.5 : 1), od);
    if (plasma) { b.plasma = true; b.life = 3.2; fire.emit(m.x, m.y, m.z, p.vel.x + dir.x * 30, p.vel.y + dir.y * 30, p.vel.z + dir.z * 30, 0.12, 4, 6, 1.2, 3, 1.8, 0.4, 1.2, 0.6, 1, 0); }
    else fire.emit(m.x, m.y, m.z, p.vel.x + dir.x * 40, p.vel.y + dir.y * 40, p.vel.z + dir.z * 40, 0.06, 2.6, 4, 4, 3, 1.6, 2, 1, 0.3, 1, 0);
    if (!plasma) p.ammo--; G.stats.shots++;
    if (!od) p.heat += S.heat * (shots.length > 1 ? 0.7 : 1);
  }
  p.fireCd = S.fireCd * (od ? 0.65 : 1);
  sfx(plasma ? 'plasma' : od ? 'gunOD' : 'gun', 0.7);
  muzzleLight.color.set(plasma ? 0x7dffb0 : 0xffd08a); muzzleLight.intensity = plasma ? 1400 : od ? 900 : 600;
  G.recoil = Math.min(0.6, (G.recoil || 0) + (plasma ? 0.35 : 0.12)); rumble(plasma ? 0.4 : 0.1, 0.25, plasma ? 120 : 60);
}

export function fireMissile() {
  const p = player; if (!p.alive || G.state !== 'flight' || p.missileCd > 0) return;
  if (p.missiles <= 0) { if (p.noMissileT <= 0) { comms('Plus de missiles. Réarmez devant le hangar ou ramassez un caisson.', 'warn', 'Ordinateur de bord'); p.noMissileT = 4; } return; }
  const locked = p.lock >= 1 && p.target && !p.target.dead;
  p.missileCd = 0.6;
  if (locked && p.S.salvo && p.missiles >= 2) { p.missiles -= 2; launchMissile(p.target, -1.6); launchMissile(p.target, 1.6); }
  else { p.missiles--; launchMissile(locked ? p.target : null, 0); }
  if (!locked && p.noMissileT <= 0) { comms('Missile tiré sans verrouillage : trajectoire balistique.', 'warn', 'Ordinateur de bord'); p.noMissileT = 5; }
}
export function fireFlares() {
  const p = player; if (!p.alive || G.state !== 'flight' || p.flareCd > 0) return;
  if (p.flares <= 0) { comms('Plus de leurres. Réarmez devant le hangar.', 'warn', 'Ordinateur de bord'); return; }
  p.flares--; p.flareCd = 1.2; deployFlares();
}

export function damagePlayer(d, fromDir, collision = false) {
  const p = player; if (!p.alive || G.state !== 'flight' || p.invulnT > 0) return;
  p.shieldT = p.S.shieldDelay; p.hitT = 0; G.stats.damageTaken += d; G.waveDamage = (G.waveDamage || 0) + d;
  if (fromDir && fromDir.lengthSq() > 0) {
    G.dmgDirs.push({ dir: fromDir.clone().normalize(), t: 1.2 }); if (G.dmgDirs.length > 6) G.dmgDirs.shift();
    p.bubble.material.uniforms.dir.value.copy(fromDir).normalize().applyQuaternion(_iq.copy(p.obj.quaternion).invert());
  }
  if (p.shield > 0 && !collision) {
    const s = Math.min(p.shield, d); p.shield -= s; d -= s; G.shieldFxT = 0.35;
    p.bubble.material.uniforms.hit.value = 1; sfx('shieldHit', 0.7);
    if (p.shield <= 0) { sfx('shieldDown'); comms('Boucliers à zéro !', 'danger', 'Ordinateur de bord'); }
  }
  if (d > 0) {
    p.hull -= d; addShake(0.25 + Math.min(1, d / 30)); G.hurtT = 0.5; sfx('hurt', 0.8); rumble(0.8, 0.6, 220);
    sparks(p.pos, p.vel, 0xffb070, 10, 40, 0.6);
  }
  if (p.hull <= 0) killPlayer();
}

export function killPlayer() {
  const p = player; p.alive = false; p.obj.visible = false; p.hull = 0;
  p.deathPos.copy(p.pos);
  explode(p.pos, p.vel, 24, { color: 0xffb070, debrisN: 12 });
  flash(p.pos, 120, 0xffffff, 0.3);
  p.lives--; G.stats.deaths++; G.state = 'dead'; G.deadT = 4; setEngine(0); hideGates();
  G.timeScale = 0.35; G.slowT = 0.9;
  comms(p.lives > 0 ? `Vaisseau perdu. Éjection réussie. Un vaisseau de réserve est préparé (${p.lives} restant${p.lives > 1 ? 's' : ''}).` : 'Dernier vaisseau perdu.', 'danger');
  p.target = null; p.lock = 0; p.odT = 0;
}

/* ---------- Ciblage ---------- */
export function targetBoresight() {
  const f = fwdOf(player.obj, _f); let best = null, ba = 0.6;
  for (const h of G.targets) { if (h.dead) continue; _to.copy(h.pos).sub(player.pos); if (_to.length() > 15000) continue; const a = f.angleTo(_to); if (a < ba) { ba = a; best = h; } }
  if (best) setTarget(best); else sfx('beep', 0.4);
}
export function targetCycle() {
  const list = G.targets.filter(h => !h.dead).sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));
  if (!list.length) return; const i = list.indexOf(player.target); setTarget(list[(i + 1) % list.length]);
}
export function targetTorpedo() {
  const list = G.torps.filter(t => !t.dead).sort((a, b) => a.eta - b.eta);
  if (list.length) setTarget(list[0]); else comms('Aucune torpille en vol.', '', 'Ordinateur de bord');
}
function setTarget(t) { if (player.target !== t) player.lock = 0; player.target = t; sfx('beep'); }

/** Écran titre : le vaisseau tourne autour de la station. */
export function updateMenuShip(dt, time) {
  const p = player, a = time * 0.1, r = 560;
  p.obj.visible = true;
  p.pos.set(Math.cos(a) * r, 70 + Math.sin(a * 2.3) * 25, Math.sin(a) * r + 40);
  p.obj.lookAt(p.pos.x - Math.sin(a), p.pos.y, p.pos.z + Math.cos(a)); p.obj.rotateY(Math.PI); p.obj.rotateZ(-0.45);
  p.vel.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(r * 0.1);
  if (p.gear !== 0) { p.gear = 0; setGear(p.obj, 0); }
  animateShip(p.obj, { power: 0.75, boost: 0, retro: 0, rcs: {}, time, missiles: p.obj.userData.parts.missiles.length });
  if (dt > 0) emitEngines(dt, 0.75, false);
}

/** Hangar : vaisseau posé sur le pont, réacteurs au ralenti. */
export function placeInHangar() {
  const p = player;
  p.pos.set(0, DECK_TOP + GEAR_HEIGHT, PARK_Z); p.obj.quaternion.setFromAxisAngle(UP, Math.PI); p.vel.set(0, 0, 0);
  p.obj.visible = true; p.gear = 1; setGear(p.obj, 1, 0.3); refreshStats();
}
export function updateHangarShip(time) {
  const p = player;
  animateShip(p.obj, { power: 0.12 + 0.03 * Math.sin(time * 3), boost: 0, retro: 0, rcs: {}, time, missiles: p.obj.userData.parts.missiles.length });
  if (landingLight) landingLight.intensity = 700;
}
