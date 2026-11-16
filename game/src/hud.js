// SPDX-License-Identifier: MIT
// hud.js — every DOM surface: HUD numbers, health/shield bars, ammo, minimap,
// kill feed, banners and the title / buy / victory screens. Reads one state
// object; writes nothing back into the sim except through callbacks.

import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(callbacks) {
    this.cb = callbacks; // {onDeploy, onBuyDeploy, onAgain, onBuy}
    this.feed = [];
    this.mapCtx = $('minimap').getContext('2d');
    $('deployBtn').addEventListener('click', () => this.cb.onDeploy());
    $('buyDeployBtn').addEventListener('click', () => this.cb.onBuyDeploy());
    $('againBtn').addEventListener('click', () => this.cb.onAgain());
    this._bindShop();
  }

  _bindShop() {
    $('shop').addEventListener('click', (e) => {
      const el = e.target.closest('.item');
      if (el && el.dataset.id) this.cb.onBuy(el.dataset.id);
    });
  }

  show(id, on) { $(id).classList.toggle('hidden', !on); }

  showTitle(on) { this.show('titleScreen', on); if (on) this.show('hud', false); }
  showBuy(on) { this.show('buyScreen', on); }
  setEndVisible(on) { this.show('endScreen', on); }
  showHud(on) { this.show('hud', on); }

  /** Full HUD refresh from the game state (called every frame; cheap DOM writes only when changed). */
  update(s) {
    $('roundLabel').textContent = `ROUND ${s.round}/${s.maxRounds}`;
    document.querySelector('#topbar .score').innerHTML =
      `<span class="v">VOLT ${s.scoreVolt}</span> — <span class="e">${s.scoreEmber} EMBER</span>`;
    $('timer').textContent = fmtTime(s.timeLeft);
    $('credits').textContent = `◈ ${s.credits}`;
    $('kdText').textContent = `${s.kills} / ${s.deaths}`;
    $('dmgText').textContent = `DMG ${s.damage}`;
    $('hpText').textContent = `${Math.ceil(s.hp)}`;
    $('hpFill').style.width = `${Math.max(0, s.hp)}%`;
    $('shFill').style.width = `${Math.max(0, s.shield)}%`;
    const w = s.weapon;
    $('ammo').innerHTML = `${s.ammo} <small>/ ${s.reserve}</small>`;
    $('weaponName').textContent = w.name + (s.reloading ? ' — RELOADING' : '');
    $('grenades').textContent = `◉ NOVA GRENADE ×${s.grenades}  [G]`;
    // Crosshair gap grows with spread (moving / firing).
    const gap = 6 + s.spread * 260;
    const set = (id, x, y, wdt, hgt) => {
      const el = $(id);
      el.style.left = `${x}px`; el.style.top = `${y}px`;
      el.style.width = `${wdt}px`; el.style.height = `${hgt}px`;
    };
    set('chT', -1, -gap - 8, 2, 8); set('chB', -1, gap, 2, 8);
    set('chL', -gap - 8, -1, 8, 2); set('chR', gap, -1, 8, 2);
    // Capture bar.
    const cap = $('capBar');
    if (s.capture.active) {
      cap.classList.remove('hidden');
      cap.firstChild.textContent = s.capture.team === 'volt' ? 'UPLINK CAPTURE — VOLT' : 'UPLINK CAPTURE — EMBER';
      $('capFill').style.width = `${(s.capture.progress / s.capture.needed) * 100}%`;
    } else cap.classList.add('hidden');
  }

  banner(text, color) {
    const b = $('banner');
    b.textContent = text;
    b.style.color = color;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), 2400);
  }

  hitmarker(head) {
    const h = $('hitmarker');
    h.classList.toggle('head', !!head);
    h.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => h.classList.remove('show'), 90);
  }

  damageFlash() {
    const d = $('dmg');
    d.style.opacity = '1';
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { d.style.opacity = '0'; }, 140);
  }

  addFeed(killer, victim, head) {
    const killerCls = killer.team === 'volt' ? 'v' : 'e';
    const victimCls = victim.team === 'volt' ? 'v' : 'e';
    this.feed.push(`<span class="${killerCls}">${killer.name}</span> ${head ? '⌖' : '✕'} <span class="${victimCls}">${victim.name}</span>`);
    if (this.feed.length > 5) this.feed.shift();
    $('killfeed').innerHTML = this.feed.join('<br>');
  }

  clearFeed() { this.feed = []; $('killfeed').innerHTML = ''; }

  /** Minimap: walls, pad, allies (cyan), recently-seen enemies (orange). */
  drawMinimap(world, player, bots, now) {
    const g = this.mapCtx;
    const S = 180, W = 64, D = 44;
    const sx = (x) => (x + W / 2) / W * S;
    const sy = (z) => (z + D / 2) / D * S;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#070a1d'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#1a2048';
    for (const c of world.colliders) {
      g.fillRect(sx(c.minX), sy(c.minZ), sx(c.maxX) - sx(c.minX), sy(c.maxZ) - sy(c.minZ));
    }
    // Uplink pad.
    g.strokeStyle = '#22e6ff'; g.lineWidth = 2;
    g.beginPath(); g.arc(sx(0), sy(-4), 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(34,230,255,0.25)';
    g.beginPath(); g.arc(sx(0), sy(-4), 10, 0, Math.PI * 2); g.fill();
    const dot = (x, z, color, r, ring) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(sx(x), sy(z), r, 0, Math.PI * 2); g.fill();
      if (ring) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(sx(x), sy(z), r + 1.5, 0, Math.PI * 2); g.stroke(); }
    };
    for (const b of bots) {
      if (!b.alive) continue;
      if (b.team === 'volt') dot(b.pos.x, b.pos.z, '#22e6ff', 3.5);
      else if (now - b.lastSeenAt < 3 || b.state === 'engage') dot(b.pos.x, b.pos.z, '#ff5a2a', 3.5);
    }
    // Player: white triangle pointing along yaw.
    const px = sx(player.pos.x), py = sy(player.pos.z);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(px + Math.sin(player.yaw) * -8, py + Math.cos(player.yaw) * -8);
    g.lineTo(px + Math.sin(player.yaw + 2.5) * 6, py + Math.cos(player.yaw + 2.5) * 6);
    g.lineTo(px + Math.sin(player.yaw - 2.5) * 6, py + Math.cos(player.yaw - 2.5) * 6);
    g.closePath(); g.fill();
  }

  /** Build the buy menu from the armoury + current loadout. */
  renderShop(items, credits, owned) {
    const shop = $('shop');
    shop.innerHTML = items.map((it) => {
      const has = owned.includes(it.id);
      const cant = !has && credits < it.price;
      return `<div class="item ${has ? 'owned' : ''} ${cant ? 'cant' : ''}" data-id="${it.id}">
        <h3>${it.name}<span>◈ ${it.price}</span></h3>
        <p>${it.desc}</p><div class="tag">${it.tag}${has ? ' · OWNED' : ''}</div></div>`;
    }).join('');
    $('buyCredits').textContent = `◈ ${credits}`;
  }

  setBuyRound(round, maxRounds) {
    $('buyRound').textContent = `ROUND ${round} OF ${maxRounds} — SPEND YOUR CREDITS`;
  }

  showEnd(win, scoreVolt, scoreEmber, stats) {
    this.show('endScreen', true);
    const t = $('victoryTitle');
    t.textContent = win ? 'VOLT TAKES YARD-7' : 'EMBER TAKES YARD-7';
    t.className = win ? 'win' : 'lose';
    $('finalScore').textContent = `${scoreVolt} — ${scoreEmber}`;
    $('stKills').textContent = stats.kills;
    $('stDeaths').textContent = stats.deaths;
    $('stDamage').textContent = stats.damage;
    $('stCredits').textContent = stats.credits;
    $('endBlurb').textContent = win
      ? 'The uplink hums cyan. YARD-7 is yours, agent.'
      : 'EMBER holds the yard tonight. Re-deploy, re-think, re-breach.';
  }
}
