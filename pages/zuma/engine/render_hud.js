/* HUD + frame composition. Depends on render.js */
(function (root) {
  'use strict';
  var Renderer = root.ZumaRenderer || require('./render.js');
  var Assets = root.Assets || require('./assets.js');
  var C = root.ZumaCore || require('./core_chain.js');
  var ok = Assets.ok;
  var R = Renderer.prototype;
  var FONT = '"Trebuchet MS", "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif';

  function label(ctx, s, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = align || 'left'; ctx.textBaseline = 'top';
    ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(s, x, y);
    ctx.fillStyle = color || '#fff4d6'; ctx.fillText(s, x, y);
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  R.layerHud = function (g, tr) {
    var ctx = this.ctx, i;
    var mb = Assets.image('menubar');
    if (ok(mb)) ctx.drawImage(mb, 0, 0, 640, 480);
    // lives in top-left green slot (x=28..100, y=4)
    var life = Assets.image('toadlives');
    for (i = 0; i < Math.min(3, Math.max(0, g.lives)); i++) {
      if (ok(life)) ctx.drawImage(life, 28 + i * 24, 4);
      else { ctx.fillStyle = '#4ade4a'; ctx.beginPath(); ctx.arc(38 + i * 24, 15, 9, 0, 6.2832); ctx.fill(); }
    }
    // stage-level in left red oval (center x=200, y=6)
    label(ctx, (g.stageIdx + 1) + '-' + (g.levelIdx + 1), 200, 6, 13, '#ffe9a3', 'center');
    // progress gauge in center black slot (x=289, y=5, w=62, h=18)
    var gx = 289, gy = 5, gw = 62, gh = 18, p = Math.min(1, g.levelScore / g.level.target);
    var gimg = Assets.image(g.barFull ? 'gaugegreen' : 'gauge');
    ctx.save(); rrect(ctx, gx, gy, gw, gh, 6); ctx.clip();
    if (ok(gimg) && p > 0) ctx.drawImage(gimg, 0, 0, Math.max(1, Math.round(gimg.naturalWidth * p)), gimg.naturalHeight, gx, gy, gw * p, gh);
    else if (p > 0) { ctx.fillStyle = g.barFull ? '#4ade4a' : '#f0b320'; ctx.fillRect(gx, gy, gw * p, gh); }
    ctx.restore();
    // score in right red oval (center x=440, y=6)
    label(ctx, String(g.score), 440, 6, 13, '#ffe9a3', 'center');
    // active power timers
    var kinds = [['slow', '#5bd75b'], ['back', '#5b8bff'], ['acc', '#ffd23f']], x = 14;
    for (i = 0; i < kinds.length; i++) {
      var t = g.powers[kinds[i][0]];
      if (t > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, 456, 54, 8); ctx.fillStyle = kinds[i][1]; ctx.fillRect(x, 456, Math.min(54, t * 5), 8); x += 60; }
    }
    // danger vignette
    if (g.danger > 0) {
      var a = g.danger * (0.18 + 0.12 * Math.sin(this.time * 10));
      var rg = ctx.createRadialGradient(320, 240, 200, 320, 240, 400);
      rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, 'rgba(255,0,0,' + a + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, 640, 480);
    }
  };

  /** compose one frame. mode: 'attract' | 'play' */
  R.draw = function (g, tr, mode) {
    var ctx = this.ctx, sx = this.scaleX || this.S || 1, sy = this.scaleY || this.S || 1;
    try {
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.clearRect(0, 0, 640, 480);
      ctx.save();
      if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * g.shake, (Math.random() - 0.5) * 10 * g.shake);
      this.layerBackground(g);
      this.layerHoles(g);
      this.layerCoin(g);
      this.layerBalls(g);
      this.layerCutouts(g);
      this.layerFrog(g);
      this.layerBullets(g);
      this.layerFx();
      ctx.restore();
      if (this.flash > 0) { ctx.fillStyle = 'rgba(255,230,160,' + this.flash * 0.5 + ')'; ctx.fillRect(0, 0, 640, 480); }
      if (mode === 'play') this.layerHud(g, tr);
    } catch (e) {            // never let one bad frame kill requestAnimationFrame
      if (!this._errLogged) { console.warn('render error (recovering):', e); this._errLogged = true; }
      try { ctx.restore(); } catch (e2) { /* ignore */ }
    }
  };
  if (typeof module !== "undefined") { module.exports = Renderer; }
})(typeof window !== 'undefined' ? window : globalThis);
