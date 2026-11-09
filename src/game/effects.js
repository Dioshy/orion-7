// Effets visuels : explosions, étincelles, traînées, ondes de choc, débris, éclairs lumineux, textes flottants.
import * as THREE from 'three';
import { R, pointScale } from '../render/renderer.js';
import { Particles } from '../render/particles.js';
import { TEX_GLOW, NOISE_GLSL } from '../render/background.js';
import { rumble } from '../core/input.js';
import { MAT } from '../render/models.js';
import { G } from './state.js';
import { sfx } from '../core/audio.js';
import { settings } from '../core/settings.js';
import { rand, randUnit, ZERO } from '../core/util.js';

export let fire, smoke;
const flashes = [], rings = [], debris = [], lights = [], balls = [], wrecks = [];
const _v = new THREE.Vector3();

export function initEffects() {
  smoke = new Particles(5000, { blending: THREE.NormalBlending, soft: 0, order: 1 });
  fire = new Particles(14000, { blending: THREE.AdditiveBlending, soft: 0.1, order: 2 });
  R.scene.add(smoke.points, fire.points);
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX_GLOW, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.visible = false; s.renderOrder = 3; R.scene.add(s); flashes.push({ s, t: 0, life: 0, size: 0, vel: new THREE.Vector3(), on: false });
  }
  const ringGeo = new THREE.RingGeometry(0.93, 1, 64);
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; R.scene.add(m); rings.push({ m, t: 0, life: 0, size: 0, on: false });
  }
  const dg = [new THREE.BoxGeometry(1, 0.6, 1.4), new THREE.TetrahedronGeometry(0.9), new THREE.BoxGeometry(1.6, 0.25, 0.8)];
  for (let i = 0; i < 160; i++) {
    const m = new THREE.Mesh(dg[i % 3], i % 4 === 0 ? MAT.enemy : MAT.hullDark); m.visible = false; R.scene.add(m);
    debris.push({ m, t: 0, life: 0, vel: new THREE.Vector3(), spin: new THREE.Vector3(), on: false, burn: false });
  }
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffa060, 0, 600, 2); R.scene.add(l); lights.push({ l, t: 0, life: 1, peak: 0 }); }
  // boules de feu volumétriques (sphère déformée par du bruit, rampe de température)
  const ballGeo = new THREE.IcosahedronGeometry(1, 5);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(ballGeo, new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, seed: { value: Math.random() * 50 }, tint: { value: new THREE.Color() } },
      vertexShader: NOISE_GLSL + `uniform float t; uniform float seed; varying float vNz; varying vec3 vNr; varying vec3 vVw;
        void main(){ vec3 p = position; float n = snoise(p*1.7 + seed + t*1.6)*0.6 + snoise(p*4.2 + seed*1.7 - t)*0.3; vNz = n;
          vec4 wp = modelMatrix*vec4(p*(1.0 + n*0.38), 1.0); vNr = normalize(mat3(modelMatrix)*normal); vVw = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float t; uniform vec3 tint; varying float vNz; varying vec3 vNr; varying vec3 vVw;
        void main(){ float rim = abs(dot(normalize(vNr), vVw));
          float heat = clamp(rim*0.85 + vNz*0.55 - t*1.25 + 0.45, 0.0, 1.0);
          vec3 c = mix(vec3(0.35,0.05,0.01), tint*1.6, smoothstep(0.1, 0.55, heat));
          c = mix(c, vec3(3.6,3.0,2.2), smoothstep(0.7, 1.0, heat));
          float a = (1.0 - t*t) * smoothstep(0.0, 0.35, heat) * (0.35 + 0.65*rim);
          gl_FragColor = vec4(c, a); }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    m.visible = false; m.renderOrder = 2; R.scene.add(m); balls.push({ m, t: 0, life: 1, size: 1, vel: new THREE.Vector3(), on: false });
  }
  R.onResize.push(updateScale);
}
export function updateScale() { const s = pointScale(); fire.mat.uniforms.uScale.value = s; smoke.mat.uniforms.uScale.value = s; }

function grab(pool) { let best = pool[0]; for (const p of pool) { if (!p.on) return p; if (p.t / p.life > best.t / best.life) best = p; } return best; }

export function flash(pos, size, color, life = 0.4, vel = ZERO, k = 4) {
  const f = grab(flashes); f.on = true; f.t = 0; f.life = life; f.size = size; f.vel.copy(vel);
  f.s.position.copy(pos); f.s.material.color.set(color).multiplyScalar(k); f.s.visible = true; f.s.scale.set(size, size, 1);
}
export function shockwave(pos, size, color = 0xffc890, life = 0.7) {
  const r = grab(rings); r.on = true; r.t = 0; r.life = life; r.size = size;
  r.m.position.copy(pos); r.m.quaternion.copy(R.camera.quaternion); r.m.rotateX(rand(-0.6, 0.6)); r.m.rotateY(rand(-0.6, 0.6));
  r.m.material.color.set(color).multiplyScalar(3); r.m.visible = true;
}
export function lightFlash(pos, intensity, color = 0xffa060, life = 0.5, range = 600) {
  let best = lights[0]; for (const L of lights) if (L.t / L.life > best.t / best.life) best = L;
  best.t = 0; best.life = life; best.peak = intensity; best.l.position.copy(pos); best.l.color.set(color); best.l.distance = range; best.l.intensity = intensity;
}

/** Explosion complète : éclair, boule de feu, fumée, étincelles, débris, onde de choc, lumière et son. */
export function explode(pos, vel, size, { color = 0xffa255, debrisN = 0, sound = true, ring = size > 8, light = size > 5 } = {}) {
  const q = R.fxScale, c = new THREE.Color(color);
  if (size >= 7) {
    const b = grab(balls); b.on = true; b.t = 0; b.life = 0.55 + Math.min(size, 80) * 0.012; b.size = size * 1.15; b.vel.copy(vel).multiplyScalar(0.8);
    b.m.position.copy(pos); b.m.material.uniforms.tint.value.set(color); b.m.material.uniforms.seed.value = Math.random() * 50;
    b.m.rotation.set(rand(0, 6), rand(0, 6), 0); b.m.visible = true;
  }
  flash(pos, Math.min(size * 3.2, 200), color, 0.35 + Math.min(size, 60) * 0.012, vel, size > 40 ? 2 : 4);
  if (size > 3) flash(pos, Math.min(size * 1.4, 90), 0xffffff, 0.18, vel, size > 40 ? 1.5 : 4);
  const nFire = Math.min(220, (16 + size * 6) * q) | 0;
  for (let i = 0; i < nFire; i++) {
    randUnit(_v).multiplyScalar(rand(0.15, 1) * size * 2.6);
    const life = rand(0.5, 1.2) + size * 0.015, h = rand(0.85, 1.5);
    fire.emit(pos.x, pos.y, pos.z, vel.x * 0.8 + _v.x, vel.y * 0.8 + _v.y, vel.z * 0.8 + _v.z, life, size * rand(0.3, 0.7), size * rand(0.9, 1.6),
      2.4 * h, 1.7 * h, 0.9 * h, c.r * 0.9, c.g * 0.25, c.b * 0.05, 0.9, 1.6);
  }
  const nSpark = Math.min(160, (10 + size * 5) * q) | 0;
  for (let i = 0; i < nSpark; i++) {
    randUnit(_v).multiplyScalar(rand(0.5, 1) * size * 9 + 30);
    fire.emit(pos.x, pos.y, pos.z, vel.x + _v.x, vel.y + _v.y, vel.z + _v.z, rand(0.6, 1.6), rand(0.35, 0.8), 0.15, 4, 3, 1.8, 1.6, 0.5, 0.1, 1, 0.6);
  }
  const nSmoke = Math.min(90, (6 + size * 2.5) * q) | 0;
  for (let i = 0; i < nSmoke; i++) {
    randUnit(_v).multiplyScalar(rand(0.1, 0.8) * size * 1.4);
    const g = rand(0.05, 0.12);
    smoke.emit(pos.x + _v.x * 0.3, pos.y + _v.y * 0.3, pos.z + _v.z * 0.3, vel.x * 0.6 + _v.x, vel.y * 0.6 + _v.y, vel.z * 0.6 + _v.z, rand(1.8, 3.5) + size * 0.04, size * 0.6, size * rand(2, 3.4), g, g, g * 1.1, g * 0.6, g * 0.6, g * 0.65, 0.55, 0.5, 1);
  }
  for (let i = 0; i < debrisN; i++) {
    const d = grab(debris); d.on = true; d.t = 0; d.life = rand(3, 7); d.burn = Math.random() < 0.5;
    d.m.position.copy(pos); d.m.scale.setScalar(rand(0.5, 1.6) * Math.max(1, size / 10)); d.m.visible = true;
    d.vel.copy(randUnit(_v).multiplyScalar(rand(10, 45) + size)).add(vel); d.spin.set(rand(-5, 5), rand(-5, 5), rand(-5, 5));
  }
  if (ring) shockwave(pos, size * 9, color, 0.5 + size * 0.01);
  if (light) lightFlash(pos, Math.min(60, size * 4) * 1000, color, 0.35 + size * 0.015, Math.min(2500, size * 60));
  if (sound) { const big = size > 40; sfx(big ? 'bigboom' : size > 6 ? 'boom' : 'hit', big ? 1 : size > 6 ? 1 : 0.6, pos); }
  shakeAt(pos, size);
}

export function shakeAt(pos, size) {
  const d = R.camera.position.distanceTo(pos), r = 200 + size * 25;
  if (d < r) { addShake((1 - d / r) * size * 0.07); rumble(Math.min(1, (1 - d / r) * size * 0.04), 0.3, 120 + size * 4); }
}
export function addShake(a) { G.shake = Math.min(3, Math.max(G.shake, a * settings.shake)); }

/** Étincelles d'impact. */
export function sparks(pos, vel, color = 0xffe2a0, n = 8, speed = 60, size = 0.5) {
  const c = new THREE.Color(color).multiplyScalar(3);
  n = Math.max(2, (n * R.fxScale) | 0);
  for (let i = 0; i < n; i++) {
    randUnit(_v).multiplyScalar(rand(0.3, 1) * speed);
    fire.emit(pos.x, pos.y, pos.z, vel.x + _v.x, vel.y + _v.y, vel.z + _v.z, rand(0.2, 0.5), size, size * 0.2, c.r, c.g, c.b, c.r * 0.5, c.g * 0.2, c.b * 0.1, 1, 2);
  }
  fire.emit(pos.x, pos.y, pos.z, vel.x, vel.y, vel.z, 0.12, size * 6, size * 9, c.r, c.g, c.b, c.r, c.g, c.b, 0.8, 0);
}

/** Traînée de propulseur : particule émise dans le sillage d'un moteur. */
/** Traînée de propulseur. Les particules héritent très peu de la vitesse du vaisseau :
 *  elles restent sur la trajectoire réellement parcourue et suivent donc les virages. */
export function engineTrail(pos, back, vel, r, g, b, power, size = 1, life = 1) {
  const k = rand(0.85, 1.15), s = 6 + 10 * power;
  fire.emit(pos.x, pos.y, pos.z,
    vel.x * 0.06 + back.x * s + rand(-1, 1), vel.y * 0.06 + back.y * s + rand(-1, 1), vel.z * 0.06 + back.z * s + rand(-1, 1),
    rand(0.22, 0.32) * (0.6 + power * 0.4) * life, size * (0.8 + power * 0.4) * k, size * 0.12, r * k, g * k, b * k, r * 0.3, g * 0.12, b * 0.35, 0.55, 2.5);
}
export function smokePuff(pos, vel, size, life = 2, g = 0.12, a = 0.4) {
  smoke.emit(pos.x, pos.y, pos.z, vel.x + rand(-3, 3), vel.y + rand(-3, 3), vel.z + rand(-3, 3), life, size * 0.5, size * 2.2, g, g, g, g * 0.7, g * 0.7, g * 0.7, a, 0.8, 1);
}
export function firePuff(pos, vel, size) {
  fire.emit(pos.x + rand(-1, 1), pos.y + rand(-1, 1), pos.z + rand(-1, 1), vel.x + rand(-4, 4), vel.y + rand(-4, 4), vel.z + rand(-4, 4), rand(0.3, 0.7), size, size * 1.8, 2.6, 1.3, 0.4, 1, 0.2, 0.05, 0.8, 1);
}

/** Texte flottant dans le monde (score, bonus). */
export function popup(pos, text, color = '#ffd76a', big = false) {
  if (G.popups.length > 24) G.popups.shift();
  G.popups.push({ pos: pos.clone(), text, color, t: 0, life: big ? 1.8 : 1.1, big });
}

/** Épave en vrille : l'appareil part en tonneau en brûlant, puis explose. */
export function wreck(obj, vel, size, color, life) {
  wrecks.push({ obj, vel: vel.clone().multiplyScalar(0.85), spin: randUnit(new THREE.Vector3()).multiplyScalar(rand(3, 7)), t: 0, life, size, color });
}
export function updateEffects(dt) {
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const w = wrecks[i]; w.t += dt;
    w.obj.position.addScaledVector(w.vel, dt); w.obj.rotation.x += w.spin.x * dt; w.obj.rotation.y += w.spin.y * dt; w.obj.rotation.z += w.spin.z * dt;
    if (Math.random() < dt * 50) firePuff(w.obj.position, w.vel, w.size * 0.25);
    if (Math.random() < dt * 30) smokePuff(w.obj.position, _v.copy(w.vel).multiplyScalar(0.6), w.size * 0.35, 2.2, 0.08, 0.5);
    if (w.t >= w.life) { R.scene.remove(w.obj); wrecks.splice(i, 1); explode(w.obj.position, w.vel, w.size, { color: w.color, debrisN: Math.round(w.size / 2.5) }); }
  }
  fire.update(dt); smoke.update(dt);
  for (const b of balls) if (b.on) {
    b.t += dt; const k = b.t / b.life;
    if (k >= 1) { b.on = false; b.m.visible = false; continue; }
    b.m.position.addScaledVector(b.vel, dt); b.m.scale.setScalar(b.size * (0.35 + 0.85 * Math.sqrt(k))); b.m.material.uniforms.t.value = k;
  }
  for (const f of flashes) if (f.on) {
    f.t += dt; const k = f.t / f.life;
    if (k >= 1) { f.on = false; f.s.visible = false; continue; }
    f.s.position.addScaledVector(f.vel, dt); const s = f.size * (0.7 + k * 1.6); f.s.scale.set(s, s, 1); f.s.material.opacity = Math.pow(1 - k, 1.5);
  }
  for (const r of rings) if (r.on) {
    r.t += dt; const k = r.t / r.life;
    if (k >= 1) { r.on = false; r.m.visible = false; continue; }
    const s = r.size * (0.15 + Math.pow(k, 0.5)); r.m.scale.set(s, s, s); r.m.material.opacity = Math.pow(1 - k, 2) * 0.7;
  }
  for (const d of debris) if (d.on) {
    d.t += dt; const k = d.t / d.life;
    if (k >= 1) { d.on = false; d.m.visible = false; continue; }
    d.m.position.addScaledVector(d.vel, dt); d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt;
    if (d.burn && k < 0.6 && Math.random() < dt * 30) firePuff(d.m.position, ZERO, 0.8);
    if (k > 0.85) d.m.scale.multiplyScalar(0.95);
  }
  for (const L of lights) if (L.l.intensity > 0) { L.t += dt; L.l.intensity = L.t >= L.life ? 0 : L.peak * Math.pow(1 - L.t / L.life, 2); }
  for (let i = G.popups.length - 1; i >= 0; i--) { const p = G.popups[i]; p.t += dt; if (p.t > p.life) G.popups.splice(i, 1); }
}

export function clearEffects() {
  for (const w of wrecks) R.scene.remove(w.obj); wrecks.length = 0;
  fire.clear(); smoke.clear();
  for (const f of flashes) { f.on = false; f.s.visible = false; }
  for (const b of balls) { b.on = false; b.m.visible = false; }
  for (const r of rings) { r.on = false; r.m.visible = false; }
  for (const d of debris) { d.on = false; d.m.visible = false; }
  for (const L of lights) L.l.intensity = 0;
  G.popups.length = 0;
}
