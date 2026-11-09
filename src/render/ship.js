// Intercepteur Orion Mk II : modèle détaillé avec pièces animées
// (train d'atterrissage, trappes, flammes de réacteurs, rétrofusées, propulseurs d'attitude, missiles, feux de navigation).
import * as THREE from 'three';
import { MAT, Builder, Box, Cyl, Sph, Lathe, Extrude, HALF, glowSprite, glow, model } from './models.js';
import { TEX_GLOW } from './background.js';
import { clamp, smooth } from '../core/util.js';

/* Texture de panneaux : tôles, lignes de jonction, rivets (générée une fois). */
function panelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d4d9df'; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const x = rnd() * 512, y = rnd() * 512, w = 40 + rnd() * 160, h = 30 + rnd() * 120, v = 200 + rnd() * 34; g.fillStyle = `rgb(${v},${v + 3},${v + 7})`; g.fillRect(x, y, w, h); }
  g.strokeStyle = 'rgba(70,78,88,0.75)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const y = i * 64 + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let r = 0; r < 8; r++) for (let k = 0; k < 3; k++) { const x = ((r * 97 + k * 173) % 512) + 0.5; g.beginPath(); g.moveTo(x, r * 64); g.lineTo(x, r * 64 + 64); g.stroke(); }
  g.fillStyle = 'rgba(80,88,98,0.6)';
  for (let r = 0; r < 8; r++) for (let x = 6; x < 512; x += 12) { g.beginPath(); g.arc(x, r * 64 + 5, 1.2, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const PANEL = panelTexture();
const SH = {
  hull: new THREE.MeshPhysicalMaterial({ color: 0xe2e6ea, map: PANEL, metalness: 0.35, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x3a414b, map: PANEL, metalness: 0.5, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  accent: new THREE.MeshPhysicalMaterial({ color: 0xe8862a, metalness: 0.2, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
  matte: new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.2, roughness: 0.9 }),
};
function decalTexture(draw, w = 256, h = 256) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const DECAL_NUM = decalTexture((g, w, h) => { g.font = '700 150px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e8862a'; g.fillText('07', w / 2, h / 2 - 12); g.font = '600 34px "Chakra Petch", sans-serif'; g.fillStyle = '#2b323b'; g.fillText('ORION', w / 2, h - 40); });
const DECAL_ROUNDEL = decalTexture((g, w) => { const r = w / 2; g.fillStyle = '#e8862a'; g.beginPath(); g.arc(r, r, r - 4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e2e6ea'; g.beginPath(); g.arc(r, r, r * 0.68, 0, Math.PI * 2); g.fill(); g.fillStyle = '#2a5ea8'; g.beginPath(); g.arc(r, r, r * 0.4, 0, Math.PI * 2); g.fill(); });
const decal = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: 0.2, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));

const metal = new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 0.95, roughness: 0.18 });
const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
const panelLine = new THREE.MeshStandardMaterial({ color: 0x8a939d, metalness: 0.6, roughness: 0.5 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.4, roughness: 0.8 });

/* Flamme de réacteur : tube conique additif, bandes de choc animées. */
const FLAME_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`;
const FLAME_FRAG = `uniform float power; uniform float boost; uniform float time; uniform vec3 colA; uniform vec3 colB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float along = vUv.y;                       // 1 = tuyère, 0 = pointe
  float core = pow(abs(dot(normalize(vN), vV)), 1.5);
  float bands = 0.75 + 0.25*sin(along*38.0 - time*55.0);
  float flick = 0.85 + 0.15*sin(time*90.0 + along*12.0);
  float a = pow(along, 1.6) * core * bands * flick * power;
  vec3 c = mix(colB, colA, pow(along, 3.0)) * (1.0 + boost*0.4);
  gl_FragColor = vec4(c * a * 1.25, a);
}`;
function flameMesh(colA, colB, radius) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.12, 1, 20, 1, true);
  g.translate(0, -0.5, 0); g.rotateX(-HALF); // s'étend vers +Z (arrière) depuis l'origine
  const m = new THREE.ShaderMaterial({
    uniforms: { power: { value: 0 }, boost: { value: 0 }, time: { value: 0 }, colA: { value: new THREE.Color(colA) }, colB: { value: new THREE.Color(colB) } },
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}

/* ---------- Profil du fuselage : toutes les pièces s'y accrochent ---------- */
const PROFILE = [[0, 8.8], [0.28, 8.0], [0.6, 6.6], [0.95, 4.6], [1.2, 2.4], [1.34, 0], [1.4, -2.2], [1.32, -4.4], [1.08, -5.6]];
const SX = 1.15, SY = 0.8;
/** Rayon du profil à la position z du vaisseau (avant = -z). */
function rAt(z) {
  const y = -z;
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i], [r1, y1] = PROFILE[i + 1];
    if (y <= y0 && y >= y1) return r0 + (r1 - r0) * (y0 - y) / (y0 - y1);
  }
  return 0;
}
const topAt = z => rAt(z) * SY, botAt = z => -rAt(z) * SY, halfW = z => rAt(z) * SX;

/* ---------- Train d'atterrissage ---------- */
// Jambe : pivot en haut (dans la soute), fût, vérin chromé, compas, contrefiche, patin articulé, feu.
function gearLeg(len, padR, braceDir) {
  const pivot = new THREE.Group();
  const hinge = new THREE.Mesh(Cyl(0.14, 0.14, 0.34, 12), SH.dark); hinge.rotation.z = HALF; pivot.add(hinge);
  const strut = new THREE.Mesh(Cyl(0.13, 0.15, len * 0.58, 12), SH.dark); strut.position.y = -len * 0.29; pivot.add(strut);
  const collar = new THREE.Mesh(Cyl(0.18, 0.18, 0.12, 12), SH.accent); collar.position.y = -len * 0.56; pivot.add(collar);
  const piston = new THREE.Mesh(Cyl(0.085, 0.085, len * 0.42, 12), metal); piston.position.y = -len * 0.76; pivot.add(piston);
  // compas (deux bielles en V)
  for (const [y, rx] of [[-len * 0.58, 0.7], [-len * 0.76, -0.7]]) { const l = new THREE.Mesh(Box(0.05, len * 0.2, 0.05), metal); l.position.set(0, y, 0.12); l.rotation.x = rx; pivot.add(l); }
  // contrefiche vers la structure
  const bl = Math.hypot(len * 0.45, 0.75), brace = new THREE.Mesh(Box(0.06, bl, 0.06), SH.dark);
  brace.position.set(0, -len * 0.225, braceDir * 0.375); brace.rotation.x = braceDir * Math.atan2(0.75, len * 0.45); pivot.add(brace);
  // patin
  const foot = new THREE.Group(); foot.position.y = -len;
  foot.add(new THREE.Mesh(Sph(0.11, 10, 8), metal));
  const pad = new THREE.Mesh(Cyl(padR, padR * 1.18, 0.16, 20), SH.dark); pad.position.y = -0.1; foot.add(pad);
  const tread = new THREE.Mesh(Cyl(padR * 1.16, padR * 1.16, 0.05, 20), blackMat); tread.position.y = -0.2; foot.add(tread);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, rib = new THREE.Mesh(Box(0.04, 0.1, padR * 0.9), SH.dark); rib.position.set(Math.cos(a) * padR * 0.45, -0.02, Math.sin(a) * padR * 0.45); rib.rotation.y = -a; foot.add(rib); }
  const lamp = new THREE.Mesh(Box(0.14, 0.06, 0.06), glow(0xffb347, 2.5)); lamp.position.set(0, -0.06, -padR); foot.add(lamp);
  pivot.add(foot);
  pivot.userData = { piston, foot, len };
  return pivot;
}
/* Trappe : charnière sur un bord, s'ouvre vers le bas. */
function door(w, l) { const pivot = new THREE.Group(); const d = new THREE.Mesh(Box(w, 0.05, l), SH.hull); d.position.x = w / 2; pivot.add(d); return pivot; }

function shadowsOn(o) { o.traverse(m => { if (m.isMesh && m.material && m.material.isMeshStandardMaterial) { m.castShadow = true; m.receiveShadow = true; } }); }

export const GEAR_HEIGHT = 3.05; // hauteur de l'origine du vaisseau au-dessus du sol, train sorti
const NOSE_Z = -4.7, MAIN_Z = 0.7, MAIN_X = 1.65, WING_Y = -0.3, POD_X = 5.75, POD_Z = 2.4;

export function buildPlayerShip() {
  const b = new Builder();
  // fuselage
  b.add(Lathe(PROFILE, 32), SH.hull, 0, 0, 0, -HALF, 0, 0, SX, 1, SY);
  // dos : épine dorsale qui prolonge la verrière jusqu'aux dérives
  b.add(Box(0.9, 0.45, 6.4), SH.dark, 0, topAt(1.4) - 0.02, 1.4);
  b.add(Box(0.3, 0.04, 6.5), SH.accent, 0, topAt(1.4) + 0.22, 1.4);
  // verrière : coque vitrée encastrée dans le dessus du nez, carénage arrière
  const canZ = -3.6, canY = topAt(canZ) - 0.2;
  b.add(Sph(1, 32, 20), MAT.glass, 0, canY, canZ, 0, 0, 0, 0.62, 0.52, 1.75);
  b.add(Sph(1, 24, 16), SH.dark, 0, canY - 0.05, canZ + 1.55, 0, 0, 0, 0.55, 0.42, 0.9);
  b.add(Box(0.05, 0.05, 2.6), SH.dark, 0, canY + 0.5, canZ + 0.1, 0.06, 0, 0);       // arceau central
  // panneau anti-reflets sur le dessus du nez, épousant la pente
  b.add(Box(0.62, 0.03, 1.9), SH.matte, 0, topAt(-5.4) + 0.005, -5.4, Math.atan2(topAt(-4.45) - topAt(-6.35), 1.9), 0, 0);
  // tube de Pitot et capteurs
  b.add(Cyl(0.03, 0.03, 1.5, 8), metal, 0, 0, -9.45, -HALF, 0, 0);
  b.add(Box(0.04, 0.38, 0.45), SH.dark, 0, topAt(3.4) + 0.42, 3.4, -0.35, 0, 0);
  // entrées d'air latérales (le train principal se range dessous)
  for (const s of [-1, 1]) {
    const x = s * (halfW(-0.5) + 0.05);
    // profil latéral : lèvre inclinée à l'avant, carénage effilé vers l'arrière
    b.add(Extrude([[-2.4, 0.33], [1.2, 0.33], [1.9, 0.0], [1.9, -0.45], [1.2, -0.62], [-1.85, -0.62]], 0.8, 0.04), SH.dark, x, 0, 0, 0, -HALF, 0);
    b.add(Extrude([[-2.36, 0.28], [-1.92, -0.56], [-1.85, -0.56], [-2.3, 0.28]], 0.66, 0), blackMat, x, 0, -0.02, 0, -HALF, 0);
    b.add(Box(0.84, 0.05, 0.5), SH.accent, x, 0.36, -2.0);
  }
  // ailes delta (apex vers l'avant)
  b.add(Extrude([[-5.7, -4.4], [-5.7, -3.0], [-1.3, 1.2], [-0.9, 3.6], [0.9, 3.6], [1.3, 1.2], [5.7, -3.0], [5.7, -4.4]], 0.26), SH.hull, 0, WING_Y, 0, -HALF, 0, 0);
  const wingTop = WING_Y + 0.19, wingBot = WING_Y - 0.19;
  const leZ = x => -1.2 + (Math.abs(x) - 1.3) / 4.4 * 4.2; // bord d'attaque
  for (const s of [-1, 1]) {
    // bande orange le long du bord d'attaque
    const len = Math.hypot(4.4, 4.2);
    b.add(Box(len, 0.06, 0.16), SH.accent, s * 3.5, wingTop - 0.02, leZ(3.5) + 0.12, 0, -s * Math.atan2(4.2, 4.4), 0);
    b.add(Box(3.6, 0.2, 0.5), SH.dark, s * 3.5, WING_Y, 4.2);                              // volets
    b.add(Box(0.05, 0.22, 1.5), SH.dark, s * 3.0, wingTop + 0.1, leZ(3.0) + 1.0);         // cloison d'aile
    // nacelle de canon en bout d'aile, centrée sur la corde
    b.add(Cyl(0.32, 0.36, 4.2, 16), SH.dark, s * POD_X, WING_Y, POD_Z, -HALF, 0, 0);
    b.add(new THREE.ConeGeometry(0.32, 0.7, 16), SH.dark, s * POD_X, WING_Y, POD_Z - 2.45, -HALF, 0, 0);
    b.add(Cyl(0.12, 0.12, 2.6, 10), metal, s * POD_X, WING_Y, POD_Z - 3.6, -HALF, 0, 0);
    b.add(Cyl(0.17, 0.17, 0.35, 10), SH.dark, s * POD_X, WING_Y, POD_Z - 4.85, -HALF, 0, 0);
    for (const z of [-3.1, -3.7, -4.3]) b.add(new THREE.TorusGeometry(0.14, 0.03, 6, 12), SH.dark, s * POD_X, WING_Y, POD_Z + z);
    b.add(Box(0.66, 0.08, 1.2), SH.accent, s * POD_X, WING_Y + 0.33, POD_Z - 0.6);
    b.add(Cyl(0.36, 0.3, 0.4, 16), SH.dark, s * POD_X, WING_Y, POD_Z + 2.3, -HALF, 0, 0);
    // dérives inclinées
    b.add(Box(0.16, 2.7, 2.6), SH.hull, s * 1.38, 1.4, 3.9, 0.32, 0, s * -0.38);
    b.add(Box(0.2, 0.32, 1.3), SH.accent, s * 1.86, 2.62, 4.35, 0.32, 0, s * -0.38);
    // dérives ventrales
    b.add(Box(0.12, 0.85, 1.4), SH.dark, s * 0.85, botAt(4.3) - 0.2, 4.3, 0, 0, s * 0.45);
    // réacteurs : nacelle, bague, tuyère, disque incandescent
    b.add(Cyl(0.8, 0.88, 3.8, 24), SH.dark, s * 1.32, -0.1, 3.9, -HALF, 0, 0);
    b.add(new THREE.TorusGeometry(0.87, 0.06, 8, 32), metal, s * 1.32, -0.1, 5.8);
    b.add(Cyl(0.7, 0.84, 1.1, 24, true), nozzleMat, s * 1.32, -0.1, 6.35, -HALF, 0, 0);
    b.add(Cyl(0.6, 0.66, 0.9, 24, true), nozzleMat, s * 1.32, -0.1, 6.3, -HALF, 0, 0);
    b.add(Cyl(0.58, 0.58, 0.06, 24), MAT.engine, s * 1.32, -0.1, 5.95, -HALF, 0, 0);
    // pylônes de missiles (derrière le bord d'attaque)
    b.add(Box(0.14, 0.42, 1.5), SH.dark, s * 3.2, wingBot - 0.18, 2.0);
    b.add(Box(0.14, 0.42, 1.5), SH.dark, s * 4.4, wingBot - 0.18, 2.9);
    // tuyères d'attitude du nez
    b.add(Box(0.22, 0.26, 0.4), SH.dark, s * (halfW(-6.4) + 0.05), 0, -6.4);
    // soute du train principal (sous l'entrée d'air) et bord de trappe
    b.add(Box(0.62, 0.04, 1.9), blackMat, s * MAIN_X, -0.64, MAIN_Z);
  }
  b.add(Box(0.24, 0.24, 0.3), SH.dark, 0, topAt(-6.5) + 0.08, -6.5);
  b.add(Box(0.24, 0.24, 0.3), SH.dark, 0, botAt(-6.5) - 0.08, -6.5);
  b.add(Box(0.56, 0.04, 2.0), blackMat, 0, botAt(NOSE_Z) + 0.03, NOSE_Z + 0.9);           // soute du train avant
  const g = b.build();
  shadowsOn(g);
  // marquages : numéro d'escadrille sur les dérives, cocardes sur l'extrados
  for (const s of [-1, 1]) {
    const fin = new THREE.Group(); fin.position.set(s * 1.38, 1.4, 3.9); fin.rotation.set(0.32, 0, s * -0.38); g.add(fin);
    const n = decal(DECAL_NUM, 1.6, 1.6); n.position.x = s * 0.085; n.rotation.y = s * Math.PI / 2; fin.add(n);
    const r = decal(DECAL_ROUNDEL, 1.0, 1.0); r.position.set(s * 3.95, wingTop + 0.012, 2.9); r.rotation.x = -HALF; g.add(r);
  }

  const noseY = botAt(NOSE_Z) + 0.12, mainY = -0.62;
  return addParts(g, {
    flames: [[-1.32, -0.1, 6.85, 0.6], [1.32, -0.1, 6.85, 0.6]],
    retro: [[-(halfW(-6.4) + 0.05), 0, -6.62], [halfW(-6.4) + 0.05, 0, -6.62]],
    rcs: rcsSet(halfW(-6.4) + 0.2, topAt(-6.5) + 0.3, botAt(-6.5) - 0.3, -6.5, POD_X, WING_Y, POD_Z + 2.2),
    missiles: [[-3.2, wingBot - 0.6, 2.0], [3.2, wingBot - 0.6, 2.0], [-4.4, wingBot - 0.6, 2.9], [4.4, wingBot - 0.6, 2.9]],
    nav: [[0xff3b2b, -POD_X - 0.38, WING_Y, POD_Z - 0.6], [0x3bff6a, POD_X + 0.38, WING_Y, POD_Z - 0.6], [0xffffff, 0, topAt(4.6) + 0.3, 4.6]],
    gear: [{ x: 0, y: noseY, z: NOSE_Z, fold: ['x', -1.62], pad: 0.4, brace: 1 }, { x: -MAIN_X, y: mainY, z: MAIN_Z, fold: ['z', 1.62], pad: 0.5, brace: -1 }, { x: MAIN_X, y: mainY, z: MAIN_Z, fold: ['z', -1.62], pad: 0.5, brace: -1 }],
    doors: [[-(MAIN_X + 0.31), -0.64, MAIN_Z, 0.62, 1.9, -1, 1.35], [MAIN_X + 0.31, -0.64, MAIN_Z, 0.62, 1.9, 1, 1.35], [-0.28, botAt(NOSE_Z) + 0.02, NOSE_Z + 0.9, 0.28, 2.0, -1, 1.45], [0.28, botAt(NOSE_Z) + 0.02, NOSE_Z + 0.9, 0.28, 2.0, 1, 1.45]],
    lamp: [0, -1.6, NOSE_Z - 0.25], engLight: [0, -0.2, 8.2],
    engines: [[-1.32, -0.1, 7.0], [1.32, -0.1, 7.0]],
    guns: [[-POD_X, WING_Y, POD_Z - 5.1], [POD_X, WING_Y, POD_Z - 5.1], [0, botAt(-5) - 0.2, -5]],
  });
}

/* ---------- Pièces animées communes à tous les vaisseaux ---------- */
function rcsSet(nx, ny0, ny1, nz, wx, wy, wz) {
  return { noseUp: [0, ny0, nz], noseDown: [0, ny1, nz], noseL: [-nx, 0, nz + 0.1], noseR: [nx, 0, nz + 0.1], lUp: [-wx, wy + 0.5, wz], lDown: [-wx, wy - 0.5, wz], rUp: [wx, wy + 0.5, wz], rDown: [wx, wy - 0.5, wz] };
}
function addParts(g, c) {
  shadowsOn(g);
  const parts = { flames: [], retro: [], rcs: {}, missiles: [], nav: [], gear: [], doors: [], gearT: 1 };
  for (const [x, y, z, r] of c.flames) { const f = flameMesh(0xeaf4ff, 0x3a7dff, r); f.position.set(x, y, z); g.add(f); parts.flames.push(f); }
  for (const [x, y, z] of c.retro) { const r = flameMesh(0xfff0e0, 0xff8a3a, 0.14); r.rotation.y = Math.PI; r.position.set(x, y, z); g.add(r); parts.retro.push(r); }
  for (const k in c.rcs) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_GLOW, color: new THREE.Color(0xdfeaff).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.position.set(...c.rcs[k]); sp.scale.set(1.5, 1.5, 1); g.add(sp); parts.rcs[k] = sp;
  }
  for (const [x, y, z] of c.missiles) {
    const m = model('missile'); for (const ch of [...m.children]) if (ch.isSprite) m.remove(ch);
    m.position.set(x, y, z); m.scale.setScalar(1.15); g.add(m); parts.missiles.push(m);
  }
  for (const [col, x, y, z] of c.nav) { const sp = glowSprite(col, 1.8, 3, false); sp.position.set(x, y, z); g.add(sp); parts.nav.push(sp); }
  for (const L of c.gear) {
    const leg = gearLeg(GEAR_HEIGHT + L.y - 0.25, L.pad, L.brace); leg.position.set(L.x, L.y, L.z); leg.userData.fold = L.fold; shadowsOn(leg); g.add(leg); parts.gear.push(leg);
  }
  for (const [x, y, z, w, l, s, ax] of c.doors) { const d = door(w, l); d.position.set(x, y, z); d.scale.x = -s; d.userData.ax = s * ax; g.add(d); parts.doors.push(d); }
  const eng = new THREE.PointLight(0x7fb0ff, 0, 30, 2); eng.position.set(...c.engLight); g.add(eng); parts.engLight = eng;
  const lamp = glowSprite(0xffffff, 1.0, 2.5, false); lamp.position.set(...c.lamp); g.add(lamp); parts.lamp = lamp;
  const V = a => new THREE.Vector3(...a);
  g.userData = {
    parts, engines: c.engines.map(V), guns: c.guns.map(V),
    rcsDirs: { noseUp: [0, 1, 0], noseDown: [0, -1, 0], noseL: [-1, 0, 0], noseR: [1, 0, 0], lUp: [0, 1, 0], lDown: [0, -1, 0], rUp: [0, 1, 0], rDown: [0, -1, 0] },
  };
  return g;
}

/** Fonctions de surface pour un profil de fuselage tourné (avant = -z). */
function prof(P, sx, sy) {
  const r = z => { const y = -z; for (let i = 0; i < P.length - 1; i++) { const [r0, y0] = P[i], [r1, y1] = P[i + 1]; if (y <= y0 && y >= y1) return r0 + (r1 - r0) * (y0 - y) / (y0 - y1); } return 0; };
  return { top: z => r(z) * sy, bot: z => -r(z) * sy, half: z => r(z) * sx };
}

/* ---------- Vipère : intercepteur effilé, plans canard, un gros réacteur ---------- */
function buildVipere() {
  const P = [[0, 8], [0.25, 7], [0.5, 5.5], [0.78, 3.5], [0.95, 1.5], [1.0, -0.5], [0.98, -2.5], [0.88, -4.2], [0.78, -4.9]];
  const F = prof(P, 1.1, 0.85), b = new Builder(), WY = -0.2;
  b.add(Lathe(P, 32), SH.hull, 0, 0, 0, -HALF, 0, 0, 1.1, 1, 0.85);
  b.add(Sph(1, 32, 20), MAT.glass, 0, F.top(-3.2) - 0.12, -3.2, 0, 0, 0, 0.5, 0.42, 1.55);
  b.add(Sph(1, 24, 16), SH.dark, 0, F.top(-1.8) - 0.15, -1.6, 0, 0, 0, 0.45, 0.36, 0.9);
  b.add(Box(0.55, 0.32, 5.2), SH.dark, 0, F.top(1.0) + 0.05, 1.2);
  b.add(Box(0.22, 0.04, 5.3), SH.accent, 0, F.top(1.0) + 0.22, 1.2);
  b.add(Box(0.5, 0.03, 1.6), SH.matte, 0, F.top(-4.9) + 0.005, -4.9, Math.atan2(F.top(-4.1) - F.top(-5.7), 1.6), 0, 0);
  b.add(Cyl(0.025, 0.025, 1.2, 8), metal, 0, 0, -8.5, -HALF, 0, 0);
  // entrée d'air ventrale sous le cockpit
  b.add(Extrude([[-2.6, 0.0], [1.4, 0.0], [1.9, -0.25], [1.9, -0.5], [-2.2, -0.62]], 1.1, 0.04), SH.dark, 0, F.bot(-1.0) + 0.1, 0, 0, -HALF, 0);
  b.add(Extrude([[-2.56, -0.04], [-2.22, -0.56], [-2.15, -0.56], [-2.5, -0.04]], 0.92, 0), blackMat, 0, F.bot(-1.0) + 0.1, -0.02, 0, -HALF, 0);
  // ailes en double delta, plans canard
  b.add(Extrude([[-4.7, -4.0], [-4.7, -3.2], [-2.2, 0.4], [-0.8, 2.6], [0.8, 2.6], [2.2, 0.4], [4.7, -3.2], [4.7, -4.0]], 0.2), SH.hull, 0, WY, 0, -HALF, 0, 0);
  b.add(Extrude([[-2.0, 4.6], [-2.0, 4.9], [-0.6, 5.7], [0.6, 5.7], [2.0, 4.9], [2.0, 4.6]], 0.1), SH.dark, 0, 0.05, 0, -HALF, 0, 0);
  for (const s of [-1, 1]) {
    b.add(Box(Math.hypot(2.5, 3.6), 0.05, 0.14), SH.accent, s * 3.45, WY + 0.14, -1.4 + 0.12, 0, -s * Math.atan2(3.6, 2.5), 0);
    b.add(Box(0.12, 1.8, 1.7), SH.hull, s * 4.75, WY + 0.75, 3.4, 0.25, 0, s * -0.45);           // dérives de bout d'aile
    b.add(Box(0.16, 0.3, 0.9), SH.accent, s * 5.1, WY + 1.55, 3.7, 0.25, 0, s * -0.45);
    b.add(Box(2.6, 0.16, 0.45), SH.dark, s * 3.2, WY, 3.75);                                     // volets
    // émetteurs d'armes dans l'emplanture
    b.add(Cyl(0.2, 0.24, 2.4, 12), SH.dark, s * 1.3, -0.35, -2.6, -HALF, 0, 0);
    b.add(Cyl(0.09, 0.09, 1.4, 8), metal, s * 1.3, -0.35, -4.4, -HALF, 0, 0);
    b.add(Box(0.04, 0.2, 1.1), SH.dark, s * 2.5, WY + 0.12, 1.4);                               // cloison
    b.add(Box(0.6, 0.04, 1.5), blackMat, s * 1.5, WY - 0.12, 1.5);                              // soute de train
    b.add(Box(0.2, 0.24, 0.35), SH.dark, s * (F.half(-6.0) + 0.04), 0, -6.0);
  }
  // réacteur unique
  b.add(Cyl(0.92, 0.98, 3.0, 28), SH.dark, 0, -0.05, 3.5, -HALF, 0, 0);
  b.add(new THREE.TorusGeometry(0.97, 0.07, 8, 32), metal, 0, -0.05, 5.0);
  b.add(Cyl(0.8, 0.94, 1.2, 28, true), nozzleMat, 0, -0.05, 5.6, -HALF, 0, 0);
  b.add(Cyl(0.7, 0.78, 1.0, 28, true), nozzleMat, 0, -0.05, 5.55, -HALF, 0, 0);
  b.add(Cyl(0.68, 0.68, 0.06, 28), MAT.engine, 0, -0.05, 5.15, -HALF, 0, 0);
  b.add(Box(0.12, 0.7, 1.2), SH.dark, 0, F.bot(3.6) - 0.3, 3.6);
  b.add(Box(0.5, 0.04, 1.6), blackMat, 0, F.bot(-4.2) + 0.03, -3.4);
  const g = b.build();
  for (const s of [-1, 1]) { const r = decal(DECAL_ROUNDEL, 0.8, 0.8); r.position.set(s * 3.2, WY + 0.112, 2.4); r.rotation.x = -HALF; g.add(r); }
  const NZ = -4.2, noseY = F.bot(NZ) + 0.1, mainY = WY - 0.28;
  return addParts(g, {
    flames: [[0, -0.05, 6.15, 0.74]],
    retro: [[-(F.half(-6.0) + 0.04), 0, -6.2], [F.half(-6.0) + 0.04, 0, -6.2]],
    rcs: rcsSet(F.half(-6.0) + 0.2, F.top(-6.2) + 0.3, F.bot(-6.2) - 0.3, -6.2, 4.7, WY, 3.6),
    missiles: [[-2.6, WY - 0.6, 1.8], [2.6, WY - 0.6, 1.8], [-3.6, WY - 0.6, 2.6], [3.6, WY - 0.6, 2.6]],
    nav: [[0xff3b2b, -4.8, WY, 3.0], [0x3bff6a, 4.8, WY, 3.0], [0xffffff, 0, F.top(3.4) + 0.3, 3.4]],
    gear: [{ x: 0, y: noseY, z: NZ, fold: ['x', -1.62], pad: 0.36, brace: 1 }, { x: -1.5, y: mainY, z: 1.4, fold: ['z', 1.62], pad: 0.42, brace: -1 }, { x: 1.5, y: mainY, z: 1.4, fold: ['z', -1.62], pad: 0.42, brace: -1 }],
    doors: [[-1.8, WY - 0.13, 1.5, 0.6, 1.5, -1, 1.35], [1.8, WY - 0.13, 1.5, 0.6, 1.5, 1, 1.35], [-0.25, F.bot(-4.2) + 0.02, -3.4, 0.25, 1.6, -1, 1.45], [0.25, F.bot(-4.2) + 0.02, -3.4, 0.25, 1.6, 1, 1.45]],
    lamp: [0, -1.5, NZ - 0.25], engLight: [0, -0.2, 7.2],
    engines: [[0, -0.05, 6.3]],
    guns: [[-1.3, -0.35, -5.2], [1.3, -0.35, -5.2], [0, F.bot(-5) - 0.15, -5]],
  });
}

/* ---------- Rempart : canonnière lourde à double poutre et quatre réacteurs ---------- */
function buildRempart() {
  const P = [[0, 7.6], [0.6, 6.7], [1.2, 5.0], [1.6, 3.0], [1.82, 0.5], [1.86, -2.0], [1.76, -4.4], [1.45, -5.4]];
  const F = prof(P, 1.25, 0.85), b = new Builder(), BX = 3.7, BY = -0.15, WY = -0.25;
  b.add(Lathe(P, 32), SH.hull, 0, 0, 0, -HALF, 0, 0, 1.25, 1, 0.85);
  b.add(Sph(1, 32, 20), MAT.glass, 0, F.top(-2.6) - 0.22, -2.6, 0, 0, 0, 0.85, 0.62, 2.0);
  b.add(Sph(1, 24, 16), SH.dark, 0, F.top(-0.8) - 0.2, -0.6, 0, 0, 0, 0.75, 0.55, 1.1);
  b.add(Box(1.3, 0.5, 5.6), SH.dark, 0, F.top(2.0) + 0.05, 2.2);
  b.add(Box(0.36, 0.05, 5.7), SH.accent, 0, F.top(2.0) + 0.31, 2.2);
  b.add(Box(0.9, 0.03, 1.6), SH.matte, 0, F.top(-4.6) + 0.005, -4.6, Math.atan2(F.top(-3.8) - F.top(-5.4), 1.6), 0, 0);
  for (const s of [-1, 1]) {                                                                     // plaques de blindage
    b.add(Box(0.14, 0.9, 4.2), SH.dark, s * (F.half(-1) + 0.02), 0.15, -1.0, 0, 0, s * 0.12);
    b.add(Box(0.14, 0.7, 3.0), SH.dark, s * (F.half(2.6) + 0.02), 0.1, 2.6, 0, 0, s * 0.12);
  }
  // aile droite épaisse traversant les poutres
  b.add(Box(13.2, 0.42, 3.4), SH.hull, 0, WY, 1.2);
  b.add(Box(13.3, 0.06, 0.2), SH.accent, 0, WY + 0.18, -0.4);
  for (const s of [-1, 1]) {
    // poutre-réacteurs
    b.add(Cyl(0.95, 1.05, 9.0, 24), SH.dark, s * BX, BY, 1.6, -HALF, 0, 0);
    b.add(new THREE.ConeGeometry(0.95, 1.6, 24), SH.dark, s * BX, BY, -3.7, -HALF, 0, 0);
    b.add(Cyl(0.16, 0.16, 2.2, 10), metal, s * BX, BY, -5.3, -HALF, 0, 0);                     // canon de poutre
    b.add(Box(1.95, 0.08, 1.2), SH.accent, s * BX, BY + 0.98, -1.2);
    for (const dx of [-0.48, 0.48]) {
      b.add(Cyl(0.46, 0.5, 0.9, 20, true), nozzleMat, s * BX + dx, BY, 6.4, -HALF, 0, 0);
      b.add(Cyl(0.44, 0.44, 0.05, 20), MAT.engine, s * BX + dx, BY, 6.05, -HALF, 0, 0);
    }
    b.add(new THREE.TorusGeometry(1.0, 0.07, 8, 32), metal, s * BX, BY, 6.05);
    // dérives jumelles
    b.add(Box(0.2, 2.3, 2.4), SH.hull, s * BX, BY + 1.95, 5.3, 0.2, 0, 0);
    b.add(Box(0.24, 0.32, 1.2), SH.accent, s * BX, BY + 3.0, 5.6, 0.2, 0, 0);
    b.add(Box(0.5, 0.36, 0.5), SH.dark, s * 6.6, WY, 1.2);                                       // bouts d'aile
    b.add(Box(0.8, 0.04, 2.0), blackMat, s * BX, BY - 1.03, 1.0);                               // soute de train
    b.add(Box(0.24, 0.26, 0.36), SH.dark, s * (F.half(-5.6) + 0.04), 0, -5.6);
  }
  b.add(Box(7.6, 0.2, 1.4), SH.hull, 0, BY + 3.05, 5.7);                                         // empennage
  // tourelle de menton
  b.add(Sph(0.55, 16, 12), SH.dark, 0, F.bot(-4.0) - 0.15, -4.0);
  b.add(Cyl(0.11, 0.11, 1.6, 10), metal, 0, F.bot(-4.0) - 0.2, -5.0, -HALF, 0, 0);
  b.add(Box(0.6, 0.04, 1.8), blackMat, 0, F.bot(-2.6) + 0.03, -1.8);
  const g = b.build();
  for (const s of [-1, 1]) {
    const fin = new THREE.Group(); fin.position.set(s * BX, BY + 1.95, 5.3); fin.rotation.x = 0.2; g.add(fin);
    const n = decal(DECAL_NUM, 1.5, 1.5); n.position.x = s * 0.105; n.rotation.y = s * Math.PI / 2; fin.add(n);
    const r = decal(DECAL_ROUNDEL, 1.1, 1.1); r.position.set(s * 5.4, WY + 0.215, 1.3); r.rotation.x = -HALF; g.add(r);
  }
  const NZ = -2.6, noseY = F.bot(NZ) + 0.12, mainY = BY - 0.95;
  return addParts(g, {
    flames: [[-BX - 0.48, BY, 6.85, 0.44], [-BX + 0.48, BY, 6.85, 0.44], [BX - 0.48, BY, 6.85, 0.44], [BX + 0.48, BY, 6.85, 0.44]],
    retro: [[-(F.half(-5.6) + 0.04), 0, -5.85], [F.half(-5.6) + 0.04, 0, -5.85]],
    rcs: rcsSet(F.half(-5.6) + 0.2, F.top(-5.8) + 0.3, F.bot(-5.8) - 0.3, -5.8, 6.6, WY, 1.2),
    missiles: [[-1.95, WY - 0.65, 1.4], [1.95, WY - 0.65, 1.4], [-5.2, WY - 0.65, 1.4], [5.2, WY - 0.65, 1.4], [-2.7, WY - 0.65, 1.6], [2.7, WY - 0.65, 1.6]],
    nav: [[0xff3b2b, -6.9, WY, 1.2], [0x3bff6a, 6.9, WY, 1.2], [0xffffff, 0, BY + 3.25, 5.7]],
    gear: [{ x: 0, y: noseY, z: NZ, fold: ['x', -1.62], pad: 0.5, brace: 1 }, { x: -BX, y: mainY, z: 1.0, fold: ['z', 1.62], pad: 0.6, brace: -1 }, { x: BX, y: mainY, z: 1.0, fold: ['z', -1.62], pad: 0.6, brace: -1 }],
    doors: [[-BX - 0.4, BY - 1.04, 1.0, 0.8, 2.0, -1, 1.35], [BX + 0.4, BY - 1.04, 1.0, 0.8, 2.0, 1, 1.35], [-0.3, F.bot(-2.6) + 0.02, -1.8, 0.3, 1.8, -1, 1.45], [0.3, F.bot(-2.6) + 0.02, -1.8, 0.3, 1.8, 1, 1.45]],
    lamp: [0, -1.6, NZ - 0.3], engLight: [0, -0.2, 8.4],
    engines: [[-BX - 0.48, BY, 7.0], [-BX + 0.48, BY, 7.0], [BX - 0.48, BY, 7.0], [BX + 0.48, BY, 7.0]],
    guns: [[-BX, BY, -6.5], [BX, BY, -6.5], [0, F.bot(-4.0) - 0.2, -5.9]],
  });
}

/** Construit le vaisseau choisi. */
export function buildShip(id) { return id === 'vipere' ? buildVipere() : id === 'rempart' ? buildRempart() : buildPlayerShip(); }
/** Livrée : couleurs de la coque et des liserés. */
export function setPaint(hull, accent) { SH.hull.color.set(hull); SH.accent.color.set(accent); }

/** Train : t = 0 rentré, 1 sorti. Les trappes s'ouvrent d'abord, puis les jambes pivotent ; elles se referment à moitié une fois le train sorti. */
export function setGear(ship, t, compress = 0) {
  const P = ship.userData.parts; P.gearT = t;
  const legs = smooth(0.3, 1, t), doors = t >= 0.999 ? 0.75 : smooth(0, 0.3, t);
  for (const l of P.gear) {
    const [ax, a] = l.userData.fold; l.rotation.x = 0; l.rotation.z = 0; l.rotation[ax] = a * (1 - legs);
    l.visible = t > 0.02;
    const len = l.userData.len;
    l.userData.piston.position.y = -len * 0.76 + compress * 0.22;
    l.userData.foot.position.y = -len + compress * 0.22;
  }
  for (const d of P.doors) d.rotation.z = d.userData.ax * doors;
  P.lamp.visible = t > 0.95;
}

/** Animation par image : flammes, rétrofusées, propulseurs, feux. */
export function animateShip(ship, { power, boost, retro, rcs, time, missiles }) {
  const P = ship.userData.parts;
  for (const f of P.flames) {
    const u = f.material.uniforms; u.power.value = clamp(power, 0.05, 1.4); u.boost.value = boost; u.time.value = time;
    const len = 1.2 + power * 5 + boost * 7 + Math.sin(time * 60) * 0.25; f.scale.set(1 + boost * 0.15, 1 + boost * 0.15, len);
  }
  for (const r of P.retro) { const u = r.material.uniforms; u.power.value = Math.min(1.2, retro); u.boost.value = retro > 1 ? 1 : 0; u.time.value = time; const w = retro > 1 ? 1.8 : 1; r.scale.set(w, w, 0.5 + retro * 3.6); r.visible = retro > 0.02; }
  for (const k in P.rcs) { const s = P.rcs[k], v = clamp(rcs[k] || 0, 0, 1); s.material.opacity = v * (0.75 + Math.random() * 0.25); s.visible = v > 0.02; }
  P.missiles.forEach((m, i) => { m.visible = i < missiles; });
  P.engLight.intensity = 60 + power * 220 + boost * 300;
  const blink = (time % 1.2) < 0.08, strobe = (time % 1.6) > 1.5;
  P.nav[0].material.opacity = blink ? 1 : 0.35; P.nav[1].material.opacity = blink ? 1 : 0.35; P.nav[2].material.opacity = strobe ? 1 : 0.05;
}
