// Station Orion-7 : modèle, collisions, dégâts visibles et tourelles de défense.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { buildStationModel, glowSprite, pdTurretModel, shadows } from '../render/models.js';
import { G } from './state.js';
import { comms } from '../ui/comms.js';
import { sfx } from '../core/audio.js';
import { firePuff, smokePuff, sparks } from './effects.js';
import { spawnBullet } from './weapons.js';
import { lead, rand, TAU } from '../core/util.js';

export const DOCK = new THREE.Vector3(0, 0, 120);
export const DECK_TOP = -23.5, DECK_END = 282, ARCHES = [130, 180, 230, 280];
export const station = { obj: new THREE.Group(), hp: 1000, maxHp: 1000, ring: null, beacons: [], turrets: [], fires: [], warn: 1, pos: null, hangarLights: null, runway: [], runwayMesh: null, archLights: [] };
station.pos = station.obj.position;

const PD_MOUNTS = [[0, 31, -38], [0, -31, -38], [31, 0, -12], [-31, 0, -12]];

export function initStation() {
  const s = station.obj, { hub, ring } = buildStationModel();
  s.add(hub); s.add(ring); station.ring = ring; shadows(hub); shadows(ring);
  for (const [x, y, z, c] of [[405, 0, -205, 0xff3b2b], [-405, 0, -205, 0x3bff6a], [0, 236, 0, 0xffffff], [0, -236, 0, 0xffffff], [0, 0, -280, 0xffffff], [0, 30, 82, 0xffb347], [0, -30, 82, 0xffb347]]) {
    const b = glowSprite(c, 30, 3, false); b.position.set(x, y, z); (Math.abs(y) > 200 ? ring : s).add(b); station.beacons.push(b);
  }
  // halo du hangar
  const hl = glowSprite(0xbfe4ff, 50, 0.25, false); hl.position.set(0, 0, 84); s.add(hl); station.hangarLights = hl;
  // foyers d'incendie possibles (repère station)
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), onRing = i % 3 === 0;
    const p = onRing ? new THREE.Vector3(Math.cos(a) * 236, Math.sin(a) * 236, rand(-8, 8)) : new THREE.Vector3(Math.cos(a) * 29, Math.sin(a) * 29, rand(-65, 15));
    station.fires.push({ p, onRing, at: rand(0.15, 0.85), n: new THREE.Vector3() });
  }
  // balisage du pont : feux d'axe, feux de bord, feux des portiques
  const zs = []; for (let z = 24; z <= 278; z += 8) zs.push(z);
  const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 1.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), zs.length * 3);
  const m4 = new THREE.Matrix4(); let i = 0;
  for (const z of zs) for (const x of [0, -11, 11]) { m4.makeTranslation(x, DECK_TOP + 0.05, z); lm.setMatrixAt(i, m4); lm.setColorAt(i, new THREE.Color(0, 0, 0)); station.runway.push({ x, z, i }); i++; }
  s.add(lm); station.runwayMesh = lm;
  for (const z of ARCHES) for (const x of [-13.5, 13.5]) { const b = glowSprite(0xffffff, 7, 1, false); b.position.set(x, 13.6, z); s.add(b); station.archLights.push({ s: b, z }); }
  R.scene.add(s);
}

export function resetStation(maxHp) {
  station.maxHp = maxHp; station.hp = maxHp; station.warn = 1;
  for (const t of station.turrets) station.obj.remove(t.obj);
  station.turrets.length = 0;
}

export function addPdTurret() {
  const i = station.turrets.length; if (i >= PD_MOUNTS.length) return;
  const [x, y, z] = PD_MOUNTS[i], obj = pdTurretModel();
  obj.position.set(x, y, z);
  const n = new THREE.Vector3(x, y, 0).normalize();
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  station.obj.add(obj);
  station.turrets.push({ obj, head: obj.userData.head, pos: new THREE.Vector3(x, y, z).addScaledVector(n, 3), cd: 0, burst: 0, target: null });
}

export function stationCollide(p, r) {
  const x = p.x, y = p.y, z = p.z, rho = Math.hypot(x, y);
  if (z > -72 && z < 20 && rho < 30 + r) return true;
  if (z >= 20 && z < 80 && rho < 28 + r && rho > 26 - r) return true;
  const dr = rho - 220; if (dr * dr + z * z < (16 + r) * (16 + r)) return true;
  if (z < -70 && z > -285 && rho < 5 + r) return true;
  // pont d'envol (marge réduite pour pouvoir rouler et décoller au ras du pont)
  if (z > 20 - r && z < DECK_END + r && Math.abs(x) < 12.5 + r && y < DECK_TOP + r * 0.5 && y > -35 - r) return true;
  if (z > 120 - r && z < 290 + r && y > DECK_TOP - 1 && y < 13.5 + r) for (const az of ARCHES) {
    if (Math.abs(z - az) > 0.8 + r) continue;
    if (Math.abs(Math.abs(x) - 13.5) < 0.8 + r || (y > 11.6 - r && Math.abs(x) < 14.3 + r)) return true;
  }
  if (z > -232 - r && z < -178 + r && Math.abs(y) < 1 + r && Math.abs(x) > 28 && Math.abs(x) < 282) return true;
  return false;
}
/** Normale sortante approximative de la partie de station la plus proche (évitement). */
export function stationNormal(p, out) {
  const rho = Math.hypot(p.x, p.y);
  if (Math.abs(rho - 220) < 60 && Math.abs(p.z) < 60) { const k = 220 / (rho || 1); return out.set(p.x - p.x * k, p.y - p.y * k, p.z).normalize(); }
  if (p.z < -170 && Math.abs(p.y) < 40) return out.set(0, Math.sign(p.y) || 1, 0);
  if (p.z > 80 && Math.abs(p.x) < 30 && p.y < 20) return out.set(0, p.y > DECK_TOP ? 1 : -1, 0);
  if (rho < 1) return out.set(0, 0, Math.sign(p.z) || 1);
  return out.set(p.x, p.y, 0).normalize();
}

export function damageStation(d) {
  if (station.hp <= 0 || G.state === 'over') return;
  station.hp = Math.max(0, station.hp - d);
  const f = station.hp / station.maxHp;
  for (const th of [0.75, 0.5, 0.25, 0.1]) if (f < th && station.warn >= th) {
    station.warn = f; comms(`Intégrité de la station : ${Math.round(f * 100)} %. ${th <= 0.25 ? 'Elle ne tiendra plus longtemps !' : 'Tenez-les à distance !'}`, 'danger'); sfx('alarm');
  }
  if (station.hp <= 0 && G.hooks.stationLost) G.hooks.stationLost();
}
export function repairStation(frac) { station.hp = Math.min(station.maxHp, station.hp + station.maxHp * frac); station.warn = Math.max(station.warn, station.hp / station.maxHp); }

const _w = new THREE.Vector3(), _a = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3();
export function updateStation(dt, visDt) {
  station.ring.rotation.z += 0.045 * visDt;
  const t = G.time + performance.now() * 0.0005;
  station.beacons.forEach((b, i) => { const on = ((t + i * 0.35) % 1.6) < 0.25; b.material.opacity = on ? 1 : 0.06; });
  station.hangarLights.material.opacity = 0.4 + 0.2 * Math.sin(t * 3);
  updateRunway(t);
  // dégâts visibles
  const dmg = 1 - station.hp / station.maxHp;
  if (visDt > 0) for (const f of station.fires) if (dmg > f.at) {
    if (f.onRing) _w.copy(f.p).applyAxisAngle(_z.set(0, 0, 1), station.ring.rotation.z); else _w.copy(f.p);
    if (Math.random() < visDt * 14) firePuff(_w, _a.copy(_w).setZ(0).normalize().multiplyScalar(8), 3 + dmg * 4);
    if (Math.random() < visDt * 6) smokePuff(_w, _a.copy(_w).setZ(0).normalize().multiplyScalar(14), 6 + dmg * 8, 4, 0.08, 0.35);
    if (Math.random() < visDt * 0.6) sparks(_w, _a.set(0, 0, 0), 0xffd090, 10, 40, 0.6);
  }
  if (dt > 0) updateTurrets(dt);
}

const _c = new THREE.Color(), AMBER = new THREE.Color(2.4, 1.3, 0.3), GREEN = new THREE.Color(0.4, 2.6, 0.8), CYAN = new THREE.Color(0.6, 1.6, 3), IDLE = new THREE.Color(0.25, 0.4, 0.6);
function updateRunway(t) {
  const st = (G.state === 'paused' || G.state === 'upgrade') ? G.prevState : G.state;
  const launching = st === 'launch', pl = G.player;
  const v = launching && pl ? pl.vel.z : 0, pz = launching && pl ? pl.pos.z : -1e9, ready = v >= 66;
  const head = 24 + ((t * (launching ? 170 : 90)) % 300);
  for (const L of station.runway) {
    if (L.x === 0) {
      const d = (L.z - head) / 9, k = Math.exp(-d * d);
      _c.copy(launching ? CYAN : IDLE).multiplyScalar(0.25 + k * (launching ? 2.6 : 1.4));
    } else if (launching) {
      _c.copy(ready ? GREEN : AMBER).multiplyScalar(L.z < pz ? 0.25 : 0.8 + 0.25 * Math.sin(t * 8 + L.z * 0.05));
    } else _c.copy(IDLE).multiplyScalar(0.6);
    station.runwayMesh.setColorAt(L.i, _c);
  }
  station.runwayMesh.instanceColor.needsUpdate = true;
  for (const a of station.archLights) {
    const passed = launching && pz > a.z;
    a.s.material.color.copy(launching ? (passed || ready ? GREEN : AMBER) : IDLE).multiplyScalar(launching && !passed ? 1.4 : 0.8);
    a.s.material.opacity = launching && !passed && !ready ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 1;
  }
}

function updateTurrets(dt) {
  for (const tu of station.turrets) {
    tu.cd -= dt;
    // cible : torpilles, missiles, drones, puis chasseurs proches
    let best = null, bs = Infinity;
    for (const h of G.targets) {
      if (h.dead || h.kind === 'boss' || h.kind === 'part') continue;
      const d = h.pos.distanceTo(tu.pos);
      const pri = h.kind === 'torp' ? 0 : h.kind === 'emissile' ? 200 : h.kind === 'drone' ? 400 : h.kind === 'bomber' ? 2000 : 1200;
      const range = h.kind === 'torp' || h.kind === 'drone' || h.kind === 'emissile' ? 1500 : 900;
      if (d < range && d + pri < bs) { bs = d + pri; best = h; }
    }
    tu.target = best;
    if (!best) continue;
    lead(tu.pos, ZEROV, best.pos, best.vel, 1300, _a);
    _d.copy(_a).sub(tu.pos).normalize();
    tu.head.lookAt(_w.copy(tu.pos).addScaledVector(_d, 100));
    if (tu.cd <= 0) {
      _d.x += rand(-0.012, 0.012); _d.y += rand(-0.012, 0.012); _d.z += rand(-0.012, 0.012); _d.normalize();
      spawnBullet('pd', _w.copy(tu.pos).addScaledVector(_d, 5), _a.copy(_d).multiplyScalar(1300), 7);
      sfx('pd', 0.6, tu.pos);
      tu.burst++; tu.cd = tu.burst % 8 === 0 ? 0.7 : 0.075;
    }
  }
}
const ZEROV = new THREE.Vector3();
