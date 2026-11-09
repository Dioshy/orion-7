// Panneaux DOM : menu, paramètres, commandes, records, pause, améliorations, victoire, débriefing.
import { settings, saveSettings, DEFAULTS, getScores, bestScore, flags, saveFlags } from '../core/settings.js';
import { applyVolumes, sfx } from '../core/audio.js';
import { applyQuality } from '../render/renderer.js';
import { DIFFS } from '../game/state.js';
import { fr } from '../core/util.js';
import { keyLabel, onLayout } from './keys.js';

const $ = id => document.getElementById(id);
const OVERLAYS = ['menu', 'settings', 'controls', 'records', 'pause', 'upgrade', 'victory', 'over'];
let H = {}, backTo = null;

export function initMenus(handlers) {
  H = handlers;
  // difficulté
  const seg = $('diffSeg');
  const setDiff = k => { settings.difficulty = k; saveSettings(); for (const b of seg.children) b.setAttribute('aria-checked', String(b.dataset.diff === k)); $('diffHint').textContent = DIFFS[k].hint; };
  for (const b of seg.children) b.addEventListener('click', () => { setDiff(b.dataset.diff); sfx('click'); });
  setDiff(DIFFS[settings.difficulty] ? settings.difficulty : 'pilote');
  // boutons
  $('btnStart').addEventListener('click', () => H.start());
  $('btnResume').addEventListener('click', () => H.resume());
  $('btnQuit').addEventListener('click', () => H.quit());
  $('btnAgain').addEventListener('click', () => H.start());
  $('btnMenu').addEventListener('click', () => H.toMenu());
  $('btnEndless').addEventListener('click', () => H.endless());
  $('btnFinish').addEventListener('click', () => H.finish());
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openPanel(b.dataset.open, b.closest('.overlay').id)));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', closePanel));
  renderSettings(); renderControls(); onLayout(renderControls);
  if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('note').textContent = 'Ce simulateur se pilote au clavier et à la souris ou à la manette : ouvrez-le sur un ordinateur ou branchez une manette.';
  updateBest();
}

export function show(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  if (id) { const f = $(id).querySelector('button:not([disabled])'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30); }
}
export const visibleOverlay = () => OVERLAYS.find(o => !$(o).hidden) || null;

function openPanel(name, from) {
  backTo = from; if (name === 'records') renderRecords();
  show(name); sfx('click');
}
function closePanel() { show(backTo || 'menu'); backTo = null; sfx('click'); }

export function updateBest() {
  const b = bestScore();
  $('bestLine').textContent = b ? `Record : ${fr(b)} points${flags.victories ? ` · ${flags.victories} victoire${flags.victories > 1 ? 's' : ''}` : ''}` : '';
}

/* ---------- Paramètres ---------- */
const SETTINGS = [
  { k: 'master', label: 'Volume général', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %`, apply: applyVolumes },
  { k: 'sfx', label: 'Effets sonores', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %`, apply: applyVolumes },
  { k: 'music', label: 'Musique', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => `${Math.round(v * 100)} %`, apply: applyVolumes },
  { k: 'quality', label: 'Qualité graphique', type: 'select', opts: [['auto', 'Automatique (adaptative)'], ['high', 'Haute'], ['medium', 'Moyenne'], ['low', 'Basse']], apply: applyQuality },
  { k: 'bloom', label: 'Halo lumineux (bloom)', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %`, apply: applyQuality },
  { k: 'mouseMode', label: 'Pilotage souris', type: 'select', opts: [['lock', 'Souris capturée (recommandé)'], ['cursor', 'Curseur libre'], ['off', 'Désactivé (clavier, manette)']] },
  { k: 'sensitivity', label: 'Sensibilité souris', type: 'range', min: 0.3, max: 2.5, step: 0.05, fmt: v => `× ${fr(v, 2)}` },
  { k: 'invertPitch', label: 'Inverser le tangage', type: 'check' },
  { k: 'fov', label: 'Champ de vision', type: 'range', min: 55, max: 95, step: 1, fmt: v => `${v}°` },
  { k: 'shake', label: 'Tremblements de caméra', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: v => `${Math.round(v * 100)} %` },
  { k: 'hints', label: 'Conseils à l\'écran', type: 'check' },
  { k: 'showFps', label: 'Afficher les images/s', type: 'check' },
];
function renderSettings() {
  const form = $('settingsForm'); form.replaceChildren();
  for (const s of SETTINGS) {
    const row = document.createElement('label'); row.className = 'set';
    const lab = document.createElement('span'); lab.textContent = s.label;
    const val = document.createElement('span'); val.className = 'v';
    let inp;
    if (s.type === 'range') {
      inp = document.createElement('input'); inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = settings[s.k];
      val.textContent = s.fmt(settings[s.k]);
      inp.addEventListener('input', () => { settings[s.k] = +inp.value; val.textContent = s.fmt(+inp.value); saveSettings(); s.apply && s.apply(); });
    } else if (s.type === 'select') {
      inp = document.createElement('select');
      for (const [v, t] of s.opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; inp.append(o); }
      inp.value = settings[s.k];
      inp.addEventListener('change', () => { settings[s.k] = inp.value; saveSettings(); s.apply && s.apply(); });
    } else {
      inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!settings[s.k];
      inp.addEventListener('change', () => { settings[s.k] = inp.checked; saveSettings(); });
    }
    row.append(lab, inp, val); form.append(row);
  }
  const row = document.createElement('div'); row.className = 'row';
  const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'ghost'; reset.textContent = 'Valeurs par défaut';
  reset.addEventListener('click', () => { const d = settings.difficulty; Object.assign(settings, DEFAULTS, { difficulty: d }); saveSettings(); applyVolumes(); applyQuality(); renderSettings(); });
  const tut = document.createElement('button'); tut.type = 'button'; tut.className = 'ghost'; tut.textContent = 'Revoir le tutoriel';
  tut.addEventListener('click', () => { flags.tutorialDone = false; saveFlags(); settings.hints = true; saveSettings(); renderSettings(); tut.textContent = 'Tutoriel réactivé'; });
  row.append(reset, tut); form.append(row);
}

/* ---------- Commandes ---------- */
const CONTROLS = [
  [['Souris'], 'orienter le nez (plus loin du centre = virage plus serré)'],
  [['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], 'tangage et lacet au clavier'],
  [['KeyQ', 'KeyE'], 'roulis'],
  [['KeyW', 'KeyS'], 'gaz (poussée directe si FA coupée)'],
  [['KeyA', 'KeyD'], 'translation latérale'],
  [['KeyR', 'KeyF'], 'translation verticale'],
  [['ShiftLeft'], 'postcombustion'],
  [['ShiftLeft', 'KeyS'], 'rétro-postcombustion : freinage brutal, marche arrière'],
  [['KeyX'], 'gaz à zéro (le vaisseau freine)'],
  [['Clic gauche', 'Space'], 'canons · décollage automatique sur le pont'],
  [['Clic droit', 'KeyG'], 'missile (verrouillage : cible au centre)'],
  [['KeyC'], 'leurres contre les missiles ennemis'],
  [['KeyT', 'KeyY'], 'cibler sous le réticule · cible suivante'],
  [['Tab'], 'cibler la torpille la plus urgente'],
  [['KeyB'], 'assistance de vol (FA) ON / OFF'],
  [['KeyV', 'KeyN'], 'vue poursuite / cockpit · portée radar'],
  [['Enter'], 'lancer la vague suivante (prime)'],
  [['KeyP', 'Escape'], 'pause'],
];
const PAD = [['Stick gauche', 'orienter le vaisseau'], ['Stick droit', 'gaz (haut/bas) et roulis'], ['Croix', 'translations'], ['RT', 'canons'], ['LT', 'missile'], ['RB', 'postcombustion'], ['LB', 'leurres'], ['A', 'cibler sous le réticule'], ['X', 'cible suivante'], ['L3', 'cibler la torpille'], ['B', 'assistance de vol'], ['Y', 'vue'], ['Select', 'portée radar'], ['Start', 'pause']];
function ctlRow(keys, txt) {
  const row = document.createElement('div'); row.className = 'ctl';
  const k = document.createElement('span'); k.className = 'k';
  keys.forEach((code, i) => { const kb = document.createElement('kbd'); kb.textContent = /^(Key|Digit|Arrow)|^(Space|ShiftLeft|Tab|Enter|Escape)$/.test(code) ? keyLabel(code) : code; k.append(kb); if (i < keys.length - 1) k.append(' '); });
  const t = document.createElement('span'); t.textContent = txt; row.append(k, t); return row;
}
function renderControls() {
  $('ctl').replaceChildren(...CONTROLS.map(([ks, txt]) => ctlRow(ks, txt)));
  $('ctlPad').replaceChildren(...PAD.map(([k, t]) => ctlRow([k], t)));
}

/* ---------- Records ---------- */
function dateFr(ts) { try { return new Date(ts).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return ''; } }
export function renderRecords(highlightId) {
  const list = getScores(), box = $('recordsList');
  if (!list.length) { box.innerHTML = '<div class="empty">Aucune sortie enregistrée pour l\'instant.</div>'; return; }
  const t = document.createElement('table'); t.className = 'scores';
  t.innerHTML = '<thead><tr><th>#</th><th>Score</th><th>Vague</th><th>Difficulté</th><th>Date</th></tr></thead>';
  const tb = document.createElement('tbody');
  list.forEach((s, i) => {
    const tr = document.createElement('tr'); if (s.id === highlightId) tr.className = 'me';
    for (const v of [i + 1, fr(s.score), s.victory ? `${s.wave} ★` : s.wave, DIFFS[s.diff]?.label || s.diff, dateFr(s.date)]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
    tb.append(tr);
  });
  t.append(tb); box.replaceChildren(t);
}

/* ---------- Améliorations ---------- */
export function showUpgrade(info, choices, levels) {
  $('upEyebrow').textContent = `Vague ${info.wave} repoussée · primes ${fr(info.bonus)} points`;
  $('upTitle').textContent = 'Choisissez une amélioration';
  $('upText').textContent = info.lines.join(' · ');
  const box = $('upCards'); box.replaceChildren();
  choices.forEach((u, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'upcard' + (u.cat ? ' cat-' + u.cat : '');
    const lv = levels[u.id] || 0;
    b.innerHTML = `<span class="key">[${i + 1}]</span><span class="ic"></span><span class="nm"></span><span class="ds"></span><span class="lv"></span>`;
    b.querySelector('.ic').textContent = u.ic; b.querySelector('.nm').textContent = u.name; b.querySelector('.ds').textContent = u.desc;
    const lvEl = b.querySelector('.lv');
    if (u.max < 10) for (let j = 0; j < u.max; j++) { const d = document.createElement('i'); if (j < lv) d.className = 'on'; lvEl.append(d); }
    b.addEventListener('click', () => H.pickUpgrade(i));
    box.append(b);
  });
  show('upgrade');
}

/* ---------- Fin de partie ---------- */
function statGrid(el, items) {
  el.replaceChildren(...items.map(([k, v]) => { const d = document.createElement('div'); d.className = 'stat'; const b = document.createElement('b'); b.textContent = v; const s = document.createElement('span'); s.textContent = k; d.append(b, s); return d; }));
}
export function statItems(G, stationPct) {
  const s = G.stats, acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  return [['Score', fr(G.score)], ['Vagues repoussées', s.wavesCleared], ['Abattus', `${s.kills}`], ['Torpilles détruites', s.torps], ['Précision', `${acc} %`], ['Meilleur combo', `× ${fr(s.bestCombo, s.bestCombo % 1 ? 1 : 0)}`], ['Station', `${stationPct} %`], ['Durée', `${m} min ${String(sec).padStart(2, '0')}`]];
}
export function medals(G) {
  const s = G.stats, acc = s.shots ? s.hits / s.shots : 0, out = [];
  if (s.wavesCleared >= 10) out.push(['Défenseur d\'Orion', 'Campagne de 10 vagues terminée']);
  if (s.bosses >= 1) out.push(['Brise-frégate', `${s.bosses} frégate${s.bosses > 1 ? 's' : ''} détruite${s.bosses > 1 ? 's' : ''}`]);
  if (s.torps >= 10) out.push(['Bouclier vivant', `${s.torps} torpilles interceptées`]);
  if (s.shots >= 300 && acc >= 0.3) out.push(['Fine gâchette', `${Math.round(acc * 100)} % de précision`]);
  if (s.bestCombo >= 4) out.push(['Maître du combo', `Multiplicateur × ${fr(s.bestCombo, 1)}`]);
  if (s.missileKills >= 8) out.push(['Missilier', `${s.missileKills} victoires au missile`]);
  if (s.deaths === 0 && s.wavesCleared >= 3) out.push(['Intouchable', 'Aucun vaisseau perdu']);
  if (s.missilesDown >= 4) out.push(['Contre-mesures', `${s.missilesDown} missiles ennemis abattus`]);
  if (s.waveNoDamage >= 2) out.push(['Fantôme', `${s.waveNoDamage} vagues sans dégâts`]);
  if (s.torpHits === 0 && s.wavesCleared >= 3) out.push(['Mur infranchissable', 'Aucune torpille n\'a touché la station']);
  return out;
}
export function showOver({ eyebrow, title, text, items, medalList, rank }) {
  $('overEyebrow').textContent = eyebrow; $('overTitle').textContent = title; $('overText').textContent = text;
  statGrid($('overStats'), items);
  $('overMedals').replaceChildren(...medalList.map(([n, d]) => { const m = document.createElement('div'); m.className = 'medal'; m.textContent = n; const sm = document.createElement('small'); sm.textContent = d; m.append(sm); return m; }));
  const rec = $('overRecord'); rec.hidden = rank < 0; rec.textContent = rank === 0 ? '★ Nouveau record !' : rank > 0 ? `${rank + 1}ᵉ meilleur score` : '';
  updateBest();
  show('over');
}
export function showVictory(items) { statGrid($('vicStats'), items); show('victory'); }

/* ---------- Navigation à la manette ---------- */
export const nav = {
  active: () => !!visibleOverlay(),
  move(d) {
    const o = visibleOverlay(); if (!o) return;
    const items = [...$(o).querySelectorAll('button, input, select')].filter(e => e.offsetParent !== null);
    if (!items.length) return;
    let i = items.indexOf(document.activeElement); i = (i + d + items.length) % items.length; items[i].focus();
  },
  ok() { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.click(); else if (a && a.type === 'checkbox') a.click(); },
  back() { const o = visibleOverlay(); if (['settings', 'controls', 'records'].includes(o)) closePanel(); else if (o === 'pause') H.resume(); },
};
