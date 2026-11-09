// Équipement du pilote : vaisseaux, armes, capacités, propulsion, livrées, crédits (sauvegardés).
const PKEY = 'orion7.profile.v1';

export const SHIPS = {
  orion: { name: 'Orion Mk II', role: 'Polyvalent', desc: 'Équilibré : bon blindage, maniable, six missiles.', cost: 0, hull: 100, shield: 100, speed: 1, agility: 1, boost: 1, missiles: 6, flares: 4, guns: 2 },
  vipere: { name: 'Vipère', role: 'Intercepteur', desc: 'Très rapide et nerveux, réserve de postcombustion accrue. Fragile.', cost: 3000, hull: 70, shield: 80, speed: 1.2, agility: 1.32, boost: 1.4, missiles: 4, flares: 6, guns: 2 },
  rempart: { name: 'Rempart', role: 'Canonnière lourde', desc: 'Lent mais très résistant, trois canons, dix missiles, quatre réacteurs.', cost: 5000, hull: 170, shield: 140, speed: 0.86, agility: 0.74, boost: 0.85, missiles: 10, flares: 4, guns: 3 },
};
export const WEAPONS = {
  cannon: { name: 'Canons cinétiques', desc: 'Cadence élevée et chauffe modérée. Visez le repère d\'avance.', cost: 0 },
  laser: { name: 'Lasers à impulsions', desc: 'Rayons instantanés : ils touchent là où vous visez. Pas de munitions, chauffent vite.', cost: 2000 },
  plasma: { name: 'Canon à plasma', desc: 'Boules lentes qui explosent en zone. Redoutable contre essaims et torpilles.', cost: 3500 },
};
export const ABILITIES = {
  aegis: { name: 'Égide', desc: 'Bouclier rechargé et invulnérabilité pendant 3 s.', cost: 0, cd: 30 },
  emp: { name: 'Onde IEM', desc: 'Onde de 450 m : détruit missiles et torpilles, paralyse les ennemis 4 s.', cost: 2500, cd: 35 },
  blink: { name: 'Saut de phase', desc: 'Bond instantané de 700 m vers l\'avant.', cost: 3000, cd: 16 },
  wingman: { name: 'Drone ailier', desc: 'Un drone allié vous escorte 25 s et tire sur vos ennemis.', cost: 4000, cd: 45 },
};
export const BOOSTS = {
  afterburner: { name: 'Postcombustion', desc: 'Poussée continue tant que la réserve tient.', cost: 0 },
  dash: { name: 'Propulseur à impulsions', desc: 'Bonds de vitesse instantanés. Trois charges qui se rechargent.', cost: 1500 },
  fusion: { name: 'Réacteur à fusion', desc: 'Postcombustion moins puissante mais presque inépuisable.', cost: 1500 },
};
export const PAINTS = {
  orion: { name: 'Orion', hull: 0xe2e6ea, accent: 0xe8862a },
  nuit: { name: 'Nuit polaire', hull: 0x3a4250, accent: 0x6fc8ff },
  sable: { name: 'Sable', hull: 0xcdb991, accent: 0x9a3a22 },
  alerte: { name: 'Alerte', hull: 0xdfe3e8, accent: 0xd8262a },
  emeraude: { name: 'Émeraude', hull: 0x2f4a40, accent: 0xe8c547 },
};
export const CATALOG = { ship: SHIPS, weapon: WEAPONS, ability: ABILITIES, boost: BOOSTS, paint: PAINTS };

function load() { try { return JSON.parse(localStorage.getItem(PKEY)) || null; } catch { return null; } }
const saved = load() || {};
export const profile = {
  credits: saved.credits || 0,
  owned: { ship: ['orion'], weapon: ['cannon'], ability: ['aegis'], boost: ['afterburner'], ...(saved.owned || {}) },
  loadout: { ship: 'orion', weapon: 'cannon', ability: 'aegis', boost: 'afterburner', paint: 'orion', ...(saved.loadout || {}) },
};
export function saveProfile() { try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch { /* stockage indisponible */ } }

export const isOwned = (cat, id) => cat === 'paint' || (CATALOG[cat][id] && (CATALOG[cat][id].cost === 0 || profile.owned[cat].includes(id)));
export function buy(cat, id) {
  const item = CATALOG[cat][id]; if (!item || isOwned(cat, id) || profile.credits < item.cost) return false;
  profile.credits -= item.cost; profile.owned[cat].push(id); profile.loadout[cat] = id; saveProfile(); return true;
}
export function equip(cat, id) { if (!isOwned(cat, id)) return false; profile.loadout[cat] = id; saveProfile(); return true; }
export const current = () => profile.loadout;
export const ship = () => SHIPS[profile.loadout.ship] || SHIPS.orion;

/** Crédits gagnés en fin de sortie. */
export function awardCredits(score, waves) { const c = Math.floor(score / 8) + waves * 120; profile.credits += c; saveProfile(); return c; }
