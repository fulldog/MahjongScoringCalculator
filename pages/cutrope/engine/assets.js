/**
 * Cut Rope asset loader for WeChat Mini Program / Canvas 2D.
 * Loads remote images from https://atbfun.github.io/cutrope/assets/
 * Falls back to vector drawing when an image is unavailable.
 */
(function (global) {
  'use strict';

  var REMOTE_BASE = 'https://atbfun.github.io/cutrope/assets/';
  var IMAGE_IDS = [
    339, 343, 'trim415', 'trim417', 'trim445', 'trim475', 'trim479', 'trim483',
    'trim503', 'candy', 119, 'trim188', 'trim239', 346, 349, 352, 355, 327, 330, 333, 336
  ];

  var cache = {};
  var queue = [];
  var active = 0;
  var MAX_CONCURRENT = 4;
  var currentCanvas = null;

  function ok(img) {
    if (!img) return false;
    if (img.width > 0 || img.naturalWidth > 0) return true;
    return false;
  }

  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      active++;
      queue.shift()();
    }
  }

  function createImageInstance(canvas) {
    if (canvas && typeof canvas.createImage === 'function') {
      return canvas.createImage();
    }
    if (typeof Image !== 'undefined') {
      return new Image();
    }
    return null;
  }

  function loadImage(id, canvas) {
    var key = String(id);
    if (cache[key]) return cache[key].promise;

    var cv = canvas || currentCanvas;
    var img = createImageInstance(cv);
    var entry = { img: img, promise: null };

    entry.promise = new Promise(function (resolve) {
      if (!img) {
        resolve(null);
        return;
      }
      queue.push(function () {
        function done(im) {
          active--;
          pump();
          resolve(im);
        }
        img.onload = function () { done(img); };
        img.onerror = function () { done(null); };
        img.src = REMOTE_BASE + 'images/' + key + '.png';
      });
      pump();
    });

    cache[key] = entry;
    return entry.promise;
  }

  var Assets = {
    ok: ok,
    setCanvas: function (cv) {
      currentCanvas = cv;
    },
    image: function (id) {
      var e = cache[String(id)];
      return e ? e.img : null;
    },
    draw: function (ctx, id, x, y, w, h) {
      var img = this.image(id);
      if (!ok(img)) {
        loadImage(id, currentCanvas);
        return false;
      }
      ctx.drawImage(img, x, y, w, h);
      return true;
    },
    preload: function (ids, cv) {
      if (cv) currentCanvas = cv;
      var list = ids && ids.length ? ids : IMAGE_IDS;
      return Promise.all(list.map(function (id) {
        return loadImage(id, currentCanvas);
      }));
    },
    soundUrl: function (name) {
      return REMOTE_BASE + 'audio/' + name + '.mp3';
    },
    IMAGE_IDS: IMAGE_IDS
  };

  if (typeof module !== 'undefined') module.exports = Assets;
  if (typeof global !== 'undefined') global.CutRopeAssets = Assets;
})(typeof globalThis !== 'undefined' ? globalThis : this);
