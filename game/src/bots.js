// SPDX-License-Identifier: MIT
// bots.js — bot agents. Each bot is a low-poly agent (body, head, visor, gun)
// with health, a waypoint route, a small state machine (advance / hold /
// engage / capture) and burst fire that reacts to what it sees and hears.

import * as THREE from 'three';
import { clamp, mulberry32, rand } from './util.js';
import { losBlocked, resolveCollision } from './world.js';

const BOT_SPEED = 3.4;
const BOT_HP = 100;

function makeBotMesh(team) {
  const g = new THREE.Group();
  const bodyColor = team === 'volt' ? 0x0e5f7a : 0x7a2408;
  const accent = team === 'volt' ? 0x22e6ff : 0xff5a2a;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.05, 0.36),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.3 }),
  );
  body.position.y = 0.95;
  g.add(body);
  const chest = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 1.4 }),
  );
  chest.position.set(0, 1.1, 0.2);
  g.add(chest);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0x1c2440, roughness: 0.5, metalness: 0.4 }),
  );
  head.position.y = 1.68;
  g.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.09, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 2.4 }),
  );
  visor.position.set(0, 1.7, 0.22);
  g.add(visor);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.4, metalness: 0.7 }),
  );
  gun.position.set(0.28, 1.15, 0.35);
  g.add(gun);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x11142a, roughness: 0.8 }));
  legL.position.set(-0.16, 0.25, 0);
  const legR = legL.clone(); legR.position.x = 0.16;
  g.add(legL); g.add(legR);
  g.traverse((o) => { o.userData.isBotMesh = true; });
  body.userData.part = 'body';
  head.userData.part = 'head';
  return { group: g, body, head };
}

export class Bot {
  constructor(scene, team, id, rng) {
    this.team = team;
    this.id = id;
    this.rng = rng;
    const { group, body, head } = makeBotMesh(team);
    this.mesh = group;
    this.bodyMesh = body;
    this.headMesh = head;
    this.mesh.traverse((o) => { o.userData.bot = this; });
    scene.add(group);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.hp = BOT_HP;
    this.alive = true;
    this.state = 'advance';
    this.route = [];
    this.routeIdx = 0;
    this.holdUntil = 0;
    this.target = null;          // {pos: Vector3, kind: 'player'|'bot', ref}
    this.lastSeen = null;        // last known enemy position
    this.lastSeenAt = -99;
    this.burstLeft = 0;
    this.fireTimer = 0;
    this.burstPause = 0;
    this.accuracy = rand(rng, 0.26, 0.42);
    this.reactAt = 0;
    this.walkPhase = rng() * 10;
    this.flashUntil = 0;
    this.deathTimer = 0;
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.hp = BOT_HP;
    this.alive = true;
    this.state = 'advance';
    this.route = [];
    this.routeIdx = 0;
    this.target = null;
    this.lastSeen = null;
    this.burstLeft = 0;
    this.fireTimer = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = yaw;
    this.bodyMesh.material.emissive?.setHex(0x000000);
  }

  setRoute(waypoints) {
    this.route = waypoints;
    this.routeIdx = 0;
  }

  damage(amount, now) {
    if (!this.alive) return 0;
    this.hp -= amount;
    this.flashUntil = now + 0.09;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTimer = 0;
      this.mesh.visible = false;
      return 1;
    }
    return 0;
  }

  /** A loud noise (gunshot / explosion) at p: turn and investigate. */
  hear(p, now) {
    if (!this.alive) return;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 26) {
      this.lastSeen = new THREE.Vector3(p.x, 0, p.z);
      this.lastSeenAt = now;
      if (this.state !== 'engage') this.state = 'advance';
    }
  }

  canSee(targetPos, colliders) {
    const d = Math.hypot(targetPos.x - this.pos.x, targetPos.z - this.pos.z);
    if (d > 46) return false;
    const eye = { x: this.pos.x, z: this.pos.z };
    return !losBlocked(eye, { x: targetPos.x, z: targetPos.z }, colliders, 1.5);
  }

  /** Aim yaw toward a point, with a reaction delay and limited turn rate. */
  _aimAt(p, dt, now) {
    const want = Math.atan2(-(p.x - this.pos.x), -(p.z - this.pos.z));
    let diff = want - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const rate = now < this.reactAt ? 1.2 : 5.5;
    this.yaw += clamp(diff, -rate * dt, rate * dt);
  }

  update(dt, now, ctx) {
    // ctx: {colliders, waypoints, padPos, padRadius, player, bots, onBotShot, onCapture}
    if (!this.alive) return;
    const { colliders } = ctx;

    // Pick a target: the player or a living enemy bot, if visible.
    let enemy = null;
    let enemyPos = null;
    if (this.team === 'ember') {
      const pp = ctx.player.pos;
      if (ctx.player.alive && this.canSee(pp, colliders)) { enemy = ctx.player; enemyPos = pp; }
      else {
        for (const b of ctx.bots) {
          if (b.team === 'volt' && b.alive && this.canSee(b.pos, colliders)) { enemy = b; enemyPos = b.pos; break; }
        }
      }
    } else {
      for (const b of ctx.bots) {
        if (b.team === 'ember' && b.alive && this.canSee(b.pos, colliders)) { enemy = b; enemyPos = b.pos; break; }
      }
    }
    if (enemy) {
      // Fresh contact: a beat before the first burst, so peeking is fair.
      if (this.state !== 'engage') this.burstPause = Math.max(this.burstPause, 0.55);
      this.lastSeen = enemyPos.clone();
      this.lastSeenAt = now;
      this.state = 'engage';
      this.target = enemy;
    } else if (this.state === 'engage' && now - this.lastSeenAt > 1.6) {
      this.state = 'advance';
      this.target = null;
    }

    // Movement.
    let moveX = 0, moveZ = 0;
    if (this.state === 'engage' && this.lastSeen) {
      const d = Math.hypot(this.lastSeen.x - this.pos.x, this.lastSeen.z - this.pos.z);
      if (d > 16) { // close the distance a little
        moveX = (this.lastSeen.x - this.pos.x) / d;
        moveZ = (this.lastSeen.z - this.pos.z) / d;
      } else if (d < 6) { // back off
        moveX = -(this.lastSeen.x - this.pos.x) / d;
        moveZ = -(this.lastSeen.z - this.pos.z) / d;
      } else {
        // Strafe sideways while fighting.
        const s = Math.sin(now * 0.9 + this.walkPhase) > 0 ? 1 : -1;
        const dx = this.lastSeen.x - this.pos.x, dz = this.lastSeen.z - this.pos.z;
        const len = Math.hypot(dx, dz) || 1;
        moveX = (-dz / len) * s * 0.6;
        moveZ = (dx / len) * s * 0.6;
      }
      this._aimAt(this.lastSeen, dt, now);
    } else if (this.state === 'advance') {
      // Follow the route; re-pick one when finished or when the pad is the goal.
      if (this.route.length === 0 || this.routeIdx >= this.route.length) {
        this.setRoute(ctx.pickRoute(this));
      }
      const wp = this.route[this.routeIdx];
      if (wp) {
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.2) {
          this.routeIdx++;
          if (this.rng() < 0.3) { this.state = 'hold'; this.holdUntil = now + rand(this.rng, 1.2, 2.8); }
        } else {
          moveX = dx / d; moveZ = dz / d;
          this._aimAt({ x: wp.x, z: wp.z }, dt, now);
        }
      }
    } else if (this.state === 'hold') {
      this.yaw += dt * 0.7; // scan around
      if (now > this.holdUntil) this.state = 'advance';
    }

    // Capture: standing on the pad advances the team's capture (handled by game).
    if (moveX || moveZ) {
      const sp = BOT_SPEED * (this.state === 'engage' ? 0.7 : 1);
      this.pos.x += moveX * sp * dt;
      this.pos.z += moveZ * sp * dt;
      this.walkPhase += dt * 9;
      const bob = Math.sin(this.walkPhase) * 0.05;
      this.mesh.position.y = Math.abs(bob) * 0.4;
    }
    const b = ctx.world.bounds;
    this.pos.x = clamp(this.pos.x, b.minX, b.maxX);
    this.pos.z = clamp(this.pos.z, b.minZ, b.maxZ);
    resolveCollision(this.pos, 0.45, colliders);
    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    this.mesh.rotation.y = this.yaw;

    // Hit flash.
    const flashing = now < this.flashUntil;
    this.bodyMesh.material.emissive.setHex(flashing ? 0xffffff : 0x000000);
    this.headMesh.material.emissive.setHex(flashing ? 0xffffff : 0x000000);

    // Shooting: bursts with pauses, worse when the target is far or moving.
    this.fireTimer -= dt;
    if (this.state === 'engage' && this.target && this.target.alive !== false) {
      const tp = this.target.pos;
      const d = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
      if (this.burstLeft <= 0) {
        this.burstPause -= dt;
        if (this.burstPause <= 0 && this.fireTimer <= 0) {
          this.burstLeft = 3 + Math.floor(this.rng() * 3);
          this.burstPause = rand(this.rng, 0.7, 1.4);
          this.fireTimer = 0.12;
        }
      } else if (this.fireTimer <= 0) {
        this.fireTimer = 0.13;
        this.burstLeft--;
        const hitP = this.accuracy * clamp(1 - d / 60, 0.25, 1);
        ctx.onBotShot(this, tp, d, hitP, now);
      }
    }
  }
}

export function makeBots(scene, seed) {
  const rng = mulberry32(seed);
  const bots = [];
  for (let i = 0; i < 2; i++) bots.push(new Bot(scene, 'volt', `volt-${i}`, mulberry32(seed + 101 + i)));
  for (let i = 0; i < 5; i++) bots.push(new Bot(scene, 'ember', `ember-${i}`, mulberry32(seed + 201 + i)));
  return bots;
}
