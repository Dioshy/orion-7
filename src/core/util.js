import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const V3 = THREE.Vector3;
export const Q = THREE.Quaternion;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const pick = arr => arr[(Math.random() * arr.length) | 0];

// Ces vecteurs ne doivent jamais être modifiés.
export const ZERO = new V3();
export const UP = new V3(0, 1, 0);
export const ZAXIS = new V3(0, 0, 1);
export const NEGZ = new V3(0, 0, -1);

export function randUnit(v = new V3()) {
  const u = Math.random() * 2 - 1, t = Math.random() * TAU, s = Math.sqrt(1 - u * u);
  return v.set(s * Math.cos(t), u, s * Math.sin(t));
}

const NF = [0, 1, 2].map(d => new Intl.NumberFormat('fr-BE', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fr = (x, d = 0) => NF[d].format(x);
export const fmtDist = d => (d < 1000 ? `${fr(Math.round(d))} m` : `${fr(d / 1000, 1)} km`);

export const fwdOf = (obj, out) => out.set(0, 0, -1).applyQuaternion(obj.quaternion);

const _la = new V3(), _lb = new V3();
/** Point de visée anticipé pour un projectile de vitesse `speed` tiré depuis sp/sv vers une cible tp/tv. */
export function lead(sp, sv, tp, tv, speed, out) {
  const d = _la.copy(tp).sub(sp), v = _lb.copy(tv).sub(sv);
  const a = v.dot(v) - speed * speed, b = 2 * d.dot(v), c = d.dot(d);
  let t = -1;
  if (Math.abs(a) < 1e-6) t = b !== 0 ? -c / b : -1;
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
      t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    }
  }
  if (!(t > 0)) t = Math.sqrt(c) / speed;
  return out.copy(tp).addScaledVector(v, t);
}

/** Le segment [a,b] passe-t-il à moins de r du point c ? */
export function segSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const t = clamp((acx * abx + acy * aby + acz * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Intersection segment / boîte alignée (méthode des dalles). */
export function segAABB(a, b, min, max) {
  let t0 = 0, t1 = 1;
  for (const k of ['x', 'y', 'z']) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return false; continue; }
    let u0 = (min[k] - a[k]) / d, u1 = (max[k] - a[k]) / d;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
    if (t0 > t1) return false;
  }
  return true;
}

export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
