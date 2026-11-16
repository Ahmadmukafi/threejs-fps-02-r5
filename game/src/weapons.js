// SPDX-License-Identifier: MIT
// weapons.js — the YARD-7 armoury. One definition per weapon; the sim reads
// these numbers, the HUD reads the same numbers, so screens and code agree.

export const WEAPONS = {
  spark: {
    id: 'spark', name: 'P-9 SPARK', slot: 0, price: 0,
    damage: 22, headMult: 2.0, rpm: 320, mag: 12, reserve: 48,
    spread: 0.011, moveSpread: 0.030, recoil: 0.011, range: 42,
    auto: false, reloadTime: 1.1, desc: 'Standard-issue sidearm. Free, reliable, quiet-ish.',
  },
  ripper: {
    id: 'ripper', name: 'VK-9 RIPPER', slot: 1, price: 800,
    damage: 19, headMult: 2.0, rpm: 780, mag: 30, reserve: 90,
    spread: 0.016, moveSpread: 0.052, recoil: 0.016, range: 55,
    auto: true, reloadTime: 1.6, desc: 'Close-quarters SMG. Hose them down — if you can hold it still.',
  },
  longshot: {
    id: 'longshot', name: 'AR-77 LONGSHOT', slot: 2, price: 1600,
    damage: 30, headMult: 2.0, rpm: 540, mag: 25, reserve: 75,
    spread: 0.007, moveSpread: 0.038, recoil: 0.024, range: 80,
    auto: true, reloadTime: 2.0, desc: 'The workhorse rifle. Accurate, punchy, honest.',
  },
  halberd: {
    id: 'halberd', name: 'DMR-50 HALBERD', slot: 3, price: 2400,
    damage: 82, headMult: 2.2, rpm: 62, mag: 5, reserve: 15,
    spread: 0.0015, moveSpread: 0.045, recoil: 0.055, range: 120,
    auto: false, reloadTime: 2.6, desc: 'Semi-auto marksman rifle. One headshot ends the argument.',
  },
};

export const WEAPON_LIST = [WEAPONS.spark, WEAPONS.ripper, WEAPONS.longshot, WEAPONS.halberd];

export const KEVLAR_PRICE = 650;
export const GRENADE_PRICE = 300;
export const KILL_REWARD = 300;
export const ROUND_WIN_REWARD = 400;
export const ROUND_LOSS_REWARD = 200;
export const START_CREDITS = 800;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;
export const ROUND_TIME = 100;
export const CAPTURE_TIME = 8;
