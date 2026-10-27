/* Zuma core simulation (no DOM). WeChat / Browser: ZumaCore ; Node: module.exports.
 * Units: px on a 640x480 board, time in seconds, fixed 100 Hz step (the original ticks at 100 Hz).
 * Path param d == waypoint index ~= 1px of arc length (verified from CURV decode, step ~1.0px). */
(function (root) {
  'use strict';
  var BD = 32;              // ball diameter == spacing along path
  var HIT = 26.5;           // bullet<->ball collision distance
  var TICK = 0.01;
  var COLORS = ['blue', 'green', 'purple', 'red', 'white', 'yellow'];
  var POWERS = ['bomb', 'back', 'slow', 'acc'];
  var SPEED_K = 60;         // px/s per unit of Settings.speed (tuned so level 1 is a ~45s walk)
  var RUSH_V = 260, BACK_V = 140, ROLL_V = 380, DIE_V = 900;
  var FIRE_V = 600;         // firespeed=6 per 100Hz tick

  var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var b64lookup = new Uint8Array(256);
  for (var bi = 0; bi < b64chars.length; bi++) b64lookup[b64chars.charCodeAt(bi)] = bi;

  function dec64(s) {
    if (typeof wx !== 'undefined' && wx.base64ToArrayBuffer) {
      try {
        return new Uint8Array(wx.base64ToArrayBuffer(s));
      } catch (e) {}
    }
    if (typeof atob === 'function') {
      try {
        var bin = atob(s), a = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
      } catch (e) {}
    }
    if (typeof Buffer !== 'undefined') {
      try {
        return new Uint8Array(Buffer.from(s, 'base64'));
      } catch (e) {}
    }
    var len = s.length;
    var placeHolders = s.charAt(len - 2) === '=' ? 2 : s.charAt(len - 1) === '=' ? 1 : 0;
    var arr = new Uint8Array((len * 3 / 4) - placeHolders);
    var cur = 0;
    for (var j = 0; j < len; j += 4) {
      var enc1 = b64lookup[s.charCodeAt(j)];
      var enc2 = b64lookup[s.charCodeAt(j + 1)];
      var enc3 = b64lookup[s.charCodeAt(j + 2)];
      var enc4 = b64lookup[s.charCodeAt(j + 3)];
      arr[cur++] = (enc1 << 2) | (enc2 >> 4);
      if (cur < arr.length) arr[cur++] = ((enc2 & 15) << 4) | (enc3 >> 2);
      if (cur < arr.length) arr[cur++] = ((enc3 & 3) << 6) | enc4;
    }
    return arr;
  }

  function Path(c) {
    var n = c.n, steps = new Int8Array(dec64(c.steps).buffer);
    this.n = n; this.len = n - 1;
    this.xs = new Float32Array(n); this.ys = new Float32Array(n);
    this.tun = dec64(c.tunnel);
    var x = c.x0, y = c.y0;
    this.xs[0] = x; this.ys[0] = y;
    for (var i = 1; i < n; i++) {
      x += steps[2 * (i - 1)] * 0.01; y += steps[2 * (i - 1) + 1] * 0.01;
      this.xs[i] = x; this.ys[i] = y;
    }
  }
  Path.prototype.at = function (d, out) {
    out = out || {};
    if (d < 0) d = 0; else if (d > this.len) d = this.len;
    var i = Math.floor(d); if (i >= this.len) i = this.len - 1;
    var f = d - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * f;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * f;
    return out;
  };
  Path.prototype.angle = function (d) {
    var a = Math.max(0, d - 2), b = Math.min(this.len, d + 2);
    var p = this.at(a), q = this.at(b);
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  Path.prototype.tunnelAt = function (d) {
    var i = Math.round(d); if (i < 0) i = 0; if (i > this.len) i = this.len;
    return this.tun[i] === 1;
  };

  function Ball(color, d, type) {
    this.color = color; this.d = d; this.type = type || 'normal';
    this.off = 0;            // visual lag (px) used to ease pushes / insertions
    this.sep = false;        // was separated from its front neighbour last step
    this.ins = null;         // {x,y,t} landing point easing for inserted balls
    this.spin = 0;
  }

  function Chain(game, path, idx, startCount) {
    this.game = game; this.path = path; this.idx = idx;
    this.balls = [];               // front (hole side, highest d) first
    this.rushLeft = startCount; this.boost = 0;
    this.reaction = 0; this.reactionActive = false;
    this.dead = false;             // front ball fell into the hole
    this.tmp = { x: 0, y: 0 };
  }
  Chain.prototype.pos = function (b, out) { return this.path.at(b.d, out); };
  Chain.prototype.hittable = function (b) {
    if (b.d < 6 || b.d > this.path.len - 4 || this.path.tunnelAt(b.d)) return false;
    var p = this.path.at(b.d, this.tmp);
    return p.x > -4 && p.x < 644 && p.y > -4 && p.y < 484;
  };
  Chain.prototype.tail = function () { return this.balls[this.balls.length - 1]; };

  /** contiguous runs [from,to] indexes (inclusive) of touching balls */
  Chain.prototype.groups = function () {
    var g = [], B = this.balls, s = 0;
    for (var i = 1; i <= B.length; i++) {
      if (i === B.length || B[i - 1].d - B[i].d > BD + 0.5) { g.push([s, i - 1]); s = i; }
    }
    return g;
  };

  Chain.prototype.spawn = function () {
    var G = this.game;
    if (!G.canSpawn()) return;
    var B = this.balls, guard = 0;
    while (guard++ < 4) {
      var tail = this.tail();
      if (tail && tail.d < BD) return;
      var d = 0;
      if (tail) { d = tail.d - BD; if (d > 8) d = 0; }
      var color = G.nextChainColor(this), type = G.rollPower();
      var b = new Ball(color, d, type);
      B.push(b);
      if (this.rushLeft > 0) { this.rushLeft--; this.boost = RUSH_V; }
      if (!tail) return;
    }
  };

  /** advance by dt seconds */
  Chain.prototype.step = function (dt) {
    var G = this.game, B = this.balls, i, k;
    if (this.dying) { return this.stepDying(dt); }
    this.spawn();
    if (!B.length) return;
    // ---- velocities per group
    var groups = this.groups();
    var base = G.level.speed * SPEED_K * (G.powers.slow > 0 ? 0.3 : 1);
    if (this.rushLeft <= 0 && this.boost > 0) this.boost = Math.max(0, this.boost - 140 * dt);
    var v = base + this.boost;
    var back = G.powers.back > 0;
    var last = groups.length - 1;
    for (k = 0; k < groups.length; k++) {
      var g = groups[k], vel = 0;
      if (k === last) vel = back ? -BACK_V : v;
      else if (back) vel = -BACK_V * 2;
      else {
        // magnetic rollback: rear ball of this (front) group vs front ball of the group behind
        var rear = B[g[1]], behindFront = B[groups[k + 1][0]];
        if (rear.color === behindFront.color && !G.noRollback) vel = -ROLL_V;
      }
      if (vel !== 0) for (i = g[0]; i <= g[1]; i++) B[i].d += vel * dt;
      for (i = g[0]; i <= g[1]; i++) B[i].spin += vel * dt;
    }
    this.resolve();
    // ---- junction events (gap closed => clack + match test)
    var closed = [];
    for (i = 0; i < B.length; i++) {
      var gap = i === 0 ? 1e9 : B[i - 1].d - B[i].d;
      if (gap > BD + 0.5) B[i].sep = true;
      else if (B[i].sep) { B[i].sep = false; if (i > 0) closed.push(B[i]); }
    }
    for (k = 0; k < closed.length; k++) {
      var idx = B.indexOf(closed[k]);
      if (idx < 1) continue;
      G.emit({ t: 'clack', chain: this.idx });
      this.checkMatch(idx, false);
    }
    // ---- easing offsets
    for (i = 0; i < B.length; i++) {
      var b = B[i];
      if (b.off > 0) b.off = Math.max(0, b.off - 260 * dt);
      if (b.ins) { b.ins.t += dt / 0.12; if (b.ins.t >= 1) b.ins = null; }
    }
    if (this.reactionActive && !this.rolling()) { this.reactionActive = false; this.reaction = 0; }
    // ---- hole
    if (B.length && B[0].d >= this.path.len - 18) { this.dying = true; this.dieT = 0; G.emit({ t: 'hole', chain: this.idx }); }
  };

  Chain.prototype.rolling = function () {
    var gr = this.groups(), B = this.balls;
    for (var k = 0; k < gr.length - 1; k++) {
      if (B[gr[k][1]].color === B[gr[k + 1][0]].color) return true;
    }
    return false;
  };

  /** enforce non-overlap: front-ward shift cascade (push) */
  Chain.prototype.resolve = function () {
    var B = this.balls;
    for (var i = B.length - 1; i >= 1; i--) {
      var over = B[i].d + BD - B[i - 1].d;
      if (over > 1e-6) { B[i - 1].d += over; B[i - 1].off += 0; }
    }
  };

  Chain.prototype.stepDying = function (dt) {
    var B = this.balls;
    this.dieT += dt;
    for (var i = 0; i < B.length; i++) B[i].d += DIE_V * dt;
    this.resolve();
    while (B.length && B[0].d >= this.path.len) {
      var p = this.path.at(this.path.len), b = B.shift();
      this.game.emit({ t: 'swallow', x: p.x, y: p.y, color: b.color });
    }
    if (!B.length) this.dead = true;
  };

  /** run [lo,hi] of same colour containing idx, touching only */
  Chain.prototype.runAround = function (idx) {
    var B = this.balls, c = B[idx].color, lo = idx, hi = idx;
    while (lo > 0 && B[lo - 1].color === c && B[lo - 1].d - B[lo].d <= BD + 0.5) lo--;
    while (hi < B.length - 1 && B[hi + 1].color === c && B[hi].d - B[hi + 1].d <= BD + 0.5) hi++;
    return [lo, hi];
  };

  Chain.prototype.checkMatch = function (idx, fromShot, bullet) {
    var r = this.runAround(idx), n = r[1] - r[0] + 1;
    if (n < 3) return false;
    if (fromShot) { this.reaction = 0; this.reactionActive = true; }
    else if (this.reactionActive) this.reaction++; else { this.reaction = 1; this.reactionActive = true; }
    this.game.destroyRun(this, r[0], r[1], this.reaction, bullet);
    return true;
  };

  root.ZumaCore = root.ZumaCore || {};
  var C = root.ZumaCore;
  C.BD = BD; C.HIT = HIT; C.TICK = TICK; C.COLORS = COLORS; C.POWERS = POWERS; C.FIRE_V = FIRE_V;
  C.SPEED_K = SPEED_K; C.Path = Path; C.Ball = Ball; C.Chain = Chain;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
