// Arrière-plan : nébuleuse, étoiles, soleil et planète procédurale (shaders GPU, aucun temps de chargement).
import * as THREE from 'three';
import { R } from './renderer.js';
import { randUnit } from '../core/util.js';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.32, 0.72).normalize();
export const PLANET_POS = new THREE.Vector3(22000, -118000, 160000);
export const PLANET_R = 90000;
const ATMO_TOP = 1.035;

export const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p, int oct){ float s=0.0, a=0.5; for(int i=0;i<8;i++){ if(i>=oct) break; s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

let planet, stars;
export let SUN = null;
const uniforms = { time: { value: 0 }, sunDir: { value: SUN_DIR }, sunObj: { value: new THREE.Vector3() } };

export function glowTexture(size = 128, soft = false) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  if (soft) { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const TEX_GLOW = glowTexture();

function buildSky() {
  // nébuleuse volumétrique : shader coûteux (déformation de domaine, poussières, cœurs lumineux)
  // calculé une seule fois dans une cubemap HDR, puis utilisé comme fond.
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE_GLSL + `
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 bandN = normalize(vec3(0.3,0.85,-0.42));
        float bd = dot(d, bandN);
        // voie lactée : bande diffuse, granulation d'étoiles non résolues, couloirs de poussière
        float band = exp(-bd*bd*28.0);
        vec3 q = d*2.4;
        vec3 w = vec3(fbm(q+1.7,4), fbm(q+9.2,4), fbm(q+4.1,4));
        float grain = fbm(d*28.0 + w, 4)*0.5+0.5;
        float lanes = smoothstep(0.48, 0.72, fbm(d*6.0 + w*1.6 + 3.0, 6)*0.5+0.5) * exp(-bd*bd*60.0);
        vec3 mw = vec3(0.13,0.12,0.15) * band * (0.35 + 0.9*grain*grain) * (1.0 - 0.85*lanes);
        mw += vec3(0.22,0.16,0.1) * exp(-pow(length(d - normalize(vec3(-0.75,0.2,-0.6))), 2.0)*6.0) * band * (1.0 - lanes); // bulbe galactique
        // nébuleuses en émission : magenta, sarcelle, ambre, avec filaments et absorption
        float n = fbm(q*1.2 + w*1.6, 6)*0.5+0.5;
        float n2 = fbm(q*2.3 + w.yzx*2.0 + 7.0, 6)*0.5+0.5;
        float fil = pow(1.0 - abs(fbm(q*1.6 + w*1.2, 5)), 4.0);
        float region = smoothstep(0.45, 0.75, fbm(d*1.1 + 20.0, 3)*0.5+0.5);
        float dust = smoothstep(0.45, 0.8, fbm(q*1.9 - w*1.3 + 2.0, 5)*0.5+0.5);
        vec3 neb = vec3(0.30,0.06,0.28) * smoothstep(0.55, 0.92, n)
                 + vec3(0.03,0.20,0.26) * smoothstep(0.58, 0.95, n2)
                 + vec3(0.40,0.18,0.05) * smoothstep(0.75, 1.0, n*n2*1.6);
        neb *= (0.5 + 0.7*fil) * region;
        neb *= 1.0 - 0.8*dust;
        float core = smoothstep(0.86, 0.98, n) * (0.6 + 0.4*fil);
        neb += vec3(0.9,0.55,0.9) * core * 0.35;
        gl_FragColor = vec4(max(neb*0.3 + mw*0.6, 0.0), 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const bake = new THREE.Scene();
  bake.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat));
  const crt = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  new THREE.CubeCamera(1, 1000, crt).update(R.renderer, bake);
  R.bgScene.background = crt.texture;
  mat.dispose();

  // étoiles (taille et éclat variables ; les plus brillantes déclenchent le bloom)
  const N = 9000, M = 9000, pos = new Float32Array((N + M) * 3), col = new Float32Array((N + M) * 3), size = new Float32Array(N + M), v = new THREE.Vector3();
  const band = new THREE.Vector3(0.3, 0.85, -0.42).normalize();
  for (let i = 0; i < N + M; i++) {
    randUnit(v);
    if (i >= N) { const d = v.dot(band); v.addScaledVector(band, -d * (0.88 + Math.random() * 0.12)).normalize(); }
    v.multiplyScalar(1.5e6); pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random(), r = Math.random();
    let b = i < N ? 0.25 + Math.pow(r, 6) * 3.2 : 0.1 + Math.random() * 0.25;
    const c = t < 0.12 ? [1, 0.75, 0.55] : t < 0.35 ? [0.7, 0.82, 1] : [1, 0.97, 0.92];
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    size[i] = i < N ? 1.2 + Math.pow(r, 4) * 2.2 : 1.1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { pr: { value: 1 }, time: uniforms.time },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float pr; uniform float time;
      void main(){ vC = color * (0.85 + 0.15*sin(time*2.0 + position.x*0.001)); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = size*pr; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = smoothstep(1.0,0.0,d); gl_FragColor = vec4(vC*a*a*1.4, 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  stars.frustumCulled = false; R.bgScene.add(stars);
  R.onResize.push(() => { stars.material.uniforms.pr.value = R.pr; });

  // soleil : halo, cœur et traînée anamorphique
  const sunPos = SUN_DIR.clone().multiplyScalar(1.2e6);
  const add = (color, k, sx, sy, tex = TEX_GLOW) => {
    const m = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(m); s.scale.set(sx, sy, 1); s.position.copy(sunPos); R.bgScene.add(s); return s;
  };
  add(0xffe6c0, 1.2, 260000, 260000, glowTexture(128, true));
  add(0xfff1d6, 2.2, 90000, 90000);
  add(0xffffff, 5, 26000, 26000);
  add(0x9ec8ff, 0.5, 700000, 9000);
}

function buildPlanet() {
  const vert = `varying vec3 vObj; varying vec3 vN; varying vec3 vV;
    void main(){ vObj = normalize(position); vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: NOISE_GLSL + `
      uniform vec3 sunDir; uniform vec3 sunObj; uniform float time;
      varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      vec3 cloudSpace(vec3 p){ float ca = time*0.004; mat2 rot = mat2(cos(ca),-sin(ca),sin(ca),cos(ca)); p.xz = rot*p.xz; return p; }
      float cloudDen(vec3 q, int oct){ vec3 wq = q*vec3(2.2,4.4,2.2)+11.0; float cl = fbm(wq + 0.9*vec3(fbm(wq*0.7,2), fbm(wq*0.7+5.2,2), 0.0), oct); return smoothstep(0.08, 0.5, cl); }
      void main(){
        vec3 p = vObj;
        float h = fbm(p*1.8 + vec3(3.1,0.0,0.0), 6);
        float lat = abs(p.y);
        float land = smoothstep(0.02, 0.05, h);
        vec3 ocean = mix(vec3(0.004,0.02,0.07), vec3(0.01,0.07,0.15), smoothstep(-0.35, 0.03, h));
        float dry = smoothstep(0.35, 0.7, fbm(p*3.0+7.0, 3)*0.5+0.5 + (0.35-lat)*0.6);
        vec3 ground = mix(vec3(0.035,0.075,0.02), vec3(0.24,0.16,0.07), dry);
        ground = mix(ground, vec3(0.16,0.14,0.12), smoothstep(0.28,0.5,h));
        vec3 col = mix(ocean, ground, land);
        float ice = smoothstep(0.8, 0.86, lat + h*0.1);
        col = mix(col, vec3(0.75,0.8,0.86), ice);
        // nuages : densité, ombre portée au sol, auto-ombrage côté opposé au soleil
        vec3 cp = cloudSpace(p);
        float clouds = cloudDen(cp, 5) * 0.85;
        float shadow = cloudDen(cloudSpace(p + sunObj*0.014), 3);
        float self = cloudDen(cloudSpace(p + sunObj*0.006), 3);
        vec3 N = normalize(vN), V = normalize(vV);
        float ndl = dot(N, sunDir);
        float day = smoothstep(-0.1, 0.25, ndl);
        vec3 lit = col*max(ndl,0.0)*2.2*(1.0 - 0.6*shadow*(1.0-clouds)) + col*0.02;
        vec3 H = normalize(sunDir+V);
        float spec = pow(max(dot(N,H),0.0), 70.0)*(1.0-land)*(1.0-clouds)*(1.0-shadow*0.8)*1.6*step(0.0,ndl);
        float cloudLit = mix(1.0, 0.42, smoothstep(0.25, 0.9, self));
        vec3 cloudCol = vec3(0.92,0.94,0.97)*(max(ndl,0.0)*1.6*cloudLit + 0.012);
        cloudCol *= mix(vec3(1.0), vec3(1.0,0.6,0.35), smoothstep(0.35, 0.0, ndl)*step(0.0, ndl)); // nuages rosés au terminateur
        vec3 surf = mix(lit + vec3(1.0,0.9,0.75)*spec, cloudCol, clouds);
        // lumières des villes
        float city = pow(smoothstep(0.6,0.95, snoise(p*90.0)*0.5+0.5), 2.0) * smoothstep(0.6,0.85, snoise(p*9.0+3.0)*0.5+0.5) * land*(1.0-ice)*smoothstep(0.05,0.12,h);
        surf += vec3(1.0,0.62,0.28)*city*(1.0-day)*(1.0-clouds*0.85)*0.9;
        // orages : éclairs dans les nuages du côté nuit
        vec3 cell = floor(cp*55.0); vec3 fc = fract(cp*55.0) - 0.5;
        float hsh = fract(sin(dot(cell, vec3(12.9898,78.233,37.719)) + floor(time*6.0)*7.13)*43758.5453);
        float bolt = step(0.9965, hsh) * smoothstep(0.5, 0.0, length(fc)) * clouds * (1.0-day);
        surf += vec3(0.65,0.75,1.0) * bolt * 3.0;
        gl_FragColor = vec4(surf, 1.0);
      }`,
  });
  planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 160, 120), mat);
  planet.position.copy(PLANET_POS); planet.rotation.z = 0.35; R.bgScene.add(planet);

  // atmosphère : diffusion de Rayleigh et de Mie calculée par lancer de rayons (unités = rayon planétaire)
  const atmo = new THREE.ShaderMaterial({
    uniforms: { sunDir: uniforms.sunDir, pCenter: { value: PLANET_POS }, pRadius: { value: PLANET_R }, intensity: { value: 5.5 } },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `
      uniform vec3 sunDir; uniform vec3 pCenter; uniform float pRadius; uniform float intensity;
      varying vec3 vWorld;
      #define IS 14
      #define JS 6
      const float RP = 1.0, RA = ${ATMO_TOP.toFixed(3)};
      const float HR = 0.0045, HM = 0.0012;
      const vec3 KR = vec3(18.5, 43.9, 75.6);
      const float KM = 55.0, G = 0.76, PI = 3.14159265;
      vec2 rsi(vec3 ro, vec3 rd, float r){ float b = dot(ro, rd); float c = dot(ro, ro) - r*r; float d = b*b - c; if (d < 0.0) return vec2(1e5, -1e5); d = sqrt(d); return vec2(-b - d, -b + d); }
      void main(){
        vec3 ro = (cameraPosition - pCenter) / pRadius;
        vec3 rd = normalize(vWorld - cameraPosition);
        vec2 ta = rsi(ro, rd, RA); if (ta.x > ta.y) discard;
        ta.x = max(ta.x, 0.0);
        vec2 tp = rsi(ro, rd, RP); if (tp.x > 0.0 && tp.x < tp.y) ta.y = min(ta.y, tp.x);
        float ds = (ta.y - ta.x) / float(IS);
        float mu = dot(rd, sunDir), mumu = mu*mu, gg = G*G;
        float pR = 3.0 / (16.0*PI) * (1.0 + mumu);
        float pM = 3.0 / (8.0*PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0*mu*G, 1.5) * (2.0 + gg));
        vec3 sR = vec3(0.0), sM = vec3(0.0); float oR = 0.0, oM = 0.0;
        for (int i = 0; i < IS; i++) {
          vec3 pos = ro + rd * (ta.x + ds * (float(i) + 0.5));
          float h = length(pos) - RP;
          float dR = exp(-h / HR) * ds, dM = exp(-h / HM) * ds;
          oR += dR; oM += dM;
          if (rsi(pos, sunDir, RP).x > 0.0) continue; // dans l'ombre de la planète
          float dl = rsi(pos, sunDir, RA).y / float(JS); float lR = 0.0, lM = 0.0;
          for (int j = 0; j < JS; j++) { float lh = length(pos + sunDir * (dl * (float(j) + 0.5))) - RP; lR += exp(-lh / HR) * dl; lM += exp(-lh / HM) * dl; }
          vec3 att = exp(-(KR * (oR + lR) + KM * 1.1 * (oM + lM)));
          sR += dR * att; sM += dM * att;
        }
        gl_FragColor = vec4(intensity * (pR * KR * sR + pM * KM * sM), 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const a = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * ATMO_TOP, 128, 96), atmo); a.position.copy(PLANET_POS); a.renderOrder = 1; R.bgScene.add(a);

  // lune lointaine
  const moon = new THREE.Mesh(new THREE.SphereGeometry(14000, 48, 32), new THREE.ShaderMaterial({
    uniforms, vertexShader: vert,
    fragmentShader: NOISE_GLSL + `uniform vec3 sunDir; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
      void main(){ float n = fbm(vObj*4.0, 5)*0.5+0.5; float cr = smoothstep(0.55,0.6, snoise(vObj*9.0)*0.5+0.5);
        vec3 c = vec3(0.32,0.3,0.28)*(0.6+0.6*n) - cr*0.06; float ndl = max(dot(normalize(vN), sunDir),0.0);
        gl_FragColor = vec4(c*ndl*2.0 + c*0.01, 1.0); }`,
  }));
  moon.position.set(-260000, 70000, -420000); R.bgScene.add(moon);
}

function buildLights() {
  // soleil chaud avec ombres portées (cadrage serré autour du vaisseau), lumière froide renvoyée par la planète
  const sun = SUN = new THREE.DirectionalLight(0xfff0d8, 3.8);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 1600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  R.scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight(0x4f7fc8, 0.9); bounce.position.copy(PLANET_POS).normalize(); R.scene.add(bounce);
  R.scene.add(new THREE.HemisphereLight(0x1c2232, 0x35558a, 1.1));
  R.scene.add(new THREE.AmbientLight(0x30343c, 0.45));
  // éclairage intérieur du hangar
  for (const z of [36, 66]) { const l = new THREE.PointLight(0xdfeaff, 1800, 80, 2); l.position.set(0, 14, z); R.scene.add(l); }
  // environnement pour les reflets métalliques : planète bleue en bas, soleil, vide
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
    uniforms: { sun: { value: SUN_DIR }, pl: { value: PLANET_POS.clone().normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sun; uniform vec3 pl; varying vec3 vD;
      void main(){ float p = smoothstep(0.55, 0.75, dot(vD, pl)); float s = pow(max(dot(vD, sun),0.0), 64.0);
        vec3 c = vec3(0.05,0.12,0.25)*p + vec3(0.012,0.014,0.02) + vec3(4.0,3.7,3.3)*s; gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide,
  })));
  const pm = new THREE.PMREMGenerator(R.renderer);
  R.scene.environment = pm.fromScene(env, 0).texture; R.scene.environmentIntensity = 0.6;
  pm.dispose();
}

export function initBackground() { buildLights(); buildSky(); buildPlanet(); }

const _pq = new THREE.Quaternion();
export function updateBackground(dt, camera) {
  uniforms.time.value += dt;
  if (planet) { planet.rotation.y += 0.002 * dt; uniforms.sunObj.value.copy(SUN_DIR).applyQuaternion(_pq.copy(planet.quaternion).invert()); }
  R.bgCamera.position.copy(camera.position);
  R.bgCamera.quaternion.copy(camera.quaternion);
  if (R.bgCamera.fov !== camera.fov) { R.bgCamera.fov = camera.fov; R.bgCamera.updateProjectionMatrix(); }
  stars.position.copy(camera.position);
}

/** Recentre le cadrage des ombres du soleil sur le point d'intérêt (vaisseau). */
const _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _sf = new THREE.Vector3();
export function updateSunShadow(focus) {
  if (!SUN) return;
  // alignement sur la grille des texels de l'ombre : pas de scintillement quand on bouge
  _lx.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize(); _ly.crossVectors(SUN_DIR, _lx);
  const t = 150 / SUN.shadow.mapSize.x, snap = v => Math.round(v / t) * t;
  _sf.copy(_lx).multiplyScalar(snap(focus.dot(_lx))).addScaledVector(_ly, snap(focus.dot(_ly))).addScaledVector(SUN_DIR, focus.dot(SUN_DIR));
  SUN.target.position.copy(_sf); SUN.position.copy(_sf).addScaledVector(SUN_DIR, 800);
  SUN.target.updateMatrixWorld();
}
