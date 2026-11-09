// Écran du hangar : vaisseau, arme, capacité, propulsion, livrée ; achats avec les crédits.
import { SHIPS, WEAPONS, ABILITIES, BOOSTS, PAINTS, profile, isOwned, buy, equip } from '../game/loadout.js';
import { sfx } from '../core/audio.js';
import { fr } from '../core/util.js';
import { keyLabel } from './keys.js';

const $ = id => document.getElementById(id);
let onChange = () => {};
export function initHangar({ change, launch, back }) {
  onChange = change;
  $('hgLaunch').addEventListener('click', launch);
  $('hgBack').addEventListener('click', back);
}

function option(cat, id, item, extra = '') {
  const b = document.createElement('button'); b.type = 'button';
  const owned = isOwned(cat, id), on = profile.loadout[cat] === id, afford = profile.credits >= item.cost;
  b.className = 'opt' + (on ? ' on' : '') + (owned ? '' : afford ? ' locked' : ' locked cant');
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = item.name;
  const tag = document.createElement('span'); tag.className = 'tag';
  tag.textContent = on ? 'Équipé' : owned ? 'Équiper' : `${afford ? 'Acheter' : 'Verrouillé'} · ${fr(item.cost)} cr`;
  const ds = document.createElement('span'); ds.className = 'ds'; ds.textContent = (extra ? extra + ' — ' : '') + item.desc;
  b.append(nm, tag, ds);
  b.addEventListener('click', () => {
    if (on) return;
    if (owned) { equip(cat, id); sfx('click'); }
    else if (buy(cat, id)) sfx('buy');
    else { sfx('deny'); return; }
    onChange(); renderHangar();
  });
  return b;
}

const STAT_ROWS = [['Coque', s => s.hull, 170], ['Bouclier', s => s.shield, 140], ['Vitesse', s => Math.round(s.speed * 320), 400], ['Maniabilité', s => Math.round(s.agility * 100), 135], ['Postcombustion', s => Math.round(s.boost * 100), 140], ['Missiles', s => s.missiles, 10]];
export function renderHangar() {
  $('hgCredits').textContent = fr(profile.credits);
  $('hgAbKey').textContent = keyLabel('KeyZ');
  $('hgShips').replaceChildren(...Object.entries(SHIPS).map(([id, s]) => option('ship', id, s, s.role)));
  const sh = SHIPS[profile.loadout.ship];
  $('hgStats').replaceChildren(...STAT_ROWS.map(([lab, f, max]) => {
    const row = document.createElement('div'); row.className = 'hg-stat';
    const l = document.createElement('span'); l.textContent = lab;
    const bar = document.createElement('i'), fill = document.createElement('b'); fill.style.width = `${Math.min(100, f(sh) / max * 100)}%`; bar.append(fill);
    const v = document.createElement('em'); v.textContent = f(sh);
    row.append(l, bar, v); return row;
  }));
  $('hgWeapon').replaceChildren(...Object.entries(WEAPONS).map(([id, w]) => option('weapon', id, w)));
  $('hgAbility').replaceChildren(...Object.entries(ABILITIES).map(([id, a]) => option('ability', id, a, `recharge ${a.cd} s`)));
  $('hgBoost').replaceChildren(...Object.entries(BOOSTS).map(([id, b]) => option('boost', id, b)));
  $('hgPaint').replaceChildren(...Object.entries(PAINTS).map(([id, p]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (profile.loadout.paint === id ? ' on' : ''); b.title = p.name;
    b.style.setProperty('--a', '#' + p.hull.toString(16).padStart(6, '0')); b.style.setProperty('--b', '#' + p.accent.toString(16).padStart(6, '0'));
    b.addEventListener('click', () => { equip('paint', id); sfx('click'); onChange(); renderHangar(); });
    return b;
  }));
}
