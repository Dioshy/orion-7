// Champ d'astéroïdes et de débris autour de la station : repères de vitesse, obstacles.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { randUnit, rand } from '../core/util.js';

export const rocks = [];
const GRID = 600, cells = new Map();
const cellKey = (cx, cy, cz) => (cx + 512) * 1048576 + (cy + 512) * 1024 + (cz + 512);
const key = (x, y, z) => cellKey(Math.floor(x / GRID), Math.floor(y / GRID), Math.floor(z / GRID));

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, v = new THREE.Vector3();
  const f = (x, y, z) => Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.3) * Math.sin(z * 3.7 + seed * 0.7);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = 1 + 0.28 * f(v.x, v.y, v.z) + 0.12 * f(v.x * 3, v.y * 3, v.z * 3) + 0.05 * f(v.x * 7, v.y * 7, v.z * 7);
    v.multiplyScalar(d); p.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals(); return g;
}

export function initAsteroids() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6f675f, roughness: 0.92, metalness: 0.05, flatShading: true });
  const geos = [rockGeometry(1.3), rockGeometry(4.1), rockGeometry(7.7)];
  const per = 110, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), e = new THREE.Euler();
  geos.forEach((geo, gi) => {
    const mesh = new THREE.InstancedMesh(geo, mat, per);
    for (let i = 0; i < per; i++) {
      let tries = 0;
      do {
        randUnit(pos); pos.y *= 0.45; pos.normalize().multiplyScalar(rand(900, 7500));
        tries++;
      } while (tries < 20 && (pos.z > 0 && Math.hypot(pos.x, pos.y + 20) < 450 && pos.z < 2600)); // couloir de décollage dégagé
      const r = Math.random() < 0.12 ? rand(25, 60) : rand(3, 18);
      q.setFromEuler(e.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
      m4.compose(pos, q, s.set(r, r, r)); mesh.setMatrixAt(i, m4);
      const rk = { pos: pos.clone(), r: r * 1.05, mesh, i };
      rocks.push(rk);
      const k = key(pos.x, pos.y, pos.z); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(rk);
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    R.scene.add(mesh);
  });
}

/** Astéroïde touché par une sphère (position, rayon), via une grille spatiale. */
export function asteroidHit(p, r) {
  const cx = Math.floor(p.x / GRID), cy = Math.floor(p.y / GRID), cz = Math.floor(p.z / GRID);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const list = cells.get(cellKey(cx + dx, cy + dy, cz + dz)); if (!list) continue;
    for (const rk of list) { const d = rk.r + r; if (p.distanceToSquared(rk.pos) < d * d) return rk; }
  }
  return null;
}
