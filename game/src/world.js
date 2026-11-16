// SPDX-License-Identifier: MIT
// world.js — YARD-7, the original map. A walled neon yard with three lanes
// (west A, mid, east B), crate cover, a central UPLINK pad and a VOLT / EMBER
// spawn at opposite ends. Exports colliders, spawns, waypoints and the pad.

import * as THREE from 'three';
import { mulberry32, rand } from './util.js';

export const MAP = { w: 64, d: 44, wallH: 5 };

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1030'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(46,90,180,0.35)'; g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  g.fillStyle = 'rgba(34,230,255,0.10)';
  for (let i = 0; i < 90; i++) g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

export function buildWorld(scene, seed = 1337) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'yard7';

  // Indigo night sky + fog.
  scene.background = new THREE.Color(0x070a1d);
  scene.fog = new THREE.Fog(0x070a1d, 30, 95);

  const hemi = new THREE.HemisphereLight(0x4a5cff, 0x0a0c22, 1.05);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8fa8ff, 1.35);
  moon.position.set(18, 30, -12);
  scene.add(moon);
  const padLight = new THREE.PointLight(0x22e6ff, 60, 26, 1.6);
  padLight.position.set(0, 6, -4);
  scene.add(padLight);
  const emberLight = new THREE.PointLight(0xff5a2a, 25, 22, 1.8);
  emberLight.position.set(0, 5, 20);
  scene.add(emberLight);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.w + 8, MAP.d + 8),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.9, metalness: 0.15 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2048, roughness: 0.7, metalness: 0.35 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x22e6ff, emissiveIntensity: 1.6, roughness: 0.4 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x2c0d06, emissive: 0xff5a2a, emissiveIntensity: 1.4, roughness: 0.4 });

  function box(x, z, w, d, h, mat, collide = true, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = false; m.receiveShadow = false;
    group.add(m);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
    return m;
  }

  // Perimeter walls (tall, neon-trimmed).
  const W = MAP.w / 2, D = MAP.d / 2;
  box(0, -D, MAP.w + 2, 1.5, MAP.wallH, wallMat); box(0, D, MAP.w + 2, 1.5, MAP.wallH, wallMat);
  box(-W, 0, 1.5, MAP.d + 2, MAP.wallH, wallMat); box(W, 0, 1.5, MAP.d + 2, MAP.wallH, wallMat);
  // Neon trim strips along the top of the walls.
  box(0, -D, MAP.w, 0.18, 0.18, neonMat, false, MAP.wallH);
  box(0, D, MAP.w, 0.18, 0.18, emberMat, false, MAP.wallH);
  box(-W, 0, 0.18, MAP.d, 0.18, neonMat, false, MAP.wallH);
  box(W, 0, 0.18, MAP.d, 0.18, emberMat, false, MAP.wallH);

  // Mid structures: two big blocks flanking the pad, making a mid lane.
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x232c5c, roughness: 0.65, metalness: 0.4 });
  const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x3a2450, roughness: 0.65, metalness: 0.4 });
  box(-9, -4, 5, 5, 2.6, crateMat);
  box(-9, -4, 5.2, 0.22, 0.22, neonMat, false, 2.6);
  box(9, -4, 5, 5, 2.6, crateMat);
  box(9, -4, 5.2, 0.22, 0.22, neonMat, false, 2.6);
  box(-14, 8, 6, 2, 2.2, crateMat2);
  box(14, 8, 6, 2, 2.2, crateMat2);
  box(0, -14, 8, 2, 3.2, crateMat);           // north wall block behind pad
  box(0, -14, 8.2, 0.22, 0.22, neonMat, false, 3.2);
  box(-20, -13, 4, 4, 2.0, crateMat2);
  box(20, -13, 4, 4, 2.0, crateMat2);
  box(-24, 4, 3, 6, 2.4, crateMat);
  box(24, 4, 3, 6, 2.4, crateMat);
  box(-6, 13, 4, 3, 1.6, crateMat2);
  box(6, 13, 4, 3, 1.6, crateMat2);
  box(0, 17, 10, 1.6, 2.8, crateMat);         // south mid block
  // A few scattered low crates for cover (crouch-height).
  box(-16, -6, 2.4, 2.4, 1.1, crateMat2);
  box(16, -6, 2.4, 2.4, 1.1, crateMat2);
  box(-4, 2, 2.2, 2.2, 1.1, crateMat2);
  box(4, 2, 2.2, 2.2, 1.1, crateMat2);

  // UPLINK pad: glowing disc + beam at map centre-north.
  const pad = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.4, 0.22, 40),
    new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x22e6ff, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  disc.position.y = 0.11;
  pad.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.4, 0.09, 10, 48),
    new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x22e6ff, emissiveIntensity: 2.2 }),
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.24;
  pad.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.9, 22, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x22e6ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 11;
  pad.add(beam);
  pad.position.set(0, 0, -4);
  group.add(pad);

  // Spawn beacons: cyan VOLT gate (south), ember EMBER gate (north).
  function beacon(x, z, mat) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 1.2), mat);
    b.position.set(x, 1.7, z);
    group.add(b);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.4), mat);
    top.position.set(x, 3.5, z);
    group.add(top);
  }
  beacon(-4, 19, neonMat); beacon(4, 19, neonMat);
  beacon(-4, -19, emberMat); beacon(4, -19, emberMat);

  // Distant skyline silhouettes (outside the walls, no collision).
  for (let i = 0; i < 26; i++) {
    const a = rand(rng, 0, Math.PI * 2);
    const r = rand(rng, 46, 70);
    const h = rand(rng, 6, 22);
    const w = rand(rng, 3, 7);
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, w),
      new THREE.MeshStandardMaterial({ color: 0x0a0e28, roughness: 1, emissive: 0x111a44, emissiveIntensity: 0.5 }),
    );
    b.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    group.add(b);
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, 0.3, w * 0.9),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: rng() > 0.5 ? 0x22e6ff : 0xff9a3c, emissiveIntensity: 1.2 }),
    );
    win.position.set(b.position.x, h * rand(rng, 0.5, 0.95), b.position.z);
    group.add(win);
  }

  // Stars.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) {
    const a = rand(rng, 0, Math.PI * 2);
    const e = rand(rng, 0.25, 1.4);
    const r = 120;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbdd8ff, size: 0.7 })));

  scene.add(group);

  const voltSpawns = [
    { x: -6, z: 18, yaw: Math.PI }, { x: 0, z: 19, yaw: Math.PI }, { x: 6, z: 18, yaw: Math.PI },
  ];
  const emberSpawns = [
    { x: -8, z: -18, yaw: 0 }, { x: -3, z: -19, yaw: 0 }, { x: 2, z: -19, yaw: 0 },
    { x: 7, z: -18, yaw: 0 }, { x: 0, z: -16, yaw: 0 },
  ];
  // Waypoint graph: west lane, mid lane, east lane, pad approaches, holds.
  const waypoints = [
    { x: -24, z: 12 }, { x: -24, z: -2 }, { x: -24, z: -14 }, { x: -14, z: -8 },
    { x: 0, z: 12 }, { x: 0, z: 2 }, { x: 0, z: -8 }, { x: 0, z: -14 },
    { x: 24, z: 12 }, { x: 24, z: -2 }, { x: 24, z: -14 }, { x: 14, z: -8 },
    { x: -8, z: -4 }, { x: 8, z: -4 }, { x: -14, z: 4 }, { x: 14, z: 4 },
    { x: 0, z: -4 }, { x: -6, z: 8 }, { x: 6, z: 8 },
  ];

  return {
    group, colliders, voltSpawns, emberSpawns, waypoints,
    padPos: new THREE.Vector3(0, 0, -4), padRadius: 3.4, padRing: ring, padBeam: beam,
    bounds: { minX: -W + 1, maxX: W - 1, minZ: -D + 1, maxZ: D - 1 },
  };
}

/** Circle-vs-AABB collision: slide the mover out of every collider it overlaps. */
export function resolveCollision(pos, radius, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pt) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

/** True when the segment a→b is blocked by any collider (2D, height-aware). */
export function losBlocked(a, b, colliders, eyeH = 1.5) {
  for (const c of colliders) {
    if (c.h < eyeH * 0.5) continue;
    if (segmentHitsBox(a, b, c)) return true;
  }
  return false;
}

function segmentHitsBox(a, b, c) {
  // Slab test in XZ.
  const dx = b.x - a.x, dz = b.z - a.z;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) { if (a.x < c.minX || a.x > c.maxX) return false; }
  else {
    let t1 = (c.minX - a.x) / dx, t2 = (c.maxX - a.x) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (a.z < c.minZ || a.z > c.maxZ) return false; }
  else {
    let t1 = (c.minZ - a.z) / dz, t2 = (c.maxZ - a.z) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
