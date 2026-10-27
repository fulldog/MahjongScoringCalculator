var BASE = 'https://atbfun.github.io/kingdomrush/assets/';

function Sound() {
  this.muted = false;
  this.unlocked = false;
  this.suspended = false;
  this.music = null;
  this.musicName = '';
  this.pool = [];
  this.last = {};
}

Sound.prototype.url = function (name) {
  var table = globalThis.KR_SOUNDS || {};
  var rel = table[name];
  return rel ? BASE + rel : '';
};

Sound.prototype.unlock = function () {
  this.unlocked = true;
};

Sound.prototype._create = function (name, loop, volume) {
  var src = this.url(name);
  if (!src || typeof wx === 'undefined' || !wx.createInnerAudioContext) return null;
  var audio = wx.createInnerAudioContext();
  audio.src = src;
  audio.loop = !!loop;
  audio.volume = volume == null ? 0.45 : volume;
  audio.obeyMuteSwitch = true;
  return audio;
};

Sound.prototype.play = function (name, volume, gap) {
  if (this.muted || !this.unlocked || this.suspended) return;
  var now = Date.now() / 1000;
  if (now - (this.last[name] || -100) < (gap || 0.1)) return;
  this.last[name] = now;
  this.pool = this.pool.filter(function (a) { return a && !a._ended; });
  if (this.pool.length >= 6) {
    var old = this.pool.shift();
    try { old.stop(); old.destroy(); } catch (e) {}
  }
  var audio = this._create(name, false, volume == null ? 0.35 : volume);
  if (!audio) return;
  audio.onEnded(function () {
    audio._ended = true;
    try { audio.destroy(); } catch (e) {}
  });
  audio.onError(function () {
    audio._ended = true;
    try { audio.destroy(); } catch (e) {}
  });
  this.pool.push(audio);
  try { audio.play(); } catch (e) {}
};

Sound.prototype.setMusic = function (biome, battle) {
  var theme = biome === 'desert' ? 'Desert' : biome === 'jungle' ? 'Jungle' : 'Underground';
  var name = 'music_' + theme + '_' + (battle ? 'Battle' : 'Prep');
  if (this.musicName === name) return;
  this.musicName = name;
  if (this.music) {
    try { this.music.stop(); this.music.destroy(); } catch (e) {}
    this.music = null;
  }
  if (!this.unlocked || this.muted || this.suspended) return;
  this.music = this._create(name, true, 0.18);
  if (this.music) {
    try { this.music.play(); } catch (e) {}
  }
};

Sound.prototype.toggle = function () {
  this.muted = !this.muted;
  if (this.muted) {
    if (this.music) { try { this.music.pause(); } catch (e) {} }
    this.stopEffects();
  } else if (!this.suspended && this.music) {
    try { this.music.play(); } catch (e) {}
  }
  return this.muted;
};

Sound.prototype.stopEffects = function () {
  for (var i = 0; i < this.pool.length; i++) {
    try { this.pool[i].stop(); this.pool[i].destroy(); } catch (e) {}
  }
  this.pool = [];
};

Sound.prototype.suspend = function (value) {
  this.suspended = !!value;
  if (this.suspended) {
    if (this.music) { try { this.music.pause(); } catch (e) {} }
    this.stopEffects();
  } else if (!this.muted && this.music) {
    try { this.music.play(); } catch (e) {}
  }
};

Sound.prototype.event = function (event) {
  var sounds = {
    build: 'Sound_GUIButtonCommon',
    upgrade: 'Sound_GUIButtonCommon',
    sell: 'Sound_GUIButtonCommon',
    reinforce: 'Sound_Reinforcements1',
    fire: 'hero_dragon_fireball_explode',
    impact: 'hero_dragon_fireball_explode',
    won: 'music_Victory_Theme',
    wave: 'Sound_TowerArcherTaunt1'
  };
  if (event.type === 'shoot') this.play(event.kind === 'mage' ? 'archmage_attack' : 'Sound_ArrowRelease2', 0.12, 0.17);
  else if (sounds[event.type]) this.play(sounds[event.type], 0.3, 0.2);
};

Sound.prototype.destroy = function () {
  this.stopEffects();
  if (this.music) {
    try { this.music.stop(); this.music.destroy(); } catch (e) {}
    this.music = null;
  }
};

module.exports = Sound;
