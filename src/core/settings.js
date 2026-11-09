// Paramètres, records et indicateurs persistés dans le navigateur.
const SKEY = 'orion7.settings.v2', HKEY = 'orion7.scores.v2', FKEY = 'orion7.flags.v2';

function load(key) { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } }
function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

export const DEFAULTS = {
  master: 0.8, sfx: 0.9, music: 0.55,
  quality: 'auto', sensitivity: 1, invertPitch: false, mouseMode: 'lock',
  fov: 70, shake: 1, hints: true, difficulty: 'pilote', showFps: false, bloom: 0.5,
};
export const settings = { ...DEFAULTS, ...(load(SKEY) || {}) };
export function saveSettings() { store(SKEY, settings); }

export const flags = { tutorialDone: false, victories: 0, ...(load(FKEY) || {}) };
export function saveFlags() { store(FKEY, flags); }

export function getScores() { const s = load(HKEY); return Array.isArray(s) ? s : []; }
/** Ajoute un score et renvoie son rang (0 = meilleur), ou -1 s'il ne figure pas dans le top 10. */
export function addScore(entry) {
  const s = getScores(); entry.id = Date.now() + Math.random();
  s.push(entry); s.sort((a, b) => b.score - a.score);
  const rank = s.indexOf(entry); s.length = Math.min(s.length, 10); store(HKEY, s);
  return rank < 10 ? rank : -1;
}
export const bestScore = () => getScores()[0]?.score || 0;
