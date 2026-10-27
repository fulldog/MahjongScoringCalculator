/**
 * Cut Rope Canvas 2D renderer — adapted from atbfun/cutrope for WeChat Mini Program.
 * Observation: original uses 320×480 world units with camera follow and asset fallbacks.
 */
var Physics = require('./physics.js');
var Assets = require('./assets.js');
var distance = Physics.distance;
var clamp = Physics.clamp;

function Renderer(canvas, assets) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.assets = assets || Assets;
  this.particles = [];
  this.trail = [];
  this.cameraX = 0;
  this.cameraY = 0;
  this.reduced = false;
  this.errors = [];
  this.last = 0;
  this.scale = 1;
  this.x = 0;
  this.y = 0;
  this.w = 320;
  this.h = 480;
  this.dpr = 1;
  this.cssW = 320;
  this.cssH = 480;
}

Renderer.prototype.reset = function () {
  this.particles = [];
  this.trail = [];
  this.cameraX = 0;
  this.cameraY = 0;
};

Renderer.prototype.resize = function (cssW, cssH, dpr) {
  this.cssW = cssW;
  this.cssH = cssH;
  this.dpr = dpr || 1;
  this.w = cssW;
  this.h = cssH;
  var pw = Math.round(cssW * this.dpr);
  var ph = Math.round(cssH * this.dpr);
  if (this.canvas.width !== pw || this.canvas.height !== ph) {
    this.canvas.width = pw;
    this.canvas.height = ph;
  }
};

Renderer.prototype.toWorld = function (clientX, clientY, rect) {
  var left = rect ? rect.left : 0;
  var top = rect ? rect.top : 0;
  return {
    x: (clientX - left - this.x) / this.scale,
    y: (clientY - top - this.y) / this.scale
  };
};

Renderer.prototype.burst = function (event) {
  if (this.reduced) return;
  var n = event.type === 'won' ? 45 : event.type === 'star' ? 15 : 7;
  for (var i = 0; i < n; i++) {
    this.particles.push({
      x: event.x,
      y: event.y,
      vx: (Math.random() - 0.5) * 130,
      vy: -30 - Math.random() * 120,
      life: 0.5 + Math.random() * 0.6,
      max: 1.1,
      color: event.type === 'star' || event.type === 'won' ? '#ffe17a' : '#f4ead0',
      r: 2 + Math.random() * 2
    });
  }
};

Renderer.prototype.star = function (ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 5;
    var s = i % 2 ? r * 0.47 : r;
    var px = x + Math.cos(a) * s;
    var py = y + Math.sin(a) * s;
    if (!i) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
};

Renderer.prototype.bubble = function (ctx, p, r) {
  r = r == null ? 26 : r;
  ctx.save();
  var g = ctx.createRadialGradient(p.x - 9, p.y - 10, 0, p.x, p.y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.33)');
  g.addColorStop(0.8, 'rgba(216,243,249,0.07)');
  g.addColorStop(1, 'rgba(140,170,181,0.47)');
  ctx.fillStyle = g;
  ctx.strokeStyle = 'rgba(245,255,255,0.63)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(p.x - 9, p.y - 11, 8, 4, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.restore();
};

Renderer.prototype.character = function (ctx, world, clock) {
  var p = world.target;
  var near = distance(world.candy, p) < 95;
  var id = world.state === 'won' ? 415 : world.state === 'lost' ? 475 : near ? 483 : Math.sin(clock * 0.002) > 0.98 ? 445 : 415;
  ctx.save();
  ctx.translate(p.x, p.y + 7);
  if (!this.reduced && world.state === 'won') {
    ctx.translate(0, -Math.abs(Math.sin(clock * 0.009)) * 6);
  }
  ctx.fillStyle = 'rgba(96,75,50,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 27, 37, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!this.assets.draw(ctx, 'trim' + id, -34, -40, 68, 74)) {
    ctx.fillStyle = '#7db532';
    ctx.strokeStyle = '#4b6f26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    var eyes = [-14, 14];
    for (var ei = 0; ei < eyes.length; ei++) {
      var ex = eyes[ei];
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(ex, -12, 15, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#243321';
      ctx.beginPath();
      ctx.arc(ex + 3, -10, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 3, 17, 0, Math.PI);
    ctx.stroke();
  }
  ctx.restore();
};

Renderer.prototype.candy = function (ctx, world, clock) {
  if (world.state !== 'playing' && world.state !== 'lost') return;
  var c = world.candy;
  if (world.state === 'lost') return;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.sin(world.time * 0.7) * 0.2 + (c.x - c.ox) * 0.06);
  ctx.shadowColor = 'rgba(104,69,26,0.26)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  var candyDrawn = this.assets.draw(ctx, 'candy', -24, -24, 48, 48);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (!candyDrawn) {
    ctx.fillStyle = '#fff6df';
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cc4b35';
    for (var i = 0; i < 5; i++) {
      ctx.rotate(Math.PI * 2 / 5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(8, -15, 20, 0);
      ctx.quadraticCurveTo(9, -3, 0, 0);
      ctx.fill();
    }
  }
  ctx.restore();
  if (world.bubble) this.bubble(ctx, c, 30 + Math.sin(clock * 0.003) * 0.5);
};

Renderer.prototype.spiderPoint = function (r) {
  var left = r.spider;
  for (var i = 1; i < r.nodes.length; i++) {
    var a = r.nodes[i - 1];
    var b = r.nodes[i];
    var d = distance(a, b);
    if (left <= d) {
      return {
        x: a.x + (b.x - a.x) * left / (d || 1),
        y: a.y + (b.y - a.y) * left / (d || 1)
      };
    }
    left -= d;
  }
  return r.nodes[r.nodes.length - 1];
};

Renderer.prototype.ropes = function (ctx, world) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (var ri = 0; ri < world.ropes.length; ri++) {
    var r = world.ropes[ri];
    if (!r.active && world.time - r.cutTime > 1.3) continue;
    ctx.save();
    var pts = r.active ? r.nodes : r.loose;
    var age = r.active ? 0 : world.time - r.cutTime;
    if (!r.active) {
      ctx.globalAlpha = Math.max(0, 1 - age / 1.3);
      ctx.translate(0, age * age * 55);
    }
    var line = function () {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i].x, pts[i].y);
        else ctx.moveTo(pts[i].x, pts[i].y);
      }
    };
    ctx.strokeStyle = '#4d392c';
    ctx.lineWidth = 3.4;
    line();
    ctx.stroke();
    ctx.strokeStyle = '#c5ab78';
    ctx.lineWidth = 1.7;
    line();
    ctx.stroke();
    ctx.setLineDash([1.5, 4]);
    ctx.strokeStyle = '#786040';
    ctx.lineWidth = 2;
    line();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (r.active && r.spider !== null) {
      var p = this.spiderPoint(r);
      if (!this.assets.draw(ctx, 'trim188', p.x - 10, p.y - 10, 20, 20)) {
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  for (var hi = 0; hi < world.hooks.length; hi++) {
    var h = world.hooks[hi];
    if (h.auto && !h.caught) {
      ctx.strokeStyle = 'rgba(184,186,130,0.47)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!this.assets.draw(ctx, h.auto ? 349 : 346, h.x - 9, h.y - 9, 18, 18)) {
      ctx.fillStyle = '#607d89';
      ctx.strokeStyle = '#dbe4d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
};

Renderer.prototype.draw = function (world, clock) {
  clock = clock == null ? Date.now() : clock;
  var ctx = this.ctx;
  var dt = Math.min(0.05, (clock - this.last) / 1000 || 0);
  this.last = clock;
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = world.level.box === 1 ? '#d6b17b' : '#a2af58';
  ctx.fillRect(0, 0, this.w, this.h);
  this.assets.draw(ctx, world.level.box === 1 ? 339 : 343, 0, 0, this.w, this.h);

  this.scale = this.h / 510;
  var desiredX = clamp(world.candy.x - 160, 0, Math.max(0, world.width - 320));
  var desiredY = clamp(world.candy.y - 240, 0, Math.max(0, world.height - 480));
  this.cameraX += (desiredX - this.cameraX) * 0.08;
  this.cameraY += (desiredY - this.cameraY) * 0.08;
  this.x = (this.w - 320 * this.scale) / 2 - this.cameraX * this.scale;
  this.y = 12 * this.scale - this.cameraY * this.scale;

  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.scale(this.scale, this.scale);
  this.ropes(ctx, world);

  for (var si = 0; si < world.spikes.length; si++) {
    var s = world.spikes[si];
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle * Math.PI / 180);
    var spike = Physics.SPIKES[s.size] || Physics.SPIKES[2];
    var id = spike.image;
    var len = spike.width / 1.2;
    if (!this.assets.draw(ctx, id, -len / 2, -16, len, 32)) {
      ctx.fillStyle = '#92a6ad';
      ctx.strokeStyle = '#415b65';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 8);
      for (var x = -len / 2; x < len / 2; x += 15) {
        ctx.lineTo(x + 7, -12);
        ctx.lineTo(x + 15, 8);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  for (var bi = 0; bi < world.bubbles.length; bi++) {
    var b = world.bubbles[bi];
    if (!b.used) this.bubble(ctx, { x: b.x, y: b.y + Math.sin(clock * 0.002 + b.x) * 1.5 });
  }

  for (var sti = 0; sti < world.stars.length; sti++) {
    var star = world.stars[sti];
    if (star.collected || star.expired) continue;
    ctx.save();
    ctx.translate(star.x, star.y + (this.reduced ? 0 : Math.sin(clock * 0.002 + star.x) * 1.2));
    var remaining = star.timeout > 0 ? star.timeout + 3 - world.time : 99;
    if (remaining < 2) ctx.globalAlpha = 0.4 + Math.abs(Math.sin(clock * 0.009)) * 0.6;
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 29);
    glow.addColorStop(0, 'rgba(255,247,163,0.42)');
    glow.addColorStop(1, 'rgba(255,247,163,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-29, -29, 58, 58);
    if (!this.assets.draw(ctx, 119, -15, -15, 30, 30)) this.star(ctx, 0, 0, 14, '#ffe24c', '#f6f4ce');
    if (star.timeout > 0) {
      ctx.strokeStyle = '#fcf1b7';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(remaining / (star.timeout + 3), 0, 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  for (var pi = 0; pi < world.pumps.length; pi++) {
    var p = world.pumps[pi];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.angle + 90) * Math.PI / 180);
    ctx.scale(1, 1 - p.pulse * 0.4);
    if (!this.assets.draw(ctx, 'trim239', -22, -27, 44, 54)) {
      ctx.fillStyle = '#5989cc';
      ctx.strokeStyle = '#d2e1e8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 21, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (p.pulse > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.53)';
      ctx.lineWidth = 2;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 10, -37);
        ctx.lineTo(i * 18, -60 - (0.35 - p.pulse) * 80);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  this.character(ctx, world, clock);
  this.candy(ctx, world, clock);

  if (world.level.box === 1 && world.level.number === 1 && world.cuts === 0) {
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.fillStyle = 'rgba(118,88,54,0.65)';
    ctx.fillText('轻轻划过这里', 202, 104);
    ctx.strokeStyle = 'rgba(118,88,54,0.44)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(198, 100);
    ctx.quadraticCurveTo(175, 113, 140, 104);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(147, 99);
    ctx.lineTo(140, 104);
    ctx.lineTo(147, 108);
    ctx.stroke();
    ctx.restore();
  }

  this.particles = this.particles.filter(function (p) { return p.life > 0; });
  for (var pti = 0; pti < this.particles.length; pti++) {
    var pt = this.particles[pti];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 180 * dt;
    ctx.globalAlpha = clamp(pt.life / 0.5, 0, 1);
    this.star(ctx, pt.x, pt.y, pt.r, pt.color);
  }
  ctx.globalAlpha = 1;

  this.trail = this.trail.filter(function (p) { return clock - p.at < 180; });
  if (this.trail.length > 1) {
    ctx.beginPath();
    for (var ti = 0; ti < this.trail.length; ti++) {
      if (ti) ctx.lineTo(this.trail[ti].x, this.trail[ti].y);
      else ctx.moveTo(this.trail[ti].x, this.trail[ti].y);
    }
    ctx.strokeStyle = 'rgba(255,254,248,0.67)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.restore();
};

module.exports = Renderer;
