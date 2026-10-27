const LEVELS = require('./engine/levels_data.js');
const Physics = require('./engine/physics.js');
const Renderer = require('./engine/render.js');
const Assets = require('./engine/assets.js');
const Sound = require('./engine/sound.js');

const SAVE_KEY = 'atb-cutrope-v1';
const SOUND_MAP = {
  cut: 'Rope_bleak_1',
  star: null, // filled dynamically
  bubble: 'Bubble',
  pop: 'Bubble_break',
  attach: 'Rope_get',
  pump: 'Pump_1',
  won: 'Win',
  lost: 'Candy_break'
};

Page({
  data: {
    navPadTop: 24,
    menuRightPad: 96,
    boxTitle: '纸盒时光',
    levelNum: 1,
    collected: 0,
    totalStars: 0,
    muted: false,
    mode: 'ready',
    showOverlay: true,
    overlayTag: 'HELLO, LITTLE FRIEND',
    overlayTitle: 'Om Nom 饿啦！',
    overlayText: '划过绳索，收集星星，\n把糖果送到它的嘴边。',
    primaryLabel: '开始喂食 →',
    showSecondary: false,
    resultStars: '',
    showLevelsModal: false,
    showHelpModal: false,
    dialogBox: 1,
    levelGrid: []
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Number(info.statusBarHeight) || 20;
    let menuRightPad = 96;
    try {
      if (wx.getMenuButtonBoundingClientRect) {
        const menuRect = wx.getMenuButtonBoundingClientRect();
        if (menuRect && menuRect.left) {
          menuRightPad = (info.windowWidth - menuRect.left) + 8;
        }
      }
    } catch (e) {}

    this.saved = this.loadSave();
    this.sound = new Sound();
    this.sound.setEnabled(this.saved.sound !== false);
    this.index = this.saved.last || 0;
    this.world = null;
    this.mode = 'ready';
    this.pointer = null;
    this.accumulator = 0;
    this.terminalAt = 0;
    this.lastFrame = Date.now();
    this.dialogResume = 'ready';

    this.setData({
      navPadTop: statusBarHeight + 6,
      menuRightPad: Math.max(88, menuRightPad),
      muted: !this.saved.sound,
      totalStars: this.calcTotalStars()
    });
  },

  onReady() {
    this.initCanvas();
  },

  onUnload() {
    this.stopLoop();
    if (this.sound) this.sound.destroy();
  },

  onHide() {
    if (this.mode === 'playing') this.pauseGame();
  },

  loadSave() {
    const blank = { scores: {}, last: 0, sound: true };
    try {
      const data = wx.getStorageSync(SAVE_KEY);
      if (!data || typeof data !== 'object') return blank;
      const saved = { scores: {}, last: 0, sound: data.sound !== false };
      saved.last = Number.isInteger(data.last) && data.last >= 0 && data.last < 50 ? data.last : 0;
      if (data.scores && typeof data.scores === 'object') {
        Object.keys(data.scores).forEach((k) => {
          const v = data.scores[k];
          if (/^\d+$/.test(k) && +k < 50 && Number.isInteger(v) && v >= 0 && v <= 3) {
            saved.scores[k] = v;
          }
        });
      }
      return saved;
    } catch (e) {
      return blank;
    }
  },

  persist() {
    try {
      wx.setStorageSync(SAVE_KEY, this.saved);
    } catch (e) {}
  },

  calcTotalStars() {
    return Object.values(this.saved.scores).reduce((a, b) => a + b, 0);
  },

  initCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#cutropeCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.warn('Cutrope canvas not ready');
          return;
        }
        const canvas = res[0].node;
        this.canvasNode = canvas;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = Math.min(2.5, info.pixelRatio || 2);
        this.dpr = dpr;
        const rectWidth = res[0].width || 360;
        const rectHeight = res[0].height || 480;
        this.canvasWidth = rectWidth;
        this.canvasHeight = rectHeight;

        Assets.setCanvas(canvas);
        this.renderer = new Renderer(canvas, Assets);
        this.renderer.resize(rectWidth, rectHeight, dpr);
        Assets.preload(Assets.IMAGE_IDS, canvas).catch(() => {});

        this.updateCanvasBounds();
        this.loadLevel(this.index, false);
        this.startLoop();
      });
  },

  updateCanvasBounds(retry) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#cutropeCanvas').boundingClientRect((rect) => {
      if (!rect || rect.width < 8 || rect.height < 8) {
        if ((retry || 0) < 10) {
          setTimeout(() => this.updateCanvasBounds((retry || 0) + 1), 60);
        }
        return;
      }
      this.canvasRect = rect;
      if (this.renderer) {
        this.renderer.resize(rect.width, rect.height, this.dpr);
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        if (this.world) {
          try { this.renderer.draw(this.world, Date.now()); } catch (e) {}
        }
      }
    }).exec();
  },

  setMode(mode) {
    this.mode = mode;
    this.setData({ mode });
  },

  overlay(tag, title, text, primary, secondary) {
    this.setData({
      showOverlay: true,
      overlayTag: tag,
      overlayTitle: title,
      overlayText: text,
      primaryLabel: primary + (primary.indexOf('→') >= 0 ? '' : ' →'),
      showSecondary: !!secondary,
      resultStars: this.mode === 'won' && this.world
        ? ('★'.repeat(this.world.collected) + '☆'.repeat(3 - this.world.collected))
        : ''
    });
  },

  hideOverlay() {
    this.setData({ showOverlay: false });
  },

  loadLevel(next, play) {
    if (play == null) play = true;
    if (!LEVELS || !LEVELS.length) {
      this.overlay('OOPS', '关卡资源未能载入', '请确认 levels_data.js 已打入小程序包。', '重试');
      return;
    }
    this.index = Physics.clamp(next, 0, 49);
    this.world = new Physics.World(LEVELS[this.index]);
    this.setMode(play ? 'playing' : 'ready');
    if (this.renderer) this.renderer.reset();
    this.pointer = null;
    this.accumulator = 0;
    this.terminalAt = 0;
    this.saved.last = this.index;
    this.persist();

    const level = this.world.level;
    const tipObj = level.objects.find((o) => o.type === 'tutorialText');
    let tip = tipObj && tipObj.text;
    if (!tip) {
      if (level.objects.some((o) => o.spider === 'true')) tip = '蜘蛛也在惦记糖果，\n及时切断它的绳子。';
      else if (this.world.pumps.length) tip = '点击蓝色气垫，\n给糖果一个轻巧的推力。';
      else if (this.world.bubbles.length) tip = '气泡会带糖果上升，\n轻点气泡，让它落下。';
      else tip = '有时，放手的时机\n比方向更重要。';
    }

    this.setData({
      boxTitle: level.box === 1 ? '纸盒时光' : '布盒奇遇',
      levelNum: level.number,
      collected: 0,
      totalStars: this.calcTotalStars(),
      showLevelsModal: false
    });

    if (!play) {
      this.overlay('HELLO, LITTLE FRIEND', 'Om Nom 饿啦！', '划过绳索，收集星星，把糖果送到它的嘴边。', '开始喂食');
    } else {
      this.hideOverlay();
      this.sound.resume();
    }

    if (this.renderer && this.world) {
      try { this.renderer.draw(this.world, Date.now()); } catch (e) {}
    }
  },

  processEvents() {
    if (!this.world) return;
    const events = this.world.events.splice(0);
    if (!events.length) return;
    let collectedChanged = false;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (this.renderer) this.renderer.burst(e);
      let name = SOUND_MAP[e.type] || 'ButtonA';
      if (e.type === 'star') name = 'Star_' + this.world.collected;
      this.sound.play(name);
      if (e.type === 'star') {
        collectedChanged = true;
      }
      if (e.type === 'won') {
        require('../../utils/minigame-report.js').report({
          game: 'cutrope',
          result: 'win',
          score: this.world.collected || 0,
          levelNo: this.index + 1,
          stars: this.world.collected || 0
        });
        this.setMode('won');
        this.terminalAt = Date.now() + 650;
        const prev = this.saved.scores[this.index] || 0;
        this.saved.scores[this.index] = Math.max(prev, this.world.collected);
        this.persist();
        this.setData({ totalStars: this.calcTotalStars() });
      }
      if (e.type === 'lost') {
        require('../../utils/minigame-report.js').report({
          game: 'cutrope',
          result: 'lose',
          score: this.world.collected || 0,
          levelNo: this.index + 1,
          stars: this.world.collected || 0
        });
        this.setMode('lost');
        this.terminalAt = Date.now() + 400;
      }
    }
    if (collectedChanged) {
      this.setData({ collected: this.world.collected });
    }
  },

  showTerminal() {
    this.terminalAt = 0;
    if (this.mode === 'won') {
      const perfect = this.world.collected === 3;
      const last = this.index === 49;
      this.overlay(
        'SWEET LITTLE VICTORY',
        perfect ? '完美投喂！' : '好吃，谢谢你！',
        last ? '50 份快乐，最后一份也送到了。继续收集剩下的星星吧。' : 'Om Nom 很满足。下一颗糖果，正在等你。',
        last ? '回到第一关' : '下一关',
        true
      );
    }
    if (this.mode === 'lost') {
      this.overlay('ONE MORE LITTLE TRY', '差一点点，再来一次。', this.world.reason || '再试一次吧。', '重新开始');
    }
  },

  startLoop() {
    this.running = true;
    this.lastFrame = Date.now();
    const frame = () => {
      if (!this.running) return;
      const now = Date.now();
      const elapsed = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;

      if (this.mode === 'playing' && this.world) {
        this.accumulator += elapsed;
        while (this.accumulator >= 1 / 60 && this.mode === 'playing') {
          this.world.step();
          this.processEvents();
          this.accumulator -= 1 / 60;
        }
      } else {
        this.accumulator = 0;
      }

      if (this.terminalAt && now >= this.terminalAt && (this.mode === 'won' || this.mode === 'lost')) {
        this.showTerminal();
      }

      if (this.renderer && this.world) {
        try { this.renderer.draw(this.world, now); } catch (e) {}
      }

      if (this.canvasNode && typeof this.canvasNode.requestAnimationFrame === 'function') {
        this.animId = this.canvasNode.requestAnimationFrame(frame);
      } else {
        this.animId = setTimeout(frame, 16);
      }
    };

    if (this.canvasNode && typeof this.canvasNode.requestAnimationFrame === 'function') {
      this.animId = this.canvasNode.requestAnimationFrame(frame);
    } else {
      this.animId = setTimeout(frame, 16);
    }
  },

  stopLoop() {
    this.running = false;
    if (this.canvasNode && typeof this.canvasNode.cancelAnimationFrame === 'function') {
      this.canvasNode.cancelAnimationFrame(this.animId);
    } else {
      clearTimeout(this.animId);
    }
  },

  unlockSound() {
    this.sound.unlock();
    this.sound.setEnabled(this.saved.sound !== false);
  },

  onPrimary() {
    this.unlockSound();
    if (this.mode === 'ready') {
      this.setMode('playing');
      this.hideOverlay();
      this.accumulator = 0;
      this.sound.resume();
    } else if (this.mode === 'paused') {
      this.resumeGame();
    } else if (this.mode === 'lost') {
      this.loadLevel(this.index, true);
    } else if (this.mode === 'won') {
      this.loadLevel(this.index === 49 ? 0 : this.index + 1, true);
    }
  },

  onSecondary() {
    this.unlockSound();
    this.loadLevel(this.index, true);
  },

  restartLevel() {
    this.unlockSound();
    this.loadLevel(this.index, true);
  },

  pauseGame() {
    if (this.mode !== 'playing') return;
    this.setMode('paused');
    this.pointer = null;
    this.accumulator = 0;
    this.sound.suspend();
    this.overlay('TAKE A LITTLE BREAK', '休息一下，甜蜜还在。', '绳索和糖果会等你回来。', '继续游戏');
  },

  resumeGame() {
    if (this.mode !== 'paused') return;
    this.setMode('playing');
    this.hideOverlay();
    this.accumulator = 0;
    this.sound.resume();
  },

  togglePause() {
    this.unlockSound();
    if (this.mode === 'playing') this.pauseGame();
    else if (this.mode === 'paused') this.resumeGame();
  },

  toggleMute() {
    this.saved.sound = !this.saved.sound;
    this.persist();
    this.unlockSound();
    this.setData({ muted: !this.saved.sound });
  },

  buildLevelGrid() {
    const box = this.dialogBox;
    const grid = [];
    for (let i = (box - 1) * 25; i < box * 25; i++) {
      const s = this.saved.scores[i] || 0;
      grid.push({
        index: i,
        label: String((i % 25) + 1).padStart(2, '0'),
        stars: s,
        starsText: '★'.repeat(s) + '☆'.repeat(3 - s),
        current: i === this.index
      });
    }
    this.setData({ levelGrid: grid, dialogBox: box });
  },

  openLevels() {
    this.unlockSound();
    this.dialogResume = this.mode;
    if (this.mode === 'playing') {
      this.sound.suspend();
    }
    this.setMode('menu');
    this.pointer = null;
    this.dialogBox = this.world ? this.world.level.box : 1;
    this.buildLevelGrid();
    this.setData({ showLevelsModal: true, dialogBox: this.dialogBox });
  },

  closeLevels() {
    this.setData({ showLevelsModal: false });
    if (this.mode === 'menu') {
      this.setMode(this.dialogResume || 'ready');
      this.accumulator = 0;
      if (this.mode === 'playing') this.sound.resume();
    }
  },

  selectBox(e) {
    this.dialogBox = Number(e.currentTarget.dataset.box) || 1;
    this.buildLevelGrid();
  },

  pickLevel(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (!Number.isFinite(idx)) return;
    this.unlockSound();
    this.loadLevel(idx, true);
  },

  openHelp() {
    this.setData({ showHelpModal: true });
  },

  closeHelp() {
    this.setData({ showHelpModal: false });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) });
  },

  preventMove() {},

  touchToClient(touch) {
    // WeChat touch: clientX/Y are relative to page viewport
    return {
      x: touch.clientX != null ? touch.clientX : touch.x,
      y: touch.clientY != null ? touch.clientY : touch.y
    };
  },

  onTouchStart(e) {
    if (this.mode !== 'playing' || !this.world || !this.renderer) return;
    if (this.pointer) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    this.unlockSound();
    const c = this.touchToClient(t);
    const rect = this.canvasRect || { left: 0, top: 0 };
    const p = this.renderer.toWorld(c.x, c.y, rect);
    this.world.tap(p);
    this.processEvents();
    this.pointer = { id: t.identifier, p: p };
    this.renderer.trail = [{ x: p.x, y: p.y, at: Date.now() }];
  },

  onTouchMove(e) {
    if (this.mode !== 'playing' || !this.pointer || !this.world || !this.renderer) return;
    const touches = e.changedTouches || [];
    const rect = this.canvasRect || { left: 0, top: 0 };
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier !== this.pointer.id) continue;
      const c = this.touchToClient(t);
      const p = this.renderer.toWorld(c.x, c.y, rect);
      this.world.swipe(this.pointer.p, p);
      this.pointer.p = p;
      this.renderer.trail.push({ x: p.x, y: p.y, at: Date.now() });
    }
    this.processEvents();
  },

  onTouchEnd(e) {
    if (!this.pointer) return;
    const touches = e.changedTouches || [];
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this.pointer.id) {
        this.pointer = null;
        break;
      }
    }
  },

  onTouchCancel() {
    this.pointer = null;
  }
});
