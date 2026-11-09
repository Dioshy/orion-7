// Améliorations proposées entre les vagues (une parmi trois).
import { G } from './state.js';
import { player, refreshStats } from './player.js';
import { station, addPdTurret, repairStation } from './station.js';
import { shuffle } from '../core/util.js';

export const UPGRADES = [
  { id: 'dmg', ic: '✦', name: 'Canons à plasma', desc: '+20 % de dégâts des canons.', max: 5 },
  { id: 'rof', ic: '≫', name: 'Culasse rapide', desc: '+15 % de cadence de tir.', max: 4 },
  { id: 'cool', ic: '❄', name: 'Dissipateurs', desc: 'Les canons chauffent 25 % moins vite.', max: 4 },
  { id: 'gun3', ic: '⋔', name: 'Canon ventral', desc: 'Un troisième canon tire avec les deux autres.', max: 1 },
  { id: 'missiles', ic: '➶', name: 'Soute élargie', desc: '+2 missiles emportés (rechargés tout de suite).', max: 3 },
  { id: 'salvo', ic: '⇉', name: 'Salve double', desc: 'Chaque tir verrouillé lance deux missiles.', max: 1, need: () => true },
  { id: 'lock', ic: '◎', name: 'Calculateur de tir', desc: 'Verrouillage missile 35 % plus rapide.', max: 2 },
  { id: 'splash', ic: '✺', name: 'Ogives à fragmentation', desc: '+40 % de rayon d\'explosion des missiles.', max: 2 },
  { id: 'shield', ic: '⬡', name: 'Générateur de bouclier', desc: '+25 boucliers max, recharge plus rapide.', max: 3 },
  { id: 'hull', ic: '▣', name: 'Blindage composite', desc: '+25 points de coque max (réparés).', max: 3 },
  { id: 'regen', ic: '✚', name: 'Nanorobots', desc: 'La coque se répare lentement en vol.', max: 2 },
  { id: 'boost', ic: '⚡', name: 'Réservoirs auxiliaires', desc: '+35 % de postcombustion, recharge plus rapide.', max: 3 },
  { id: 'agility', ic: '↻', name: 'Propulseurs vectoriels', desc: '+15 % de maniabilité.', max: 3 },
  { id: 'flares', ic: '✧', name: 'Lance-leurres', desc: '+2 leurres contre les missiles ennemis.', max: 2 },
  { id: 'magnet', ic: '⊛', name: 'Aimant de récupération', desc: 'Les caissons sont attirés vers vous de loin.', max: 1 },
  { id: 'combo', ic: '×', name: 'Ordinateur tactique', desc: 'Les combos durent 60 % plus longtemps.', max: 1 },
  { id: 'ovd', ic: '☀', name: 'Surcharge prolongée', desc: 'Les caissons de surcharge durent 20 s au lieu de 12.', max: 1 },
  { id: 'pd', ic: '⌖', name: 'Tourelle de défense', desc: 'La station reçoit une tourelle qui abat torpilles, missiles et drones.', max: 4, cat: 'defense' },
  { id: 'repair', ic: '⚒', name: 'Équipe de réparation', desc: 'Répare 30 % de la station.', max: 99, cat: 'defense', need: () => station.hp < station.maxHp * 0.85 },
  { id: 'armor', ic: '⛨', name: 'Plaques de la station', desc: '+20 % d\'intégrité maximale de la station (ajoutée).', max: 2, cat: 'defense' },
];

export function rollUpgrades(n = 3) {
  const avail = UPGRADES.filter(u => (G.up[u.id] || 0) < u.max && (!u.need || u.need()));
  const list = shuffle(avail.slice());
  // une option défensive garantie si la station souffre
  if (station.hp < station.maxHp * 0.6) { const d = list.findIndex(u => u.cat === 'defense'); if (d > 2) list.unshift(list.splice(d, 1)[0]); }
  return list.slice(0, n);
}

export function applyUpgrade(id) {
  G.up[id] = (G.up[id] || 0) + 1;
  const p = player;
  refreshStats();
  switch (id) {
    case 'missiles': p.missiles = p.S.maxMissiles; break;
    case 'hull': p.hull = p.S.maxHull; break;
    case 'shield': p.shield = p.S.maxShield; break;
    case 'flares': p.flares = p.S.maxFlares; break;
    case 'boost': p.boost = p.S.maxBoost; break;
    case 'pd': addPdTurret(); break;
    case 'repair': G.up.repair = 0; repairStation(0.3); break;
    case 'armor': station.maxHp *= 1.2; station.hp += station.maxHp / 1.2 * 0.2; break;
  }
}
