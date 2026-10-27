/* Demo / test bot: picks a ball it can legitimately match and aims with path lead. */
(function (root) {
  'use strict';
  var C = root.ZumaCore || require('./core_chain.js'), BD = C.BD, HIT = C.HIT;
  var Bot = { cooldown: 0, skill: 1 };

  function firstHit(game, fx, fy, tx, ty) {
    var dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    var best = null, bt = 1e9;
    for (var c = 0; c < game.chains.length; c++) {
      var ch = game.chains[c], B = ch.balls;
      for (var k = 0; k < B.length; k++) {
        if (!ch.hittable(B[k])) continue;
        var p = ch.path.at(B[k].d), rx = p.x - fx, ry = p.y - fy, t = rx * dx + ry * dy;
        if (t < 0) continue;
        var perp = Math.abs(rx * dy - ry * dx);
        if (perp < HIT && t < bt) { bt = t; best = { ch: ch, k: k }; }
      }
    }
    return best;
  }
  function value(game, hit, color) {
    if (!hit) return 0;
    var B = hit.ch.balls, k = hit.k, v = 0;
    if (B[k].color === color) v = 2;
    var f = B[k - 1], r = B[k + 1];
    if (f && f.color === color && f.d - B[k].d < BD + 1) v = Math.max(v, 1.5);
    if (r && r.color === color && B[k].d - r.d < BD + 1) v = Math.max(v, 1.5);
    return v ? v + B[k].d / hit.ch.path.len : 0;
  }
  function plan(game, color) {
    var f = game.frog, best = null, bv = 0;
    for (var c = 0; c < game.chains.length; c++) {
      var ch = game.chains[c], B = ch.balls, gr = ch.groups(), last = gr.length - 1;
      var rearStart = last >= 0 ? gr[last][0] : 0;
      for (var k = 0; k < B.length; k++) {
        if (!ch.hittable(B[k])) continue;
        var p = ch.path.at(B[k].d), dist = Math.hypot(p.x - f.x, p.y - f.y);
        var lead = (k >= rearStart ? game.level.speed * C.SPEED_K : 0) * dist / C.FIRE_V;
        var q = ch.path.at(B[k].d + lead);
        var hit = firstHit(game, f.x, f.y, q.x, q.y);
        var v = value(game, hit, color);
        if (v > bv) { bv = v; best = { x: q.x, y: q.y }; }
      }
    }
    return best ? { x: best.x, y: best.y, v: bv } : null;
  }
  Bot.think = function (game, dt) {
    var f = game.frog;
    Bot.cooldown -= dt;
    var a = plan(game, f.cur), b = plan(game, f.next), act = { swap: false, fire: false };
    var use = a;
    if ((!a && b) || (a && b && b.v > a.v + 0.6)) { act.swap = true; use = b; }
    if (!use) {
      // nothing matchable: shoot the front ball only when in danger
      if (game.danger > 0.3) { var ch = game.chains[0], B = ch && ch.balls[0]; if (B) { var p = ch.path.at(B.d); use = { x: p.x, y: p.y }; } }
    }
    if (use) {
      game.aimAt(use.x, use.y);
      var want = Math.atan2(-(use.x - f.x), use.y - f.y), diff = want - f.aim;
      while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 0.06 && Bot.cooldown <= 0 && !act.swap) { act.fire = true; Bot.cooldown = 0.28 / Bot.skill; }
    }
    return act;
  };
  Bot.act = function (game, dt) {
    if (game.state !== 'play') return;
    var a = Bot.think(game, dt);
    if (a.swap) game.swap();
    else if (a.fire) game.fire();
  };
  root.ZumaBot = Bot;
  if (typeof module !== 'undefined' && module.exports) module.exports = Bot;
})(typeof window !== 'undefined' ? window : globalThis);
