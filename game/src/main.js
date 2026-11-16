// SPDX-License-Identifier: MIT
// main.js — entrypoint: build the game and run the loop.
// The game also answers ?shot=menu|play|buy|end with deterministic staged
// scenes (see Game._applyShotPresetFromUrl) for its own screenshots.

import { Game } from './game.js';

const game = new Game();
game.run();

// Small test hook (read-only state for automated playtests, not gameplay).
window.__NEON = { game };
