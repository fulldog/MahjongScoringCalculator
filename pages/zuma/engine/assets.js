/**
 * WeChat Mini Program / Web Asset Loader for Zuma Deluxe
 * Loads remote assets from https://atbfun.github.io/zuma/assets/
 * Built-in Assets.ok(img) ensures safe fallback to vector rendering if network is slow/offline.
 */
(function (global) {
  'use strict';
  var M = null;
  try {
    M = require('./manifest.js');
  } catch (e) {
    M = global.ZUMA_MANIFEST || { images: {}, sounds: [] };
  }

  var REMOTE_BASE = 'https://atbfun.github.io/zuma/assets/';
  var cache = {};
  var queue = [], active = 0, MAX_CONCURRENT = 4;
  var currentCanvas = null;

  function ok(img) {
    if (!img) return false;
    // WeChat Mini Program Canvas 2D image has width/height when loaded
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

  function loadImage(rel, canvas) {
    if (cache[rel]) return cache[rel].promise;
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
        img.onerror = function () {
          // On network error, leave image unready so vector fallback takes over cleanly
          done(null);
        };
        img.src = REMOTE_BASE + rel;
      });
      pump();
    });

    cache[rel] = entry;
    return entry.promise;
  }

  var Assets = {
    ok: ok,
    setCanvas: function (cv) {
      currentCanvas = cv;
    },
    image: function (name) {
      if (!M || !M.images) return null;
      var ext = M.images[name];
      if (!ext) return null;
      var e = cache['images/' + name + '.' + ext];
      return e ? e.img : null;
    },
    level: function (gid, file) {
      var e = cache['levels/' + gid + '/' + file];
      return e ? e.img : null;
    },
    preload: function (names, cv) {
      if (cv) currentCanvas = cv;
      return Promise.all(names.map(function (n) {
        var ext = M && M.images ? M.images[n] : null;
        return ext ? loadImage('images/' + n + '.' + ext, currentCanvas) : Promise.resolve(null);
      }));
    },
    preloadLevel: function (g, cv) {
      if (cv) currentCanvas = cv;
      var files = ['bg.jpg'].concat((g.cutouts || []).map(function (c) { return c.img + '.png'; }));
      return Promise.all(files.map(function (f) {
        return loadImage('levels/' + g.id + '/' + f, currentCanvas);
      }));
    },
    soundUrl: function (name) {
      return REMOTE_BASE + 'sounds/' + name + '.mp3';
    }
  };

  if (typeof module !== 'undefined') module.exports = Assets;
  if (typeof window !== 'undefined') window.Assets = Assets;
})(typeof window !== 'undefined' ? window : globalThis);
