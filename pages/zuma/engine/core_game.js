/* Zuma game rules: Game state machine, shooting, insertion, matching, power balls, treasure.
 * Depends on core_chain.js (ZumaCore). */
(function (root) {
  'use strict';
  var C = root.ZumaCore || require('./core_chain.js');
  var BD = C.BD, HIT = C.HIT, COLORS = C.COLORS, POWERS = C.POWERS, Ball = C.Ball, Chain = C.Chain, Path = C.Path;

  function Game(data, opts) {
    opts = opts || {};
    this.data = data;
    this.rng = opts.rng || Math.random;
    this.events = [];
    this.pathCache = {};
    this.lives = 3; this.score = 0;
    this.stageIdx = 0; this.levelIdx = 0;
    this.state = 'idle'; this.t = 0; this.acc = 0;
    this.chains = []; this.bullets = [];
    this.powers = { slow: 0, back: 0, acc: 0 };
    this.stats = { balls: 0, combos: 0, coins: 0, seconds: 0, gaps: 0 };
    this.frog = { x: 320, y: 240, aim: 0, cur: 0, next: 1, reload: 0, recoil: 0, tx: 320, ty: 100 };
    this.coin = null; this.coinsShown = {};
    this.levelScore = 0; this.barFull = false; this.shake = 0; this.warnT = 0;
    this.sincePower = 0; this.colorCheck = 0;
    this.noRollback = !!opts.noRollback;
  }
  var P = Game.prototype;
  C.Game = Game;

  P.emit = function (e) { this.events.push(e); };
  P.drain = function () { var e = this.events; this.events = []; return e; };
  P.rand = function (n) { return Math.floor(this.rng() * n); };

  P.path = function (name) {
    return this.pathCache[name] || (this.pathCache[name] = new Path(this.data.curves[name]));
  };
  P.stage = function () { return this.data.stages[this.stageIdx]; };
  P.colorsForStage = function (s) { return Math.min(6, 4 + Math.floor(s / 3)); };

  P.startLevel = function (stageIdx, levelIdx, keepScore) {
    var st = this.data.stages[stageIdx];
    this.stageIdx = stageIdx; this.levelIdx = levelIdx;
    var gid = st.levels[levelIdx];
    this.gfx = this.data.graphics[gid];
    var s = this.data.settings[st.settings[levelIdx]] || this.data.settings.level1;
    this.level = {
      speed: s.speed || 0.5, start: s.start || 35, target: s.score || 1000,
      slowfactor: s.slowfactor || 3, colors: s.colors || this.colorsForStage(stageIdx),
      single: s.single || 0, id: gid, settingsId: st.settings[levelIdx]
    };
    if (!keepScore) this.score = this.score || 0;
    this.resetBoard();
    this.emit({ t: 'levelStart', stage: stageIdx + 1, level: levelIdx + 1, gid: gid });
  };

  P.resetBoard = function () {
    var g = this.gfx, self = this;
    var per = Math.ceil(this.level.start / (g.curves.length > 1 ? 1.6 : 1));
    // Settings.start is a ball count; capped so the opening rush never fills more than 60% of the track
    // (design assumption: several late-game values would otherwise start the chain almost on the skull)
    this.chains = g.curves.map(function (cn, i) {
      var pa = self.path(cn);
      return new Chain(self, pa, i, Math.min(per, Math.floor(pa.len * 0.6 / BD)));
    });
    this.bullets = []; this.coin = null; this.coinsShown = {};
    this.powers = { slow: 0, back: 0, acc: 0 };
    this.levelScore = 0; this.barFull = false; this.sincePower = 0;
    this.frog.x = g.gx; this.frog.y = g.gy; this.frog.reload = 0;
    this.frog.tx = g.gx; this.frog.ty = g.gy + 100;
    this.frog.cur = this.pickColor(); this.frog.next = this.pickColor();
    this.state = 'ready'; this.t = 0;
  };

  // ------------------------------------------------------------- colours
  P.palette = function () {
    var n = Math.min(6, Math.max(2, this.level.colors)), a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return a;
  };
  P.nextChainColor = function (ch) {
    var pal = this.palette(), B = ch.balls, n = B.length, c, tries = 0;
    do {
      c = pal[this.rand(pal.length)];
      if (n && this.rng() < 0.3) c = B[n - 1].color;
      var triple = n >= 2 && B[n - 1].color === c && B[n - 2].color === c;
      tries++;
    } while (triple && tries < 12);
    return c;
  };
  P.rollPower = function () {
    this.sincePower++;
    if (this.sincePower > 14 && this.rng() < 0.03 + 0.001 * this.stageIdx) {
      this.sincePower = 0;
      return POWERS[this.rand(POWERS.length)];
    }
    return 'normal';
  };
  P.availableColors = function () {
    var seen = {}, out = [];
    for (var i = 0; i < this.chains.length; i++) {
      var ch = this.chains[i];
      for (var j = 0; j < ch.balls.length; j++) {
        if (ch.hittable(ch.balls[j]) && !seen[ch.balls[j].color]) { seen[ch.balls[j].color] = 1; out.push(ch.balls[j].color); }
      }
    }
    return out;
  };
  P.pickColor = function () {
    var av = this.availableColors();
    if (!av.length) av = this.palette();
    return av[this.rand(av.length)];
  };
  P.canSpawn = function () { return !this.barFull && this.state !== 'ready' && this.state !== 'lost' && this.state !== 'over'; };

  // ------------------------------------------------------------- frog input
  P.aimAt = function (x, y) { this.frog.tx = x; this.frog.ty = y; };
  P.swap = function () {
    if (this.state !== 'play' && this.state !== 'ready') return false;
    var f = this.frog, t = f.cur; f.cur = f.next; f.next = t;
    this.emit({ t: 'swap' }); return true;
  };
  P.fire = function () {
    if (this.state !== 'play') return false;
    var f = this.frog;
    if (f.reload > 0) return false;
    var dx = f.tx - f.x, dy = f.ty - f.y, l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    this.bullets.push({ x: f.x + dx * 34, y: f.y + dy * 34, vx: dx * C.FIRE_V, vy: dy * C.FIRE_V, color: f.cur, gap: 0, age: 0 });
    f.cur = f.next; f.next = this.pickColor(); f.reload = 0.12; f.recoil = 1;
    this.emit({ t: 'fire' });
    return true;
  };

  // ------------------------------------------------------------- update loop
  P.update = function (dt) {
    if (this.state === 'idle' || this.state === 'over' || this.state === 'done') return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= C.TICK) { this.acc -= C.TICK; this.tick(C.TICK); }
  };

  P.tick = function (dt) {
    var f = this.frog, i;
    this.t += dt; this.stats.seconds += dt;
    var ang = Math.atan2(-(f.tx - f.x), f.ty - f.y);
    var diff = ang - f.aim; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    f.aim += diff * Math.min(1, dt * 30);
    if (f.reload > 0) f.reload -= dt;
    if (f.recoil > 0) f.recoil = Math.max(0, f.recoil - dt * 6);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    for (var k in this.powers) if (this.powers[k] > 0) this.powers[k] -= dt;

    if (this.state === 'ready') { if (this.t > 1.4) { this.state = 'play'; this.t = 0; this.emit({ t: 'go' }); } return; }
    if (this.state === 'lost') {
      if (this.t > 2.2) {
        if (this.lives > 0) { this.resetBoard(); this.emit({ t: 'retry' }); } else { this.state = 'over'; this.emit({ t: 'gameOver' }); }
      }
      return;
    }
    if (this.state === 'won') {
      if (this.t > 2.8) this.advance();
      return;
    }
    // play / dying
    var alive = 0;
    for (i = 0; i < this.chains.length; i++) { this.chains[i].step(dt); if (!this.chains[i].dead) alive++; }
    if (this.state === 'play') {
      this.updateBullets(dt);
      this.updateCoin(dt);
      this.updateWarning(dt);
      this.colorCheck -= dt;
      if (this.colorCheck <= 0) { this.colorCheck = 0.3; this.refreshAmmo(); }
      var dying = false, empty = true;
      for (i = 0; i < this.chains.length; i++) { if (this.chains[i].dying) dying = true; if (this.chains[i].balls.length) empty = false; }
      if (dying) { this.state = 'dying'; this.t = 0; this.bullets = []; }
      else if (this.barFull && empty) { this.win(); }
    } else if (this.state === 'dying') {
      if (alive === 0) {
        this.lives--; this.state = 'lost'; this.t = 0; this.shake = 1;
        this.emit({ t: 'lifeLost', lives: this.lives });
      }
    }
  };

  P.refreshAmmo = function () {
    var av = this.availableColors(); if (!av.length) return;
    var f = this.frog;
    if (av.indexOf(f.cur) < 0) { f.cur = av[this.rand(av.length)]; this.emit({ t: 'ammoChange' }); }
    if (av.indexOf(f.next) < 0) f.next = av[this.rand(av.length)];
  };

  P.updateWarning = function (dt) {
    var worst = 0;
    for (var i = 0; i < this.chains.length; i++) {
      var b = this.chains[i].balls[0];
      if (b) worst = Math.max(worst, b.d / this.chains[i].path.len);
    }
    this.danger = worst > 0.82 ? Math.min(1, (worst - 0.82) / 0.15) : 0;
    this.warnT -= dt;
    if (this.danger > 0 && this.warnT <= 0) { this.warnT = 2.4; this.emit({ t: 'warning' }); }
  };

  // ------------------------------------------------------------- bullets
  P.updateBullets = function (dt) {
    for (var i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      // sub-step so fast bullets cannot tunnel through a ball
      var steps = 3, hit = false;
      for (var s = 0; s < steps && !hit; s++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps; b.age += dt / steps;
        this.trackGap(b);
        if (this.coin && Math.hypot(b.x - this.coin.x, b.y - this.coin.y) < 22) this.collectCoin();
        hit = this.collide(b);
      }
      if (hit || b.x < -50 || b.x > 690 || b.y < -50 || b.y > 530) this.bullets.splice(i, 1);
    }
  };

  P.trackGap = function (b) {
    for (var c = 0; c < this.chains.length; c++) {
      var ch = this.chains[c], B = ch.balls, gr = ch.groups();
      for (var k = 0; k < gr.length - 1; k++) {
        var lo = B[gr[k + 1][0]].d + BD * 0.8, hi = B[gr[k][1]].d - BD * 0.8;
        if (hi - lo < 10) continue;
        for (var d = lo; d <= hi; d += 8) {
          var p = ch.path.at(d, ch.tmp);
          if (Math.abs(p.x - b.x) < 14 && Math.abs(p.y - b.y) < 14 && !ch.path.tunnelAt(d)) { b.gap = Math.max(b.gap, hi - lo + BD * 1.6); return; }
        }
      }
    }
  };

  P.collide = function (b) {
    var best = null, bestCh = null, bestK = -1, bd = HIT * HIT;
    for (var c = 0; c < this.chains.length; c++) {
      var ch = this.chains[c], B = ch.balls;
      for (var k = 0; k < B.length; k++) {
        if (!ch.hittable(B[k])) continue;
        var p = ch.path.at(B[k].d, ch.tmp), dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = B[k]; bestCh = ch; bestK = k; }
      }
    }
    if (!best) return false;
    this.insert(bestCh, bestK, b);
    return true;
  };

  P.insert = function (ch, k, bullet) {
    var B = ch.balls, path = ch.path, kb = B[k];
    var fp = path.at(kb.d + 16), bp = path.at(kb.d - 16);
    var front = Math.pow(fp.x - bullet.x, 2) + Math.pow(fp.y - bullet.y, 2) < Math.pow(bp.x - bullet.x, 2) + Math.pow(bp.y - bullet.y, 2);
    var idx = front ? k : k + 1, R = B[idx], d;
    if (front) d = kb.d + BD; else { d = kb.d - BD; if (R && d < R.d + BD) d = R.d + BD; }
    var before = B.map(function (x) { return x.d; });
    var nb = new Ball(bullet.color, d, 'normal');
    nb.ins = { x: bullet.x, y: bullet.y, t: 0 };
    B.splice(idx, 0, nb);
    ch.resolve();
    for (var i = 0; i < B.length; i++) {
      if (B[i] === nb) continue;
      var old = i < idx ? before[i] : before[i - 1];
      if (B[i].d - old > 0.5) B[i].off = B[i].d - old;
    }
    nb.sep = false;
    var p = path.at(nb.d);
    if (!ch.checkMatch(B.indexOf(nb), true, bullet)) {
      this.emit({ t: 'insert', x: p.x, y: p.y });
    }
  };

  // ------------------------------------------------------------- destruction
  P.destroyRun = function (ch, lo, hi, combo, bullet) {
    var removed = ch.balls.splice(lo, hi - lo + 1), n = removed.length, pts = [], i, sx = 0, sy = 0;
    var gain = n * 10 + (n > 3 ? (n - 3) * 10 : 0) + (combo > 0 ? 100 * combo : 0);
    for (i = 0; i < n; i++) {
      var p = ch.path.at(removed[i].d); pts.push({ x: p.x, y: p.y, color: removed[i].color, type: removed[i].type });
      sx += p.x; sy += p.y;
    }
    var gapBonus = 0;
    if (bullet && bullet.gap > 0) { gapBonus = 100 * Math.min(10, Math.ceil(bullet.gap / BD)); gain += gapBonus; this.stats.gaps++; }
    this.stats.balls += n; if (combo > 0) this.stats.combos++;
    this.addScore(gain);
    this.emit({ t: 'destroy', x: sx / n, y: sy / n, n: n, combo: combo, pts: pts, gain: gain, gapBonus: gapBonus, color: removed[0].color });
    for (i = 0; i < n; i++) if (removed[i].type !== 'normal') this.trigger(removed[i].type, pts[i]);
  };

  P.trigger = function (type, p) {
    if (type === 'bomb') {
      var R = 95, c, k, hitAny = 0;
      for (c = 0; c < this.chains.length; c++) {
        var ch = this.chains[c], B = ch.balls, pts = [];
        for (k = B.length - 1; k >= 0; k--) {
          var q = ch.path.at(B[k].d);
          if (Math.hypot(q.x - p.x, q.y - p.y) < R) { pts.push({ x: q.x, y: q.y, color: B[k].color }); B.splice(k, 1); }
        }
        if (pts.length) { hitAny += pts.length; this.stats.balls += pts.length; this.addScore(pts.length * 10); this.emit({ t: 'destroy', x: p.x, y: p.y, n: pts.length, combo: 0, pts: pts, gain: pts.length * 10, gapBonus: 0, silent: true }); }
      }
      this.shake = 1; this.emit({ t: 'explode', x: p.x, y: p.y });
    } else if (type === 'back') { this.powers.back = 2.8; this.emit({ t: 'power', kind: 'back' }); }
    else if (type === 'slow') { this.powers.slow = 6; this.emit({ t: 'power', kind: 'slow' }); }
    else if (type === 'acc') { this.powers.acc = 12; this.emit({ t: 'power', kind: 'acc' }); }
  };

  P.addScore = function (n) {
    this.score += n; this.levelScore += n;
    if (!this.barFull && this.levelScore >= this.level.target) { this.barFull = true; this.emit({ t: 'barFull' }); }
  };

  // ------------------------------------------------------------- treasure
  P.progress = function () {
    var m = 0;
    for (var i = 0; i < this.chains.length; i++) { var b = this.chains[i].balls[0]; if (b) m = Math.max(m, b.d / this.chains[i].path.len); }
    return m * 100;
  };
  P.updateCoin = function (dt) {
    if (this.coin) {
      this.coin.life -= dt; this.coin.spin += dt * 20;
      if (this.coin.life <= 0) { this.emit({ t: 'coinGone', x: this.coin.x, y: this.coin.y }); this.coin = null; }
      return;
    }
    var tp = this.gfx.treasure, pr = this.progress();
    for (var i = 0; i < tp.length; i++) {
      if (!this.coinsShown[i] && pr >= tp[i].dist + 12 && !this.barFull) {
        this.coinsShown[i] = 1;
        this.coin = { x: tp[i].x, y: tp[i].y, life: 12, spin: 0 };
        this.emit({ t: 'coinAppear', x: tp[i].x, y: tp[i].y });
        return;
      }
    }
  };
  P.collectCoin = function () {
    var c = this.coin; if (!c) return;
    this.coin = null; this.stats.coins++;
    this.addScore(500);
    this.emit({ t: 'coin', x: c.x, y: c.y, gain: 500 });
  };

  // ------------------------------------------------------------- progression
  P.win = function () {
    this.state = 'won'; this.t = 0;
    this.addScore(1000);
    this.emit({ t: 'levelWon', stage: this.stageIdx + 1, level: this.levelIdx + 1, bonus: 1000 });
  };
  P.advance = function () {
    var st = this.stage();
    if (this.levelIdx + 1 < st.levels.length) { this.startLevel(this.stageIdx, this.levelIdx + 1, true); return; }
    this.emit({ t: 'stageClear', stage: this.stageIdx + 1 });
    if (this.stageIdx + 1 < this.data.stages.length) { this.startLevel(this.stageIdx + 1, 0, true); }
    else { this.state = 'done'; this.emit({ t: 'victory' }); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
