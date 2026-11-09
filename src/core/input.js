// Clavier, souris (capture du pointeur + manche virtuel) et manette standard.
import { settings } from './settings.js';
import { clamp } from './util.js';

export const KEY_ACTIONS = {
  KeyG: 'missile', KeyT: 'target', KeyY: 'cycle', Tab: 'targetTorp', KeyB: 'fa', KeyV: 'camera', KeyN: 'radar',
  KeyC: 'flare', KeyX: 'zeroThrottle', KeyP: 'pause', Escape: 'pause', Enter: 'launchWave', NumpadEnter: 'launchWave',
  Digit1: 'pick1', Digit2: 'pick2', Digit3: 'pick3', Numpad1: 'pick1', Numpad2: 'pick2', Numpad3: 'pick3', Space: 'skip',
};
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
// Manette « standard » : boutons → actions ponctuelles
const PAD_ACTIONS = { 0: 'target', 1: 'fa', 2: 'cycle', 3: 'camera', 4: 'flare', 8: 'radar', 9: 'pause', 10: 'targetTorp', 11: 'zeroThrottle' };

export const input = {
  keys: {}, mouse: { x: innerWidth / 2, y: innerHeight / 2, l: false }, stick: { x: 0, y: 0 },
  locked: false, wantLock: false, steer: true, neutral: false, neutralMove: 0, canvas: null, onAction: () => {}, onLockLost: () => {}, usingPad: false,
  pad: null, padBtn: [], padPrevBtn: [], ax: { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 }, captureKeys: () => false,
};

export function initInput(canvas) {
  input.canvas = canvas;
  addEventListener('keydown', e => {
    if (PREVENT.has(e.code) && input.captureKeys()) e.preventDefault();
    if (e.repeat) return;
    input.keys[e.code] = true; input.usingPad = false;
    const a = KEY_ACTIONS[e.code]; if (a) input.onAction(a, 'key');
  });
  addEventListener('keyup', e => { input.keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; input.mouse.l = false; });
  addEventListener('mousemove', e => {
    input.mouse.x = e.clientX; input.mouse.y = e.clientY;
    if (input.neutral) { input.neutralMove += Math.abs(e.movementX) + Math.abs(e.movementY); if (input.neutralMove > 30) input.neutral = false; }
    if (input.locked && input.steer && !input.neutral) {
      const k = settings.sensitivity * 1.15 / (Math.min(innerWidth, innerHeight) * 0.3);
      const s = input.stick;
      s.x += clamp(e.movementX, -150, 150) * k; s.y += clamp(e.movementY, -150, 150) * k;
      const l = Math.hypot(s.x, s.y); if (l > 1) { s.x /= l; s.y /= l; }
    }
  });
  canvas.addEventListener('mousedown', e => {
    input.usingPad = false;
    if (e.button === 0) input.mouse.l = true;
    if (e.button === 2) input.onAction('missile', 'mouse');
    if (input.wantLock && !input.locked) requestLock();
  });
  addEventListener('mouseup', e => { if (e.button === 0) input.mouse.l = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked; input.locked = document.pointerLockElement === canvas;
    if (input.locked && !was) { input.stick.x = 0; input.stick.y = 0; }
    if (was && !input.locked) input.onLockLost();
  });
  addEventListener('gamepadconnected', () => { input.usingPad = true; });
}

export function requestLock() {
  if (settings.mouseMode !== 'lock' || input.locked || !input.canvas.requestPointerLock) return;
  try {
    const p = input.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => { try { const q = input.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch { /* refus du navigateur */ } });
  } catch { /* refus du navigateur */ }
}
export function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
export function setWantLock(on) { input.wantLock = on && settings.mouseMode === 'lock'; if (!on) releaseLock(); }

/** Position du manche : capture → manche virtuel ; sinon position du curseur par rapport au centre. */
export function getStick(W, H) {
  if (!input.steer || input.neutral) { input.stick.x = 0; input.stick.y = 0; return input.stick; }
  if (input.locked) return input.stick;
  if (settings.mouseMode === 'off') { input.stick.x = 0; input.stick.y = 0; return input.stick; }
  const r = Math.min(W, H) * 0.3;
  input.stick.x = clamp((input.mouse.x - W / 2) / r, -1, 1); input.stick.y = clamp((input.mouse.y - H / 2) / r, -1, 1);
  return input.stick;
}
export function recenterStick() { input.stick.x = 0; input.stick.y = 0; }
/** Manche au neutre jusqu'à ce que le joueur bouge réellement la souris (décollage, reprise). */
export function neutralStick() { input.stick.x = 0; input.stick.y = 0; input.neutral = true; input.neutralMove = 0; }

const dz = (v, d = 0.14) => (Math.abs(v) < d ? 0 : Math.sign(v) * (Math.abs(v) - d) / (1 - d));
/** Lecture de la manette (appelée chaque image). `nav` reçoit les actions de navigation dans les menus. */
export function pollPad(nav) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p = null; for (const g of pads) if (g && g.connected) { p = g; break; }
  input.pad = p;
  if (!p) return;
  const prev = input.padPrevBtn = input.padBtn, cur = input.padBtn = p.buttons.map(b => b.pressed || b.value > 0.5);
  const ax = input.ax;
  ax.lx = dz(p.axes[0] || 0); ax.ly = dz(p.axes[1] || 0); ax.rx = dz(p.axes[2] || 0); ax.ry = dz(p.axes[3] || 0);
  ax.lt = p.buttons[6] ? p.buttons[6].value : 0; ax.rt = p.buttons[7] ? p.buttons[7].value : 0;
  const any = cur.some(Boolean) || Math.abs(ax.lx) + Math.abs(ax.ly) + Math.abs(ax.rx) + Math.abs(ax.ry) > 0.2;
  if (any) input.usingPad = true;
  const edge = i => cur[i] && !prev[i];
  if (nav && nav.active()) {
    if (edge(12) || (ax.ly < -0.6 && !input._navHeld)) nav.move(-1);
    if (edge(13) || (ax.ly > 0.6 && !input._navHeld)) nav.move(1);
    if (edge(14) || (ax.lx < -0.6 && !input._navHeld)) nav.move(-1);
    if (edge(15) || (ax.lx > 0.6 && !input._navHeld)) nav.move(1);
    input._navHeld = Math.abs(ax.lx) > 0.5 || Math.abs(ax.ly) > 0.5;
    if (edge(0)) nav.ok();
    if (edge(1)) nav.back();
    if (edge(9)) input.onAction('pause', 'pad');
    return;
  }
  for (const i in PAD_ACTIONS) if (edge(+i)) input.onAction(PAD_ACTIONS[i], 'pad');
  if (cur[6] && !prev[6]) input.onAction('missile', 'pad');
  if (edge(0)) input.onAction('skip', 'pad');
}
export const padHeld = i => !!input.padBtn[i];

/** Vibration de la manette (si prise en charge). */
let rumbleUntil = 0;
export function rumble(strong, weak = strong, ms = 150) {
  const p = input.pad; if (!p || !input.usingPad || !p.vibrationActuator) return;
  const now = performance.now(); if (now < rumbleUntil && strong < 0.6) return; rumbleUntil = now + ms * 0.5;
  try { p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }); } catch { /* non pris en charge */ }
}
