[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02-r5/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Ahmadmukafi/threejs-fps-02-r5/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# NEON BREACH — YARD-7 Tactical FPS

A round-based tactical FPS in the Counter-Strike style, built on three.js 0.187.0 (vendored, no build step, no network requests). You are **VOLT**, three agents deep in the neon yard YARD-7. **EMBER** holds five.

First team to **5 rounds** (max 9) takes the yard. Win a round by **eliminating all EMBER** or by holding the **UPLINK pad** for 8 seconds. Kills and round wins pay **credits** — spend them between rounds on the VK-9 RIPPER, AR-77 LONGSHOT, DMR-50 HALBERD and KEVLAR VEST. Stop, aim, breathe: firing on the move sprays wide, crouching and standing still tighten your shots, and headshots pay double.

## How to play

```
node serve.ts            # serves game/ at http://localhost:8080
```

Open the page in desktop Chrome. Click **CLICK TO DEPLOY**, buy in the buy phase, then fight.

- **W A S D** move · **Mouse** aim (click to lock) · **Click** fire · **R** reload
- **Shift** walk silent · **C** crouch · **1 / 2 / 3 / 4** swap weapon
- **G** throw NOVA grenade · **B** buy menu (between rounds) · **Esc** release mouse

## What is in the game

- **Gunplay** — raycast hits against head and body (2× headshot), recoil, bloom and movement spread, reloads, reserve ammo, tracer fire, muzzle flash.
- **Tactics** — an UPLINK objective beyond killing, a credit economy with a buy menu, four weapons plus a NOVA grenade, and bots that follow lane routes, hold positions, react to gunfire they hear, strafe while engaging and push the pad.
- **The map** — YARD-7: an original three-lane neon yard (west / mid / east), crate cover, a glowing uplink pad, an indigo night sky and a skyline. Palette: indigo night + neon cyan, EMBER orange as the enemy accent.
- **The screens** — title (rules + controls), first-person play with a full HUD (credits, round, K/D, score, timer, HP, shield, ammo, minimap, kill feed), buy menu, and a victory screen with final score, kills / deaths / damage and credits.

## Layout

- `game/` — the static game. `index.html` + `src/`: `main.js` (bootstrap), `game.js` (simulation: fixed 60 Hz step apart from rendering), `world.js` (YARD-7 map + collision), `bots.js` (bot AI), `weapons.js` (armoury), `hud.js` (HUD + menus + minimap), `audio.js` (synthesized WebAudio effects), `util.js`.
- `main.ts` — copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the kit's `buildDossier`.
- `serve.ts` — tiny static server for local play and screenshots.
- `screenshots/` — four renders of the game's own code: menu, play, buy, victory.

<sub>Entered on [make.fun](https://make.fun/?ref=6z0bn4hz&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
