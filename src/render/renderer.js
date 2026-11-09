// Moteur de rendu : arrière-plan lointain (planète, ciel) + scène de combat, bloom HDR, qualité adaptative.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GodRaysPass, SpeedShader } from './postfx.js';
import { settings } from '../core/settings.js';

const PRESETS = {
  low: { pr: 0.75, bloom: false, samples: 0, fx: 0.5, rays: false, shadows: false },
  medium: { pr: 1, bloom: true, samples: 0, fx: 0.8, rays: true, shadows: true },
  high: { pr: 2, bloom: true, samples: 4, fx: 1, rays: true, shadows: true },
  auto: { pr: 1.5, bloom: true, samples: 0, fx: 1, rays: true, shadows: true },
};

export const R = {
  renderer: null, composer: null, bloom: null, scene: null, camera: null, bgScene: null, bgCamera: null,
  W: 1, H: 1, DPR: 1, pr: 1, prMax: 1, preset: PRESETS.auto, fxScale: 1, fps: 60, onResize: [],
  _acc: 0, _frames: 0, _cool: 0,
};

export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  R.renderer = renderer;
  R.scene = new THREE.Scene();
  R.camera = new THREE.PerspectiveCamera(settings.fov, 1, 1, 60000);
  R.bgScene = new THREE.Scene(); R.bgScene.background = new THREE.Color(0x000000);
  R.bgCamera = new THREE.PerspectiveCamera(settings.fov, 1, 400, 2.2e6);

  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  const bgPass = new RenderPass(R.bgScene, R.bgCamera);
  const mainPass = new RenderPass(R.scene, R.camera); mainPass.clear = false; mainPass.clearDepth = true;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.35, 1.05);
  const rays = new GodRaysPass(), speed = new ShaderPass(SpeedShader);
  composer.addPass(bgPass); composer.addPass(mainPass); composer.addPass(rays); composer.addPass(bloom); composer.addPass(speed); composer.addPass(new OutputPass());
  R.composer = composer; R.bloom = bloom; R.rays = rays; R.speed = speed;
  applyQuality();
  addEventListener('resize', resize); resize();
}

export function applyQuality() {
  const p = R.preset = PRESETS[settings.quality] || PRESETS.auto;
  const dpr = devicePixelRatio || 1;
  R.prMax = Math.min(dpr, p.pr);
  R.pr = settings.quality === 'auto' ? Math.min(R.prMax, Math.max(1, R.pr || 1)) : R.prMax;
  R.bloom.enabled = p.bloom && settings.bloom > 0.01; R.raysAllowed = p.rays;
  R.renderer.shadowMap.enabled = p.shadows; R.renderer.shadowMap.needsUpdate = true;
  R.bloom.strength = 0.8 * settings.bloom; R.bloom.radius = 0.25 + 0.2 * settings.bloom;
  R.fxScale = p.fx;
  for (const t of [R.composer.renderTarget1, R.composer.renderTarget2]) if (t.samples !== p.samples) { t.samples = p.samples; t.dispose(); }
  resize();
}

export function resize() {
  const W = R.W = innerWidth, H = R.H = innerHeight; R.DPR = Math.min(devicePixelRatio || 1, 2);
  R.renderer.setPixelRatio(R.pr); R.renderer.setSize(W, H, false);
  R.composer.setPixelRatio(R.pr); R.composer.setSize(W, H);
  for (const c of [R.camera, R.bgCamera]) { c.aspect = W / H; c.updateProjectionMatrix(); }
  for (const f of R.onResize) f(W, H);
}

/** Résolution dynamique : en mode auto, ajuste la densité de pixels pour rester fluide. */
export function perfSample(dt) {
  R._acc += dt; R._frames++;
  if (R._acc < 1.5) return;
  R.fps = R._frames / R._acc; R._acc = 0; R._frames = 0;
  if (settings.quality !== 'auto' || (import.meta.env.DEV && window.__fix)) return;
  if (R._cool > 0) { R._cool--; return; }
  let pr = R.pr;
  if (R.fps < 48 && pr > 0.75) pr = Math.max(0.75, pr * 0.88);
  else if (R.fps > 57 && pr < R.prMax) pr = Math.min(R.prMax, pr * 1.1);
  if (Math.abs(pr - R.pr) > 0.01) { R.pr = pr; resize(); R._cool = 2; }
}

/** Facteur de conversion taille monde → pixels pour les particules. */
export const pointScale = () => R.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(R.camera.fov) / 2));

const _sun = new THREE.Vector3();
/** Met à jour les post-traitements : position du soleil à l'écran, intensité du flou de vitesse. */
export function updatePostFx(sunDir, speedAmount) {
  _sun.copy(sunDir).multiplyScalar(1e6).add(R.bgCamera.position).project(R.bgCamera);
  const behind = _sun.z > 1, edge = Math.max(Math.abs(_sun.x), Math.abs(_sun.y));
  const k = behind ? 0 : Math.max(0, Math.min(1, (1.6 - edge) / 0.9));
  R.rays.uniforms.sunPos.value.set(_sun.x * 0.5 + 0.5, _sun.y * 0.5 + 0.5);
  R.rays.uniforms.strength.value = k * 0.9;
  R.rays.enabled = R.raysAllowed && k > 0.01;
  R.speed.uniforms.amount.value = speedAmount;
  R.speed.enabled = speedAmount > 0.01;
}

export function render() { R.composer.render(); }
