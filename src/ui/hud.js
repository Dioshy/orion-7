// HUD dessiné sur un canvas 2D par-dessus le rendu WebGL.
import * as THREE from 'three';
import { R } from '../render/renderer.js';
import { G, CAMPAIGN_WAVES } from '../game/state.js';
import { player, SPD } from '../game/player.js';
import { nextGate, gateRun, GATE_COUNT } from '../game/launch.js';
import { station, DOCK } from '../game/station.js';
import { boss } from '../game/boss.js';
import { input } from '../core/input.js';
import { settings } from '../core/settings.js';
import { lead, clamp, fr, fmtDist, fwdOf, TAU } from '../core/util.js';
import { PICKUP_INFO } from '../game/pickups.js';
import { comboWindow } from '../game/score.js';
import { keyLabel } from './keys.js';
import { tutorialHint } from './tutorial.js';
import { ability, abilityDef } from '../game/abilities.js';
import { SUN_DIR, PLANET_POS, PLANET_R } from '../render/background.js';

const FONT_D = '"Chakra Petch","Bahnschrift","Segoe UI",sans-serif';
const FONT_M = '"IBM Plex Mono",Consolas,monospace';
const COL = { hud: '#cfe6ff', dim: 'rgba(207,230,255,0.55)', faint: 'rgba(207,230,255,0.22)', amber: '#ffb347', red: '#ff5a4a', friend: '#7fd4ff', host: '#ff8a66', alt: '#e08aff', gold: '#ffd76a', ok: '#7dffb0' };
const HOST_COL = { interceptor: COL.alt, drone: '#ff6a4a', torp: COL.amber, emissile: COL.red, part: '#ffb08a', boss: '#ff8a66' };

let hud, c, W = 1, H = 1, DPR = 1, lastHud = performance.now(), flareVis = 0;
export function initHud(canvas) {
  hud = canvas; c = canvas.getContext('2d');
  R.onResize.push(() => { W = R.W; H = R.H; DPR = R.DPR; hud.width = Math.round(W * DPR); hud.height = Math.round(H * DPR); });
  W = R.W; H = R.H; DPR = R.DPR; hud.width = Math.round(W * DPR); hud.height = Math.round(H * DPR);
}
export const hudCanvas = () => hud;

const _pc = new THREE.Vector3(), _pn = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _iq = new THREE.Quaternion(), _r = new THREE.Vector3(), _aim = new THREE.Vector3(), _to = new THREE.Vector3();
function proj(p) {
  const cam = R.camera;
  _pc.copy(p).applyMatrix4(cam.matrixWorldInverse); const behind = _pc.z >= -0.1;
  _pn.copy(_pc).applyMatrix4(cam.projectionMatrix);
  const x = (_pn.x * 0.5 + 0.5) * W, y = (-_pn.y * 0.5 + 0.5) * H;
  return { x, y, behind, cx: _pc.x, cy: _pc.y, d: -_pc.z, on: !behind && x > 0 && x < W && y > 0 && y < H };
}
function edgeArrow(pr, color, label, size = 1) {
  const a = Math.atan2(-pr.cy, pr.cx), rx = W * 0.44, ry = H * 0.4;
  const x = W / 2 + Math.cos(a) * rx, y = H / 2 + Math.sin(a) * ry;
  c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = color; c.beginPath(); c.moveTo(11 * size, 0); c.lineTo(-5 * size, -7 * size); c.lineTo(-5 * size, 7 * size); c.closePath(); c.fill(); c.restore();
  if (label) { c.fillStyle = color; c.font = `600 11px ${FONT_M}`; c.textAlign = 'center'; c.fillText(label, x, y + (Math.sin(a) > 0 ? -16 : 22)); }
}
function brackets(x, y, s, color, lw = 1.5) {
  const k = s * 0.45; c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(x + sx * s, y + sy * (s - k)); c.lineTo(x + sx * s, y + sy * s); c.lineTo(x + sx * (s - k), y + sy * s); }
  c.stroke();
}
function bar(x, y, w, h, f, color, label, value, align = 'left') {
  c.fillStyle = COL.faint; c.fillRect(x, y, w, h); c.fillStyle = color; const fw = w * clamp(f, 0, 1);
  if (align === 'right') c.fillRect(x + w - fw, y, fw, h); else c.fillRect(x, y, fw, h);
  c.font = `600 10px ${FONT_D}`; c.fillStyle = COL.dim; c.textAlign = align; c.fillText(label, align === 'right' ? x + w : x, y - 5);
  if (value !== undefined) { c.font = `500 11px ${FONT_M}`; c.fillStyle = color; c.textAlign = align === 'right' ? 'left' : 'right'; c.fillText(value, align === 'right' ? x : x + w, y - 5); }
}
const blinkOn = (hz = 3) => Math.floor(performance.now() / 1000 * hz) % 2 === 0;

export function drawHUD() {
  c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H);
  const st = (G.state === 'paused' || G.state === 'upgrade') ? G.prevState : G.state;
  if (settings.showFps) { c.font = `500 11px ${FONT_M}`; c.fillStyle = COL.dim; c.textAlign = 'left'; c.fillText(`${Math.round(R.fps)} i/s · ×${R.pr.toFixed(2)}`, 12, H - 12); }
  const now = performance.now(), hdt = Math.min(0.1, (now - lastHud) / 1000); lastHud = now;
  if (st !== 'loading' && st) drawFlare(hdt);
  if (st === 'menu' || st === 'loading' || st === 'hangar' || !st) return;
  if (st === 'over' || st === 'victory') return;
  if (G.hudBoot < 1 && G.state !== 'paused') G.hudBoot = Math.min(1, G.hudBoot + hdt * 0.7);
  const p = player, flying = st === 'flight' || st === 'launch';
  c.lineCap = 'round'; c.textBaseline = 'alphabetic';
  if (flying && p.alive) drawSpeedLines(p);
  const boot = G.hudBoot ?? 1;
  if (boot < 1) {
    c.globalAlpha = Math.max(0, Math.min(1, boot * 1.6)) * (boot > 0 && boot < 0.5 && Math.random() < 0.3 ? 0.3 : 1);
    if (boot > 0 && boot < 0.8) { c.save(); c.globalAlpha = 1; c.textAlign = 'center'; c.font = `600 12px ${FONT_M}`; c.fillStyle = COL.friend;
      c.fillText(boot < 0.35 ? 'INITIALISATION DU HUD…' : boot < 0.6 ? 'CAPTEURS · RADAR · ARMEMENT' : 'SYSTÈMES EN LIGNE', W / 2, H * 0.6); c.restore(); }
  }
  if (flying && p.alive) {
    const f = fwdOf(p.obj, _f);
    drawContacts(p);
    drawPickups();
    drawGate(p);
    // station et zone de ravitaillement
    const sp = proj(station.pos), sd = p.pos.distanceTo(station.pos);
    if (sp.on) { c.font = `600 11px ${FONT_D}`; c.fillStyle = COL.friend; c.textAlign = 'center'; c.fillText(`ORION-7 · ${fmtDist(sd)}`, sp.x, sp.y - 30); }
    else edgeArrow(sp, COL.friend, `ORION-7 ${fmtDist(sd)}`);
    if (sd < 4000) {
      const dp = proj(DOCK);
      if (dp.on) {
        const s = clamp(110 * 700 / dp.d, 8, 90); c.strokeStyle = p.docked ? COL.ok : 'rgba(127,212,255,0.55)'; c.setLineDash([6, 6]); c.lineWidth = 1.2;
        c.beginPath(); c.arc(dp.x, dp.y, s, 0, TAU); c.stroke(); c.setLineDash([]);
        c.fillStyle = p.docked ? COL.ok : COL.friend; c.font = `600 10px ${FONT_D}`; c.textAlign = 'center'; c.fillText(p.docked ? 'RAVITAILLEMENT EN COURS' : 'RAVITAILLEMENT < 30 m/s', dp.x, dp.y + s + 14);
      }
    }
    // vecteur vitesse
    const spd = p.vel.length();
    if (spd > 2) {
      _a.copy(p.vel).divideScalar(spd);
      const pg = proj(_b.copy(p.pos).addScaledVector(_a, 2000));
      if (pg.on) { c.strokeStyle = COL.hud; c.lineWidth = 1.5; c.beginPath(); c.arc(pg.x, pg.y, 7, 0, TAU); c.moveTo(pg.x - 7, pg.y); c.lineTo(pg.x - 14, pg.y); c.moveTo(pg.x + 7, pg.y); c.lineTo(pg.x + 14, pg.y); c.moveTo(pg.x, pg.y - 7); c.lineTo(pg.x, pg.y - 13); c.stroke(); }
      const rg = proj(_b.copy(p.pos).addScaledVector(_a, -2000));
      if (rg.on) { c.strokeStyle = COL.amber; c.lineWidth = 1.5; c.beginPath(); c.arc(rg.x, rg.y, 7, 0, TAU); c.moveTo(rg.x - 5, rg.y - 5); c.lineTo(rg.x + 5, rg.y + 5); c.moveTo(rg.x + 5, rg.y - 5); c.lineTo(rg.x - 5, rg.y + 5); c.stroke(); }
    }
    // réticule
    const bs = proj(_b.copy(p.pos).addScaledVector(f, 1000));
    if (bs.on) {
      const od = p.odT > 0;
      c.strokeStyle = p.overheat ? COL.red : od ? COL.gold : COL.hud; c.lineWidth = 1.6; c.beginPath();
      c.moveTo(bs.x - 16, bs.y); c.lineTo(bs.x - 6, bs.y); c.moveTo(bs.x + 6, bs.y); c.lineTo(bs.x + 16, bs.y); c.moveTo(bs.x, bs.y - 16); c.lineTo(bs.x, bs.y - 6); c.moveTo(bs.x, bs.y + 6); c.lineTo(bs.x, bs.y + 16); c.stroke();
      c.fillStyle = c.strokeStyle; c.fillRect(bs.x - 1, bs.y - 1, 2, 2);
      // jauge de chauffe en arc autour du réticule
      if (p.heat > 1) { c.strokeStyle = p.overheat ? COL.red : p.heat > 70 ? COL.amber : 'rgba(207,230,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.arc(bs.x, bs.y, 24, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 0.5 * p.heat / 100); c.stroke(); }
      if (G.hitMarkT > 0 || G.killMarkT > 0) {
        const kill = G.killMarkT > 0, s = kill ? 16 + (0.35 - G.killMarkT) * 30 : 12;
        c.strokeStyle = kill ? COL.red : COL.amber; c.lineWidth = kill ? 2.5 : 2; c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(bs.x + sx * s, bs.y + sy * s); c.lineTo(bs.x + sx * (s - 6), bs.y + sy * (s - 6)); }
        c.stroke();
      }
    }
    // manche (souris capturée ou curseur)
    if (st === 'flight' && settings.mouseMode !== 'off' && !input.usingPad) {
      const r = Math.min(W, H) * 0.3, sx = W / 2 + input.stick.x * r, sy = H / 2 + input.stick.y * r;
      c.strokeStyle = COL.faint; c.lineWidth = 1; c.beginPath(); c.arc(W / 2, H / 2, r * 0.05, 0, TAU); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, r, 0, TAU); c.setLineDash([2, 8]); c.stroke(); c.setLineDash([]);
      c.fillStyle = COL.hud; c.beginPath(); c.arc(sx, sy, 3, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(207,230,255,0.3)'; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(sx, sy); c.stroke();
    }
    drawDamageDirs(p);
    drawPanels(spd, sd);
    drawAbility(p);
    if (G.camMode !== 'cockpit') drawRadar();
    drawCombo();
  }
  c.globalAlpha = 1;
  drawPopups();
  if (st === 'launch' && boot > 0.25) drawLaunch(p);
  if (st === 'dead') {
    c.textAlign = 'center'; c.fillStyle = COL.red; c.font = `700 ${Math.min(48, W * 0.07)}px ${FONT_D}`; c.fillText('VAISSEAU DÉTRUIT', W / 2, H * 0.4);
    c.font = `600 13px ${FONT_M}`; c.fillStyle = COL.hud; c.fillText(player.lives > 0 ? `Vaisseau de réserve dans ${Math.max(0, Math.ceil(G.deadT))} s` : '', W / 2, H * 0.4 + 30);
    drawTop();
  }
  if (flying && input.wantLock && !input.locked && settings.mouseMode === 'lock' && !input.usingPad) {
    c.textAlign = 'center'; c.font = `600 13px ${FONT_D}`; c.fillStyle = blinkOn(1.5) ? COL.amber : COL.dim;
    c.fillText('CLIQUEZ POUR CAPTURER LA SOURIS', W / 2, H * 0.22);
  }
  drawBanner(); drawAnnounce();
}

function hostColor(h) { return HOST_COL[h.kind] || COL.host; }
function drawContacts(p) {
  for (const h of G.targets) {
    if (h.dead) continue;
    const isT = h === p.target, col = hostColor(h);
    if (h.kind === 'part' && !isT && h.pos.distanceTo(p.pos) > 1800) continue;
    const pr = proj(h.pos);
    if (pr.on) {
      const s = clamp(h.radius * 900 / pr.d, 5, h.kind === 'boss' ? 160 : 40);
      if (h.kind === 'torp' || h.kind === 'emissile') { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(pr.x, pr.y - s - 3); c.lineTo(pr.x + s + 3, pr.y); c.lineTo(pr.x, pr.y + s + 3); c.lineTo(pr.x - s - 3, pr.y); c.closePath(); c.stroke(); }
      else if (h.kind === 'part') { c.strokeStyle = col; c.lineWidth = 1.2; c.beginPath(); c.arc(pr.x, pr.y, s + 3, 0, TAU); c.stroke(); }
      else brackets(pr.x, pr.y, s + 4, col, isT ? 2 : 1.2);
      if (!isT && pr.d < 6000 && h.kind !== 'part') { c.font = `500 10px ${FONT_M}`; c.fillStyle = col; c.textAlign = 'left'; c.fillText(h.kind === 'torp' ? `${fmtDist(pr.d)} · ${Math.ceil(h.eta)} s` : fmtDist(pr.d), pr.x + s + 8, pr.y + 3); }
      if (isT) {
        const S = Math.max(s + 12, 22); brackets(pr.x, pr.y, S, col, 2);
        _to.copy(h.pos).sub(p.pos); const dist = _to.length(); const closing = -_a.copy(h.vel).sub(p.vel).dot(_to) / (dist || 1);
        c.font = `600 12px ${FONT_M}`; c.fillStyle = col; c.textAlign = 'left';
        c.fillText(fmtDist(dist), pr.x + S + 8, pr.y - S + 10);
        c.fillStyle = COL.dim; c.fillText(`${closing >= 0 ? '▼' : '▲'} ${fr(Math.abs(Math.round(closing)))} m/s`, pr.x + S + 8, pr.y - S + 26);
        if (h.kind === 'torp') { c.fillStyle = h.eta < 10 ? COL.red : COL.amber; c.fillText(`IMPACT ${Math.ceil(h.eta)} s`, pr.x + S + 8, pr.y - S + 42); }
        if (h.kind === 'boss' && h.shieldUp) { c.fillStyle = COL.friend; c.fillText('BOUCLIER ACTIF', pr.x + S + 8, pr.y - S + 42); }
        c.fillStyle = COL.faint; c.fillRect(pr.x - S, pr.y + S + 6, S * 2, 3); c.fillStyle = col; c.fillRect(pr.x - S, pr.y + S + 6, S * 2 * clamp(h.hp / (h.maxHp || 1), 0, 1), 3);
        c.font = `600 10px ${FONT_D}`; c.textAlign = 'center'; c.fillStyle = col; c.fillText(h.label || '', pr.x, pr.y - S - 8);
        if (p.lock > 0) {
          c.strokeStyle = p.lock >= 1 ? COL.red : COL.amber; c.lineWidth = 2.5; c.beginPath(); c.arc(pr.x, pr.y, S + 10, -Math.PI / 2, -Math.PI / 2 + TAU * p.lock); c.stroke();
          if (p.lock >= 1 && blinkOn()) { c.fillStyle = COL.red; c.font = `700 12px ${FONT_D}`; c.fillText('VERROUILLÉ', pr.x, pr.y + S + 26); }
        }
        if (h.kind !== 'boss') {
          lead(p.pos, p.vel, h.pos, h.vel, 1100, _aim); const lp = proj(_aim);
          if (lp.on && dist < 3500) {
            c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(lp.x, lp.y, 8, 0, TAU); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(lp.x, lp.y, 1.8, 0, TAU); c.fill();
            c.strokeStyle = COL.faint; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(pr.x, pr.y); c.lineTo(lp.x, lp.y); c.stroke(); c.setLineDash([]);
          }
        }
      }
    } else if (isT) edgeArrow(pr, col, fmtDist(h.pos.distanceTo(p.pos)));
    else if (h.kind === 'torp') edgeArrow(pr, COL.amber, '', 0.9);
    else if (h.kind === 'emissile' && h.target === p) edgeArrow(pr, COL.red, 'MISSILE', 1.2);
  }
}
function drawPickups() {
  for (const k of G.pickups) {
    const pr = proj(k.pos); if (!pr.on || pr.d > 3000) continue;
    const info = PICKUP_INFO[k.type]; c.strokeStyle = info.color; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(pr.x, pr.y - 9); c.lineTo(pr.x + 9, pr.y); c.lineTo(pr.x, pr.y + 9); c.lineTo(pr.x - 9, pr.y); c.closePath(); c.stroke();
    if (pr.d < 1500) { c.font = `600 9px ${FONT_D}`; c.fillStyle = info.color; c.textAlign = 'center'; c.fillText(info.label, pr.x, pr.y - 14); }
  }
}
function drawDamageDirs(p) {
  _iq.copy(R.camera.quaternion).invert();
  for (const d of G.dmgDirs) {
    _r.copy(d.dir).applyQuaternion(_iq);
    const a = Math.atan2(-_r.y, _r.x), k = clamp(d.t / 1.2, 0, 1), r = Math.min(W, H) * 0.2;
    c.strokeStyle = `rgba(255,70,50,${k * 0.85})`; c.lineWidth = 6; c.beginPath(); c.arc(W / 2, H / 2, r, a - 0.3, a + 0.3); c.stroke();
  }
}
function drawPopups() {
  for (const pp of G.popups) {
    const pr = proj(pp.pos); if (!pr.on) continue;
    const k = pp.t / pp.life, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    c.globalAlpha = a; c.font = `700 ${pp.big ? 15 : 13}px ${FONT_D}`; c.textAlign = 'center'; c.fillStyle = pp.color;
    c.fillText(pp.text, pr.x, pr.y - 20 - k * 40); c.globalAlpha = 1;
  }
}
function drawCombo() {
  const cb = G.combo; if (cb.chain < 2) return;
  const x = W / 2 + Math.min(W, H) * 0.18, y = H / 2 - Math.min(W, H) * 0.12, k = clamp(cb.t / comboWindow(), 0, 1);
  c.strokeStyle = COL.faint; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 22, 0, TAU); c.stroke();
  c.strokeStyle = COL.gold; c.beginPath(); c.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
  c.fillStyle = COL.gold; c.font = `700 15px ${FONT_M}`; c.textAlign = 'center'; c.fillText(`×${fr(cb.mult, cb.mult % 1 ? 1 : 0)}`, x, y + 5);
  c.font = `600 9px ${FONT_D}`; c.fillStyle = COL.dim; c.fillText(`SÉRIE ${cb.chain}`, x, y + 38);
}
function drawBanner() {
  const b = G.banner; if (!b) return;
  const k = b.t / b.life, a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1, y = H * 0.27;
  c.globalAlpha = a; c.textAlign = 'center';
  c.font = `700 ${Math.min(64, W * 0.08)}px ${FONT_D}`; c.fillStyle = b.color; c.fillText(b.title, W / 2, y);
  c.font = `500 14px ${FONT_M}`; c.fillStyle = COL.hud; c.fillText(b.sub, W / 2, y + 30);
  c.globalAlpha = 1;
}
function drawAnnounce() {
  const a = G.announce; if (!a) return;
  const k = a.t / 1.8, s = 1 + Math.max(0, 0.25 - a.t) * 2, al = k > 0.7 ? (1 - k) / 0.3 : 1;
  c.save(); c.translate(W / 2, H * 0.6); c.scale(s, s); c.globalAlpha = al;
  c.font = `700 26px ${FONT_D}`; c.textAlign = 'center'; c.fillStyle = a.color; c.fillText(a.text, 0, 0);
  c.restore(); c.globalAlpha = 1;
}

function drawTop() {
  const w = Math.min(320, W - 40), x = W / 2 - w / 2, y = 34, f = station.hp / station.maxHp;
  bar(x, y, w, 6, f, f > 0.5 ? COL.friend : f > 0.25 ? COL.amber : COL.red, 'INTÉGRITÉ ORION-7', `${Math.round(f * 100)} %`);
  c.font = `500 11px ${FONT_M}`; c.textAlign = 'center'; c.fillStyle = COL.dim;
  const hostN = G.enemies.length + G.spawnQueue.filter(s => s.kind !== 'boss').length + (boss ? 1 : 0), tN = G.torps.length;
  const wl = G.wave <= CAMPAIGN_WAVES && !G.endless ? `VAGUE ${G.wave}/${CAMPAIGN_WAVES}` : `VAGUE ${G.wave} · INFINI`;
  c.fillText(`${wl} · HOSTILES ${hostN}${tN ? ` · TORPILLES ${tN}` : ''} · SCORE ${fr(G.score)}`, W / 2, y + 24);
  if (!G.waveActive && G.interT > 0) {
    c.fillStyle = COL.friend; c.fillText(`Prochaine vague dans ${Math.ceil(G.interT)} s · ${keyLabel('Enter')} pour lancer maintenant (prime)`, W / 2, y + 40);
  }
  if (boss) {
    const by = y + 58, bw = Math.min(420, W - 40), bx = W / 2 - bw / 2;
    bar(bx, by, bw, 7, boss.hp / boss.maxHp, boss.shieldUp ? COL.friend : COL.red, boss.label, boss.shieldUp ? 'BOUCLIER ACTIF' : `${Math.round(boss.hp / boss.maxHp * 100)} %`);
    const parts = boss.parts; let px = bx;
    c.font = `600 9px ${FONT_D}`; c.textAlign = 'left';
    for (const [sub, lab] of [['gen', 'GÉN.'], ['turret', 'TOUR.'], ['engine', 'MOT.']]) {
      const ps = parts.filter(q => q.sub === sub), alive = ps.filter(q => !q.dead).length;
      c.fillStyle = alive ? (sub === 'gen' ? COL.friend : COL.host) : COL.faint; c.fillText(`${lab} ${alive}/${ps.length}`, px, by + 20); px += 80;
    }
  }
  c.textAlign = 'right'; c.fillStyle = COL.dim; c.font = `600 10px ${FONT_D}`; c.fillText('VAISSEAUX', W - 24, y);
  for (let i = 0; i < G.diff.lives; i++) { c.fillStyle = i < player.lives ? COL.hud : COL.faint; const vx = W - 30 - i * 18; c.beginPath(); c.moveTo(vx, y + 6); c.lineTo(vx + 6, y + 20); c.lineTo(vx - 6, y + 20); c.closePath(); c.fill(); }
}

function drawPanels(spd, sd) {
  const p = player, S = p.S; drawTop();
  if (G.camMode !== 'cockpit') {
  const narrow = W < 720, lx = narrow ? 16 : 30, rw = narrow ? 120 : 160, py = narrow ? H - 270 : H / 2 - 80;
  c.textAlign = 'left'; c.font = `600 10px ${FONT_D}`; c.fillStyle = COL.dim; c.fillText('VITESSE', lx, py);
  c.font = `600 ${narrow ? 24 : 32}px ${FONT_M}`; c.fillStyle = p.boosting ? COL.friend : p.retroBoosting ? COL.amber : COL.hud; const sv = fr(Math.round(spd)); c.fillText(sv, lx, py + (narrow ? 26 : 34));
  const nw = c.measureText(sv).width; c.font = `500 12px ${FONT_M}`; c.fillStyle = COL.dim; c.fillText('m/s', lx + nw + 6, py + (narrow ? 26 : 34));
  let y = py + (narrow ? 52 : 64);
  const acc = p.accF; c.font = `700 14px ${FONT_M}`; c.fillStyle = acc > 8 ? COL.ok : acc < -8 ? COL.amber : 'rgba(0,0,0,0)'; c.fillText(acc > 8 ? '▲' : '▼', lx + nw + 34, py + (narrow ? 26 : 34));
  if (p.fa) bar(lx, y, rw, 5, p.throttle, COL.hud, 'GAZ', `${Math.round(p.throttle * SPD.cruise)} m/s`);
  else { c.font = `700 12px ${FONT_D}`; c.fillStyle = blinkOn() ? COL.amber : 'rgba(255,179,71,0.5)'; c.fillText('ASSISTANCE COUPÉE', lx, y); }
  y += 30;
  if (S.boostType === 'dash') {
    c.font = `600 10px ${FONT_D}`; c.fillStyle = COL.dim; c.textAlign = 'left'; c.fillText('IMPULSIONS', lx, y - 5);
    const ch = p.dashCharges ?? 3;
    for (let i = 0; i < 3; i++) { const f = clamp(ch - i, 0, 1); c.fillStyle = COL.faint; c.fillRect(lx + i * (rw / 3), y, rw / 3 - 4, 5); c.fillStyle = f >= 1 ? COL.friend : 'rgba(127,212,255,0.45)'; c.fillRect(lx + i * (rw / 3), y, (rw / 3 - 4) * f, 5); }
  } else bar(lx, y, rw, 5, p.boost / S.maxBoost, p.boost < S.maxBoost * 0.2 ? COL.amber : COL.friend, S.boostType === 'fusion' ? 'RÉACTEUR À FUSION' : 'POSTCOMBUSTION', `${Math.round(p.boost / S.maxBoost * 100)} %`);
  y += 24; c.font = `500 11px ${FONT_M}`; c.textAlign = 'left'; c.fillStyle = COL.dim;
  c.fillText(`FA ${p.fa ? 'ON ' : 'OFF'}  ·  ${fr(Math.min(p.g, 19.9), 1)} G`, lx, y);
  c.fillText(`ORION-7  ${fmtDist(sd)}`, lx, y + 16);
  if (p.odT > 0) { c.fillStyle = COL.gold; c.font = `700 12px ${FONT_D}`; c.fillText(`SURCHARGE ${Math.ceil(p.odT)} s`, lx, y + 38); }
  // droite : défense et armement
  const rx = W - (narrow ? 16 : 30) - rw; y = py;
  bar(rx, y, rw, 5, p.shield / S.maxShield, COL.friend, 'BOUCLIERS', `${Math.round(p.shield)}`, 'right');
  y += 30; bar(rx, y, rw, 5, p.hull / S.maxHull, p.hull < S.maxHull * 0.3 ? COL.red : p.hull < S.maxHull * 0.6 ? COL.amber : COL.hud, 'COQUE', `${Math.round(p.hull)}`, 'right');
  y += 30; bar(rx, y, rw, 5, p.heat / 100, p.odT > 0 ? COL.gold : p.overheat ? COL.red : p.heat > 70 ? COL.amber : COL.hud, p.odT > 0 ? 'SURCHARGE' : p.overheat ? 'SURCHAUFFE' : 'CHAUFFE CANONS', undefined, 'right');
  y += 26; c.textAlign = 'right'; c.font = `500 11px ${FONT_M}`; c.fillStyle = S.weapon === 'cannon' && p.ammo < 150 ? COL.amber : COL.dim; c.fillText(S.weapon === 'cannon' ? `OBUS ${fr(Math.floor(p.ammo))}` : S.weapon === 'laser' ? 'LASERS · ÉNERGIE' : 'PLASMA · ÉNERGIE', rx + rw, y);
  y += 18; const mm = S.maxMissiles, mw = Math.min(11, 100 / mm);
  c.fillStyle = COL.dim; c.fillText('MISSILES', rx + rw - mm * mw - 6, y);
  for (let i = 0; i < mm; i++) { c.fillStyle = i < p.missiles ? COL.hud : COL.faint; c.fillRect(rx + rw - (i + 1) * mw + 2, y - 9, mw - 4, 10); }
  y += 18; const fm = S.maxFlares;
  c.fillStyle = COL.dim; c.fillText(`LEURRES [${keyLabel('KeyC')}]`, rx + rw - fm * 9 - 6, y);
  for (let i = 0; i < fm; i++) { c.fillStyle = i < p.flares ? COL.gold : COL.faint; c.beginPath(); c.arc(rx + rw - i * 9 - 4, y - 4, 3, 0, TAU); c.fill(); }
  }
  // alertes centrales
  c.textAlign = 'center'; c.font = `700 13px ${FONT_D}`; let ay = H * 0.68;
  const incoming = G.eMissiles.some(m => m.target === p);
  if (incoming && blinkOn(5)) { c.fillStyle = COL.red; c.font = `700 16px ${FONT_D}`; c.fillText(`MISSILE ENTRANT · LEURRES [${keyLabel('KeyC')}]`, W / 2, ay); ay += 20; c.font = `700 13px ${FONT_D}`; }
  if (G.torps.length && blinkOn()) {
    const eta = Math.min(...G.torps.map(t => t.eta));
    c.fillStyle = COL.amber; c.fillText(`TORPILLE${G.torps.length > 1 ? 'S' : ''} VERS LA STATION · IMPACT ${Math.ceil(eta)} s · ${keyLabel('Tab')} POUR CIBLER`, W / 2, ay); ay += 18;
  }
  if (p.hull < S.maxHull * 0.3 && blinkOn()) { c.fillStyle = COL.red; c.fillText('COQUE CRITIQUE · RETOURNEZ AU HANGAR', W / 2, ay); ay += 18; }
  const hint = tutorialHint();
  if (hint) { c.font = `600 13px ${FONT_D}`; c.fillStyle = COL.friend; c.fillText(hint, W / 2, H - Math.min(130, W * 0.2) * 0.42 * 2 - 70); }
  else if (!p.target && G.targets.length && G.state === 'flight') { c.font = `500 11px ${FONT_M}`; c.fillStyle = COL.dim; c.fillText(`${keyLabel('KeyT')} : cibler le contact sous le réticule`, W / 2, ay); }
}

function drawRadar() {
  const p = player, Rr = Math.min(130, W * 0.2), ry = Rr * 0.42, cx = W / 2, cy = H - ry - 30, range = G.radarRange;
  c.save(); c.fillStyle = 'rgba(6,14,26,0.58)'; c.beginPath(); c.ellipse(cx, cy, Rr, ry, 0, 0, TAU); c.fill();
  c.strokeStyle = COL.faint; c.lineWidth = 1;
  for (const k of [1, 0.66, 0.33]) { c.beginPath(); c.ellipse(cx, cy, Rr * k, ry * k, 0, 0, TAU); c.stroke(); }
  c.beginPath(); c.moveTo(cx - Rr, cy); c.lineTo(cx + Rr, cy); c.moveTo(cx, cy - ry); c.lineTo(cx, cy + ry);
  c.moveTo(cx, cy); c.lineTo(cx - Math.sin(0.6) * Rr, cy - Math.cos(0.6) * ry); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(0.6) * Rr, cy - Math.cos(0.6) * ry); c.stroke();
  _iq.copy(p.obj.quaternion).invert();
  const plot = (pos, color, shape, ring) => {
    const l = _r.copy(pos).sub(p.pos).applyQuaternion(_iq), k = 1 / range;
    let x = l.x * k, z = l.z * k, y = l.y * k; const hd = Math.hypot(x, z); let out = false;
    if (hd > 1) { x /= hd; z /= hd; y = clamp(y / hd, -1, 1); out = true; }
    const sx = cx + x * Rr, sy = cy + z * ry, ty = sy - clamp(y, -1.4, 1.4) * ry * 1.2;
    c.strokeStyle = color; c.globalAlpha = out ? 0.45 : 1; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, ty); c.stroke();
    c.fillStyle = color; c.beginPath();
    if (shape === 'sq') c.rect(sx - 4, ty - 4, 8, 8);
    else if (shape === 'boss') c.rect(sx - 6, ty - 4, 12, 8);
    else if (shape === 'tri') { c.moveTo(sx, ty - 4); c.lineTo(sx + 4, ty + 3); c.lineTo(sx - 4, ty + 3); c.closePath(); }
    else if (shape === 'dia') { c.moveTo(sx, ty - 3.5); c.lineTo(sx + 3.5, ty); c.lineTo(sx, ty + 3.5); c.lineTo(sx - 3.5, ty); c.closePath(); }
    else c.arc(sx, ty, shape === 'big' ? 4 : shape === 'small' ? 1.6 : 2.5, 0, TAU);
    c.fill(); if (ring) { c.beginPath(); c.arc(sx, ty, 8, 0, TAU); c.stroke(); } c.globalAlpha = 1;
  };
  plot(station.pos, COL.friend, 'sq');
  for (const k of G.pickups) plot(k.pos, PICKUP_INFO[k.type].color, 'small');
  for (const e of G.enemies) plot(e.pos, hostColor(e), e.kind === 'bomber' ? 'big' : e.kind === 'drone' ? 'small' : 'tri', e === p.target);
  if (boss) plot(boss.pos, COL.host, 'boss', boss === p.target);
  for (const t of G.torps) plot(t.pos, COL.amber, 'dia', t === p.target);
  for (const m of G.eMissiles) plot(m.pos, COL.red, 'dia');
  for (const m of G.missiles) plot(m.pos, COL.hud, 'dot');
  c.fillStyle = COL.hud; c.beginPath(); c.moveTo(cx, cy - 5); c.lineTo(cx + 4, cy + 4); c.lineTo(cx - 4, cy + 4); c.closePath(); c.fill();
  c.font = `500 10px ${FONT_M}`; c.textAlign = 'center'; c.fillStyle = COL.dim; c.fillText(`RADAR ${fmtDist(range)} · ${keyLabel('KeyN')}`, cx, cy + ry + 16);
  c.restore();
}

function drawCockpitFrame() {
  c.save(); c.fillStyle = 'rgba(10,14,20,0.92)'; c.strokeStyle = 'rgba(80,90,105,0.9)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, H * 0.78); c.lineTo(W * 0.22, H * 0.86); c.lineTo(W * 0.78, H * 0.86); c.lineTo(W, H * 0.78); c.lineTo(W, H); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.08, 0); c.lineTo(W * 0.02, H * 0.78); c.lineTo(0, H * 0.78); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(W, 0); c.lineTo(W * 0.92, 0); c.lineTo(W * 0.98, H * 0.78); c.lineTo(W, H * 0.78); c.closePath(); c.fill();
  c.fillRect(0, 0, W, 10); c.restore();
}

/* ---------- Décollage, balises, lignes de vitesse ---------- */
function drawLaunch(p) {
  const v = p.vel.z, vr = SPD.vr, w = Math.min(360, W - 60), x = W / 2 - w / 2, y = H * 0.3;
  c.textAlign = 'center'; c.font = `700 ${Math.min(42, W * 0.06)}px ${FONT_D}`;
  const ready = v >= vr * 0.95;
  c.fillStyle = ready ? COL.ok : COL.amber;
  c.fillText(v < 1 ? 'PRÊT AU DÉCOLLAGE' : ready ? 'ROTATION' : 'ROULAGE', W / 2, y);
  c.fillStyle = COL.faint; c.fillRect(x, y + 18, w, 6);
  c.fillStyle = ready ? COL.ok : COL.amber; c.fillRect(x, y + 18, w * clamp(v / (vr * 1.35), 0, 1), 6);
  const mx = x + w / 1.35; c.fillStyle = COL.hud; c.fillRect(mx - 1, y + 12, 2, 18);
  c.font = `600 10px ${FONT_D}`; c.fillText(`VR ${vr} m/s`, mx, y + 44);
  c.font = `600 13px ${FONT_M}`; c.fillStyle = COL.hud; c.textAlign = 'left'; c.fillText(`${Math.round(v)} m/s`, x, y + 44);
  if (v < 8) {
    c.textAlign = 'center'; c.font = `600 14px ${FONT_D}`; c.fillStyle = blinkOn(1.6) ? COL.amber : COL.hud;
    c.fillText(input.usingPad ? 'STICK DROIT ↑ OU GÂCHETTE : GAZ · RB : POSTCOMBUSTION · A : AUTO' : `${keyLabel('KeyW')} : GAZ  ·  ${keyLabel('ShiftLeft').toUpperCase()} : POSTCOMBUSTION  ·  ${keyLabel('Space').toUpperCase()} : DÉCOLLAGE AUTO`, W / 2, y + 74);
  }
}

function drawGate(p) {
  const g = nextGate(); if (!g) return;
  const pr = proj(g.pos), d = g.pos.distanceTo(p.pos), label = `BALISE ${gateRun.idx + 1}/${GATE_COUNT} · ${fmtDist(d)}`;
  if (pr.on) {
    const s = clamp(17 * 900 / pr.d, 10, 120);
    c.strokeStyle = COL.ok; c.lineWidth = 2; c.beginPath();
    c.moveTo(pr.x, pr.y - s - 6); c.lineTo(pr.x + s + 6, pr.y); c.lineTo(pr.x, pr.y + s + 6); c.lineTo(pr.x - s - 6, pr.y); c.closePath(); c.stroke();
    c.font = `600 11px ${FONT_D}`; c.fillStyle = COL.ok; c.textAlign = 'center'; c.fillText(label, pr.x, pr.y - s - 14);
  } else edgeArrow(pr, COL.ok, label, 1.1);
  if (gateRun.passed > 0) { c.font = `600 11px ${FONT_M}`; c.fillStyle = COL.ok; c.textAlign = 'center'; c.fillText(`BALISES FRANCHIES ${gateRun.passed}`, W / 2, H * 0.22 + 20); }
}

const LINES = Array.from({ length: 56 }, () => ({ a: Math.random() * TAU, o: Math.random(), w: 0.5 + Math.random() * 1.2 }));
function drawSpeedLines(p) {
  const spd = p.vel.length(), k = clamp((spd - 330) / 380, 0, 1) + (p.boosting ? 0.35 : 0);
  if (k <= 0.02) return;
  const t = performance.now() / 1000, diag = Math.hypot(W, H) / 2, n = Math.floor(LINES.length * Math.min(1, k));
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const L = LINES[i], ph = (L.o + t * (1.4 + k * 2.2)) % 1;
    const r0 = diag * (0.35 + ph * 0.9), len = diag * (0.05 + k * 0.16) * (0.5 + ph);
    const ca = Math.cos(L.a), sa = Math.sin(L.a);
    c.strokeStyle = `rgba(200,225,255,${(0.05 + 0.18 * k) * Math.sin(ph * Math.PI)})`; c.lineWidth = L.w;
    c.beginPath(); c.moveTo(W / 2 + ca * r0, H / 2 + sa * r0); c.lineTo(W / 2 + ca * (r0 + len), H / 2 + sa * (r0 + len)); c.stroke();
  }
  c.restore();
}

/* ---------- Reflet de lentille du soleil (masqué par la planète) ---------- */
const _sn = new THREE.Vector3(), _oc = new THREE.Vector3();
const GHOSTS = [[0.22, 26, '255,205,150', 0.12], [0.42, 10, '150,210,255', 0.2], [0.62, 55, '110,150,255', 0.05], [0.86, 18, '255,180,120', 0.1], [1.12, 34, '140,255,200', 0.06], [1.38, 95, '170,130,255', 0.035], [1.7, 22, '255,220,180', 0.08]];
function drawFlare(dt) {
  _sn.copy(SUN_DIR).multiplyScalar(1e6).add(R.bgCamera.position).project(R.bgCamera);
  let target = 0;
  if (_sn.z < 1 && Math.abs(_sn.x) < 1.15 && Math.abs(_sn.y) < 1.15) {
    _oc.copy(PLANET_POS).sub(R.camera.position); const b = _oc.dot(SUN_DIR), d2 = _oc.lengthSq() - b * b;
    const blocked = b > 0 && d2 < PLANET_R * PLANET_R * 1.03;
    if (!blocked) target = Math.max(0, 1 - Math.max(Math.abs(_sn.x), Math.abs(_sn.y)) * 0.75);
  }
  flareVis += (target - flareVis) * Math.min(1, dt * 6);
  if (flareVis < 0.01) return;
  const sx = (_sn.x * 0.5 + 0.5) * W, sy = (-_sn.y * 0.5 + 0.5) * H, dx = W / 2 - sx, dy = H / 2 - sy, k = Math.min(W, H) / 800;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [t, r, col, a] of GHOSTS) {
    const x = sx + dx * t * 2, y = sy + dy * t * 2, rr = r * k * 1.4, al = a * flareVis;
    const g = c.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(0.65, `rgba(${col},${al * 0.6})`); g.addColorStop(0.9, `rgba(${col},${al * 1.2})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
  }
  const hx = sx + dx * 1.9, hy = sy + dy * 1.9, hr = 40 * k; c.strokeStyle = `rgba(200,220,255,${0.08 * flareVis})`; c.lineWidth = 2;
  c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; i ? c.lineTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr) : c.moveTo(hx + Math.cos(a) * hr, hy + Math.sin(a) * hr); } c.stroke();
  c.restore();
}

/* ---------- Capacité spéciale : icône avec recharge ---------- */
function drawAbility(p) {
  const def = abilityDef(), cd = ability.cd, ready = cd <= 0, k = ready ? 1 : 1 - cd / def.cd;
  const x = W / 2 + Math.min(130, W * 0.2) + 46, y = H - Math.min(130, W * 0.2) * 0.42 - 36, r = 22;
  c.save();
  c.fillStyle = 'rgba(6,14,26,0.6)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = COL.faint; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.strokeStyle = ready ? COL.gold : COL.friend; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke();
  if (ready) { c.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 200); c.fillStyle = COL.gold; c.beginPath(); c.arc(x, y, r - 4, 0, TAU); c.fill(); c.globalAlpha = 1; }
  c.fillStyle = ready ? '#1b1206' : COL.hud; c.font = `700 14px ${FONT_M}`; c.textAlign = 'center'; c.fillText(ready ? keyLabel('KeyZ') : String(Math.ceil(cd)), x, y + 5);
  c.font = `600 9px ${FONT_D}`; c.fillStyle = ready ? COL.gold : COL.dim; c.fillText(def.name.toUpperCase(), x, y + r + 13);
  if (ability.active > 0) { c.fillStyle = COL.gold; c.fillText(`${Math.ceil(ability.active)} s`, x, y - r - 6); }
  if (ability.wing) { c.fillStyle = COL.friend; c.fillText(`DRONE ${Math.ceil(ability.wing.life)} s`, x, y - r - 6); }
  c.restore();
}
