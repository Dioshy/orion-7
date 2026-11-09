// Interception Orion-7 : démarrage, transitions d'état et boucle principale.
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './style.css';

import * as THREE from 'three';
import { R, initRenderer, render, perfSample, updatePostFx } from './render/renderer.js';
import { initBackground, updateBackground, updateSunShadow, SUN_DIR } from './render/background.js';
import { initModels } from './render/models.js';
import { initDust, updateDust } from './render/dust.js';
import { settings, flags, saveFlags, addScore } from './core/settings.js';
import { audio, audioInit, setEngine, music, sfx } from './core/audio.js';
import { input, initInput, pollPad, setWantLock, requestLock, recenterStick, neutralStick } from './core/input.js';
import { G, DIFFS, newStats, simRunning, CAMPAIGN_WAVES } from './game/state.js';
import { initEffects, updateEffects, clearEffects, explode, updateScale } from './game/effects.js';
import { initWeapons, updateBullets, updateMissiles, updateEnemyMissiles, updateFlares, updateTorpedoes, syncTracers, clearProjectiles, stationAimPoint } from './game/weapons.js';
import { station, initStation, resetStation, updateStation, damageStation } from './game/station.js';
import { initGates, updateGates, hideGates } from './game/launch.js';
import { initAsteroids } from './game/asteroids.js';
import { setGear } from './render/ship.js';
import { initCockpit } from './render/cockpit.js';
import { smooth } from './core/util.js';
import { player, updateShipVisuals, updateMenuShip, killPlayer, initPlayer, resetPlayerForGame, prepareLaunch, updateLaunch, updatePlayer, skipLaunch, fireMissile, fireFlares, targetBoresight, targetCycle, targetTorpedo } from './game/player.js';
import { updateEnemies, rebuildTargets, clearEnemies, damageHostile } from './game/enemies.js';
import { boss, updateBoss, clearBoss } from './game/boss.js';
import { updatePickups, clearPickups } from './game/pickups.js';
import { updateWaves, launchWaveNow } from './game/waves.js';
import { updateCombo, resetCombo, banner } from './game/score.js';
import { rollUpgrades, applyUpgrade } from './game/upgrades.js';
import { updateCamera, resetCamera, startIntro } from './game/camera.js';
import { initHud, drawHUD } from './ui/hud.js';
import { comms, clearComms } from './ui/comms.js';
import { initMenus, show, showUpgrade, showOver, showVictory, statItems, medals, nav, updateBest } from './ui/menus.js';
import { initKeyLabels } from './ui/keys.js';
import { resetTutorial, updateTutorial } from './ui/tutorial.js';
import { rand } from './core/util.js';

const $ = id => document.getElementById(id);
const hudEl = $('hud');
let timers = [], lastAutoPause = 0, pendingVictory = false;
const later = (f, ms) => timers.push(setTimeout(f, ms));

/* ---------- Démarrage ---------- */
async function boot() {
  const bar = $('loadBar'), prog = (k) => { bar.style.width = `${Math.round(k * 100)}%`; return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };
  try {
    initRenderer($('gl'));
  } catch (e) {
    $('loading').remove(); const f = $('fatal'); f.hidden = false;
    f.textContent = 'WebGL est indisponible sur ce navigateur ou cette machine. Activez l\'accélération matérielle ou essayez un navigateur récent (Chrome, Firefox, Edge, Safari).';
    return;
  }
  await prog(0.15);
  initBackground(); await prog(0.35);
  initModels(); await prog(0.5);
  initEffects(); initWeapons(); initDust(); await prog(0.65);
  initStation(); initPlayer(); initGates(); initAsteroids(); G.player = player; initCockpit(); await prog(0.8);
  initHud(hudEl); initInput(hudEl); initKeyLabels();
  input.captureKeys = () => simRunning();
  input.onAction = onAction;
  input.onLockLost = () => { if (simRunning()) { lastAutoPause = performance.now(); setPause(true); } };
  initMenus({ start: startGame, resume: () => setPause(false), quit: quitGame, toMenu, pickUpgrade, endless: continueEndless, finish: () => { pendingVictory = false; G.state = G.prevState; endGame('victory'); } });
  G.hooks.waveCleared = onWaveCleared;
  G.hooks.stationLost = () => endGame('station');
  audio.listener = R.camera;
  updateScale();
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch { /* polices facultatives */ }
  // précompilation des shaders pour éviter les saccades au premier tir
  try { R.renderer.compile(R.scene, R.camera); R.renderer.compile(R.bgScene, R.bgCamera); } catch { /* facultatif */ }
  await prog(1);
  $('loading').remove();
  G.state = 'menu'; show('menu');
  addEventListener('blur', () => { if (simRunning()) setPause(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && simRunning()) setPause(true); });
  last = performance.now(); requestAnimationFrame(frame);
}

/* ---------- Transitions ---------- */
function clearWorld() {
  timers.forEach(clearTimeout); timers = [];
  clearEnemies(); clearProjectiles(); clearPickups(); clearBoss(); clearEffects();
  G.targets.length = 0; G.spawnQueue = []; G.clearedInfo = null; hideGates(); G.dmgDirs = []; G.banner = null; G.announce = null; G.timeScale = 1; G.slowT = 0; G.shake = 0;
}

function startGame() {
  audioInit(); applyMusic(0.2);
  clearWorld();
  G.diffKey = DIFFS[settings.difficulty] ? settings.difficulty : 'pilote'; G.diff = DIFFS[G.diffKey];
  G.endless = false; G.score = 0; G.wave = 0; G.waveActive = false; G.interT = 16; G.stats = newStats(); G.up = {}; G.time = 0;
  pendingVictory = false; resetCombo();
  resetStation(G.diff.stationHp); resetPlayerForGame(); resetTutorial(); clearComms();
  const fade = $('fade'); fade.style.transition = 'none'; fade.style.opacity = '0.35'; requestAnimationFrame(() => requestAnimationFrame(() => { fade.style.transition = ''; fade.style.opacity = '0'; }));
  show(null); hudEl.classList.add('flying');
  comms('Ici Contrôle Orion. Contacts hostiles détectés à 8 km. Décollage autorisé.');
  prepareLaunch(true); resetCamera(); startIntro(3.2); G.hudBoot = -3.2 * 0.7; recenterStick();
  setWantLock(true); requestLock();
}

function toMenu() {
  clearWorld(); G.state = 'menu'; player.alive = false;
  setWantLock(false); hudEl.classList.remove('flying'); setEngine(0); clearComms(); updateBest(); show('menu');
}

function setPause(on) {
  if (on && simRunning()) {
    G.prevState = G.state; G.state = 'paused'; show('pause'); setEngine(0); setWantLock(false); hudEl.classList.remove('flying');
    $('pauseText').textContent = `Vague ${G.wave} · score ${G.score.toLocaleString('fr-BE')} · ${player.lives} vaisseau${player.lives > 1 ? 'x' : ''} en réserve.`;
  } else if (!on && G.state === 'paused') {
    G.state = G.prevState; show(null); hudEl.classList.add('flying'); setWantLock(true); requestLock(); neutralStick();
  }
}
function quitGame() { if (G.state === 'paused') G.state = G.prevState; endGame('abandon'); }

function onWaveCleared(info) {
  if (info.victory) { pendingVictory = true; flags.victories++; saveFlags(); }
  const choices = rollUpgrades(3);
  G.pendingUpgrade = choices;
  G.prevState = G.state; G.state = 'upgrade'; setWantLock(false); setEngine(0); hudEl.classList.remove('flying');
  showUpgrade(info, choices, G.up);
}
function pickUpgrade(i) {
  if (G.state !== 'upgrade' || !G.pendingUpgrade || !G.pendingUpgrade[i]) return;
  const u = G.pendingUpgrade[i]; G.pendingUpgrade = null;
  applyUpgrade(u.id); sfx('upgrade');
  comms(`Amélioration installée : ${u.name}.`, 'good', 'Atelier');
  if (pendingVictory) { music.stinger('victory'); showVictory(statItems(G, Math.round(station.hp / station.maxHp * 100))); return; }
  resumeFromOverlay();
}
function continueEndless() {
  pendingVictory = false; G.endless = true;
  banner('MODE INFINI', 'Les vagues deviennent de plus en plus dures. Jusqu\'où tiendrez-vous ?', '#7dffb0', 4);
  resumeFromOverlay();
}
function resumeFromOverlay() { G.state = G.prevState; show(null); hudEl.classList.add('flying'); setWantLock(true); requestLock(); neutralStick(); }

function endGame(reason) {
  if (G.state === 'over') return;
  const flyingBefore = G.state;
  G.state = 'over'; G.overReason = reason; setWantLock(false); setEngine(0); hudEl.classList.remove('flying');
  const victory = reason === 'victory' || G.stats.wavesCleared >= CAMPAIGN_WAVES;
  music.stinger(victory ? 'victory' : 'defeat');
  if (reason === 'station') {
    for (let i = 0; i < 16; i++) later(() => explode(stationAimPoint(), new THREE.Vector3(), rand(25, 70), { debrisN: 8 }), i * 230);
    later(() => explode(new THREE.Vector3(0, 0, -20), new THREE.Vector3(), 160, { debrisN: 30 }), 3800);
  }
  if (flyingBefore !== 'dead') player.obj.visible = reason !== 'station' && player.alive;
  const rank = G.score > 0 ? addScore({ score: G.score, wave: G.wave, diff: G.diffKey, date: Date.now(), victory }) : -1;
  const T = {
    station: ['Débriefing', 'Station perdue', `Orion-7 n'a pas résisté à la vague ${G.wave}. Les torpilles et les drones sont la priorité : abattez-les avant l'impact, et pensez aux tourelles de défense.`],
    pilot: ['Débriefing', 'Escadrille anéantie', `Vos ${G.diff.lives} vaisseaux ont été détruits pendant la vague ${G.wave}. Gardez de la vitesse, utilisez les leurres et revenez au hangar pour réparer.`],
    abandon: ['Sortie interrompue', 'Retour au briefing', `Vous avez quitté la sortie pendant la vague ${G.wave}.`],
    victory: ['Rapport de Contrôle Orion', 'Mission accomplie', `Orion-7 est sauvée. ${G.endless ? `Vous avez tenu jusqu'à la vague ${G.wave} en mode infini.` : 'Les dix vagues ont été repoussées.'}`],
  }[reason];
  const data = { eyebrow: T[0], title: T[1], text: T[2], items: statItems(G, Math.round(station.hp / station.maxHp * 100)), medalList: medals(G), rank };
  later(() => showOver(data), reason === 'station' ? 5200 : reason === 'pilot' ? 2000 : 0);
}

/* ---------- Actions ---------- */
function onAction(a) {
  if (a === 'pause') {
    if (performance.now() - lastAutoPause < 500) return;
    if (G.state === 'paused') setPause(false); else if (simRunning()) setPause(true);
    return;
  }
  if (G.state === 'upgrade') { if (a.startsWith('pick')) pickUpgrade(+a.slice(4) - 1); return; }
  if (G.state === 'launch' && a === 'skip') { skipLaunch(); return; }
  if (G.state !== 'flight' && G.state !== 'launch') return;
  const p = player;
  switch (a) {
    case 'missile': fireMissile(); break;
    case 'target': targetBoresight(); break;
    case 'cycle': targetCycle(); break;
    case 'targetTorp': targetTorpedo(); break;
    case 'flare': fireFlares(); break;
    case 'fa': p.fa = !p.fa; comms(p.fa ? 'Assistance de vol active : les propulseurs compensent la dérive.' : 'Assistance coupée : vol newtonien pur. Rien ne freine, la poussée est directe.', p.fa ? '' : 'warn', 'Ordinateur de bord'); sfx('beep'); break;
    case 'camera': G.camMode = G.camMode === 'chase' ? 'cockpit' : 'chase'; break;
    case 'radar': G.radarRange = G.radarRange === 2000 ? 5000 : G.radarRange === 5000 ? 12000 : 2000; sfx('beep'); break;
    case 'zeroThrottle': p.throttle = 0; break;
    case 'launchWave': launchWaveNow(); break;
  }
}

/* ---------- Musique adaptative ---------- */
function applyMusic(x) { music.setIntensity(x); }
function musicTarget() {
  const s = G.state;
  if (s === 'menu' || s === 'loading') return 0.05;
  if (s === 'over') return 0.02;
  if (s === 'paused' || s === 'upgrade') return 0.12;
  if (!G.waveActive) return 0.18;
  let near = 0; for (const e of G.enemies) if (e.pos.distanceToSquared(player.pos) < 2500 * 2500) near++;
  return Math.min(1, 0.42 + near * 0.06 + (G.torps.length ? 0.12 : 0) + (boss ? 0.35 : 0));
}

/* ---------- Boucle ---------- */
let last = 0;
const vign = $('vignette'), shieldEl = $('shieldfx'), boostEl = $('boostfx'), odEl = $('odfx');
function step(h) {
  G.time += h;
  rebuildTargets();
  if (G.state === 'launch') updateLaunch(h);
  else if (G.state === 'flight') updatePlayer(h);
  else if (G.state === 'dead') {
    G.deadT -= h;
    if (G.deadT <= 0) { if (player.lives > 0) { prepareLaunch(false); resetCamera(); startIntro(2.6); G.hudBoot = -2.6 * 0.7; } else { endGame('pilot'); return; } }
  }
  updateEnemies(h); updateBoss(h); updateTorpedoes(h); updateEnemyMissiles(h); updateFlares(h);
  if (G.state === 'over') return;
  updateGates(h);
  updateWaves(h); updatePickups(h);
  updateBullets(h); updateMissiles(h);
  updateCombo(h); updateTutorial(h);
  G.hitMarkT -= h; G.killMarkT -= h; G.hurtT = Math.max(0, G.hurtT - h); G.shieldFxT = Math.max(0, G.shieldFxT - h);
  for (let i = G.dmgDirs.length - 1; i >= 0; i--) if ((G.dmgDirs[i].t -= h) <= 0) G.dmgDirs.splice(i, 1);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (import.meta.env.DEV && window.__noLoop) return;
  const rdt = Math.min((now - last) / 1000, 0.1); last = now;
  pollPad(nav);
  perfSample(rdt);
  if (G.slowT > 0) { G.slowT -= rdt; if (G.slowT <= 0) { G.slowT = 0; G.timeScale = 1; } else G.timeScale = Math.min(1, G.timeScale + rdt * 0.5); }
  const frozen = G.state === 'paused' || G.state === 'upgrade';
  const fxDt = frozen ? 0 : rdt * G.timeScale;
  if (simRunning()) {
    const n = Math.max(1, Math.ceil(fxDt / (1 / 60))), h = fxDt / n;
    for (let i = 0; i < n && simRunning(); i++) step(h);
    G.stats.time += fxDt;
  } else if (G.state === 'over') { rebuildTargets(); updateEnemies(fxDt); updateBullets(fxDt); updateMissiles(fxDt); }
  updateEffects(fxDt);
  updateStation(simRunning() ? fxDt : 0, frozen ? 0 : rdt);
  syncTracers();
  updateCamera(rdt, fxDt);
  R.camera.updateMatrixWorld();
  updateBackground(frozen ? 0 : rdt, R.camera);
  const flyingNow = G.state === 'flight' || G.state === 'launch';
  updateDust(R.camera.position, flyingNow ? player.vel : new THREE.Vector3());
  if (G.state === 'menu') updateMenuShip(rdt, now / 1000); else updateShipVisuals(frozen ? 0 : fxDt, now / 1000);
  const spdAmt = G.state === 'flight' && settings.shake > 0 ? Math.min(1, smooth(260, 720, player.vel.length()) * 0.85 + (player.boosting ? 0.25 : 0) + G.hurtT * 1.4) * (G.camMode === 'cockpit' ? 0.4 : 1) : 0;
  updatePostFx(SUN_DIR, spdAmt);
  updateSunShadow(G.state === 'dead' ? player.deathPos : player.pos);
  music.setIntensity(musicTarget());
  // voiles d'écran
  const lowHull = G.state === 'flight' && player.hull < player.S.maxHull * 0.3;
  vign.style.opacity = Math.max(G.hurtT * 1.6, lowHull ? 0.35 + 0.15 * Math.sin(now * 0.006) : 0);
  shieldEl.style.opacity = G.shieldFxT * 2.5;
  boostEl.style.opacity = G.state === 'flight' && player.boosting ? 1 : 0;
  odEl.style.opacity = G.state === 'flight' && player.odT > 0 ? 0.6 + 0.4 * Math.sin(now * 0.008) : 0;
  render();
  drawHUD();
}

if (import.meta.env.DEV) window.__orion = { G, player, station, startGame, endGame, setPause, R, damageHostile, damageStation, setGear, killPlayer, get boss() { return boss; } };
boot();
