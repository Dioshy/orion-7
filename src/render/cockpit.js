// Cockpit 3D : rendu dans une passe séparée (plan proche de 2 cm), commandes animées, écrans en direct.
import * as THREE from 'three';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { R } from './renderer.js';
import { SUN_DIR } from './background.js';
import { G } from '../game/state.js';
import { player, SPD } from '../game/player.js';
import { station } from '../game/station.js';
import { boss } from '../game/boss.js';
import { PICKUP_INFO } from '../game/pickups.js';
import { clamp, fr, fmtDist, TAU } from '../core/util.js';

export const CK = { scene: null, camera: null, pass: null, stick: null, throttle: null, screens: [], lamps: {}, sun: null, glass: null, frame: 0, look: new THREE.Vector2() };
export const EYE = new THREE.Vector3(0, 1.05, -3.35); // position de l'œil dans le repère du vaisseau

const M = {
  panel: new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.55, roughness: 0.62 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x4a525c, metalness: 0.7, roughness: 0.4 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x353b44, metalness: 0.75, roughness: 0.35 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x111418, metalness: 0.3, roughness: 0.85 }),
  grip: new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.1, roughness: 0.9 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xe08a2a, metalness: 0.3, roughness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 1, roughness: 0.2 }),
};
const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };
const cyl = (a, b, h, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(a, b, h, 16), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); return m; };

function screen(w, h, cw, ch) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.15, 1.15, 1.15) }));
  return { cv, ctx: cv.getContext('2d'), tex, mesh, w: cw, h: ch };
}
function lamp(label, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.01), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  m.userData = { on: new THREE.Color(color).multiplyScalar(2.2), off: new THREE.Color(0x0c0d10), label };
  return m;
}

export function initCockpit() {
  const scene = CK.scene = new THREE.Scene();
  CK.camera = new THREE.PerspectiveCamera(80, R.W / R.H, 0.02, 40);
  scene.environment = R.scene.environment; scene.environmentIntensity = 0.4;
  CK.sun = new THREE.DirectionalLight(0xfff2dc, 2.4); scene.add(CK.sun, CK.sun.target);
  scene.add(new THREE.HemisphereLight(0x5a86c8, 0x080808, 0.9), new THREE.AmbientLight(0x404650, 0.7));
  const glowL = new THREE.PointLight(0x6fc8ff, 0.6, 1.4, 2); glowL.position.set(0, -0.3, -0.45); scene.add(glowL);

  // planche de bord inclinée vers le pilote
  const dash = new THREE.Group(); dash.position.set(0, -0.42, -0.66); dash.rotation.x = -0.5; scene.add(dash);
  dash.add(box(1.36, 0.42, 0.05, M.panel, 0, 0, -0.03));
  const sc = [screen(0.3, 0.24, 384, 307), screen(0.36, 0.32, 512, 455), screen(0.3, 0.24, 384, 307)];
  [[-0.43, -0.01], [0, 0], [0.43, -0.01]].forEach(([x, y], i) => {
    dash.add(box(sc[i].mesh.geometry.parameters.width + 0.035, sc[i].mesh.geometry.parameters.height + 0.035, 0.025, M.dark, x, y, -0.005));
    sc[i].mesh.position.set(x, y, 0.009); dash.add(sc[i].mesh);
    for (let k = 0; k < 5; k++) dash.add(box(0.022, 0.014, 0.012, M.trim, x - 0.1 + k * 0.05, y - sc[i].mesh.geometry.parameters.height / 2 - 0.03, 0.004));
  });
  CK.screens = sc;
  // auvent anti-reflets et voyants
  scene.add(box(1.42, 0.04, 0.3, M.panel, 0, -0.22, -0.78));
  scene.add(box(1.42, 0.012, 0.02, M.accent, 0, -0.2, -0.63));
  const lampDefs = [['lock', 0xff3b2b], ['missile', 0xff3b2b], ['fa', 0xffb347], ['od', 0xffd76a], ['boost', 0x6fc8ff], ['gear1', 0x3bff6a], ['gear2', 0x3bff6a], ['gear3', 0x3bff6a], ['hull', 0xff3b2b]];
  lampDefs.forEach(([k, col], i) => { const l = lamp(k, col); l.position.set(-0.32 + i * 0.08, -0.205, -0.64); l.rotation.x = -0.5; scene.add(l); CK.lamps[k] = l; });
  // sous la planche, consoles latérales
  scene.add(box(1.3, 0.36, 0.55, M.dark, 0, -0.74, -0.8));
  for (const s of [-1, 1]) {
    const con = new THREE.Group(); con.position.set(s * 0.46, -0.42, -0.36); con.rotation.z = s * -0.18; scene.add(con);
    con.add(box(0.26, 0.08, 0.7, M.panel, 0, -0.04, 0));
    con.add(box(0.27, 0.012, 0.71, M.trim, 0, 0.002, 0));
    for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) {
      const lit = Math.random() < 0.4;
      const b = box(0.028, 0.012, 0.028, lit ? new THREE.MeshBasicMaterial({ color: new THREE.Color(Math.random() < 0.5 ? 0x6fc8ff : 0xffb347).multiplyScalar(1.2) }) : M.trim, -0.08 + q * 0.055 * (s < 0 ? 1 : 1), 0.012, 0.1 + r * 0.07);
      con.add(b);
    }
    for (let q = 0; q < 3; q++) con.add(box(0.012, 0.04, 0.012, M.chrome, -0.06 + q * 0.04, 0.03, 0.3, 0.4));
    // montants de la verrière
    scene.add(box(0.05, 0.9, 0.06, M.frame, s * 0.78, 0.05, -0.92, -0.35, 0, s * 0.42));
    scene.add(box(0.06, 0.06, 1.8, M.frame, s * 0.72, -0.24, 0.0));
  }
  // arceaux de la verrière (fins, pour une bonne visibilité)
  for (const [z, r, t] of [[-1.05, 0.98, 0.022], [0.15, 0.92, 0.03], [0.9, 0.86, 0.04]]) {
    const a = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 48, Math.PI), M.frame); a.position.set(0, -0.26, z); scene.add(a);
  }
  const spine = box(0.035, 0.035, 2.0, M.frame, 0, 0.68, -0.05, 0.03); scene.add(spine);
  // verre de la verrière : reflets de Fresnel très discrets
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 48, 24, 0, TAU, 0, Math.PI * 0.62), new THREE.ShaderMaterial({
    uniforms: { sun: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 v = normalize(-vP); float f = pow(1.0 - abs(dot(vN, v)), 3.0);
        float glint = pow(max(dot(reflect(-sun, vN), v), 0.0), 60.0);
        float a = f * 0.18 + glint * 0.35; gl_FragColor = vec4(vec3(0.55,0.75,1.0) * a, a); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.BackSide,
  }));
  glass.rotation.x = -Math.PI / 2 + 0.25; glass.scale.set(1.0, 1.25, 1.05); glass.position.set(0, -0.26, -0.15); scene.add(glass); CK.glass = glass;
  // combinateur du viseur tête haute
  const comb = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17), new THREE.MeshBasicMaterial({ color: 0x3a6a5a, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
  comb.position.set(0, -0.13, -0.66); comb.rotation.x = -0.25; scene.add(comb);
  scene.add(box(0.3, 0.02, 0.03, M.frame, 0, -0.215, -0.66));

  // manche latéral (à droite) et manette des gaz (à gauche)
  const stickBase = new THREE.Group(); stickBase.position.set(0.31, -0.37, -0.4); scene.add(stickBase);
  stickBase.add(cyl(0.045, 0.06, 0.04, M.dark, 0, 0, 0));
  const stick = new THREE.Group(); stickBase.add(stick); CK.stick = stick;
  stick.add(cyl(0.012, 0.014, 0.12, M.chrome, 0, 0.06, 0));
  { const gr = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.07, 6, 12), M.grip); gr.position.set(0, 0.16, 0.005); gr.rotation.x = 0.15; stick.add(gr); }
  stick.add(cyl(0.02, 0.02, 0.012, M.trim, 0, 0.115, 0));
  stick.add(box(0.03, 0.02, 0.035, M.accent, 0, 0.215, -0.005));
  stick.add(box(0.012, 0.03, 0.012, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b2b).multiplyScalar(1.2) }), 0, 0.14, -0.03)); // gâchette
  const thrBase = new THREE.Group(); thrBase.position.set(-0.33, -0.37, -0.42); scene.add(thrBase);
  thrBase.add(box(0.07, 0.025, 0.24, M.dark, 0, 0, 0));
  for (let k = 0; k < 6; k++) thrBase.add(box(0.075, 0.004, 0.006, M.trim, 0, 0.014, -0.1 + k * 0.04));
  const thr = new THREE.Group(); thrBase.add(thr); CK.throttle = thr;
  thr.add(box(0.014, 0.12, 0.014, M.chrome, 0, 0.06, 0));
  { const gr = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.06, 6, 12), M.grip); gr.position.set(0.005, 0.13, 0); gr.rotation.z = Math.PI / 2; thr.add(gr); }
  const tb = box(0.02, 0.012, 0.02, new THREE.MeshBasicMaterial({ color: 0x223040 }), 0.03, 0.158, 0); thr.add(tb); CK.boostBtn = tb;

  scene.traverse(o => { o.frustumCulled = false; });
  CK.pass = new RenderPass(scene, CK.camera); CK.pass.clear = false; CK.pass.clearDepth = true; CK.pass.enabled = false;
  R.composer.insertPass(CK.pass, 2);
  R.onResize.push(() => { CK.camera.aspect = R.W / R.H; CK.camera.updateProjectionMatrix(); });
}

const _iq = new THREE.Quaternion(), _l = new THREE.Vector3();
/** Appelée chaque image : active la passe, place la caméra, anime commandes, voyants et écrans. */
export function updateCockpit(active, headPos, headQuat, fov, inp) {
  CK.pass.enabled = active;
  if (!active) return;
  const p = player, cam = CK.camera;
  cam.position.copy(headPos); cam.quaternion.copy(headQuat);
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  // soleil dans le repère du cockpit
  _iq.copy(p.obj.quaternion).invert(); _l.copy(SUN_DIR).applyQuaternion(_iq);
  CK.sun.position.copy(_l); CK.glass.material.uniforms.sun.value.copy(_l);
  // commandes
  CK.stick.rotation.set(inp.pitch * 0.32, inp.yaw * 0.35, inp.roll * 0.3);
  const t = p.boosting ? 1.15 : p.retroBoosting ? -0.25 : p.throttle;
  CK.throttle.rotation.x = 0.5 - t * 0.9;
  CK.boostBtn.material.color.set(p.boosting ? 0x6fc8ff : p.retroBoosting ? 0xffb347 : 0x223040).multiplyScalar(p.boosting || p.retroBoosting ? 2 : 1);
  // voyants
  const blink = Math.floor(performance.now() / 250) % 2 === 0, L = CK.lamps;
  const set = (k, on) => L[k].material.color.copy(on ? L[k].userData.on : L[k].userData.off);
  set('lock', p.lock >= 1); set('missile', G.eMissiles.some(m => m.target === p) && blink); set('fa', !p.fa); set('od', p.odT > 0);
  set('boost', p.boosting || p.retroBoosting); const g = p.gear > 0.95; set('gear1', g); set('gear2', g); set('gear3', g);
  set('hull', p.hull < p.S.maxHull * 0.3 && blink);
  // écrans (mis à jour une image sur deux)
  if ((CK.frame++ & 1) === 0) { drawRadar(CK.screens[1]); drawStatus(CK.screens[0]); drawTarget(CK.screens[2]); for (const s of CK.screens) s.tex.needsUpdate = true; }
}

/* ---------- Écrans multifonctions ---------- */
const C = { bg: '#04101a', grid: 'rgba(110,200,255,0.18)', txt: '#bfe6ff', dim: 'rgba(191,230,255,0.55)', host: '#ff8a66', alt: '#e08aff', amber: '#ffb347', red: '#ff5a4a', ok: '#7dffb0', friend: '#7fd4ff', gold: '#ffd76a' };
const F = (w, s) => `${w} ${s}px "IBM Plex Mono", monospace`;
function frame(s, title) {
  const c = s.ctx, w = s.w, h = s.h;
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#061522'); g.addColorStop(1, '#020a12');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(110,200,255,0.35)'; c.lineWidth = 2; c.strokeRect(4, 4, w - 8, h - 8);
  c.fillStyle = C.friend; c.font = F(600, Math.round(h * 0.055)); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(title, 14, 12);
  for (let y = 0; y < h; y += 3) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(0, y, w, 1); } // lignes de balayage
}
const _r = new THREE.Vector3(), _q = new THREE.Quaternion();
function drawRadar(s) {
  const c = s.ctx, w = s.w, h = s.h, p = player, range = G.radarRange;
  frame(s, `RADAR · ${fmtDist(range)}`);
  const cx = w / 2, cy = h * 0.56, Rr = Math.min(w, h) * 0.42;
  c.strokeStyle = C.grid; c.lineWidth = 1.5;
  for (const k of [1, 0.66, 0.33]) { c.beginPath(); c.arc(cx, cy, Rr * k, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(cx - Rr, cy); c.lineTo(cx + Rr, cy); c.moveTo(cx, cy - Rr); c.lineTo(cx, cy + Rr); c.stroke();
  // balayage
  const a = (performance.now() / 1000 * 1.6) % TAU;
  const sw = c.createConicGradient ? c.createConicGradient(a - 0.6, cx, cy) : null;
  if (sw) { sw.addColorStop(0, 'rgba(110,200,255,0)'); sw.addColorStop(0.095, 'rgba(110,200,255,0.18)'); sw.addColorStop(0.1, 'rgba(110,200,255,0)'); c.fillStyle = sw; c.beginPath(); c.arc(cx, cy, Rr, 0, TAU); c.fill(); }
  _q.copy(p.obj.quaternion).invert();
  const plot = (pos, col, shape, ring) => {
    _r.copy(pos).sub(p.pos).applyQuaternion(_q);
    let x = _r.x / range, z = _r.z / range; const d = Math.hypot(x, z), out = d > 1; if (out) { x /= d; z /= d; }
    const sx = cx + x * Rr, sy = cy + z * Rr, up = _r.y / range;
    c.globalAlpha = out ? 0.45 : 1; c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath();
    const r = shape === 'big' ? 9 : shape === 'small' ? 4 : 6.5;
    if (shape === 'sq') c.rect(sx - 7, sy - 7, 14, 14);
    else if (shape === 'dia') { c.moveTo(sx, sy - r); c.lineTo(sx + r, sy); c.lineTo(sx, sy + r); c.lineTo(sx - r, sy); c.closePath(); }
    else { c.moveTo(sx, sy - r); c.lineTo(sx + r * 0.9, sy + r * 0.7); c.lineTo(sx - r * 0.9, sy + r * 0.7); c.closePath(); }
    c.fill();
    if (Math.abs(up) > 0.04) { c.beginPath(); c.moveTo(sx + 11, sy); c.lineTo(sx + 17, sy + (up > 0 ? -7 : 7)); c.lineTo(sx + 23, sy); c.fill(); }
    if (ring) { c.beginPath(); c.arc(sx, sy, 14, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
  };
  plot(station.pos, C.friend, 'sq');
  for (const k of G.pickups) plot(k.pos, PICKUP_INFO[k.type].color, 'small');
  for (const e of G.enemies) plot(e.pos, e.kind === 'interceptor' ? C.alt : C.host, e.kind === 'bomber' ? 'big' : e.kind === 'drone' ? 'small' : 'tri', e === p.target);
  if (boss) plot(boss.pos, C.host, 'big', boss === p.target);
  for (const t of G.torps) plot(t.pos, C.amber, 'dia', t === p.target);
  for (const m of G.eMissiles) plot(m.pos, C.red, 'dia');
  c.fillStyle = C.txt; c.beginPath(); c.moveTo(cx, cy - 10); c.lineTo(cx + 7, cy + 7); c.lineTo(cx - 7, cy + 7); c.closePath(); c.fill();
  c.font = F(500, 18); c.fillStyle = C.dim; c.textAlign = 'right'; c.textBaseline = 'bottom';
  c.fillText(`HOSTILES ${G.enemies.length + (boss ? 1 : 0)}${G.torps.length ? ` · TORP ${G.torps.length}` : ''}`, w - 14, h - 10);
}
function bar(c, x, y, w, h, f, col, label, val) {
  c.fillStyle = 'rgba(191,230,255,0.15)'; c.fillRect(x, y, w, h); c.fillStyle = col; c.fillRect(x, y, w * clamp(f, 0, 1), h);
  c.font = F(500, 15); c.fillStyle = C.dim; c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillText(label, x, y - 3);
  c.fillStyle = col; c.textAlign = 'right'; c.fillText(val, x + w, y - 3);
}
function drawStatus(s) {
  const c = s.ctx, w = s.w, p = player, S = p.S;
  frame(s, 'SYSTÈMES');
  c.font = F(600, 40); c.fillStyle = p.boosting ? C.friend : p.retroBoosting ? C.amber : C.txt; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillText(fr(Math.round(p.vel.length())), 14, 80); c.font = F(500, 16); c.fillStyle = C.dim; c.fillText(`m/s · GAZ ${Math.round(p.throttle * SPD.cruise)}`, 14, 100);
  const x = 14, bw = w - 28;
  bar(c, x, 130, bw, 9, p.shield / S.maxShield, C.friend, 'BOUCLIERS', Math.round(p.shield));
  bar(c, x, 168, bw, 9, p.hull / S.maxHull, p.hull < S.maxHull * 0.3 ? C.red : p.hull < S.maxHull * 0.6 ? C.amber : C.txt, 'COQUE', Math.round(p.hull));
  bar(c, x, 206, bw, 9, p.odT > 0 ? 1 : p.heat / 100, p.odT > 0 ? C.gold : p.overheat ? C.red : p.heat > 70 ? C.amber : C.txt, p.odT > 0 ? 'SURCHARGE' : 'CHAUFFE', p.odT > 0 ? `${Math.ceil(p.odT)} s` : '');
  bar(c, x, 244, bw, 9, p.boost / S.maxBoost, C.friend, 'POSTCOMB.', `${Math.round(p.boost / S.maxBoost * 100)} %`);
  c.font = F(500, 16); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = C.txt;
  c.fillText(`MSL ${p.missiles}/${S.maxMissiles}  LRR ${p.flares}  ${p.fa ? 'FA' : 'FA OFF'}`, 14, 290);
}
function drawTarget(s) {
  const c = s.ctx, w = s.w, p = player, t = p.target && !p.target.dead ? p.target : null;
  frame(s, t ? 'CIBLE' : 'TACTIQUE');
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  if (t) {
    const col = t.kind === 'torp' ? C.amber : t.kind === 'emissile' ? C.red : t.kind === 'interceptor' ? C.alt : C.host;
    c.font = F(600, 24); c.fillStyle = col; c.fillText(t.label || '', 14, 66);
    const d = t.pos.distanceTo(p.pos);
    c.font = F(600, 34); c.fillStyle = C.txt; c.fillText(fmtDist(d), 14, 112);
    bar(c, 14, 150, w - 28, 9, t.hp / (t.maxHp || 1), col, 'INTÉGRITÉ', `${Math.round(t.hp / (t.maxHp || 1) * 100)} %`);
    bar(c, 14, 190, w - 28, 9, p.lock, p.lock >= 1 ? C.red : C.amber, 'VERROUILLAGE', p.lock >= 1 ? 'VERROUILLÉ' : `${Math.round(p.lock * 100)} %`);
    c.font = F(500, 17); c.fillStyle = C.dim;
    if (t.kind === 'torp') { c.fillStyle = t.eta < 10 ? C.red : C.amber; c.fillText(`IMPACT STATION ${Math.ceil(t.eta)} s`, 14, 236); }
    if (t.kind === 'boss' && t.shieldUp) { c.fillStyle = C.friend; c.fillText('BOUCLIER ACTIF', 14, 236); }
  } else {
    const f = station.hp / station.maxHp;
    c.font = F(600, 22); c.fillStyle = C.txt; c.fillText(`VAGUE ${G.wave}`, 14, 66);
    bar(c, 14, 104, w - 28, 9, f, f > 0.5 ? C.friend : f > 0.25 ? C.amber : C.red, 'ORION-7', `${Math.round(f * 100)} %`);
    c.font = F(500, 17); c.fillStyle = C.dim; c.fillText(`STATION ${fmtDist(p.pos.distanceTo(station.pos))}`, 14, 146);
    const torps = G.torps.slice().sort((a, b) => a.eta - b.eta).slice(0, 3);
    torps.forEach((tp, i) => { c.fillStyle = tp.eta < 10 ? C.red : C.amber; c.fillText(`TORPILLE · IMPACT ${Math.ceil(tp.eta)} s`, 14, 182 + i * 26); });
    if (!torps.length) { c.fillStyle = C.dim; c.fillText(!G.waveActive && G.interT > 0 ? `PROCHAINE VAGUE ${Math.ceil(G.interT)} s` : 'AUCUNE TORPILLE', 14, 182); }
  }
}
