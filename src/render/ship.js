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

/* Jambe de train : pivot en haut, vérin, patin d'atterrissage, feu. */
function gearLeg(len, padR) {
  const pivot = new THREE.Group();
  const strut = new THREE.Mesh(Cyl(0.15, 0.15, len * 0.62, 10), MAT.hullDark); strut.position.y = -len * 0.31; pivot.add(strut);
  const piston = new THREE.Mesh(Cyl(0.1, 0.1, len * 0.5, 10), metal); piston.position.y = -len * 0.72; pivot.add(piston);
  const collar = new THREE.Mesh(Cyl(0.2, 0.2, 0.18, 10), MAT.stripe); collar.position.y = -len * 0.6; pivot.add(collar);
  const brace = new THREE.Mesh(Box(0.07, len * 0.7, 0.07), MAT.hullDark); brace.position.set(0, -len * 0.4, 0.35); brace.rotation.x = -0.35; pivot.add(brace);
  const foot = new THREE.Group(); foot.position.y = -len;
  foot.add(new THREE.Mesh(Cyl(padR, padR * 1.15, 0.2, 16), MAT.hullDark));
  const tread = new THREE.Mesh(Cyl(padR * 1.1, padR * 1.1, 0.06, 16), blackMat); tread.position.y = -0.12; foot.add(tread);
  const lamp = new THREE.Mesh(Box(0.18, 0.08, 0.18), glow(0xffb347, 3)); lamp.position.set(0, 0.14, padR * 0.6); foot.add(lamp);
  pivot.add(foot);
  pivot.userData = { piston, foot, len };
  return pivot;
}
function door(w, l) { const pivot = new THREE.Group(); const d = new THREE.Mesh(Box(w, 0.06, l), MAT.hull); d.position.x = w / 2; pivot.add(d); return pivot; }

function shadowsOn(o) { o.traverse(m => { if (m.isMesh && m.material && m.material.isMeshStandardMaterial) { m.castShadow = true; m.receiveShadow = true; } }); }

export const GEAR_HEIGHT = 3.05; // hauteur de l'origine du vaisseau au-dessus du sol, train sorti

export function buildPlayerShip() {
  const b = new Builder();
  // fuselage
  b.add(Lathe([[0, 8.8], [0.28, 8.0], [0.6, 6.6], [0.95, 4.6], [1.2, 2.4], [1.34, 0], [1.4, -2.2], [1.32, -4.4], [1.08, -5.6]], 24), SH.hull, 0, 0, 0, -HALF, 0, 0, 1.15, 1, 0.8);
  b.add(Box(0.95, 0.5, 7.2), SH.dark, 0, 0.98, 1.6);
  b.add(Box(0.32, 0.06, 7.4), SH.accent, 0, 1.25, 1.6);
  for (const s of [-1, 1]) b.add(Box(0.95, 0.12, 5.4), SH.hull, s * 1.05, -0.12, -3.4, 0, s * 0.13, 0);
  // lignes de panneaux
  for (const z of [-5.8, -1.2, 2.6]) b.add(new THREE.TorusGeometry(1.3, 0.025, 4, 32), panelLine, 0, 0, z, 0, 0, 0, 1.15, 0.8, 1);
  // verrière et armature
  b.add(Sph(0.74, 24, 16), MAT.glass, 0, 0.8, -3.7, 0, 0, 0, 1, 0.78, 2.5);
  for (const z of [-4.9, -3.7, -2.5]) b.add(new THREE.TorusGeometry(0.74, 0.045, 6, 24, Math.PI), SH.dark, 0, 0.66, z, 0, 0, 0, 1, 0.82, 1);
  b.add(Box(0.07, 0.07, 3.6), SH.dark, 0, 1.38, -3.7);
  // entrées d'air
  for (const s of [-1, 1]) { b.add(Box(0.95, 0.95, 3.4), SH.dark, s * 1.48, -0.18, -0.5); b.add(Box(0.75, 0.75, 0.1), blackMat, s * 1.48, -0.18, -2.21); b.add(Box(0.95, 0.12, 0.6), SH.accent, s * 1.48, 0.34, -2.0); }
  // ailes delta avec apex
  b.add(Extrude([[-5.7, -4.4], [-5.7, -3.0], [-1.3, 1.2], [-0.9, 3.6], [0.9, 3.6], [1.3, 1.2], [5.7, -3.0], [5.7, -4.4]], 0.26), SH.hull, 0, -0.3, 0, -HALF, 0, 0);
  for (const s of [-1, 1]) {
    b.add(Box(3.6, 0.2, 0.55), SH.dark, s * 3.5, -0.3, 4.55);              // volets
    b.add(Box(4.2, 0.03, 0.08), panelLine, s * 3.3, -0.15, 2.4);                 // ligne de panneau
    // nacelles de canons en bout d'aile
    b.add(Cyl(0.34, 0.34, 4.8, 12), SH.dark, s * 5.75, -0.3, -1.4, -HALF, 0, 0);
    b.add(Cyl(0.13, 0.13, 2.6, 8), metal, s * 5.75, -0.3, -4.9, -HALF, 0, 0);
    b.add(Cyl(0.2, 0.2, 0.3, 8), SH.dark, s * 5.75, -0.3, -6.1, -HALF, 0, 0);
    b.add(Box(0.7, 0.1, 1.3), SH.accent, s * 5.75, 0.02, 0.2);
    // dérives inclinées
    b.add(Box(0.16, 2.7, 2.6), SH.hull, s * 1.38, 1.4, 3.9, 0.32, 0, s * -0.38);
    b.add(Box(0.2, 0.32, 1.3), SH.accent, s * 1.86, 2.62, 4.35, 0.32, 0, s * -0.38);
    // réacteurs
    b.add(Cyl(0.8, 0.88, 3.8, 18), SH.dark, s * 1.32, -0.1, 3.9, -HALF, 0, 0);
    b.add(new THREE.TorusGeometry(0.86, 0.07, 6, 24), metal, s * 1.32, -0.1, 5.75);
    b.add(Cyl(0.64, 0.82, 1.1, 18, true), nozzleMat, s * 1.32, -0.1, 6.35, -HALF, 0, 0);
    b.add(Cyl(0.6, 0.6, 0.08, 18), MAT.engine, s * 1.32, -0.1, 6.0, -HALF, 0, 0);
    // pylônes de missiles
    b.add(Box(0.14, 0.45, 1.6), SH.dark, s * 3.2, -0.62, 0.3);
    b.add(Box(0.14, 0.45, 1.6), SH.dark, s * 4.4, -0.62, 0.5);
    // logements de train
    b.add(Box(0.75, 0.05, 1.7), blackMat, s * 2.1, -0.46, 1.3);
    // tuyères d'attitude
    b.add(Box(0.3, 0.3, 0.4), SH.dark, s * 0.75, 0, -6.4);
    b.add(Box(0.25, 0.4, 0.4), SH.dark, s * 5.75, -0.3, 1.25);
  }
  b.add(Box(0.6, 0.05, 1.8), blackMat, 0, -1.02, -4.6);
  b.add(Box(0.3, 0.3, 0.4), SH.dark, 0, 0.55, -6.5);
  b.add(Box(0.3, 0.3, 0.4), SH.dark, 0, -0.55, -6.5);
  // détails supplémentaires
  b.add(Box(0.75, 0.035, 1.9), SH.matte, 0, 0.76, -5.35, -0.12, 0, 0);                 // panneau anti-reflets
  b.add(Cyl(0.03, 0.03, 1.5, 6), metal, 0, 0, -9.4, -HALF, 0, 0);                         // tube de Pitot
  b.add(Box(0.04, 0.42, 0.5), SH.dark, 0, 1.45, 3.4, -0.3, 0, 0);                         // antennes
  b.add(Box(0.04, 0.3, 0.4), SH.dark, 0, -1.0, 1.0, 0.3, 0, 0);
  for (const s of [-1, 1]) {
    b.add(Box(0.05, 0.28, 1.6), SH.dark, s * 3.0, -0.1, 0.4);                             // cloisons d'aile
    b.add(Box(0.12, 0.9, 1.5), SH.dark, s * 0.9, -1.15, 4.3, 0, 0, s * 0.45);             // dérives ventrales
    b.add(Box(1.6, 0.06, 0.12), SH.accent, s * 4.6, -0.13, -2.3, 0, s * 0.62, 0);          // bord d'attaque
    for (let k = 0; k < 12; k++) {                                                          // pétales de tuyère
      const a = k / 12 * Math.PI * 2;
      b.add(Box(0.28, 0.05, 0.75), SH.dark, s * 1.32 + Math.cos(a) * 0.86, -0.1 + Math.sin(a) * 0.86, 6.75, -Math.sin(a) * 0.12, Math.cos(a) * 0.12, a + HALF);
    }
  }
  const g = b.build();
  shadowsOn(g);
  // marquages : numéro d'escadrille sur les dérives, cocardes sur les ailes
  for (const s of [-1, 1]) {
    const fin = new THREE.Group(); fin.position.set(s * 1.38, 1.4, 3.9); fin.rotation.set(0.32, 0, s * -0.38); g.add(fin);
    const n = decal(DECAL_NUM, 1.6, 1.6); n.position.x = s * 0.085; n.rotation.y = s * Math.PI / 2; fin.add(n);
    const r = decal(DECAL_ROUNDEL, 1.1, 1.1); r.position.set(s * 4.1, -0.155, 0.6); r.rotation.x = -HALF; g.add(r);
  }

  // --- pièces animées ---
  const parts = { flames: [], retro: [], rcs: {}, missiles: [], nav: [], gear: [], doors: [], gearT: 1 };
  for (const s of [-1, 1]) {
    const f = flameMesh(0xeaf4ff, 0x3a7dff, 0.58); f.position.set(s * 1.32, -0.1, 6.5); g.add(f); parts.flames.push(f);
    const r = flameMesh(0xfff0e0, 0xff8a3a, 0.16); r.rotation.y = Math.PI; r.position.set(s * 0.75, 0, -6.65); g.add(r); parts.retro.push(r);
  }
  // propulseurs d'attitude : direction de l'éjection
  const rcsDef = { noseUp: [0, 0.8, -6.5], noseDown: [0, -0.8, -6.5], noseL: [-0.95, 0, -6.4], noseR: [0.95, 0, -6.4], lUp: [-5.75, 0.0, 1.25], lDown: [-5.75, -0.6, 1.25], rUp: [5.75, 0.0, 1.25], rDown: [5.75, -0.6, 1.25] };
  for (const k in rcsDef) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_GLOW, color: new THREE.Color(0xdfeaff).multiplyScalar(3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    sp.position.set(...rcsDef[k]); sp.scale.set(1.6, 1.6, 1); g.add(sp); parts.rcs[k] = sp;
  }
  // missiles visibles sous les ailes
  for (const [x, z] of [[-3.2, 0.3], [3.2, 0.3], [-4.4, 0.5], [4.4, 0.5]]) { const m = model('missile'); for (const c of [...m.children]) if (c.isSprite) m.remove(c); m.position.set(x, -1.05, z); m.scale.setScalar(1.15); g.add(m); parts.missiles.push(m); }
  // feux de navigation
  for (const [c, x, y, z] of [[0xff3b2b, -5.75, -0.3, -0.2], [0x3bff6a, 5.75, -0.3, -0.2], [0xffffff, 0, 1.3, 5.2]]) {
    const s = glowSprite(c, 1.8, 3, false); s.position.set(x, y, z); g.add(s); parts.nav.push(s);
  }
  // train d'atterrissage (pivots)
  const nose = gearLeg(2.0, 0.42); nose.position.set(0, -1.0, -4.6); nose.userData.fold = ['x', 1.62]; g.add(nose); parts.gear.push(nose);
  for (const s of [-1, 1]) {
    const m = gearLeg(2.1, 0.5); m.position.set(s * 2.1, -0.75, 1.3); m.userData.fold = ['z', s * 1.62]; g.add(m); parts.gear.push(m);
    const d = door(0.72, 1.7); d.position.set(s * 2.1 + s * 0.38, -0.5, 1.3); d.scale.x = -s; d.userData.ax = s * 1.3; g.add(d); parts.doors.push(d);
    const nd = door(0.3, 1.8); nd.position.set(s * 0.32, -1.04, -4.6); nd.scale.x = -s; nd.userData.ax = s * 1.4; g.add(nd); parts.doors.push(nd);
  }
  const eng = new THREE.PointLight(0x7fb0ff, 0, 30, 2); eng.position.set(0, -0.2, 8.2); g.add(eng); parts.engLight = eng;
  // phare d'atterrissage
  const lamp = glowSprite(0xffffff, 2.2, 3, false); lamp.position.set(0, -2.6, -4.9); g.add(lamp); parts.lamp = lamp;
  g.userData = {
    parts,
    engines: [new THREE.Vector3(-1.32, -0.1, 6.6), new THREE.Vector3(1.32, -0.1, 6.6)],
    guns: [new THREE.Vector3(-5.75, -0.3, -6.3), new THREE.Vector3(5.75, -0.3, -6.3), new THREE.Vector3(0, -1.2, -5)],
    rcsDirs: { noseUp: [0, 1, 0], noseDown: [0, -1, 0], noseL: [-1, 0, 0], noseR: [1, 0, 0], lUp: [0, 1, 0], lDown: [0, -1, 0], rUp: [0, 1, 0], rDown: [0, -1, 0] },
  };
  shadowsOn(g);
  return g;
}

/** Train : t = 0 rentré, 1 sorti. Les trappes s'ouvrent d'abord, puis les jambes pivotent. */
export function setGear(ship, t, compress = 0) {
  const P = ship.userData.parts; P.gearT = t;
  const legs = smooth(0.3, 1, t), doors = smooth(0, 0.3, t);
  for (const l of P.gear) {
    const [ax, a] = l.userData.fold; l.rotation.x = 0; l.rotation.z = 0; l.rotation[ax] = a * (1 - legs);
    l.visible = t > 0.02;
    l.userData.piston.position.y = -l.userData.len * 0.72 + compress * 0.25;
    l.userData.foot.position.y = -l.userData.len + compress * 0.25;
  }
  for (const d of P.doors) { d.rotation.z = d.userData.ax * doors; d.visible = true; }
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
