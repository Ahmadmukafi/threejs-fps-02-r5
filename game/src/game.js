// SPDX-License-Identifier: MIT
// game.js — NEON BREACH: the whole simulation in one place.
// Fixed-step logic (60 Hz) kept apart from rendering: update() advances the
// round, the bots, the capture and the projectiles; render() only draws.
// State lives in this class; the HUD reads it, the input writes intents.

import * as THREE from 'three';
import { clamp, lerp, mulberry32, rand, pick } from './util.js';
import { WEAPONS, WEAPON_LIST, KEVLAR_PRICE, GRENADE_PRICE, KILL_REWARD, ROUND_WIN_REWARD, ROUND_LOSS_REWARD, START_CREDITS, ROUNDS_TO_WIN, MAX_ROUNDS, ROUND_TIME, CAPTURE_TIME } from './weapons.js';
import { buildWorld, resolveCollision } from './world.js';
import { makeBots } from './bots.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';

export const STEP = 1 / 60;
const EYE_STAND = 1.55;
const EYE_CROUCH = 1.0;
const PLAYER_RADIUS = 0.42;
const PLAYER_SPEED = 5.4;

export class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 220);
    this.scene.add(this.camera);

    this.world = buildWorld(this.scene, 20261117);
    this.solidMeshes = [];
    this.world.group.traverse((o) => {
      if (o.isMesh && !(o.material && o.material.transparent)) this.solidMeshes.push(o);
    });
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;

    this.sounds = new SoundBank();
    this.hud = new Hud({
      onDeploy: () => this.startMatch(),
      onBuyDeploy: () => this.deployRound(),
      onAgain: () => this.resetMatch(),
      onBuy: (id) => this.buy(id),
    });

    this.bots = makeBots(this.scene, 90210);
    this.rng = mulberry32(424242);

    // Player state.
    this.player = {
      pos: new THREE.Vector3(0, 0, 19), vel: new THREE.Vector3(),
      yaw: Math.PI, pitch: 0, hp: 100, shield: 0, alive: true,
      crouched: false, eyeH: EYE_STAND, moving: false, speed2d: 0,
    };
    this.keys = {};
    this.mouseDown = false;
    this.locked = false;
    this.dragging = false;

    this.loadout = { owned: ['spark'], current: 'spark', kevlar: false, grenadesBought: 0 };
    this.ammo = {}; this.reserve = {};
    this._refillAmmo();

    // Match state.
    this.phase = 'title'; // title | buy | play | roundEnd | over
    this.round = 1;
    this.scoreVolt = 0; this.scoreEmber = 0;
    this.credits = START_CREDITS;
    this.kills = 0; this.deaths = 0; this.damage = 0;
    this.timeLeft = ROUND_TIME;
    this.buyTimeLeft = 20;
    this.capture = { volt: 0, ember: 0 };
    this.roundWinner = null;
    this.spectateBot = null;
    this.fireTimer = 0; this.bloom = 0; this.recoil = 0;
    this.reloading = false; this.reloadTimer = 0;
    this.grenades = 1;
    this.grenadeProjectiles = [];
    this.tracers = [];
    this._buildTracers();
    this._buildViewmodel();
    this.muzzle = new THREE.PointLight(0xffc266, 0, 9, 1.8);
    this.camera.add(this.muzzle);
    this.muzzle.position.set(0.25, -0.22, -0.9);

    this.time = 0;
    this.acc = 0;
    this._semiEdge = true;
    this.lastT = performance.now();
    this._bindInput();
    this._applyShotPresetFromUrl();
    if (this.phase === 'title') this.hud.showTitle(true);
    window.addEventListener('resize', () => this._resize());
  }

  // ---------- setup ----------

  _refillAmmo() {
    for (const w of WEAPON_LIST) { this.ammo[w.id] = w.mag; this.reserve[w.id] = w.reserve; }
  }

  _buildTracers() {
    for (let i = 0; i < 14; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0x9ff3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
  }

  _fireTracer(from, to, color) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color ?? 0x9ff3ff);
    t.line.material.opacity = 0.9;
    t.life = 0.07;
  }

  _buildViewmodel() {
    this.vm = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.35, metalness: 0.75 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x22e6ff, emissiveIntensity: 1.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.45), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), dark);
    barrel.position.set(0, 0.025, -0.38);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.035, 0.09), glow);
    sight.position.set(0, 0.075, -0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), dark);
    grip.position.set(0, -0.13, 0.16); grip.rotation.x = 0.35;
    this.vm.add(body, barrel, sight, grip);
    this.vmBarrel = barrel;
    this.vm.scale.setScalar(0.8);
    this.vm.position.set(0.3, -0.27, -0.6);
    this.camera.add(this.vm);
  }

  _setViewmodel(weapon) {
    // Longer barrel for the DMR, shorter for the SMG: the model matches the gun.
    const len = weapon.id === 'halberd' ? 0.62 : weapon.id === 'ripper' ? 0.3 : weapon.id === 'longshot' ? 0.48 : 0.22;
    this.vmBarrel.scale.z = len / 0.4;
    this.vmBarrel.position.z = -0.28 - len / 2 + 0.2;
  }

  _bindInput() {
    const c = this.renderer.domElement;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyB' && this.phase === 'buy') this.deployRound();
      if (e.code === 'KeyC' && this.phase === 'play') this.player.crouched = !this.player.crouched;
      if (e.code === 'Digit1') this.equip('spark');
      if (e.code === 'Digit2') this.equip('ripper');
      if (e.code === 'Digit3') this.equip('longshot');
      if (e.code === 'Digit4') this.equip('halberd');
      if (e.code === 'Enter' && this.phase === 'title') this.startMatch();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      if (this.phase === 'play' && !this.locked) this.dragging = true;
      if (this.phase === 'play' && !this.locked) c.requestPointerLock?.()?.catch?.(() => {});
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) { this.mouseDown = false; this.dragging = false; } });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.phase !== 'play' || !this.player.alive) return;
      if (this.locked || this.dragging) {
        this.player.yaw -= e.movementX * 0.0021;
        this.player.pitch = clamp(this.player.pitch - e.movementY * 0.0021, -1.45, 1.45);
      }
    });
    c.addEventListener('click', () => {
      if (this.phase === 'play' && !this.locked) c.requestPointerLock?.()?.catch?.(() => {});
    });
    window.addEventListener('blur', () => { this.mouseDown = false; this.keys = {}; });
  }

  _resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---------- match flow ----------

  startMatch() {
    this.sounds.ensure();
    this.resetMatch();
    this.phase = 'buy';
    this.hud.showTitle(false);
    this.hud.showHud(true);
    this.openBuy();
  }

  resetMatch() {
    this.round = 1; this.scoreVolt = 0; this.scoreEmber = 0;
    this.credits = START_CREDITS;
    this.kills = 0; this.deaths = 0; this.damage = 0;
    this.loadout = { owned: ['spark'], current: 'spark', kevlar: false, grenadesBought: 0 };
    this._refillAmmo();
    this._setViewmodel(WEAPONS.spark);
    this.capture = { volt: 0, ember: 0 };
    this.hud.clearFeed();
    this.hud.setEndVisible(false);
  }

  openBuy() {
    this.phase = 'buy';
    this.buyTimeLeft = 20;
    this.hud.setBuyRound(this.round, MAX_ROUNDS);
    this._renderShop();
    this.hud.showBuy(true);
    this.hud.showHud(true);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _shopItems() {
    return [
      { ...WEAPONS.ripper, tag: 'SMG · 30 RD · 780 RPM' },
      { ...WEAPONS.longshot, tag: 'RIFLE · 25 RD · 540 RPM' },
      { ...WEAPONS.halberd, tag: 'DMR · 5 RD · 1-SHOT HEAD' },
      { id: 'kevlar', name: 'KEVLAR VEST', price: KEVLAR_PRICE, tag: '+50 SHIELD THIS ROUND',
        desc: 'Woven plates that eat the first hits. One vest per round.' },
      { id: 'grenade', name: 'NOVA GRENADE', price: GRENADE_PRICE, tag: 'AOE · 110 DMG · +1 THIS ROUND',
        desc: 'A bouncing charge of bottled lightning. [G] to throw.' },
    ];
  }

  _renderShop() {
    const owned = [...this.loadout.owned];
    if (this.loadout.kevlar) owned.push('kevlar');
    this.hud.renderShop(this._shopItems(), this.credits, owned);
  }

  buy(id) {
    if (this.phase !== 'buy') return;
    if (id === 'kevlar') {
      if (this.loadout.kevlar || this.credits < KEVLAR_PRICE) return;
      this.credits -= KEVLAR_PRICE; this.loadout.kevlar = true;
    } else if (id === 'grenade') {
      if (this.loadout.grenadesBought >= 2 || this.credits < GRENADE_PRICE) return;
      this.credits -= GRENADE_PRICE; this.loadout.grenadesBought++;
    } else {
      const w = WEAPONS[id];
      if (!w || this.loadout.owned.includes(id) || this.credits < w.price) return;
      this.credits -= w.price; this.loadout.owned.push(id);
      this.equip(id);
    }
    this.sounds.buy();
    this._renderShop();
  }

  equip(id) {
    if (!this.loadout.owned.includes(id)) return;
    if (this.reloading) { this.reloading = false; }
    this.loadout.current = id;
    this._setViewmodel(WEAPONS[id]);
    this.fireTimer = 0; this.bloom = 0;
  }

  deployRound() {
    this.hud.showBuy(false);
    this.phase = 'play';
    this.timeLeft = ROUND_TIME;
    this.capture = { volt: 0, ember: 0 };
    this.grenades = 1 + this.loadout.grenadesBought;
    this.loadout.grenadesBought = 0;
    this._refillAmmo();
    this.player.hp = 100;
    this.player.shield = this.loadout.kevlar ? 50 : 0;
    this.loadout.kevlar = false;
    this.player.alive = true;
    this.spectateBot = null;
    // Spawn teams.
    const vs = this.world.voltSpawns, es = this.world.emberSpawns;
    this.player.pos.set(vs[1].x, 0, vs[1].z);
    this.player.yaw = vs[1].yaw; this.player.pitch = 0; this.player.vel.set(0, 0, 0);
    const volts = this.bots.filter((b) => b.team === 'volt');
    const embers = this.bots.filter((b) => b.team === 'ember');
    volts.forEach((b, i) => { const s = vs[i === 0 ? 0 : 2]; b.reset(s.x, s.z, s.yaw); b.setRoute(this._routeFor(b)); });
    embers.forEach((b, i) => { const s = es[i]; b.reset(s.x, s.z, s.yaw); b.setRoute(this._routeFor(b)); });
    this.hud.banner(`ROUND ${this.round}`, '#22e6ff');
    this.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
  }

  _routeFor(bot) {
    const wps = this.world.waypoints;
    const lane = pick(this.rng, [0, 1, 2]); // 0 west, 1 mid, 2 east
    const dir = bot.team === 'ember' ? 1 : -1; // ember pushes south, volt pushes north
    const laneWps = wps.filter((w) => (lane === 0 && w.x < -10) || (lane === 1 && Math.abs(w.x) <= 10) || (lane === 2 && w.x > 10));
    const sorted = [...laneWps].sort((a, b) => dir * (a.z - b.z));
    const route = sorted.slice(0, 3 + Math.floor(this.rng() * 2));
    route.push({ x: pick(this.rng, [-6, 0, 6]), z: -4 }); // converge on the pad
    return route;
  }

  endRound(winner, reason) {
    if (this.phase !== 'play') return;
    this.phase = 'roundEnd';
    this.roundWinner = winner;
    if (winner === 'volt') { this.scoreVolt++; this.credits += ROUND_WIN_REWARD; }
    else { this.scoreEmber++; this.credits += ROUND_LOSS_REWARD; }
    this.hud.banner(
      winner === 'volt' ? 'VOLT TAKES THE ROUND' : 'EMBER TAKES THE ROUND',
      winner === 'volt' ? '#22e6ff' : '#ff5a2a',
    );
    if (winner === 'volt') this.sounds.roundWin(); else this.sounds.roundLose();
    setTimeout(() => {
      if (this.scoreVolt >= ROUNDS_TO_WIN || this.scoreEmber >= ROUNDS_TO_WIN || this.round >= MAX_ROUNDS) {
        this.endMatch();
      } else {
        this.round++;
        this.openBuy();
      }
    }, 2600);
  }

  endMatch() {
    this.phase = 'over';
    const win = this.scoreVolt > this.scoreEmber;
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud.showEnd(win, this.scoreVolt, this.scoreEmber, {
      kills: this.kills, deaths: this.deaths, damage: this.damage, credits: this.credits,
    });
    if (win) this.sounds.roundWin();
  }

  // ---------- combat ----------

  _weapon() { return WEAPONS[this.loadout.current]; }

  startReload() {
    if (this.phase !== 'play' || !this.player.alive || this.reloading) return;
    const w = this._weapon();
    if (this.ammo[w.id] >= w.mag || this.reserve[w.id] <= 0) return;
    this.reloading = true;
    this.reloadTimer = w.reloadTime;
    this.sounds.reload();
  }

  _finishReload() {
    const w = this._weapon();
    const need = w.mag - this.ammo[w.id];
    const take = Math.min(need, this.reserve[w.id]);
    this.ammo[w.id] += take;
    this.reserve[w.id] -= take;
    this.reloading = false;
  }

  _spreadNow() {
    const w = this._weapon();
    const move = clamp(this.player.speed2d / PLAYER_SPEED, 0, 1);
    const crouch = this.player.crouched ? 0.55 : 1;
    return (w.spread + w.moveSpread * move + this.bloom) * crouch;
  }

  tryFire(now) {
    if (this.phase !== 'play' || !this.player.alive || this.reloading) return;
    const w = this._weapon();
    if (this.fireTimer > 0) return;
    if (this.ammo[w.id] <= 0) { this.sounds.dry(); this.fireTimer = 0.25; this.startReload(); return; }
    this.fireTimer = 60 / w.rpm;
    this.ammo[w.id]--;
    this.bloom = Math.min(0.05, this.bloom + w.recoil * 0.55);
    this.recoil = Math.min(0.09, this.recoil + w.recoil);
    this.player.pitch = clamp(this.player.pitch + w.recoil * 0.55, -1.45, 1.45);
    this.sounds.shot(w.id);
    this.muzzle.intensity = 26;
    this._shootRay(w, true, now);
    for (const b of this.bots) if (b.alive) b.hear(this.player.pos, now);
  }

  _shootRay(w, fromPlayer, now) {
    const spread = this._spreadNow();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += (this.rng() * 2 - 1) * spread;
    dir.y += (this.rng() * 2 - 1) * spread;
    dir.z += (this.rng() * 2 - 1) * spread;
    dir.normalize();
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.raycaster.set(origin, dir);
    const botMeshes = [];
    for (const b of this.bots) {
      if (!b.alive || b.team === 'volt') continue;
      botMeshes.push(b.bodyMesh, b.headMesh);
    }
    const hits = this.raycaster.intersectObjects([...botMeshes, ...this.solidMeshes], false);
    const muzzlePos = origin.clone().add(dir.clone().multiplyScalar(0.8));
    muzzlePos.y -= 0.12;
    if (!hits.length) {
      const end = origin.clone().add(dir.clone().multiplyScalar(60));
      this._fireTracer(muzzlePos, end);
      return;
    }
    const hit = hits[0];
    this._fireTracer(muzzlePos, hit.point);
    const bot = hit.object.userData.bot;
    if (!bot) return; // wall / crate
    const head = hit.object.userData.part === 'head';
    const dist = hit.distance;
    const falloff = dist > w.range * 0.6 ? lerp(1, 0.6, (dist - w.range * 0.6) / (w.range * 0.4)) : 1;
    const dmg = Math.round(w.damage * (head ? w.headMult : 1) * falloff);
    this.damage += dmg;
    const died = bot.damage(dmg, now);
    this.hud.hitmarker(head);
    if (died) {
      this.kills++;
      this.credits += KILL_REWARD;
      this.sounds.kill();
      this.hud.addFeed({ name: 'YOU', team: 'volt' }, { name: bot.id.toUpperCase(), team: 'ember' }, head);
      this._checkRoundEnd();
    } else this.sounds.hit(head);
  }

  _damagePlayer(amount, fromBot) {
    if (!this.player.alive) return;
    let rest = amount;
    if (this.player.shield > 0) {
      const absorbed = Math.min(this.player.shield, rest);
      this.player.shield -= absorbed; rest -= absorbed;
    }
    this.player.hp -= rest;
    this.hud.damageFlash();
    this.sounds.hurt();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.alive = false;
      this.deaths++;
      this.hud.addFeed({ name: fromBot.id.toUpperCase(), team: 'ember' }, { name: 'YOU', team: 'volt' }, false);
      const ally = this.bots.find((b) => b.team === 'volt' && b.alive);
      this.spectateBot = ally ?? null;
      this.hud.banner('YOU ARE DOWN', '#ff5a2a');
      if (document.pointerLockElement) document.exitPointerLock();
      this._checkRoundEnd();
    }
  }

  throwGrenade() {
    if (this.phase !== 'play' || !this.player.alive || this.grenades <= 0) return;
    this.grenades--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22e6ff, emissiveIntensity: 2 }),
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.grenadeProjectiles.push({
      mesh, vel: dir.multiplyScalar(16).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: 1.25, bounced: false,
    });
    this.sounds.reload();
  }

  _explodeGrenade(p, now) {
    const light = new THREE.PointLight(0x66f6ff, 120, 18, 1.5);
    light.position.copy(p); light.position.y = Math.max(1, p.y);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 260);
    this.sounds.grenade();
    const hurt = (pos, hp, apply) => {
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d > 6.5) return;
      const dmg = Math.round(lerp(110, 25, d / 6.5));
      apply(dmg);
    };
    for (const b of this.bots) {
      if (!b.alive) continue;
      hurt(b.pos, b.hp, (dmg) => {
        if (b.team === 'ember') {
          this.damage += dmg;
          if (b.damage(dmg, now)) {
            this.kills++; this.credits += KILL_REWARD;
            this.hud.addFeed({ name: 'YOU', team: 'volt' }, { name: b.id.toUpperCase(), team: 'ember' }, false);
          }
        } else b.damage(dmg, now);
        b.hear(p, now);
      });
    }
    hurt(this.player.pos, this.player.hp, (dmg) => this._damagePlayer(Math.round(dmg / 2), { id: 'nova' }));
    this._checkRoundEnd();
  }

  _checkRoundEnd() {
    if (this.phase !== 'play') return;
    const embersAlive = this.bots.some((b) => b.team === 'ember' && b.alive);
    const voltsAlive = this.player.alive || this.bots.some((b) => b.team === 'volt' && b.alive);
    if (!embersAlive) this.endRound('volt', 'elimination');
    else if (!voltsAlive) this.endRound('ember', 'elimination');
  }

  // ---------- per-frame ----------

  _botCtx(now) {
    return {
      colliders: this.world.colliders, waypoints: this.world.waypoints,
      padPos: this.world.padPos, padRadius: this.world.padRadius,
      player: this.player, bots: this.bots, world: this.world,
      pickRoute: (b) => this._routeFor(b),
      onBotShot: (bot, targetPos, dist, hitP, t) => {
        const from = bot.pos.clone(); from.y = 1.35;
        const to = targetPos.clone(); to.y = 1.3;
        this._fireTracer(from, to, bot.team === 'ember' ? 0xffb08a : 0x9ff3ff);
        this.sounds.enemyShot(dist);
        if (this.rng() < hitP) {
          const dmg = Math.round(9 * clamp(1 - dist / 70, 0.4, 1));
          if (bot.team === 'ember' && targetPos === this.player.pos) this._damagePlayer(dmg, bot);
          else {
            const victim = this.bots.find((b) => b.pos === targetPos && b.alive);
            if (victim) {
              if (victim.damage(dmg, t)) {
                this.hud.addFeed(
                  { name: bot.id.toUpperCase(), team: bot.team },
                  { name: victim.id.toUpperCase(), team: victim.team }, false);
                this._checkRoundEnd();
              }
            }
          }
        }
      },
    };
  }

  update(dt) {
    this.time += dt;
    if (this.phase === 'buy') {
      this.buyTimeLeft -= dt;
      if (this.buyTimeLeft <= 0) this.deployRound();
      return;
    }
    if (this.phase !== 'play') return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      const vAlive = (this.player.alive ? 1 : 0) + this.bots.filter((b) => b.team === 'volt' && b.alive).length;
      const eAlive = this.bots.filter((b) => b.team === 'ember' && b.alive).length;
      this.endRound(vAlive >= eAlive ? 'volt' : 'ember', 'time');
      return;
    }

    // Player movement (acceleration toward wish direction, then collision).
    const p = this.player;
    if (p.alive) {
      const sprint = this.keys.ShiftLeft || this.keys.ShiftRight;
      const speed = p.crouched ? 2.6 : sprint ? 3.1 : PLAYER_SPEED;
      const fwd = (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0);
      const str = (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0);
      const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
      let wx = (-sin * fwd + cos * str);
      let wz = (-cos * fwd - sin * str);
      const len = Math.hypot(wx, wz);
      if (len > 0) { wx /= len; wz /= len; }
      const accel = 14;
      p.vel.x = lerp(p.vel.x, wx * speed, Math.min(1, accel * dt));
      p.vel.z = lerp(p.vel.z, wz * speed, Math.min(1, accel * dt));
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.speed2d = Math.hypot(p.vel.x, p.vel.z);
      p.moving = p.speed2d > 0.5;
      const b = this.world.bounds;
      p.pos.x = clamp(p.pos.x, b.minX, b.maxX);
      p.pos.z = clamp(p.pos.z, b.minZ, b.maxZ);
      resolveCollision(p.pos, PLAYER_RADIUS, this.world.colliders);
      const targetEye = p.crouched ? EYE_CROUCH : EYE_STAND;
      p.eyeH = lerp(p.eyeH, targetEye, Math.min(1, 12 * dt));
    }

    // Firing (hold for autos).
    this.fireTimer -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.06);
    this.recoil = Math.max(0, this.recoil - dt * 0.25);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload();
    }
    const w = this._weapon();
    if (this.mouseDown && p.alive) {
      if (w.auto) this.tryFire(this.time);
      else if (this._semiEdge) { this.tryFire(this.time); this._semiEdge = false; }
    }
    if (!this.mouseDown) this._semiEdge = true;

    // Bots.
    const ctx = this._botCtx(this.time);
    for (const bot of this.bots) bot.update(dt, this.time, ctx);

    // Grenade projectiles.
    for (let i = this.grenadeProjectiles.length - 1; i >= 0; i--) {
      const g = this.grenadeProjectiles[i];
      g.fuse -= dt;
      g.vel.y -= 18 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y <= 0.12 && !g.bounced) {
        g.bounced = true;
        g.mesh.position.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6; g.vel.z *= 0.6;
      }
      if (g.fuse <= 0 || g.mesh.position.y < -1) {
        const pos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        this.grenadeProjectiles.splice(i, 1);
        this._explodeGrenade(pos, this.time);
      }
    }

    // Uplink capture: only one team on the pad advances it.
    const inPad = (pos) => Math.hypot(pos.x - this.world.padPos.x, pos.z - this.world.padPos.z) < this.world.padRadius;
    const vOn = (p.alive && inPad(p.pos)) || this.bots.some((b) => b.team === 'volt' && b.alive && inPad(b.pos));
    const eOn = this.bots.some((b) => b.team === 'ember' && b.alive && inPad(b.pos));
    if (vOn && !eOn) {
      this.capture.volt += dt; this.capture.ember = Math.max(0, this.capture.ember - dt * 2);
      if (this.capture.volt >= CAPTURE_TIME) { this.endRound('volt', 'capture'); return; }
    } else if (eOn && !vOn) {
      this.capture.ember += dt; this.capture.volt = Math.max(0, this.capture.volt - dt * 2);
      if (this.capture.ember >= CAPTURE_TIME) { this.endRound('ember', 'capture'); return; }
    } else {
      this.capture.volt = Math.max(0, this.capture.volt - dt);
      this.capture.ember = Math.max(0, this.capture.ember - dt);
    }
    if ((vOn && !eOn) || (eOn && !vOn)) {
      if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.sounds.capture();
    }

    // Pad ring pulse.
    this.world.padRing.rotation.z = this.time * 0.6;
    this.world.padBeam.material.opacity = 0.1 + 0.06 * Math.sin(this.time * 2.4);
  }

  render() {
    const p = this.player;
    if (this.phase === 'title') {
      // Slow cinematic orbit over the yard behind the title panel.
      const a = this.time * 0.08;
      this.camera.position.set(Math.sin(a) * 26, 9 + Math.sin(this.time * 0.11) * 2, Math.cos(a) * 26);
      this.camera.lookAt(0, 1, -4);
    } else if (this.phase === 'buy') {
      this.camera.position.set(p.pos.x, p.eyeH, p.pos.z);
      this.camera.rotation.set(0, 0, 0);
      this.camera.rotateY(p.yaw);
      this.camera.rotateX(p.pitch);
    } else if (this.phase === 'play' || this.phase === 'roundEnd') {
      if (p.alive) {
        this.camera.position.set(p.pos.x, p.eyeH, p.pos.z);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(p.yaw);
        this.camera.rotateX(p.pitch);
      } else if (this.spectateBot) {
        const b = this.spectateBot;
        this.camera.position.set(b.pos.x, 1.6, b.pos.z);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(b.yaw);
        this.camera.rotateX(-0.05);
      }
    }
    // Viewmodel bob + recoil (render-side only).
    const bobT = this.time * (p.moving ? 9 : 0);
    const bobA = p.moving ? 0.012 : 0.003;
    this.vm.position.y = -0.27 + Math.sin(bobT) * bobA - this.recoil * 0.4;
    this.vm.position.x = 0.3 + Math.cos(bobT * 0.5) * bobA * 0.6;
    this.vm.position.z = -0.6 + this.recoil * 1.4;
    this.vm.visible = p.alive && (this.phase === 'play' || this.phase === 'roundEnd');
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - 240 * (1 / 60));
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= 1 / 60;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  hudState() {
    const w = this._weapon();
    return {
      round: this.round, maxRounds: MAX_ROUNDS,
      scoreVolt: this.scoreVolt, scoreEmber: this.scoreEmber,
      timeLeft: this.phase === 'buy' ? this.buyTimeLeft : this.timeLeft, credits: this.credits,
      kills: this.kills, deaths: this.deaths, damage: this.damage,
      hp: this.player.hp, shield: this.player.shield,
      ammo: this.ammo[w.id], reserve: this.reserve[w.id], weapon: w,
      reloading: this.reloading, grenades: this.grenades,
      spread: this._spreadNow(),
      capture: {
        active: this.capture.volt > 0.2 || this.capture.ember > 0.2,
        team: this.capture.volt >= this.capture.ember ? 'volt' : 'ember',
        progress: Math.max(this.capture.volt, this.capture.ember),
        needed: CAPTURE_TIME,
      },
    };
  }

  frame(now) {
    const dtMs = Math.min(100, now - this.lastT);
    this.lastT = now;
    this.acc += dtMs / 1000;
    let n = 0;
    while (this.acc >= STEP && n < 5) { this.update(STEP); this.acc -= STEP; n++; }
    if (n === 5) this.acc = 0;
    this.render();
    if (this.phase === 'play' || this.phase === 'buy' || this.phase === 'roundEnd') {
      this.hud.update(this.hudState());
      this.hud.drawMinimap(this.world, this.player, this.bots, this.time);
    }
  }

  run() {
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- deterministic screenshot presets (?shot=menu|play|buy|end) ----------

  _applyShotPresetFromUrl() {
    const q = new URLSearchParams(window.location.search);
    const shot = q.get('shot');
    if (!shot) return;
    this._shotPreset = shot;
    if (shot === 'menu') { this.phase = 'title'; return; }
    if (shot === 'play') this._presetPlay();
    else if (shot === 'buy') this._presetBuy();
    else if (shot === 'end') this._presetEnd();
  }

  _presetPlay() {
    this.phase = 'play';
    this.round = 3; this.scoreVolt = 2; this.scoreEmber = 1;
    this.credits = 1450; this.kills = 4; this.deaths = 1; this.damage = 812;
    this.timeLeft = 67; this.grenades = 1;
    this.loadout = { owned: ['spark', 'ripper', 'longshot'], current: 'longshot', kevlar: false, grenadesBought: 0 };
    this._refillAmmo(); this.ammo.longshot = 18; this.reserve.longshot = 50;
    this._setViewmodel(WEAPONS.longshot);
    this.player.hp = 86; this.player.shield = 35; this.player.alive = true;
    this.player.pos.set(-6, 0, 6); this.player.yaw = 0.35; this.player.pitch = -0.01;
    this.hud.showTitle(false); this.hud.showHud(true);
    const volts = this.bots.filter((b) => b.team === 'volt');
    const embers = this.bots.filter((b) => b.team === 'ember');
    volts[0].reset(-14, 10, 0.4); volts[0].state = 'advance'; volts[0].lastSeenAt = this.time;
    volts[1].reset(8, 12, -0.3); volts[1].state = 'hold'; volts[1].lastSeenAt = this.time;
    const spots = [[-3, -6, 0.2], [5, -10, -0.4], [-12, -12, 0.6], [12, 2, 2.6], [-2, -16, 0.1]];
    embers.forEach((b, i) => {
      b.reset(spots[i][0], spots[i][1], spots[i][2]);
      b.lastSeenAt = this.time; // show on minimap
      b.state = 'advance';
    });
    // Aim the player at the nearest ember so the shot reads as combat.
    const t = embers[0].pos;
    this.player.yaw = Math.atan2(-(t.x - this.player.pos.x), -(t.z - this.player.pos.z));
    this.player.pitch = 0.02;
  }

  _presetBuy() {
    this.phase = 'buy';
    this.round = 4; this.scoreVolt = 2; this.scoreEmber = 1;
    this.credits = 2350; this.kills = 6; this.deaths = 2; this.damage = 1240;
    this.loadout = { owned: ['spark', 'ripper'], current: 'ripper', kevlar: false, grenadesBought: 0 };
    this._refillAmmo();
    this.player.hp = 100; this.player.shield = 0; this.player.alive = true;
    this.player.pos.set(0, 0, 19); this.player.yaw = Math.PI;
    this.hud.showTitle(false); this.hud.showHud(true);
    this.openBuy();
  }

  _presetEnd() {
    this.phase = 'over';
    this.scoreVolt = 5; this.scoreEmber = 2; this.round = 9;
    this.kills = 14; this.deaths = 3; this.damage = 3420; this.credits = 3150;
    this.hud.showTitle(false); this.hud.showHud(false);
    this.hud.showEnd(true, 5, 2, { kills: 14, deaths: 3, damage: 3420, credits: 3150 });
    // A quiet yard behind the panel: from mid-yard, looking north at the pad.
    this.player.pos.set(0, 0, 10); this.player.yaw = Math.PI; this.player.pitch = 0;
    this.camera.position.set(0, 3.4, 12);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(Math.PI);
    this.camera.rotateX(-0.1);
  }
}
