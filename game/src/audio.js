// SPDX-License-Identifier: MIT
// audio.js — synthesized sound effects (WebAudio, no audio files, no network).
// Every effect is a short oscillator/noise burst; failures are silent.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    } catch { /* headless / no audio: stay silent */ }
  }

  _tone(freq, dur, type, slideTo, vol) {
    if (!this.ctx || !this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
      g.gain.setValueAtTime(vol ?? 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  _noise(dur, vol, lowpass) {
    if (!this.ctx || !this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass ?? 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol ?? 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
    } catch { /* ignore */ }
  }

  shot(kind) {
    if (kind === 'halberd') { this._noise(0.22, 0.9, 900); this._tone(110, 0.18, 'sawtooth', 40, 0.5); }
    else if (kind === 'longshot') { this._noise(0.12, 0.7, 1400); this._tone(180, 0.08, 'square', 70, 0.3); }
    else if (kind === 'ripper') { this._noise(0.08, 0.55, 2000); this._tone(220, 0.05, 'square', 90, 0.22); }
    else { this._noise(0.09, 0.5, 2200); this._tone(260, 0.06, 'square', 100, 0.25); }
  }

  enemyShot(dist) {
    const v = Math.max(0.08, 0.4 - dist * 0.008);
    this._noise(0.09, v, 1200);
  }

  hit(head) { this._tone(head ? 1250 : 950, 0.06, 'sine', null, 0.5); }
  kill() { this._tone(660, 0.09, 'sine', 990, 0.5); this._tone(990, 0.14, 'sine', 1320, 0.4); }
  hurt() { this._tone(140, 0.16, 'sawtooth', 60, 0.5); }
  reload() { this._tone(500, 0.05, 'square', null, 0.2); setTimeout(() => this._tone(700, 0.05, 'square', null, 0.2), 140); }
  dry() { this._tone(300, 0.04, 'square', null, 0.25); }
  grenade() { this._noise(0.5, 0.9, 500); this._tone(70, 0.45, 'sine', 30, 0.8); }
  roundWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'triangle', null, 0.4), i * 110)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'triangle', null, 0.35), i * 130)); }
  buy() { this._tone(880, 0.07, 'sine', null, 0.35); setTimeout(() => this._tone(1175, 0.1, 'sine', null, 0.35), 70); }
  capture() { this._tone(1047, 0.1, 'sine', null, 0.3); }
}
