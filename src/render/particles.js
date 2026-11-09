// Système de particules GPU : un seul appel de dessin par système, aucune allocation pendant le jeu.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute float size; attribute float alpha; attribute vec3 color;
uniform float uScale;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = -mv.z;
  gl_PointSize = d > 0.5 ? size * uScale / d : 0.0;
  vColor = color; vAlpha = alpha * smoothstep(1.5, 9.0, d);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha; uniform float uSoft;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, uSoft, d);
  a *= a;
  if (a * vAlpha < 0.004) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

export class Particles {
  constructor(max, { blending = THREE.AdditiveBlending, soft = 0, order = 0 } = {}) {
    this.max = max; this.count = 0; this.ring = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max); this.fadeIn = new Uint8Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    const mk = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('position', mk(this.pos, 3)); g.setAttribute('color', mk(this.col, 3));
    g.setAttribute('alpha', mk(this.alpha, 1)); g.setAttribute('size', mk(this.size, 1));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uSoft: { value: soft } }, vertexShader: VERT, fragmentShader: FRAG,
      blending, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = order;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, r2, g2, b2, a = 1, drag = 0, fadeIn = 0) {
    let i;
    if (this.count < this.max) i = this.count++;
    else { i = this.ring; this.ring = (this.ring + 1) % this.max; }
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r2; this.c1[i3 + 1] = g2; this.c1[i3 + 2] = b2;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0;
    this.a0[i] = a; this.alpha[i] = fadeIn ? 0 : a; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
  }

  _move(i, j) { // copie la particule j dans i
    const i3 = i * 3, j3 = j * 3;
    for (const arr of [this.pos, this.vel, this.c0, this.c1, this.col]) { arr[i3] = arr[j3]; arr[i3 + 1] = arr[j3 + 1]; arr[i3 + 2] = arr[j3 + 2]; }
    for (const arr of [this.life, this.maxLife, this.s0, this.s1, this.a0, this.drag, this.fadeIn, this.alpha, this.size]) arr[i] = arr[j];
  }

  update(dt) {
    let n = this.count;
    const P = this.pos, Vl = this.vel, C = this.col, C0 = this.c0, C1 = this.c1;
    for (let i = 0; i < n;) {
      const L = (this.life[i] += dt), t = L / this.maxLife[i];
      if (t >= 1) { n--; if (i !== n) this._move(i, n); continue; }
      const i3 = i * 3, k = Math.max(0, 1 - this.drag[i] * dt);
      Vl[i3] *= k; Vl[i3 + 1] *= k; Vl[i3 + 2] *= k;
      P[i3] += Vl[i3] * dt; P[i3 + 1] += Vl[i3 + 1] * dt; P[i3 + 2] += Vl[i3 + 2] * dt;
      C[i3] = C0[i3] + (C1[i3] - C0[i3]) * t; C[i3 + 1] = C0[i3 + 1] + (C1[i3 + 1] - C0[i3 + 1]) * t; C[i3 + 2] = C0[i3 + 2] + (C1[i3 + 2] - C0[i3 + 2]) * t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * (this.fadeIn[i] ? Math.min(1, t * 8) : 1);
      i++;
    }
    this.count = n; if (this.ring >= n) this.ring = 0;
    this.geo.setDrawRange(0, n);
    if (n > 0) for (const name of ['position', 'color', 'alpha', 'size']) {
      const a = this.geo.attributes[name]; a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
  }

  clear() { this.count = 0; this.ring = 0; this.geo.setDrawRange(0, 0); }
}
