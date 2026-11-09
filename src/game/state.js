// État partagé de la partie.
export const DIFFS = {
  recrue: { label: 'Recrue', hint: 'Ennemis moins précis et moins puissants, station renforcée, 4 vaisseaux. Score × 0,75.', enemyDmg: 0.6, spread: 1.6, stationHp: 1400, enemyHp: 0.85, score: 0.75, lives: 4, aggr: 0.8 },
  pilote: { label: 'Pilote', hint: 'L\'expérience prévue : exigeante mais juste. 3 vaisseaux.', enemyDmg: 1, spread: 1, stationHp: 1000, enemyHp: 1, score: 1, lives: 3, aggr: 1 },
  veteran: { label: 'Vétéran', hint: 'Ennemis précis et coriaces, station fragile, 2 vaisseaux. Score × 1,5.', enemyDmg: 1.35, spread: 0.7, stationHp: 800, enemyHp: 1.2, score: 1.5, lives: 2, aggr: 1.25 },
};
export const CAMPAIGN_WAVES = 10;

export const G = {
  state: 'loading', prevState: null, time: 0, timeScale: 1, slowT: 0,
  diffKey: 'pilote', diff: DIFFS.pilote, endless: false,
  wave: 0, waveActive: false, waveT: 0, interT: 0, spawnQueue: [], waveSize: 0,
  score: 0,
  stats: null,
  enemies: [], torps: [], eMissiles: [], missiles: [], pickups: [], flares: [], targets: [],
  boss: null, up: {},
  combo: { chain: 0, t: 0, mult: 1, quick: 0, quickT: 0, best: 0 },
  shake: 0, hitMarkT: 0, killMarkT: 0, dmgDirs: [], popups: [], banner: null, announce: null,
  camMode: 'chase', radarRange: 5000, deadT: 0, launchT: 0, launchDur: 3,
  pendingUpgrade: null, overReason: null, hooks: {}, hurtT: 0, shieldFxT: 0, waveDamage: 0, stationAtWaveStart: 0, reinforceShown: null, clearedInfo: null, clearedDelay: 0, hudBoot: 1, fovKick: 0, recoil: 0, player: null,
};

export function newStats() {
  return { kills: 0, bombers: 0, interceptors: 0, drones: 0, fighters: 0, bosses: 0, torps: 0, missilesDown: 0, shots: 0, hits: 0, wavesCleared: 0, deaths: 0, pickups: 0, bestCombo: 1, missileKills: 0, time: 0, damageTaken: 0, waveNoDamage: 0, torpHits: 0 };
}
G.stats = newStats();

export const isFlying = () => G.state === 'flight' || G.state === 'launch';
export const simRunning = () => G.state === 'flight' || G.state === 'launch' || G.state === 'dead';
