/* Canvas renderer: 640x480 logical board, layered, every drawImage guarded by Assets.ok() with vector fallbacks. */
(function (root) {
  'use strict';
  var C = root.ZumaCore || require('./core_chain.js');
  var Assets = root.Assets || require('./assets.js');
  var BD = C.BD, ok = Assets.ok;
  var COLORS = C.COLORS;
  var HEX = { blue: '#3b7bff', green: '#3fd04a', purple: '#a64bd6', red: '#e5322d', white: '#f2f2f2', yellow: '#f6cf2a' };
  var PREFIX = { normal: 'baball', bomb: 'babomb', back: 'babackwards', slow: 'baslow', acc: 'baaccuracy' };
  var W = 640, H = 480;

  function Renderer(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.game = game;
    this.S = 1; this.scaleX = 1; this.scaleY = 1;
    this.time = 0; this.parts = []; this.texts = []; this.booms = []; this.flash = 0;
    this.banner = null; this.hud = { name: '' }; this.lang = function (k) { return k; };
    this.resize();
  }
  var R = Renderer.prototype;
  R.resize = function (w, h, dpr) {
    var S = dpr || Math.min(2.5, Math.max(1, root.devicePixelRatio || 1));
    this.S = S;
    if (w && h) {
      this.canvas.width = Math.round(w * S);
      this.canvas.height = Math.round(h * S);
      this.scaleX = this.canvas.width / W;
      this.scaleY = this.canvas.height / H;
    } else {
      this.canvas.width = Math.round(W * S);
      this.canvas.height = Math.round(H * S);
      this.scaleX = S;
      this.scaleY = S;
    }
  };
  R.setGame = function (g) { this.game = g; this.parts = []; this.texts = []; this.booms = []; };

  // ------------------------------------------------------------ events -> effects
  R.onEvents = function (evs, t) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'destroy') {
        for (var k = 0; k < e.pts.length; k++) this.burst(e.pts[k].x, e.pts[k].y, HEX[COLORS[e.pts[k].color]] || '#fff', 9);
        if (!e.silent) this.text(e.x, e.y - 8, '+' + e.gain, '#fff6b0', 18);
        if (e.combo > 0) this.text(e.x, e.y - 30, t('combo', { n: e.combo }), '#ffd23f', 22);
        if (e.gapBonus > 0) this.text(e.x, e.y - 52, t('gapBonus', { n: e.gapBonus }), '#7dfcff', 20);
      } else if (e.t === 'explode') {
        this.booms.push({ x: e.x, y: e.y, t: 0 });
        this.flash = 0.5;
      } else if (e.t === 'coin') {
        this.burst(e.x, e.y, '#ffd23f', 18);
        this.text(e.x, e.y - 12, t('coinBonus', { n: e.gain }), '#ffe27a', 20);
      } else if (e.t === 'swallow') {
        this.burst(e.x, e.y, HEX[COLORS[e.color]] || '#fff', 5);
      } else if (e.t === 'insert') {
        this.burst(e.x, e.y, '#ffffff', 3);
      }
    }
  };
  R.burst = function (x, y, color, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 130;
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, color: color, size: 2 + Math.random() * 3 });
    }
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  };
  R.text = function (x, y, s, color, size) {
    this.texts.push({ x: Math.max(60, Math.min(580, x)), y: y, s: s, color: color, size: size, life: 1.3 });
  };
  R.update = function (dt) {
    this.time += dt;
    var i, p;
    for (i = this.parts.length - 1; i >= 0; i--) {
      p = this.parts[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (i = this.texts.length - 1; i >= 0; i--) { p = this.texts[i]; p.life -= dt; p.y -= 26 * dt; if (p.life <= 0) this.texts.splice(i, 1); }
    for (i = this.booms.length - 1; i >= 0; i--) { p = this.booms[i]; p.t += dt; if (p.t > 0.7) this.booms.splice(i, 1); }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
  };

  // ------------------------------------------------------------ helpers
  R.ballImg = function (type, color) { return Assets.image((PREFIX[type] || 'baball') + COLORS[color]); };
  R.drawBall = function (x, y, color, type, d, scale, angle) {
    var ctx = this.ctx, img = this.ballImg(type, color), s = scale || 1;
    if (ok(img)) {
      ctx.save(); ctx.translate(x, y); if (s !== 1) ctx.scale(s, s);
      if (angle) ctx.rotate(angle);
      if (type === 'normal') {
        var frames = Math.max(1, Math.floor(img.naturalHeight / 32)), fr = ((Math.floor(d / 2.1) % frames) + frames) % frames;
        ctx.drawImage(img, 0, fr * 32, 32, 32, -16, -16, 32, 32);
      } else {
        ctx.drawImage(img, 0, 0, 32, 32, -16, -16, 32, 32);
      }
      ctx.restore();
    } else {                               // vector fallback
      var g = ctx.createRadialGradient(x - 5 * s, y - 5 * s, 2, x, y, 16 * s);
      g.addColorStop(0, '#fff'); g.addColorStop(0.25, HEX[COLORS[color]] || '#888'); g.addColorStop(1, '#222');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 15 * s, 0, 6.2832); ctx.fill();
    }
    if (type !== 'normal') {
      var pulse = 0.5 + 0.5 * Math.sin(this.time * 7);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.4 * pulse) + ')';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, (17 + pulse * 2) * s, 0, 6.2832); ctx.stroke(); ctx.restore();
    }
  };

  // ------------------------------------------------------------ layers
  R.layerBackground = function (g) {
    var ctx = this.ctx, bg = Assets.level(g.gfx.id, 'bg.jpg');
    if (ok(bg)) {
      if (g.gfx.space) {
        var off = (this.time * 14) % bg.naturalHeight;
        ctx.drawImage(bg, 0, off, 640, 480, 0, 0, 640, 480);
        if (off > bg.naturalHeight - 480) ctx.drawImage(bg, 0, 0, 640, 480, 0, bg.naturalHeight - off, 640, 480);
      } else ctx.drawImage(bg, 0, 0, W, H);
    } else {
      var gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#3b5d3a'); gr.addColorStop(1, '#1d2e22');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      // track hint so the game is still playable without images
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 36; ctx.lineJoin = 'round'; ctx.beginPath();
      for (var c = 0; c < g.chains.length; c++) {
        var p = g.chains[c].path;
        for (var d = 0; d < p.len; d += 6) { var q = p.at(d); if (d === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
      }
      ctx.stroke();
    }
  };
  R.layerHoles = function (g) {
    var ctx = this.ctx, hole = Assets.image('hole'), cover = Assets.image('pitcover');
    for (var c = 0; c < g.chains.length; c++) {
      var ch = g.chains[c], p = ch.path.at(ch.path.len);
      var open = ch.dying ? 1 : (g.danger || 0);
      // Danger / intro path-sparkle trail from leading ball toward the skull
      if (open > 0.05 && ch.balls.length) {
        var lead = Math.max(0, ch.balls[ch.balls.length - 1].d);
        var span = ch.path.len - lead;
        if (span > 16) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (var s = 0; s < 5; s++) {
            var frac = ((this.time * 1.6 + s * 0.2) % 1);
            var sp = ch.path.at(lead + span * frac);
            ctx.fillStyle = 'rgba(255,190,60,' + (0.55 * (1 - frac) * open) + ')';
            ctx.beginPath(); ctx.arc(sp.x, sp.y, 4 + (1 - frac) * 4, 0, 6.2832); ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.save(); ctx.translate(p.x, p.y);
      if (ok(hole)) ctx.drawImage(hole, -44, -44);
      else { ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.2832); ctx.fill(); ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4; ctx.stroke(); }
      if (ok(cover)) {
        var frames = Math.floor(cover.naturalHeight / 88), fr = Math.max(0, Math.min(frames - 1, Math.round(open * (frames - 1))));
        ctx.drawImage(cover, 0, fr * 88, 88, 88, -44, -44, 88, 88);
      } else {
        ctx.fillStyle = 'rgba(201,162,39,' + (1 - open * 0.8) + ')'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
      if (open > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var a = open * (0.35 + 0.3 * Math.sin(this.time * 12));
        var rg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 60);
        rg.addColorStop(0, 'rgba(255,60,30,' + a + ')'); rg.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = rg; ctx.fillRect(p.x - 60, p.y - 60, 120, 120); ctx.restore();
      }
    }
  };
  R.layerCoin = function (g) {
    if (!g.coin) return;
    var ctx = this.ctx, img = Assets.image('coin'), c = g.coin;
    var fade = Math.min(1, c.life / 1.5);
    ctx.save(); ctx.globalAlpha = fade;
    if (ok(img)) {
      var frames = Math.floor(img.naturalHeight / 36), fr = Math.floor(c.spin) % frames;
      ctx.drawImage(img, 0, fr * 36, 36, 36, c.x - 18, c.y - 18, 36, 36);
    } else { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(c.x, c.y, 12 + Math.sin(c.spin) * 3, 0, 6.2832); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,220,120,0.25)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 22 + Math.sin(this.time * 6) * 3, 0, 6.2832); ctx.fill();
    ctx.restore();
  };
  R.layerBalls = function (g) {
    var ctx = this.ctx, shadow = Assets.image('ballshadow'), tmp = { x: 0, y: 0 }, i, k;
    var pos = [];
    for (var c = 0; c < g.chains.length; c++) {
      var ch = g.chains[c], B = ch.balls;
      for (i = B.length - 1; i >= 0; i--) {
        var b = B[i];
        if (b.d < -BD) continue;
        var p = ch.path.at(b.d - b.off, tmp), x = p.x, y = p.y;
        var ang = ch.path.angle(b.d - b.off) - Math.PI / 2;
        if (b.ins) { var e = b.ins.t * b.ins.t * (3 - 2 * b.ins.t); x = b.ins.x + (x - b.ins.x) * e; y = b.ins.y + (y - b.ins.y) * e; }
        if (x < -20 || x > 660 || y < -20 || y > 500) continue;
        pos.push({ x: x, y: y, b: b, ang: ang });
      }
    }
    for (k = 0; k < pos.length; k++) {
      if (ok(shadow)) ctx.drawImage(shadow, pos[k].x - 14, pos[k].y - 13); else { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(pos[k].x + 3, pos[k].y + 4, 15, 14, 0, 0, 6.2832); ctx.fill(); }
    }
    for (k = 0; k < pos.length; k++) this.drawBall(pos[k].x, pos[k].y, pos[k].b.color, pos[k].b.type, pos[k].b.d - pos[k].b.off, 1, pos[k].ang);
  };
  R.layerCutouts = function (g) {
    var cs = g.gfx.cutouts, ctx = this.ctx;
    for (var i = 0; i < cs.length; i++) { var im = Assets.level(g.gfx.id, cs[i].img + '.png'); if (ok(im)) ctx.drawImage(im, cs[i].x, cs[i].y); }
  };
  R.layerFrog = function (g) {
    var ctx = this.ctx, f = g.frog, img = Assets.image('smallfrogonpad');
    var dx = -Math.sin(f.aim), dy = Math.cos(f.aim);
    ctx.save(); ctx.translate(f.x, f.y);
    // aiming guide
    if (g.powers.acc > 0 && g.state === 'play') {
      ctx.setLineDash([8, 8]); ctx.lineDashOffset = -this.time * 40; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx * 36, dy * 36); ctx.lineTo(dx * 700, dy * 700); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.save(); ctx.rotate(f.aim);
    var tongue = Assets.image('tongue');
    if (f.recoil > 0.05 && ok(tongue)) {
      ctx.drawImage(tongue, -16, 10 + (1 - f.recoil) * 18, 32, 36);
    }
    if (ok(img)) ctx.drawImage(img, -54, -54);
    else { ctx.fillStyle = '#3c8d3c'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 6.2832); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-14, 16, 7, 0, 6.2832); ctx.arc(14, 16, 7, 0, 6.2832); ctx.fill(); }
    if (g.state !== 'over') {
      var gem = Assets.image('balight' + COLORS[f.next]);
      if (ok(gem)) ctx.drawImage(gem, -8, -36, 16, 16);
      else { ctx.fillStyle = HEX[COLORS[f.next]] || '#fff'; ctx.beginPath(); ctx.arc(0, -28, 7, 0, 6.2832); ctx.fill(); }
    }
    ctx.restore();
    if (g.state !== 'over') {
      var mouth = 22 - f.recoil * 8;
      if (f.reload <= 0 || f.recoil < 0.5) this.drawBall(dx * mouth, dy * mouth, f.cur, 'normal', 0, 0.9, f.aim);
    }
    ctx.restore();
  };
  R.layerBullets = function (g) {
    for (var i = 0; i < g.bullets.length; i++) { var b = g.bullets[i]; this.drawBall(b.x, b.y, b.color, 'normal', b.age * 400, 1, Math.atan2(b.vy, b.vx) - Math.PI / 2); }
  };
  R.layerFx = function () {
    var ctx = this.ctx, i, p;
    var boom = Assets.image('explosion');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < this.booms.length; i++) {
      p = this.booms[i];
      if (ok(boom)) { var frames = Math.floor(boom.naturalHeight / 86), fr = Math.min(frames - 1, Math.floor(p.t / 0.7 * frames)); ctx.drawImage(boom, 0, fr * 86, 85, 86, p.x - 64, p.y - 64, 128, 128); }
      else { ctx.fillStyle = 'rgba(255,170,60,' + (1 - p.t / 0.7) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + p.t * 130, 0, 6.2832); ctx.fill(); }
    }
    for (i = 0; i < this.parts.length; i++) {
      p = this.parts[i]; ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    for (i = 0; i < this.texts.length; i++) {
      p = this.texts[i]; ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.font = 'bold ' + p.size + 'px "Trebuchet MS", "PingFang SC", "Hiragino Sans", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(p.s, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.s, p.x, p.y);
    }
    ctx.restore();
  };
  root.ZumaRenderer = Renderer;
  Renderer.HEX = HEX; Renderer.W = W; Renderer.H = H;
  if (typeof module !== "undefined") { module.exports = Renderer; }
})(typeof window !== 'undefined' ? window : globalThis);
