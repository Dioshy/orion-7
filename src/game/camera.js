// Caméras : poursuite souple, cockpit, caméra de mort, plans cinématiques du menu et de fin.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { G } from './state.js';
import { player } from './player.js';
import { settings } from '../core/settings.js';
import { randUnit, damp, clamp, smooth } from '../core/util.js';
import { updateCockpit, EYE } from '../render/cockpit.js';

const CHASE = new THREE.Vector3(0, 5.4, 25), COCKPIT = new THREE.Vector3(0, 0.95, -2.6);
const camQ = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
let orbitA = 0, lag = new THREE.Vector3(), push = 0, bodyVisible = true;
const _e2 = new THREE.Vector3();
let snapNext = false;
/** La prochaine image place la caméra directement (sans glisser à travers la coque). */
export function snapCamera() { snapNext = true; }
const head = new THREE.Vector3(), headQ = new THREE.Quaternion(), _e = new THREE.Euler(), _iq = new THREE.Quaternion();
import { CK } from '../render/cockpit.js';
function ckShake(v) { CK.camera.position.add(v); }
/** Masque la carlingue extérieure en vue cockpit (les lumières du vaisseau restent actives). */
function setBody(v) {
  if (v === bodyVisible) return; bodyVisible = v;
  for (const ch of player.obj.children) if (!ch.isLight && !(ch.isObject3D && ch.children.some(x => x.isLight) && !ch.isMesh)) ch.visible = v;
}
export function resetCamera() { camQ.copy(player.obj.quaternion); lag.set(0, 0, 0); push = 0; }
/* Intro de décollage : la caméra part devant l'entrée du hangar, survole le vaisseau dans le hangar
   (couloir dégagé, jamais à travers la coque) puis se place derrière lui. */
const intro = { t: 1, dur: 3.2, p0: new THREE.Vector3(9, -8, 165), p1: new THREE.Vector3(14, -9, 66) };
const _ip = new THREE.Vector3(), _it = new THREE.Vector3(), _inq = new THREE.Quaternion(), _cq = new THREE.Quaternion();
export function startIntro(dur = 3.2) { intro.t = 0; intro.dur = dur; blend.t = 1; }
/* Transition : on part de la pose actuelle de la caméra et on rejoint la nouvelle en douceur. */
const blend = { t: 1, dur: 1, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 70 };
export function cameraTransition(dur = 1.4) {
  const cam = R.camera; blend.t = 0; blend.dur = dur; blend.pos.copy(cam.position); blend.quat.copy(cam.quaternion); blend.fov = cam.fov;
}

export function updateCamera(rdt, dt) {
  const cam = R.camera, p = player;
  const st = (G.state === 'paused' || G.state === 'upgrade') ? G.prevState : G.state;
  let fov = settings.fov;
  if (import.meta.env.DEV && st === 'studio' && window.__orion?.studio) { // vue d'atelier (développement)
    const v = window.__orion.studio; cam.position.set(v.x, v.y, v.z); cam.lookAt(p.pos); cam.fov = 38; cam.updateProjectionMatrix(); return;
  }
  if (st === 'hangar') {
    const a = performance.now() * 0.00016, r = p.obj.userData.shipId === 'rempart' ? 18 : 15.5;
    _v.set(Math.sin(a) * r, 4.5 + Math.sin(a * 0.7) * 1.5, Math.cos(a) * r).add(p.pos);
    if (snapNext) { cam.position.copy(_v); cam.fov = 50; snapNext = false; } else cam.position.lerp(_v, 1 - Math.exp(-(rdt || 0.016) * 3));
    cam.lookAt(_w.copy(p.pos).add(_e2.set(0, 0.6, 0))); fov = 50;
    cam.fov = damp(cam.fov, fov, 3, rdt || 0.016); cam.updateProjectionMatrix(); updateCockpit(false); return;
  }
  if (st === 'menu' || st === 'loading') {
    const now = performance.now() / 1000, shot = Math.floor(now / 12) % 3;
    if (shot === 0 || !p.obj.visible) {
      const t = now * 0.05, a = -0.71 + Math.sin(t) * 0.9; // reste du côté éclairé
      cam.position.set(Math.sin(a) * 760, 150 + Math.sin(t * 1.7) * 70, Math.cos(a) * 760 + 60);
      cam.lookAt(0, 0, -40); fov = 52;
    } else if (shot === 1) {
      cam.position.copy(_v.set(16, 4, -34).applyQuaternion(p.obj.quaternion).add(p.pos)); cam.lookAt(_w.copy(p.pos).addScaledVector(p.vel, 0.05)); cam.rotateY(0.3); fov = 48;
    } else {
      cam.position.copy(_v.set(-5, 6, 30).applyQuaternion(p.obj.quaternion).add(p.pos)); cam.lookAt(_w.set(0, -2, -60).applyQuaternion(p.obj.quaternion).add(p.pos)); cam.rotateY(0.32); fov = 60;
    }
  } else if (st === 'launch' || st === 'flight') {
    camQ.slerp(p.obj.quaternion, 1 - Math.exp(-dt * (G.camMode === 'chase' ? 7 : 40)));
    if (G.camMode === 'chase') {
      lag.lerp(_v.copy(p.vel).multiplyScalar(-0.006), 1 - Math.exp(-dt * 3));
      // la caméra recule quand on accélère, se rapproche quand on freine
      push = damp(push, clamp(p.accF * 0.035, -6, 11), 4, dt);
      const spdK = smooth(150, 720, p.vel.length());
      _w.set(0, CHASE.y - spdK * 1.2 + push * 0.12, CHASE.z + push + spdK * 3);
      cam.position.copy(_w).applyQuaternion(camQ).add(p.pos).add(lag);
      cam.quaternion.copy(camQ); cam.rotateZ(p.av.y * 0.07 - p.av.z * 0.025);
      if (G.recoil > 0) cam.position.addScaledVector(_v.set(0, 0, 1).applyQuaternion(camQ), G.recoil * 0.6);
    } else {
      // tête du pilote : poussée en arrière à l'accélération, penchée dans les virages
      head.set(clamp(-p.av.y * 0.025, -0.05, 0.05), clamp(-p.av.x * 0.015, -0.03, 0.03), clamp(p.accF * 0.0005, -0.05, 0.08));
      headQ.setFromEuler(_e.set(-p.av.x * 0.012, -p.av.y * 0.015, p.av.z * 0.02));
      cam.position.copy(EYE).add(head).applyQuaternion(p.obj.quaternion).add(p.pos);
      cam.quaternion.copy(p.obj.quaternion).multiply(headQ);
    }
    p.obj.visible = p.alive;
    setBody(G.camMode === 'chase' || intro.t < 1);
    fov += (G.camMode === 'cockpit' ? 12 : 0) + (16 * smooth(120, 720, p.vel.length()) + (p.boosting ? 5 : 0) + (G.fovKick || 0)) * (G.camMode === 'cockpit' ? 0.5 : 1);
    if (dt > 0) { G.fovKick = damp(G.fovKick || 0, 0, 5, dt); G.recoil = damp(G.recoil || 0, 0, 14, dt); }
    const rum = (p.boosting ? 0.07 : 0) + 0.05 * smooth(400, 720, p.vel.length()) + (st === 'launch' ? 0.04 * smooth(5, 70, p.vel.length()) : 0);
    if (rum > 0 && dt > 0) cam.position.add(randUnit(_v).multiplyScalar(rum * settings.shake));
  } else if (st === 'dead') {
    orbitA += dt * 0.35;
    const r = 70 + (4 - G.deadT) * 18;
    _v.set(Math.sin(orbitA) * r, 20 + (4 - G.deadT) * 6, Math.cos(orbitA) * r).add(p.deathPos);
    cam.position.lerp(_v, 1 - Math.exp(-rdt * 2));
    cam.lookAt(p.deathPos);
  } else if (st === 'over' || st === 'victory') {
    orbitA += rdt * 0.06;
    _v.set(Math.sin(orbitA) * 1100, 260, Math.cos(orbitA) * 1100);
    cam.position.lerp(_v, 1 - Math.exp(-rdt * 0.8));
    _w.set(0, 0, 0); cam.lookAt(_w); fov = 55;
  }
  cam.fov = damp(cam.fov, fov, 3, rdt || 0.016);
  if (intro.t < 1 && (st === 'launch' || st === 'flight')) {
    intro.t = Math.min(1, intro.t + (rdt || 0.016) / intro.dur);
    const k = intro.t < 0.5 ? 2 * intro.t * intro.t : 1 - Math.pow(-2 * intro.t + 2, 2) / 2; // accélère puis ralentit
    const u = 1 - k;
    _ip.copy(intro.p0).multiplyScalar(u * u).addScaledVector(intro.p1, 2 * u * k).addScaledVector(cam.position, k * k);
    _cq.copy(cam.quaternion);
    _it.copy(p.pos).add(_v.set(0, 1, 0)); cam.position.copy(_ip); cam.lookAt(_it); _inq.copy(cam.quaternion);
    cam.quaternion.slerpQuaternions(_inq, _cq, smooth(0.7, 1, k));
    cam.fov = fov - 14 * (1 - k);
  }
  if (blend.t < 1) {
    blend.t = Math.min(1, blend.t + (rdt || 0.016) / blend.dur);
    const k = 1 - Math.pow(1 - blend.t, 3); // sortie douce
    cam.position.lerpVectors(blend.pos, cam.position, k); cam.quaternion.slerpQuaternions(blend.quat, cam.quaternion, k);
    cam.fov = blend.fov + (cam.fov - blend.fov) * k;
  }
  cam.updateProjectionMatrix();
  const ck = G.camMode === 'cockpit' && (st === 'flight' || st === 'launch') && p.alive && intro.t >= 1;
  updateCockpit(ck, head, headQ, cam.fov, p.inp);
  if (G.shake > 0.01 && dt > 0) {
    randUnit(_v).multiplyScalar(G.shake * (ck ? 0.15 : 1)); cam.position.add(_v);
    if (ck) { _iq.copy(p.obj.quaternion).invert(); _v.applyQuaternion(_iq); ckShake(_v); }
    G.shake *= Math.exp(-dt * 5);
  }
}
