/**
 * Local audio. Full path literals so the packer keeps these files in the cutrope subpackage.
 */
var AUDIO = {
  Game_music: '/pages/cutrope/assets/audio/Game_music.mp3',
  Rope_bleak_1: '/pages/cutrope/assets/audio/Rope_bleak_1.mp3',
  Star_1: '/pages/cutrope/assets/audio/Star_1.mp3',
  Star_2: '/pages/cutrope/assets/audio/Star_2.mp3',
  Star_3: '/pages/cutrope/assets/audio/Star_3.mp3',
  Bubble: '/pages/cutrope/assets/audio/Bubble.mp3',
  Bubble_break: '/pages/cutrope/assets/audio/Bubble_break.mp3',
  Rope_get: '/pages/cutrope/assets/audio/Rope_get.mp3',
  Pump_1: '/pages/cutrope/assets/audio/Pump_1.mp3',
  Win: '/pages/cutrope/assets/audio/Win.mp3',
  Candy_break: '/pages/cutrope/assets/audio/Candy_break.mp3',
  ButtonA: '/pages/cutrope/assets/audio/ButtonA.mp3'
};

function Sound() {
  this.enabled = true;
  this.unlocked = false;
  this.paused = false;
  this.music = null;
  this.pool = [];
  this.musicToken = 0;
}

Sound.prototype.unlock = function () {
  this.unlocked = true;
};

Sound.prototype.setEnabled = function (value) {
  this.enabled = !!value;
  if (this.enabled) {
    this.unlock();
    if (!this.paused) this.startMusic();
  } else {
    this.musicToken++;
    if (this.music) {
      try { this.music.stop(); } catch (e) {}
    }
    this.stopEffects();
  }
};

Sound.prototype._create = function (name, loop) {
  var a = wx.createInnerAudioContext();
  a.src = AUDIO[name] || AUDIO.ButtonA;
  a.loop = !!loop;
  a.volume = loop ? 0.15 : 0.65;
  a.obeyMuteSwitch = true;
  return a;
};

Sound.prototype.startMusic = function () {
  if (!this.enabled || this.paused) return;
  if (!this.music) {
    this.music = this._create('Game_music', true);
  }
  try { this.music.play(); } catch (e) {}
};

Sound.prototype.play = function (name) {
  if (!this.enabled || this.paused || !this.unlocked) return;
  var token = this.musicToken;
  this.pool = this.pool.filter(function (a) {
    return a && !a._ended;
  });
  if (this.pool.length >= 6) {
    var old = this.pool.shift();
    try { old.stop(); old.destroy(); } catch (e) {}
  }
  var audio = this._create(name, false);
  var self = this;
  audio.onEnded(function () {
    audio._ended = true;
    try { audio.destroy(); } catch (e) {}
  });
  audio.onError(function () {
    audio._ended = true;
    try { audio.destroy(); } catch (e) {}
  });
  this.pool.push(audio);
  if (token !== this.musicToken) return;
  try { audio.play(); } catch (e) {}
};

Sound.prototype.stopEffects = function () {
  for (var i = 0; i < this.pool.length; i++) {
    try { this.pool[i].stop(); this.pool[i].destroy(); } catch (e) {}
  }
  this.pool = [];
};

Sound.prototype.suspend = function () {
  this.paused = true;
  this.musicToken++;
  if (this.music) {
    try { this.music.pause(); } catch (e) {}
  }
  this.stopEffects();
};

Sound.prototype.resume = function () {
  this.paused = false;
  if (this.enabled) {
    this.unlock();
    this.startMusic();
  }
};

Sound.prototype.destroy = function () {
  this.musicToken++;
  this.stopEffects();
  if (this.music) {
    try { this.music.stop(); this.music.destroy(); } catch (e) {}
    this.music = null;
  }
};

module.exports = Sound;
