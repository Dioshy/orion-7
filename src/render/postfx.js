// Post-traitements : rayons de soleil volumétriques (écran) et flou radial de vitesse avec aberration chromatique.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const GodRaysShader = {
  uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.5) }, strength: { value: 0 }, threshold: { value: 1.2 }, decay: { value: 0.955 }, density: { value: 0.85 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength; uniform float threshold; uniform float decay; uniform float density;
    varying vec2 vUv;
    #define N 40
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (strength < 0.002) { gl_FragColor = base; return; }
      vec2 delta = (vUv - sunPos) * density / float(N);
      vec2 uv = vUv; float illum = 1.0; vec3 acc = vec3(0.0);
      float jitter = fract(sin(dot(vUv, vec2(12.9898,78.233))) * 43758.5453);
      uv -= delta * jitter;
      for (int i = 0; i < N; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = max(dot(s, vec3(0.299, 0.587, 0.114)) - threshold, 0.0);
        acc += s * min(l, 4.0) * illum;
        illum *= decay;
      }
      gl_FragColor = vec4(base.rgb + acc * strength / float(N), base.a);
    }`,
};

export const SpeedShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.5) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; uniform vec2 center; varying vec2 vUv;
    void main(){
      vec2 c = vUv - center; float r = length(c);
      float k = amount * 0.06 * smoothstep(0.15, 0.8, r);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 10; i++) { float t = float(i) / 9.0; col += texture2D(tDiffuse, center + c * (1.0 - k * t)).rgb; }
      col /= 10.0;
      float ca = amount * 0.0022 * r;
      col.r = mix(col.r, texture2D(tDiffuse, center + c * (1.0 + ca)).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, center + c * (1.0 - ca)).b, 0.7);
      col *= 1.0 - amount * 0.25 * smoothstep(0.35, 0.9, r);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** Rayons de soleil en pleine résolution (30 échantillons, tramage fin), ajoutés à l'image. */
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
export class GodRaysPass extends Pass {
  constructor() {
    super();
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.raysMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, sunPos: { value: new THREE.Vector2(0.5, 0.5) }, threshold: { value: 1.2 }, decay: { value: 0.945 }, density: { value: 0.85 }, dither: { value: 1 }, aspect: { value: 1.6 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float threshold; uniform float decay; uniform float density; uniform float dither; uniform float aspect; varying vec2 vUv;
        #define N 30
        void main(){
          vec2 delta = (vUv - sunPos) * density / float(N);
          vec2 uv = vUv - delta * (dither > 0.5 ? fract(sin(dot(vUv, vec2(12.9898,78.233))) * 43758.5453) : 0.5);
          float illum = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < N; i++) {
            uv -= delta;
            vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
            // seule la lumière proche du soleil à l'écran émet des rayons (pas les balises, feux, explosions lointaines)
            vec2 dd = (uv - sunPos) * vec2(aspect, 1.0);
            float src = exp(-dot(dd, dd) * 38.0);
            acc += s * min(max(dot(s, vec3(0.299, 0.587, 0.114)) - threshold, 0.0), 4.0) * illum * src;
            illum *= decay;
          }
          gl_FragColor = vec4(acc / float(N), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: null }, strength: { value: 0 } },
      vertexShader: VS,
      fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tRays; uniform float strength; varying vec2 vUv; void main(){ vec4 b = texture2D(tDiffuse, vUv); gl_FragColor = vec4(b.rgb + texture2D(tRays, vUv).rgb * strength * 2.2, b.a); }',
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
    this.uniforms = { sunPos: this.raysMat.uniforms.sunPos, strength: this.compMat.uniforms.strength };
  }
  setSize(w, h) { this.w = w; this.h = h; this.raysMat.uniforms.aspect.value = w / Math.max(1, h); this.applyScale(); }
  /** Pleine résolution avec tramage fin, ou demi-résolution sans tramage (lisse) si la machine peine. */
  setScale(s) { if (s !== this.scale) { this.scale = s; this.applyScale(); } }
  applyScale() { const s = this.scale || 1; this.raysMat.uniforms.dither.value = s >= 1 ? 1 : 0; this.rt.setSize(Math.max(1, Math.round((this.w || 1) * s)), Math.max(1, Math.round((this.h || 1) * s))); }
  render(renderer, writeBuffer, readBuffer) {
    this.raysMat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.rt); this.quad.material = this.raysMat; this.quad.render(renderer);
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture; this.compMat.uniforms.tRays.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.material = this.compMat; this.quad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.raysMat.dispose(); this.compMat.dispose(); this.quad.dispose(); }
}
