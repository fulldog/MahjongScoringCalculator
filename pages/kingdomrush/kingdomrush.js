require('./engine/data.js');
require('./engine/sprites.js');
require('./engine/sounds.js');
const KR = require('./engine/engine.js');
const KRRenderer = require('./engine/renderer.js');
const Sound = require('./engine/sound.js');

const SAVE_KEY = 'atb-kingdomrush-frontiers-v1';
const ASSET = 'https://atbfun.github.io/kingdomrush/assets/';
const BIOME = { desert: '沙漠战役', jungle: '丛林战役', underground: '地下战役' };
const TYPE_ORDER = ['archer', 'barracks', 'mage', 'artillery'];
const MODE_HINT = {
  hero: '点击道路移动英雄',
  rally: '在兵营附近的道路设置集结点',
  fire: '点击道路施放火雨',
  reinforce: '点击道路召唤援军'
};
const MAP_STATUS = {
  ready: '准备布防',
  playing: '战斗进行中',
  paused: '战场已暂停',
  won: '防守成功',
  lost: '防线失守'
};

function readSave() {
  const save = { stars: {}, muted: false, difficulty: 'normal' };
  try {
    const raw = wx.getStorageSync(SAVE_KEY);
    if (!raw || typeof raw !== 'object') return save;
    if (raw.difficulty === 'casual' || raw.difficulty === 'normal' || raw.difficulty === 'veteran') {
      save.difficulty = raw.difficulty;
    }
    save.muted = !!raw.muted;
    const stars = raw.stars || {};
    for (let i = 1; i <= 15; i++) {
      const n = Number(stars[i] != null ? stars[i] : stars[String(i)]);
      if (n >= 1 && n <= 3) save.stars[i] = n;
    }
  } catch (e) {}
  return save;
}

function artOf(name) {
  const sprite = globalThis.KR_SPRITES && globalThis.KR_SPRITES[name];
  return sprite ? ASSET + sprite.file : '';
}

Page({
  data: {
    pageH: 600,
    cardW: 320,
    boardH: 240,
    missionNo: '01',
    biome: '沙漠战役',
    missionName: '沙锤营地',
    lives: 20,
    gold: 300,
    waveText: '0 / 6',
    mapStatus: '准备布防',
    mode: '',
    modeHint: '',
    heroArt: '',
    heroStatus: '英雄 · Lv.1',
    fireReady: false,
    fireLabel: '范围轰击',
    reinforceReady: false,
    reinforceLabel: '支援防线',
    speedLabel: '1×',
    status: 'ready',
    tip: '先点击空地建造防御塔，再召唤敌人。',
    waveLabel: '召唤第 1 波',
    waveDisabled: true,
    sheetTitle: '构筑你的防线',
    sheetDesc: '选择一处建造点，部署你的第一座防御塔。',
    sheetMode: 'build',
    towerCards: [],
    upgrades: [],
    showRally: false,
    sellLabel: '',
    towerStats: '',
    siteCount: '12 处空地',
    showRanges: false,
    showIntro: true,
    showPause: false,
    showResult: false,
    showHelp: false,
    showCampaign: false,
    toast: '',
    difficulty: 'normal',
    stages: [],
    resultEyebrow: '',
    resultStars: '',
    resultTitle: '',
    resultDesc: '',
    showNext: false,
    nextLabel: '前往下一关 →',
    muted: false
  },

  onLoad() {
    this.save = readSave();
    this.sound = new Sound();
    this.sound.muted = this.save.muted;
    this.selected = -1;
    this.mode = null;
    this.rallyIndex = -1;
    this.speed = 1;
    this.accumulator = 0;
    this.running = false;
    this.showIntro = true;
    this.autoResume = null;
    this.hiddenPause = false;
    this.hudSig = '';
    this.sheetSig = '';
    this.measureTries = 0;
    this.layout();
    this.setData({
      heroArt: artOf('SoldierHeroAlric'),
      muted: this.save.muted,
      difficulty: this.save.difficulty
    });
    this.initGame(0, false);
  },

  onHide() {
    if (this.game && this.game.status === 'playing') {
      this.game.pause();
      this.hiddenPause = true;
    }
    if (this.sound) this.sound.suspend(true);
    this.publish(true);
  },

  onShow() {
    if (this.hiddenPause && this.game && this.game.status === 'paused' && !this.data.showPause && !this.data.showCampaign && !this.data.showHelp) {
      this.game.pause();
      this.hiddenPause = false;
    }
    if (this.sound) this.sound.suspend(this.game && this.game.status === 'paused');
    this.lastTs = 0;
    this.publish(true);
  },

  onUnload() {
    this.running = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.sound) this.sound.destroy();
  },

  layout() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const winW = info.windowWidth || 375;
    const winH = info.windowHeight || 667;
    const sheetMin = 196;
    const chrome = 18 + 48 + 2 + 56 + 44 + 8 + sheetMin;
    let cardW = Math.round(winW - 16);
    let boardH = Math.round(cardW * 3 / 4);
    const maxH = winH - chrome;
    if (boardH > maxH) {
      boardH = Math.max(140, Math.floor(maxH));
      const fitW = Math.round(boardH * 4 / 3);
      if (fitW < cardW) cardW = fitW;
    }
    this.dpr = Math.min(2, info.pixelRatio || 1);
    this.setData({ pageH: winH, cardW: cardW, boardH: boardH });
  },

  persist() {
    try {
      wx.setStorageSync(SAVE_KEY, this.save);
    } catch (e) {}
  },

  initGame(index, begin) {
    const self = this;
    this.game = new KR.Game({
      levelIndex: index,
      difficulty: this.save.difficulty,
      onEvent: function (event) { self.onGameEvent(event); }
    });
    this.selected = -1;
    this.mode = null;
    this.rallyIndex = -1;
    this.speed = 1;
    this.accumulator = 0;
    this.showIntro = !begin;
    this.autoResume = null;
    this.hiddenPause = false;
    this.hudSig = '';
    this.sheetSig = '';
    if (this.stage) {
      this.stage.selected = -1;
      this.stage.hover = -1;
      this.stage.mode = null;
      this.stage.assets.get(this.game.level.map);
    }
    if (begin) {
      this.game.start();
      this.sound.unlock();
      this.sound.musicName = '';
      this.sound.suspend(false);
      this.sound.setMusic(this.game.level.biome, false);
    }
    this.setData({
      showIntro: this.showIntro,
      showPause: false,
      showResult: false,
      showHelp: false,
      showCampaign: false,
      mode: ''
    }, () => this.syncCanvas());
    this.publish(true);
  },

  modalOpen() {
    const data = this.data || {};
    return !!(data.showHelp || data.showPause || data.showResult || data.showCampaign);
  },

  syncCanvas() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.modalOpen()) return;
    this.measureTries = 0;
    this.canvasNode = null;
    setTimeout(() => {
      if (!this.modalOpen()) this.bootCanvas();
    }, 40);
  },

  bootCanvas() {
    const query = wx.createSelectorQuery();
    query.in(this).select('#krCanvas').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node || !info.width || info.width < 8 || !info.height || info.height < 8) {
        this.measureTries = (this.measureTries || 0) + 1;
        if (this.measureTries < 12) setTimeout(() => this.bootCanvas(), 80);
        return;
      }
      const canvas = info.node;
      const dpr = this.dpr || 1;
      canvas.width = Math.round(800 * dpr);
      canvas.height = Math.round(600 * dpr);
      this.canvasNode = canvas;
      if (!this.stage) this.stage = new KRRenderer.Renderer(canvas);
      else {
        this.stage.canvas = canvas;
        this.stage.ctx = canvas.getContext('2d');
        this.stage.assets.images = new Map();
        this.stage.assets.failed = new Set();
        this.stage.assets.bind(canvas);
      }
      this.stage.dpr = dpr;
      this.stage.selected = this.selected;
      this.stage.mode = this.mode;
      this.stage.assets.get(this.game.level.map);
      this.measureRect();
      this.stage.draw(this.game);
      this.startLoop();
    });
  },

  measureRect() {
    wx.createSelectorQuery().in(this).select('#krCanvas').boundingClientRect((rect) => {
      if (rect && rect.width > 8 && rect.height > 8) this.canvasRect = rect;
    }).exec();
  },

  startLoop() {
    if (this.running || !this.canvasNode || !this.canvasNode.requestAnimationFrame) {
      if (!this.running && this.canvasNode && !this.canvasNode.requestAnimationFrame) this.startTimerLoop();
      return;
    }
    this.running = true;
    this.lastTs = 0;
    const canvas = this.canvasNode;
    const step = (ts) => {
      if (!this.running) return;
      this.frame(ts || Date.now());
      canvas.requestAnimationFrame(step);
    };
    canvas.requestAnimationFrame(step);
  },

  startTimerLoop() {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    const step = () => {
      if (!this.running) return;
      this.frame(Date.now());
      this.timer = setTimeout(step, 16);
    };
    step();
  },

  frame(ts) {
    const last = this.lastTs || ts;
    let dt = Math.min(0.1, Math.max(0, (ts - last) / 1000));
    this.lastTs = ts;
    const g = this.game;
    if (g && g.status === 'playing') {
      this.accumulator += dt * this.speed;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps < 8) {
        g.tick(1 / 60);
        this.accumulator -= 1 / 60;
        steps += 1;
      }
    }
    if (this.stage && g) {
      try { this.stage.draw(g); } catch (e) {}
    }
    this.uiTimer = (this.uiTimer || 0) + dt;
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0;
      this.publish(false);
    }
  },

  onGameEvent(event) {
    if (this.sound) this.sound.event(event);
    if (!this.game) return;
    if (event.type === 'wave') this.sound.setMusic(this.game.level.biome, true);
    if (event.type === 'won') {
      const stars = event.stars || 1;
      require('../../utils/minigame-report.js').report({
        game: 'kingdomrush',
        result: 'win',
        score: stars * 1000 + (this.game.lives || 0),
        levelNo: this.game.level.id,
        stars
      });
      const id = this.game.level.id;
      this.save.stars[id] = Math.max(this.save.stars[id] || 0, stars);
      this.persist();
      this.openResult(true, stars);
    } else if (event.type === 'lost') {
      require('../../utils/minigame-report.js').report({
        game: 'kingdomrush',
        result: 'lose',
        score: this.game.kills || 0,
        levelNo: this.game.level.id,
        stars: 0
      });
      this.openResult(false, 0);
    }
  },

  publish(force) {
    const g = this.game;
    if (!g) return;
    const fireSec = Math.ceil(g.cooldowns.fire || 0);
    const reSec = Math.ceil(g.cooldowns.reinforce || 0);
    const nextIn = Number.isFinite(g.nextIn) ? Math.ceil(Math.max(0, g.nextIn)) : -1;
    const heroKey = g.hero.hp > 0 ? g.hero.level : Math.ceil(g.hero.respawn || 0);
    const hudSig = [g.gold, g.lives, g.wave, g.status, fireSec, reSec, nextIn, heroKey, this.mode || '', this.speed, this.showIntro ? 1 : 0, this.selected].join('|');
    const tower = g.towerAt(this.selected);
    const sheetSig = [this.selected, tower ? tower.level : 0, tower ? (tower.branch || '') : '', tower ? tower.spent : 0, g.gold, g.status, this.showIntro ? 1 : 0].join('|');
    if (!force && hudSig === this.hudSig && sheetSig === this.sheetSig) return;
    const sheetChanged = force || sheetSig !== this.sheetSig;
    this.hudSig = hudSig;
    this.sheetSig = sheetSig;
    const playing = g.status === 'playing';
    const patch = {
      missionNo: String(g.level.id).padStart(2, '0'),
      biome: BIOME[g.level.biome] || '战役',
      missionName: g.level.name,
      lives: g.lives,
      gold: g.gold,
      waveText: g.wave + ' / ' + g.level.waves.length,
      mapStatus: g.status === 'playing' && !g.wave ? '准备布防' : (MAP_STATUS[g.status] || ''),
      mode: this.mode || '',
      modeHint: MODE_HINT[this.mode] || '',
      heroStatus: g.hero.hp > 0 ? ('英雄 · Lv.' + g.hero.level) : ('复活 ' + Math.ceil(g.hero.respawn || 0) + 's'),
      fireReady: playing && fireSec <= 0,
      fireLabel: fireSec > 0 ? (fireSec + ' 秒后就绪') : '范围轰击',
      reinforceReady: playing && reSec <= 0,
      reinforceLabel: reSec > 0 ? (reSec + ' 秒后就绪') : '支援防线',
      speedLabel: this.speed + '×',
      status: g.status,
      tip: this.tipText(g, nextIn),
      waveLabel: g.wave >= g.level.waves.length ? '抵御最后的敌人' : ('召唤第 ' + (g.wave + 1) + ' 波'),
      waveDisabled: g.status !== 'playing' || g.wave >= g.level.waves.length,
      siteCount: (g.holders.length - g.towers.length) + ' 处空地',
      showRanges: !!(this.stage && this.stage.showRanges),
      showIntro: this.showIntro,
      muted: this.sound ? this.sound.muted : false
    };
    if (sheetChanged) Object.assign(patch, this.sheetPatch(g, tower));
    this.setData(patch);
  },

  tipText(g, nextIn) {
    if (g.status === 'paused') return '战场已暂停，可以从容规划。';
    if (g.status === 'won') return '防守成功，战果已保存。';
    if (g.status === 'lost') return '重新部署，尝试不同的防御组合。';
    if (!g.wave) return '先点击空地建造防御塔，再召唤敌人。';
    if (nextIn >= 0) return '下一波 ' + nextIn + ' 秒 · 提前迎敌可获得金币。';
    return '最后一波，守住防线！';
  },

  sheetPatch(g, tower) {
    if (!tower) {
      const title = this.selected >= 0 ? ('建造点 ' + String(this.selected + 1).padStart(2, '0')) : '构筑你的防线';
      const desc = this.selected >= 0 ? '选择一座防御塔，让这里成为坚固的防线。' : '选择一处建造点，部署你的第一座防御塔。';
      return {
        sheetMode: 'build',
        sheetTitle: title,
        sheetDesc: desc,
        towerCards: TYPE_ORDER.map((type) => {
          const cost = g.stats(type).cost;
          return {
            type: type,
            name: KR.TYPES[type].name,
            cost: cost,
            art: artOf(KRRenderer.towerNames[type][0]),
            disabled: this.showIntro || !g.interactive() || g.gold < cost
          };
        }),
        upgrades: [],
        showRally: false,
        sellLabel: '',
        towerStats: ''
      };
    }
    const stats = g.stats(tower.type, tower.level, tower.branch);
    const damage = stats.minDamage + '–' + stats.maxDamage + (tower.type === 'archer' ? ' ×2' : '');
    const extra = tower.type === 'barracks' ? '3 名士兵' : (((stats.reload || 30) / 30).toFixed(1) + ' 秒');
    const upgrades = [];
    if (tower.level < 3) {
      const cost = g.stats(tower.type, tower.level + 1).cost;
      upgrades.push({
        branch: '',
        label: '升级至 ' + (tower.level + 1) + ' 级',
        cost: cost,
        disabled: !g.interactive() || g.gold < cost
      });
    } else if (tower.level === 3) {
      KR.TYPES[tower.type].branches.forEach((branch) => {
        const cost = g.stats(tower.type, 4, branch).cost;
        upgrades.push({
          branch: branch,
          label: KR.BRANCHES[branch],
          cost: cost,
          disabled: !g.interactive() || g.gold < cost
        });
      });
    }
    return {
      sheetMode: 'tower',
      sheetTitle: (KR.BRANCHES[tower.branch] || KR.TYPES[tower.type].name) + '  Lv.' + tower.level,
      sheetDesc: KR.TYPES[tower.type].description,
      towerCards: [],
      upgrades: upgrades,
      showRally: tower.type === 'barracks',
      sellLabel: '出售防御塔 · 返还 ' + Math.floor(tower.spent * 0.6) + ' 金币',
      towerStats: (tower.type === 'barracks' ? '士兵伤害 ' : '攻击伤害 ') + damage + ' · ' + extra
    };
  },

  pointFrom(touch) {
    const rect = this.canvasRect || { left: 0, top: 0, width: this.data.cardW, height: this.data.boardH };
    const x = touch.clientX != null ? touch.clientX : touch.x;
    const y = touch.clientY != null ? touch.clientY : touch.y;
    return {
      x: (x - rect.left) * 800 / (rect.width || 1),
      y: (y - rect.top) * 600 / (rect.height || 1)
    };
  },

  nearestSite(point) {
    const width = (this.canvasRect && this.canvasRect.width) || this.data.cardW || 320;
    const radius = Math.max(26, 22 * 800 / width);
    let best = -1;
    let bestD = radius;
    const holders = this.game.holders;
    for (let i = 0; i < holders.length; i++) {
      const d = Math.hypot(holders[i].x - point.x, holders[i].y - point.y);
      if (d < bestD) {
        bestD = d;
        best = holders[i].index;
      }
    }
    return best;
  },

  setMode(value, rallyIndex) {
    this.mode = value;
    this.rallyIndex = value === 'rally' ? rallyIndex : -1;
    if (this.stage) this.stage.mode = value;
    this.publish(true);
  },

  selectSite(index) {
    this.selected = this.game.holders[index] ? index : -1;
    if (this.stage) this.stage.selected = this.selected;
    this.setMode(null);
    this.sheetSig = '';
    this.publish(true);
  },

  toast(message) {
    this.setData({ toast: message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.setData({ toast: '' });
    }, 1600);
  },

  onStart() {
    if (!this.game || this.game.status !== 'ready') return;
    this.sound.unlock();
    this.showIntro = false;
    this.game.start();
    this.sound.musicName = '';
    this.sound.setMusic(this.game.level.biome, false);
    this.setData({ showIntro: false });
    this.toast('选择建造点布防，准备好后召唤第一波。');
    this.publish(true);
  },

  onTouchStart(e) {
    if (this.showIntro || this.data.showPause || this.data.showResult || this.data.showHelp || this.data.showCampaign) return;
    if (!this.game || !this.game.interactive()) return;
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;
    this.sound.unlock();
    if (!this.canvasRect) this.measureRect();
    const point = this.pointFrom(touch);
    if (this.stage) {
      this.stage.pointer = point;
      this.stage.hover = this.nearestSite(point);
    }
    if (this.mode) {
      const ok = this.mode === 'hero'
        ? this.game.moveHero(point.x, point.y)
        : this.mode === 'rally'
          ? this.game.rally(this.rallyIndex, point.x, point.y)
          : this.game.cast(this.mode, point.x, point.y);
      if (ok) {
        this.setMode(null);
      } else {
        this.toast('请在有效的道路位置选择目标。');
      }
      return;
    }
    const site = this.nearestSite(point);
    if (site >= 0) {
      this.selectSite(site);
      return;
    }
    if (Math.hypot(this.game.hero.x - point.x, this.game.hero.y - point.y) < 28) {
      this.setMode('hero');
      return;
    }
    this.selectSite(-1);
  },

  onTouchMove(e) {
    if (!this.stage || !this.game) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const point = this.pointFrom(touch);
    this.stage.pointer = point;
    this.stage.hover = this.nearestSite(point);
  },

  onTouchEnd() {
    if (this.stage) this.stage.hover = -1;
  },

  preventMove() {},

  onBuild(e) {
    const type = e.currentTarget.dataset.type;
    if (this.showIntro) {
      this.toast('请先点击「开始守卫」。');
      return;
    }
    if (this.selected < 0) {
      this.toast('先在战场上选择建造点。');
      return;
    }
    this.sound.unlock();
    if (this.game.build(this.selected, type)) this.publish(true);
    else this.toast('此处无法建造，或金币不足。');
  },

  onUpgrade(e) {
    const branch = e.currentTarget.dataset.branch || null;
    this.sound.unlock();
    if (this.game.upgrade(this.selected, branch)) this.publish(true);
    else this.toast('金币不足或该塔已达到最高等级。');
  },

  onSell() {
    this.sound.unlock();
    if (this.game.sell(this.selected)) {
      this.sheetSig = '';
      this.publish(true);
    }
  },

  onRally() {
    if (this.showIntro || !this.game.interactive()) return;
    this.setMode('rally', this.selected);
  },

  onHero() {
    if (this.showIntro) return;
    if (!this.game.interactive() || this.game.hero.hp <= 0) return;
    this.sound.unlock();
    this.setMode(this.mode === 'hero' ? null : 'hero');
  },

  onFire() { this.useSkill('fire'); },
  onReinforce() { this.useSkill('reinforce'); },

  useSkill(name) {
    if (this.game.status !== 'playing') {
      this.toast('开始战斗后可使用技能。');
      return;
    }
    if (this.game.cooldowns[name] > 0) {
      this.toast('技能还在冷却中。');
      return;
    }
    this.sound.unlock();
    this.setMode(this.mode === name ? null : name);
  },

  onWave() {
    if (!this.game || this.game.status !== 'playing') return;
    this.sound.unlock();
    if (this.game.nextWave()) {
      this.toast('第 ' + this.game.wave + ' 波来袭，守住防线！');
      this.publish(true);
    }
  },

  onSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    this.publish(true);
  },

  onPause() {
    if (!this.game) return;
    if (this.game.status === 'paused' && this.data.showPause) {
      this.onResume();
      return;
    }
    if (this.game.status !== 'playing') return;
    this.game.pause();
    this.setMode(null);
    this.sound.suspend(true);
    this.running = false;
    this.setData({ showPause: true });
    this.publish(true);
  },

  onResume() {
    if (this.game && this.game.status === 'paused') this.game.pause();
    this.sound.suspend(false);
    this.lastTs = 0;
    this.setData({ showPause: false, showHelp: false }, () => this.syncCanvas());
    this.publish(true);
  },

  onRestart() {
    this.sound.suspend(false);
    this.initGame(this.game.levelIndex, true);
  },

  openResult(won, stars) {
    this.setMode(null);
    if (this.sound && this.sound.music) {
      try { this.sound.music.pause(); } catch (e) {}
    }
    const g = this.game;
    this.running = false;
    this.setData({
      showResult: true,
      showPause: false,
      resultEyebrow: won ? 'VICTORY' : 'TRY ANOTHER STRATEGY',
      resultStars: won ? ('✦'.repeat(stars) + '✧'.repeat(3 - stars)) : '防线失守',
      resultTitle: won ? '防线，屹立不倒。' : '再来一次，指挥官。',
      resultDesc: g.level.name + ' · 击败 ' + g.kills + ' 名敌人 · 剩余 ' + g.lives + ' 生命',
      showNext: !!won,
      nextLabel: g.level.id === 15 ? '战役完成 · 查看地图' : '前往下一关 →'
    });
    this.publish(true);
  },

  onNext() {
    if (!this.game) return;
    if (this.game.levelIndex >= 14) this.openCampaign();
    else this.initGame(this.game.levelIndex + 1, true);
  },

  openHelp() {
    this.setMode(null);
    if (this.game.status === 'playing') {
      this.game.pause();
      this.autoResume = 'help';
      this.sound.suspend(true);
    }
    this.running = false;
    this.setData({ showHelp: true });
    this.publish(true);
  },

  closeHelp() {
    this.setData({ showHelp: false }, () => this.syncCanvas());
    if (this.autoResume === 'help' && this.game.status === 'paused') {
      this.game.pause();
      this.sound.suspend(false);
      this.lastTs = 0;
    }
    this.autoResume = null;
    this.publish(true);
  },

  openCampaign() {
    this.setMode(null);
    const fromPause = this.data.showPause;
    if (this.game.status === 'playing') {
      this.game.pause();
      this.sound.suspend(true);
    }
    this.autoResume = 'campaign';
    if (fromPause) this.autoResume = 'campaign';
    this.running = false;
    this.setData({
      showPause: false,
      showResult: false,
      showCampaign: true,
      difficulty: this.save.difficulty,
      stages: this.stageList()
    });
    this.publish(true);
  },

  closeCampaign() {
    this.setData({ showCampaign: false }, () => this.syncCanvas());
    if (this.autoResume === 'campaign' && this.game && this.game.status === 'paused') {
      this.game.pause();
      this.sound.suspend(false);
      this.lastTs = 0;
    }
    this.autoResume = null;
    this.publish(true);
  },

  stageList() {
    const current = this.game ? this.game.level.id : 0;
    return globalThis.KR_DATA.levels.map((level) => {
      const stars = this.save.stars[level.id] || 0;
      return {
        index: level.id - 1,
        no: String(level.id).padStart(2, '0'),
        name: level.name,
        map: ASSET + level.map,
        current: level.id === current,
        starText: stars ? '✦'.repeat(stars) : '等待你的指挥'
      };
    });
  },

  setDifficulty(e) {
    const diff = e.currentTarget.dataset.diff;
    if (diff !== 'casual' && diff !== 'normal' && diff !== 'veteran') return;
    this.save.difficulty = diff;
    this.persist();
    this.setData({ difficulty: diff });
  },

  pickStage(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(index)) return;
    this.sound.unlock();
    this.sound.suspend(false);
    this.initGame(index, true);
    this.toast('已抵达' + this.game.level.name + '，准备布防。');
  },

  toggleRanges() {
    if (!this.stage) return;
    this.stage.showRanges = !this.stage.showRanges;
    this.publish(true);
  },

  toggleMute() {
    this.sound.unlock();
    this.save.muted = this.sound.toggle();
    this.persist();
    this.setData({ muted: this.sound.muted });
  },

  cancelMode() {
    this.setMode(null);
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
