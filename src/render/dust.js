// Poussière spatiale : repères de vitesse, étirés en traînées quand on va vite.
import * as THREE from 'three';
import { R } from './renderer.js';

const N = 1000, RAD = 300, R2 = RAD * 2;
const pts = new Float32Array(N * 3), seg = new Float32Array(N * 6), col = new Float32Array(N * 6);
let lines, points;
export function initDust() {
  for (let i = 0; i < N * 3; i++) pts[i] = (Math.random() * 2 - 1) * RAD;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(seg, 3).setUsage(THREE.DynamicDrawUsage));
  lg.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  lines.frustumCulled = false; R.scene.add(lines);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pts, 3).setUsage(THREE.DynamicDrawUsage));
  points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.5, color: 0x9fb4c8, transparent: true, opacity: 0.5, depthWrite: false }));
  points.frustumCulled = false; R.scene.add(points);
}
export function updateDust(cam, vel) {
  const sp = vel.length(), k = Math.min(0.075, 0.01 + sp * 0.0001), a = Math.min(1.4, Math.max(0, (sp - 30) / 300));
  const vx = vel.x * k, vy = vel.y * k, vz = vel.z * k;
  for (let i = 0; i < N; i++) {
    const i3 = i * 3, i6 = i * 6;
    for (let j = 0; j < 3; j++) {
      const c = j === 0 ? cam.x : j === 1 ? cam.y : cam.z; let v = pts[i3 + j];
      while (v - c > RAD) v -= R2; while (v - c < -RAD) v += R2; pts[i3 + j] = v;
    }
    seg[i6] = pts[i3]; seg[i6 + 1] = pts[i3 + 1]; seg[i6 + 2] = pts[i3 + 2];
    seg[i6 + 3] = pts[i3] + vx; seg[i6 + 4] = pts[i3 + 1] + vy; seg[i6 + 5] = pts[i3 + 2] + vz;
    col[i6] = 0.4 * a; col[i6 + 1] = 0.48 * a; col[i6 + 2] = 0.6 * a; col[i6 + 3] = col[i6 + 4] = col[i6 + 5] = 0;
  }
  lines.geometry.attributes.position.needsUpdate = true; lines.geometry.attributes.color.needsUpdate = true;
  points.geometry.attributes.position.needsUpdate = true;
  lines.visible = a > 0.01;
}
