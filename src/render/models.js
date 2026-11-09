// Modèles procéduraux. Les pièces statiques sont fusionnées par matériau (peu d'appels de dessin).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX_GLOW } from './background.js';
import { TAU } from '../core/util.js';

const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });

export const MAT = {
  hull: std(0xc4ccd4, 0.55, 0.38),
  hullDark: std(0x3a4049, 0.65, 0.5),
  stripe: std(0xe08a2a, 0.3, 0.5),
  glass: std(0x0a1a2c, 0.9, 0.1, { emissive: 0x0a3a66, emissiveIntensity: 0.7 }),
  engine: glow(0x9cc8ff, 1.5),
  enemy: std(0x6a2a22, 0.55, 0.42),
  enemyDark: std(0x1c1a1e, 0.7, 0.38),
  enemyGlow: glow(0xff3020, 5),
  enemyEngine: glow(0xff7a30, 4),
  alt: std(0x40284a, 0.6, 0.35),
  altGlow: glow(0xd040ff, 5),
  drone: std(0x2c2a30, 0.7, 0.35, { flatShading: true }),
  droneCore: glow(0xff3a10, 7),
  boss: std(0x4a3d39, 0.6, 0.48),
  bossDark: std(0x201d21, 0.7, 0.45),
  bossGlow: glow(0xff4020, 4),
  panel: std(0x15264d, 0.8, 0.25, { emissive: 0x02060f }),
  white: std(0xe6e6df, 0.15, 0.6),
  hangar: std(0x23272d, 0.4, 0.7, { side: THREE.BackSide }),
  strip: glow(0xbfe4ff, 0.6),
  amber: glow(0xffb347, 1.8),
  window: glow(0xffd9a0, 2.2),
  red: glow(0xff3b2b, 4),
  green: glow(0x3bff6a, 4),
  shieldGen: glow(0x60d8ff, 4),
  deck: std(0x50565e, 0.45, 0.62),
  deckDark: std(0x2b2f35, 0.5, 0.7),
};

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
class Builder {
  constructor() { this.map = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m4);
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g); return this;
  }
  build() {
    const grp = new THREE.Group();
    for (const [mat, list] of this.map) { const merged = mergeGeometries(list); merged.computeBoundingSphere(); grp.add(new THREE.Mesh(merged, mat)); list.forEach(g => g.dispose()); }
    return grp;
  }
}

const HALF = Math.PI / 2;
const Box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const Cyl = (a, b, h, s = 12, open = false) => new THREE.CylinderGeometry(a, b, h, s, 1, open);
const Cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
const Sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
function Lathe(pts, seg = 16) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function Extrude(pts, depth, bevel = 0.06) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2); return g;
}

const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const spriteMats = new Map();
export function glowSprite(color, size, k = 2.5, shared = true) {
  const key = color + ':' + k;
  let m = shared && spriteMats.get(key);
  if (!m) { m = new THREE.SpriteMaterial({ map: TEX_GLOW, color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }); if (shared) spriteMats.set(key, m); }
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

/* ---------- Joueur : intercepteur Orion ---------- */
function playerTemplate() {
  const b = new Builder();
  b.add(Lathe([[0, 7.4], [0.35, 6.5], [0.78, 5], [1.08, 3], [1.28, 0.5], [1.32, -2], [1.18, -4.2], [0.92, -5]], 16), MAT.hull, 0, 0, 0, -HALF, 0, 0, 1.12, 1, 0.78);
  b.add(Sph(0.7, 16, 12), MAT.glass, 0, 0.72, -2.9, 0, 0, 0, 1, 0.75, 2.6);
  b.add(Extrude([[-5.4, -3.9], [-5.4, -2.7], [-1.0, 2.3], [1.0, 2.3], [5.4, -2.7], [5.4, -3.9]], 0.24), MAT.hull, 0, -0.25, 0, -HALF, 0, 0);
  b.add(Extrude([[-5.0, -3.7], [-5.0, -3.1], [5.0, -3.1], [5.0, -3.7]], 0.26), MAT.hullDark, 0, -0.25, 0, -HALF, 0, 0);
  b.add(Box(0.32, 0.05, 6.2), MAT.stripe, 0, 0.96, 0.6);
  for (const s of [-1, 1]) {
    b.add(Box(0.5, 0.3, 1.6), MAT.stripe, s * 5.2, -0.25, 3.0);
    b.add(Cyl(0.15, 0.15, 4.4, 8), MAT.hullDark, s * 4.75, -0.12, -2.4, -HALF, 0, 0);
    b.add(Cyl(0.24, 0.24, 1.2, 8), MAT.hullDark, s * 4.75, -0.12, -0.4, -HALF, 0, 0);
    b.add(Box(0.18, 2.3, 2.4), MAT.hull, s * 1.25, 1.15, 3.7, 0, 0, s * -0.36);
    b.add(Box(0.2, 0.25, 2.2), MAT.stripe, s * 1.62, 2.12, 3.95, 0, 0, s * -0.36);
    b.add(Cyl(0.64, 0.8, 2.8, 14), MAT.hullDark, s * 1.3, -0.15, 4.1, -HALF, 0, 0);
    b.add(Cyl(0.56, 0.56, 0.12, 14), MAT.engine, s * 1.3, -0.15, 5.52, -HALF, 0, 0);
    b.add(Box(0.9, 0.6, 2.6), MAT.hullDark, s * 1.05, -0.65, 0.4);
  }
  const g = b.build();
  META.player = { engines: [new THREE.Vector3(-1.3, -0.15, 5.7), new THREE.Vector3(1.3, -0.15, 5.7)], guns: [new THREE.Vector3(-4.75, -0.12, -4.8), new THREE.Vector3(4.75, -0.12, -4.8), new THREE.Vector3(0, -1.1, -4)] };
  return g;
}

/* ---------- Ennemis ---------- */
function fighterTemplate() {
  const b = new Builder();
  b.add(Box(1.7, 1.05, 7.2), MAT.enemy, 0, 0, 0.3);
  b.add(Cone(1.05, 3.2, 4), MAT.enemyDark, 0, 0, -4.9, -HALF, 0, Math.PI / 4);
  b.add(Box(0.85, 0.32, 1.3), MAT.enemyGlow, 0, 0.62, -2.0);
  b.add(Extrude([[-0.8, -1.5], [-5.8, 1.6], [-5.8, 2.7], [-0.8, 1.0], [0.8, 1.0], [5.8, 2.7], [5.8, 1.6], [0.8, -1.5]], 0.18), MAT.enemyDark, 0, 0, 0, -HALF, 0, 0);
  for (const s of [-1, 1]) {
    b.add(Box(0.22, 2.6, 1.9), MAT.enemy, s * 5.8, 0, -2.1);
    b.add(Box(0.24, 0.24, 1.2), MAT.enemyGlow, s * 5.8, 1.35, -2.1);
  }
  b.add(Cyl(0.75, 0.9, 2.2, 10), MAT.enemyDark, 0, 0, 4.5, -HALF, 0, 0);
  b.add(Cyl(0.6, 0.6, 0.1, 10), MAT.enemyEngine, 0, 0, 5.62, -HALF, 0, 0);
  META.fighter = { engines: [new THREE.Vector3(0, 0, 5.8)] }; return b.build();
}
function interceptorTemplate() {
  const b = new Builder();
  b.add(Lathe([[0, 8.5], [0.3, 6.5], [0.62, 3], [0.78, 0], [0.72, -3], [0.58, -4.6]], 10), MAT.alt, 0, 0, 0, -HALF, 0, 0);
  b.add(Box(0.12, 0.12, 9), MAT.altGlow, 0, 0.72, -0.5);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + Math.PI / 2;
    b.add(Box(0.14, 2.6, 4.2), MAT.enemyDark, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 2.4, 0, 0, a - HALF);
    b.add(Box(0.16, 0.5, 0.5), MAT.altGlow, Math.cos(a) * 2.75, Math.sin(a) * 2.75, 0.5, 0, 0, a - HALF);
  }
  b.add(Cyl(0.5, 0.5, 0.1, 10), MAT.altGlow, 0, 0, 4.66, -HALF, 0, 0);
  META.interceptor = { engines: [new THREE.Vector3(0, 0, 4.8)] }; return b.build();
}
function droneTemplate() {
  const b = new Builder();
  b.add(new THREE.IcosahedronGeometry(1.5, 0), MAT.drone);
  for (const [x, y, z] of [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]]) {
    const v = new THREE.Vector3(x, y, z).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v), e = new THREE.Euler().setFromQuaternion(q);
    b.add(Cone(0.35, 1.8, 6), MAT.enemyDark, v.x * 1.7, v.y * 1.7, v.z * 1.7, e.x, e.y, e.z);
  }
  b.add(Sph(0.75, 10, 8), MAT.droneCore, 0, 0, -1.1);
  META.drone = { engines: [new THREE.Vector3(0, 0, 1.4)] }; return b.build();
}
function bomberTemplate() {
  const b = new Builder();
  b.add(Box(5.2, 3.3, 17), MAT.enemy);
  b.add(Box(5.6, 0.5, 12), MAT.enemyDark, 0, 1.85, 0.5);
  b.add(Box(3.6, 2.4, 4.2), MAT.enemyDark, 0, 0.2, -10.4);
  b.add(Cone(2.0, 3, 4), MAT.enemy, 0, 0.2, -13.9, -HALF, 0, Math.PI / 4);
  b.add(Box(2.3, 0.9, 2.3), MAT.enemyGlow, 0, 1.8, -7.6);
  b.add(Box(1.8, 0.4, 8), MAT.red, 0, -1.72, -1);
  for (const s of [-1, 1]) {
    b.add(Box(2.5, 2.5, 12.5), MAT.enemyDark, s * 4.8, -0.6, 2.2);
    b.add(Box(5.4, 0.32, 6.4), MAT.enemy, s * 3.8, 0.6, 1.2);
    b.add(Cyl(1.0, 1.0, 0.12, 12), MAT.enemyEngine, s * 4.8, -0.6, 8.52, -HALF, 0, 0);
    b.add(Box(0.3, 0.3, 0.3), MAT.red, s * 6.2, 0.6, -2);
  }
  const g = b.build();
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, 2.1, 3);
  turret.add(new THREE.Mesh(Sph(1.2, 12, 8), MAT.enemyDark));
  for (const s of [-1, 1]) { const m = new THREE.Mesh(Cyl(0.14, 0.14, 2.6, 6), MAT.hullDark); m.rotation.x = HALF; m.position.set(s * 0.4, 0.2, 1.4); turret.add(m); }
  g.add(turret);
  META.bomber = { engines: [new THREE.Vector3(-4.8, -0.6, 8.8), new THREE.Vector3(4.8, -0.6, 8.8)] };
  return g;
}
export function bossTemplate() {
  const b = new Builder();
  b.add(Box(34, 22, 150), MAT.boss);
  b.add(Cone(26, 46, 4), MAT.boss, 0, 0, -98, -HALF, 0, Math.PI / 4, 1, 1, 0.62);
  b.add(Box(38, 4, 120), MAT.bossDark, 0, 12, 0);
  b.add(Box(38, 4, 120), MAT.bossDark, 0, -12, 0);
  for (let z = -60; z <= 60; z += 20) for (const s of [-1, 1]) b.add(Box(3, 16, 14), MAT.bossDark, s * 18, 0, z);
  b.add(Box(14, 14, 26), MAT.boss, 0, 20, 34);
  b.add(Box(10, 3, 18), MAT.bossGlow, 0, 26.2, 30);
  b.add(Box(16, 2, 4), MAT.bossGlow, 0, 20, 20.9);
  b.add(Box(20, 6, 30), MAT.bossGlow, 0, -11.5, -50);
  for (const s of [-1, 1]) for (let z = -70; z <= 70; z += 10) b.add(Box(0.8, 0.8, 0.8), MAT.window, s * 17.2, 4, z);
  for (const x of [-10, 0, 10]) { b.add(Cyl(7, 8, 14, 16), MAT.bossDark, x, 0, 80, -HALF, 0, 0); b.add(Cyl(6, 6, 0.4, 16), MAT.enemyEngine, x, 0, 87.3, -HALF, 0, 0); }
  b.add(Cyl(0.8, 0.8, 30, 6), MAT.hullDark, 0, 40, 34);
  const g = b.build();
  g.userData.engines = [new THREE.Vector3(-10, 0, 88), new THREE.Vector3(0, 0, 88), new THREE.Vector3(10, 0, 88)];
  // volumes de collision (repère local)
  g.userData.boxes = [
    { min: new THREE.Vector3(-19, -14, -75), max: new THREE.Vector3(19, 14, 75) },
    { min: new THREE.Vector3(-13, -11, -120), max: new THREE.Vector3(13, 11, -75) },
    { min: new THREE.Vector3(-7, 13, 21), max: new THREE.Vector3(7, 27, 47) },
    { min: new THREE.Vector3(-18, -9, 72), max: new THREE.Vector3(18, 9, 88) },
  ];
  return g;
}
export function bossPart(kind) {
  const grp = new THREE.Group();
  if (kind === 'gen') {
    grp.add(new THREE.Mesh(Cyl(7, 8, 3, 18), MAT.bossDark));
    const d = new THREE.Mesh(Sph(5.5, 18, 10), MAT.shieldGen); d.position.y = 2; grp.add(d);
    const s = glowSprite(0x60d8ff, 26, 2.2); s.position.y = 3; grp.add(s);
  } else if (kind === 'turret') {
    grp.add(new THREE.Mesh(Cyl(4.2, 5, 3, 14), MAT.bossDark));
    const head = new THREE.Group(); head.position.y = 3;
    head.add(new THREE.Mesh(Sph(3.4, 12, 8), MAT.boss));
    for (const s of [-1, 1]) { const m = new THREE.Mesh(Cyl(0.5, 0.5, 8, 8), MAT.hullDark); m.rotation.x = HALF; m.position.set(s * 1.3, 0.4, 4.5); head.add(m); }
    const eye = new THREE.Mesh(Box(1.6, 0.6, 0.6), MAT.bossGlow); eye.position.set(0, 1.2, 2.8); head.add(eye);
    grp.add(head); grp.userData.head = head;
  } else if (kind === 'engine') {
    const s = glowSprite(0xff7a30, 30, 2.4); grp.add(s);
  }
  return grp;
}
export function shieldSkin(template) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { hit: { value: 0 }, time: { value: 0 }, up: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition-wp.xyz; vP = position; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float hit; uniform float time; uniform float up; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.5+0.5*sin(vP.z*0.35 - time*6.0); float hex = step(0.9, fract(vP.x*0.15+vP.y*0.15)) + step(0.92, fract(vP.z*0.08));
        float a = (f*0.5 + hex*0.08 + scan*0.04)*(0.35+hit*2.5)*up;
        gl_FragColor = vec4(vec3(0.35,0.8,1.6)*a, a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const grp = new THREE.Group();
  for (const m of template.children) if (m.isMesh) grp.add(new THREE.Mesh(m.geometry, mat));
  grp.scale.set(1.12, 1.18, 1.05); grp.userData.mat = mat;
  return grp;
}

function torpedoTemplate(heavy) {
  const b = new Builder(), k = heavy ? 1.8 : 1;
  b.add(Cyl(0.45 * k, 0.45 * k, 3.4 * k, 10), MAT.enemyDark, 0, 0, 0, -HALF, 0, 0);
  b.add(Cone(0.45 * k, 1.1 * k, 10), MAT.red, 0, 0, -2.25 * k, -HALF, 0, 0);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; b.add(Box(0.08, 0.7 * k, 0.9 * k), MAT.enemy, Math.cos(a) * 0.5 * k, Math.sin(a) * 0.5 * k, 1.3 * k, 0, 0, a); }
  const g = b.build(); g.add(at(glowSprite(0xffa040, heavy ? 22 : 13, 3), 0, 0, 2.2 * k));
  return g;
}
function missileTemplate(enemy) {
  const b = new Builder();
  b.add(Cyl(0.18, 0.18, 2.2, 6), enemy ? MAT.enemyDark : MAT.white, 0, 0, 0, -HALF, 0, 0);
  b.add(Cone(0.18, 0.5, 6), enemy ? MAT.red : MAT.stripe, 0, 0, -1.35, -HALF, 0, 0);
  const g = b.build(); g.add(at(glowSprite(enemy ? 0xff5030 : 0xffffff, enemy ? 7 : 5, 3), 0, 0, 1.3));
  return g;
}

export const PICKUP_COLORS = { repair: 0x6dff9a, ammo: 0xd8e8ff, shield: 0x60d0ff, overdrive: 0xffc840 };
function pickupTemplate(type) {
  const col = PICKUP_COLORS[type], g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), glow(col, 2.2)); core.name = 'core'; g.add(core);
  const cage = new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.5), wireframe: true })); cage.name = 'cage'; g.add(cage);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.18, 6, 40), glow(col, 2)); ring.name = 'ring'; g.add(ring);
  g.add(glowSprite(col, 18, 1.4));
  return g;
}

/* ---------- Station Orion-7 (axe Z, hangar ouvert vers +Z) ---------- */
export function buildStationModel() {
  const b = new Builder();
  b.add(Cyl(28, 28, 90, 40), MAT.hull, 0, 0, -25, HALF, 0, 0);
  b.add(Cyl(28, 28, 60, 40, true), MAT.hull, 0, 0, 50, HALF, 0, 0);
  b.add(Cyl(26.5, 26.5, 60, 40, true), MAT.hangar, 0, 0, 50, HALF, 0, 0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; b.add(Box(0.45, 0.45, 54), MAT.strip, Math.cos(a) * 26.1, Math.sin(a) * 26.1, 50, 0, 0, a); }
  for (let z = 26; z <= 76; z += 10) b.add(new THREE.TorusGeometry(26.2, 0.35, 6, 40), MAT.hullDark, 0, 0, z);
  for (let z = 30; z <= 74; z += 6) b.add(Box(10, 0.3, 1.2), MAT.amber, 0, -26.2, z);
  b.add(new THREE.TorusGeometry(28, 1.1, 8, 48), MAT.amber, 0, 0, 80);
  b.add(new THREE.TorusGeometry(30, 2.2, 10, 48), MAT.hullDark, 0, 0, -10);
  b.add(new THREE.TorusGeometry(29, 1.4, 8, 48), MAT.hullDark, 0, 0, -50);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; b.add(Box(6, 3, 18), MAT.hullDark, Math.cos(a) * 28.5, Math.sin(a) * 28.5, -30, 0, 0, a); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; b.add(Box(1.2, 1.2, 0.6), MAT.window, Math.cos(a) * 28.3, Math.sin(a) * 28.3, (i % 2 ? -42 : -18), 0, 0, a); }
  b.add(Cyl(4, 4, 200, 10), MAT.hullDark, 0, 0, -170, HALF, 0, 0);
  for (const sx of [-1, 1]) {
    b.add(Box(250, 0.8, 52), MAT.panel, sx * 155, 0, -205);
    for (let k = 0; k < 6; k++) b.add(Box(1.2, 1.0, 52.4), MAT.hullDark, sx * (40 + k * 46), 0, -205);
    b.add(Box(250, 1.0, 1.2), MAT.hullDark, sx * 155, 0, -205);
    b.add(Box(2, 90, 30), MAT.white, 0, sx * 50, -110);
  }
  b.add(new THREE.SphereGeometry(10, 20, 10, 0, TAU, 0, Math.PI / 2), MAT.white, 0, 0, -275, -HALF, 0, 0);
  // pont d'envol : plancher du hangar puis piste extérieure, quille, portiques
  b.add(Box(18, 1, 60), MAT.deck, 0, -24, 50);
  b.add(Box(24, 2, 202), MAT.deck, 0, -24.5, 181);
  for (const s of [-1, 1]) {
    b.add(Box(1.2, 1.6, 202), MAT.hullDark, s * 12.6, -23.9, 181);
    b.add(Box(0.35, 0.04, 258), MAT.stripe, s * 9.6, -23.48, 151);
    for (let z = 100; z <= 260; z += 40) b.add(Box(0.9, 12, 0.9), MAT.hullDark, s * 9, -30.5, z, 0, 0, s * 0.55);
  }
  for (let z = 26; z < 280; z += 14) b.add(Box(0.6, 0.04, 6), MAT.white, 0, -23.48, z);
  b.add(Box(10, 9, 200), MAT.deckDark, 0, -30, 182);
  for (const z of [130, 180, 230, 280]) {
    for (const s of [-1, 1]) b.add(Box(1.4, 36, 1.4), MAT.hullDark, s * 13.5, -5.5, z);
    b.add(Box(28.4, 1.6, 1.6), MAT.hullDark, 0, 12.5, z);
    b.add(Box(20, 0.3, 0.3), MAT.strip, 0, 11.6, z);
  }
  const hub = b.build();
  const ringB = new Builder();
  ringB.add(new THREE.TorusGeometry(220, 16, 20, 120), MAT.hull);
  ringB.add(new THREE.TorusGeometry(220, 16.4, 6, 120), MAT.hullDark, 0, 0, 0, 0, 0, 0, 1, 1, 0.12);
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; ringB.add(Cyl(4, 4, 194, 10), MAT.hullDark, Math.cos(a) * 125, Math.sin(a) * 125, 0, 0, 0, a - HALF); }
  for (let i = 0; i < 120; i++) { const a = i / 120 * TAU; ringB.add(Box(1.4, 2.2, 3), MAT.window, Math.cos(a) * 236.3, Math.sin(a) * 236.3, (i % 2 ? 4 : -4), 0, 0, a); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + 0.1; ringB.add(Box(10, 6, 34), MAT.hullDark, Math.cos(a) * 205, Math.sin(a) * 205, 0, 0, 0, a); }
  const ring = ringB.build();
  return { hub, ring };
}
export function pdTurretModel() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(Cyl(2.4, 3, 2, 12), MAT.hullDark));
  const head = new THREE.Group(); head.position.y = 2;
  head.add(new THREE.Mesh(Sph(1.8, 12, 8), MAT.hull));
  for (const s of [-1, 1]) { const m = new THREE.Mesh(Cyl(0.22, 0.22, 4.2, 6), MAT.hullDark); m.rotation.x = HALF; m.position.set(s * 0.6, 0.2, 2.4); head.add(m); }
  const l = new THREE.Mesh(Box(0.8, 0.3, 0.3), MAT.strip); l.position.set(0, 1.1, 1); head.add(l);
  g.add(head); g.userData.head = head; return g;
}

/* ---------- Cache des gabarits ---------- */
const T = {}, META = {};
export function initModels() {
  T.player = playerTemplate(); T.fighter = fighterTemplate(); T.interceptor = interceptorTemplate(); T.drone = droneTemplate();
  T.bomber = bomberTemplate(); T.torp = torpedoTemplate(false); T.htorp = torpedoTemplate(true);
  T.missile = missileTemplate(false); T.emissile = missileTemplate(true);
  for (const k in PICKUP_COLORS) T['pk_' + k] = pickupTemplate(k);
}
/** Instance d'un gabarit (géométries et matériaux partagés). */
/** Active les ombres portées/reçues sur les maillages éclairés d'un objet. */
export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh && o.material && (o.material.isMeshStandardMaterial)) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
export function model(name) {
  const c = T[name].clone(true); shadows(c);
  c.userData = { ...(META[name] || {}) };
  for (const n of ['turret', 'core', 'cage', 'ring']) { const o = c.getObjectByName(n); if (o) c.userData[n] = o; }
  return c;
}

export { Builder, Box, Cyl, Cone, Sph, Lathe, Extrude, HALF, glow };
