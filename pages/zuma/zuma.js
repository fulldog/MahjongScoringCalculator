const DATA = require('./engine/levels_data.js');
const C = require('./engine/core_chain.js');
require('./engine/core_game.js');
const ZumaRenderer = require('./engine/render.js');
require('./engine/render_hud.js');
const Assets = require('./engine/assets.js');
const Bot = require('./engine/bot.js');

const HIGH_SCORE_KEY = 'zuma_high_score_v1';
const UNLOCKED_STAGE_KEY = 'zuma_unlocked_stage_v1';

// 13 个阶段名称
const STAGE_NAMES = [
  '螺旋末日', '泥泞滑坡', '曲折回环', '盘旋石窟', '毒牙密径',
  '古老神庙', '蛇形迷宫', '黄金遗迹', '日蚀深渊', '羽蛇之眼',
  '美洲豹祭坛', '太阳神殿', '太空格斗'
];

Page({
  data: {
    score: 0,
    highScore: 0,
    stageNum: 1,
    levelNum: 1,
    currentStageName: '螺旋末日',
    muted: false,
    botActive: false,
    isPaused: false,
    isLandscape: false,
    toastMsg: '',
    unlockedStage: 1,
    navPadTop: 24,
    menuRightPad: 96,
    showPauseModal: false,
    showStagesModal: false,
    showHelpModal: false,
    showResultModal: false,
    resultTitle: '',
    resultIsWin: false,
    isNewRecord: false,
    stagesList: []
  },

  onLoad() {
    const highScore = wx.getStorageSync(HIGH_SCORE_KEY) || 0;
    const unlockedStage = wx.getStorageSync(UNLOCKED_STAGE_KEY) || 1;

    // 动态读取系统状态栏与微信胶囊位置，确保顶栏绝对不与胶囊冲突
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

    this.setData({
      highScore: Number(highScore) || 0,
      unlockedStage: Math.max(1, Number(unlockedStage) || 1),
      navPadTop: statusBarHeight + 6,
      menuRightPad: Math.max(88, menuRightPad)
    });

    this.buildStagesList();
    this.audioPool = [];
    this.lastAudioPlayTime = {};
  },

  onReady() {
    this.initGameCanvas();
  },

  onUnload() {
    this.stopLoop();
    this.destroyAudios();
  },

  onHide() {
    if (this.game && this.game.state === 'play') {
      this.pauseGame();
    }
  },

  onResize(res) {
    const isLandscape = res.size.windowWidth > res.size.windowHeight;
    this.setData({ isLandscape });
    this.updateCanvasBounds();
  },

  buildStagesList() {
    const unlocked = this.data.unlockedStage;
    const curStage = this.game ? this.game.stageIdx : 0;
    const list = [];

    for (let i = 0; i < 13; i++) {
      list.push({
        index: i,
        name: STAGE_NAMES[i] || `第${i + 1}阶段`,
        unlocked: i + 1 <= unlocked,
        current: i === curStage,
        statusText: i + 1 <= unlocked ? (i + 1 < unlocked ? '已通关' : '当前') : '未解锁'
      });
    }

    this.setData({ stagesList: list });
  },

  initGameCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#zumaCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          console.warn('Canvas not found or not ready');
          return;
        }

        const canvas = res[0].node;
        this.canvasNode = canvas;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = Math.min(2.5, info.pixelRatio || 2);
        this.dpr = dpr;

        const rectWidth = res[0].width || 360;
        const rectHeight = res[0].height || 270;
        this.canvasWidth = rectWidth;
        this.canvasHeight = rectHeight;

        // 设置 Assets canvas 实例，用于微信小程序图片创建
        Assets.setCanvas(canvas);

        // 创建 Game 实例
        const game = new C.Game(DATA);
        this.game = game;

        // 创建 Renderer 并自适应实际像素
        const renderer = new ZumaRenderer(canvas, game);
        renderer.resize(rectWidth, rectHeight, dpr);
        this.renderer = renderer;

        // 预加载关键资源（失败会自动走纯矢量降级渲染，绝不报错）
        this.preloadAssets();

        // 启动第一关
        game.startLevel(0, 0);

        this.updateCanvasBounds();
        this.syncHudStats();
        this.startLoop();
      });
  },

  preloadAssets() {
    const coreImgs = [
      'hole', 'pitcover', 'coin', 'ballshadow', 'smallfrogonpad',
      'tongue', 'explosion', 'gauge', 'gaugegreen', 'zumabar',
      'toadlives', 'menubar'
    ];
    ['blue', 'green', 'purple', 'red', 'white', 'yellow'].forEach((c) => {
      coreImgs.push('baball' + c, 'babomb' + c, 'babackwards' + c, 'baslow' + c, 'baaccuracy' + c, 'balight' + c);
    });

    Assets.preload(coreImgs, this.canvasNode).catch(() => {});
    if (this.game && this.game.gfx) {
      Assets.preloadLevel(this.game.gfx, this.canvasNode).catch(() => {});
    }
  },

  updateCanvasBounds() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#zumaCanvas').boundingClientRect((rect) => {
      if (rect) {
        this.canvasRect = rect;
        if (this.renderer && rect.width && rect.height) {
          this.renderer.resize(rect.width, rect.height, this.dpr);
        }
      }
    }).exec();
  },

  startLoop() {
    this.running = true;
    let lastTime = Date.now();

    const frame = () => {
      if (!this.running) return;

      const now = Date.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (!this.data.isPaused && this.game) {
        // AI 机器人托管
        if (this.data.botActive && this.game.state === 'play') {
          Bot.act(this.game, dt);
        }

        // 逻辑更新
        this.game.update(dt);

        // 渲染更新
        if (this.renderer) {
          this.renderer.update(dt);
          const mode = this.game.state === 'idle' ? 'attract' : 'play';
          this.renderer.draw(this.game, null, mode);
        }

        // 消费事件列表
        this.processGameEvents();
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

  processGameEvents() {
    if (!this.game) return;
    const events = this.game.drain();
    if (!events.length) return;

    if (this.renderer && this.renderer.onEvents) {
      this.renderer.onEvents(events, (k) => k);
    }

    let needSync = false;

    for (let i = 0; i < events.length; i++) {
      const e = events[i];

      // 音效触发
      if (!this.data.muted) {
        if (e.t === 'fire') this.playSound('fireball1');
        else if (e.t === 'destroy') this.playSound('ballsdestroyed1');
        else if (e.t === 'combo') this.playSound('chime1');
        else if (e.t === 'coin') this.playSound('coingrab');
        else if (e.t === 'clack') this.playSound('ballclick1');
        else if (e.t === 'explode') this.playSound('bombexplode');
        else if (e.t === 'swap') this.playSound('rolling');
        else if (e.t === 'levelWon') this.playSound('chant2');
        else if (e.t === 'stageClear') this.playSound('chant5');
        else if (e.t === 'hole') this.playSound('chant14');
        else if (e.t === 'gameOver') this.playSound('chant8');
      }

      if (e.t === 'destroy' || e.t === 'coin' || e.t === 'levelStart') {
        needSync = true;
      }

      if (e.t === 'levelWon') {
        this.handleLevelWon();
      }

      if (e.t === 'stageClear') {
        this.handleStageClear();
      }

      if (e.t === 'lost') {
        this.handleLifeLost();
      }

      if (e.t === 'gameOver') {
        this.handleGameOver();
      }
    }

    if (needSync) {
      this.syncHudStats();
    }
  },

  syncHudStats() {
    if (!this.game) return;
    const score = this.game.score;
    const highScore = Math.max(score, this.data.highScore);
    const stageNum = this.game.stageIdx + 1;
    const levelNum = this.game.levelIdx + 1;
    const currentStageName = STAGE_NAMES[this.game.stageIdx] || `第${stageNum}阶段`;

    this.setData({
      score,
      highScore,
      stageNum,
      levelNum,
      currentStageName
    });

    if (score > this.data.highScore) {
      wx.setStorageSync(HIGH_SCORE_KEY, score);
    }
  },

  playSound(name) {
    const now = Date.now();
    if (this.lastAudioPlayTime[name] && now - this.lastAudioPlayTime[name] < 70) {
      return;
    }
    this.lastAudioPlayTime[name] = now;

    try {
      const audio = wx.createInnerAudioContext();
      audio.src = Assets.soundUrl(name);
      audio.play();
      audio.onEnded(() => { audio.destroy(); });
      audio.onError(() => { audio.destroy(); });
    } catch (e) {}
  },

  destroyAudios() {
    this.audioPool.forEach((a) => {
      try { a.destroy(); } catch (e) {}
    });
    this.audioPool = [];
  },

  // 坐标转换：屏幕触摸位置 -> 640x480 标准画板坐标
  toBoardPoint(touch) {
    const rect = this.canvasRect;
    if (!rect || !rect.width || !rect.height) {
      return { x: 320, y: 240 };
    }
    const x = (touch.clientX - rect.left) * (640 / rect.width);
    const y = (touch.clientY - rect.top) * (480 / rect.height);
    return {
      x: Math.max(0, Math.min(640, x)),
      y: Math.max(0, Math.min(480, y))
    };
  },

  onTouchStart(event) {
    if (!this.game || this.data.isPaused || this.game.state !== 'play') return;
    const touch = event.touches[0];
    if (!touch) return;
    const p = this.toBoardPoint(touch);

    // 点击石蛙中心可快速换球
    const frogDist = Math.hypot(p.x - this.game.frog.x, p.y - this.game.frog.y);
    if (frogDist < 45) {
      this.onSwapBall();
      return;
    }

    this.game.aimAt(p.x, p.y);
  },

  onTouchMove(event) {
    if (!this.game || this.data.isPaused || this.game.state !== 'play') return;
    const touch = event.touches[0];
    if (!touch) return;
    const p = this.toBoardPoint(touch);
    this.game.aimAt(p.x, p.y);
  },

  onTouchEnd(event) {
    if (!this.game || this.data.isPaused || this.game.state !== 'play') return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const p = this.toBoardPoint(touch);

    const frogDist = Math.hypot(p.x - this.game.frog.x, p.y - this.game.frog.y);
    if (frogDist >= 45) {
      this.game.aimAt(p.x, p.y);
      this.game.fire();
    }
  },

  onTouchCancel() {},

  onSwapBall() {
    if (!this.game || this.data.isPaused) return;
    this.game.swap();
  },

  toggleBot() {
    const botActive = !this.data.botActive;
    this.setData({ botActive });
    this.showToast(botActive ? '🤖 AI自动托管已开启' : '🤖 已切换为手动模式');
  },

  toggleMute() {
    const muted = !this.data.muted;
    this.setData({ muted });
    this.showToast(muted ? '🔇 已静音' : '🔊 音效开启');
  },

  togglePause() {
    if (this.data.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  },

  pauseGame() {
    this.setData({
      isPaused: true,
      showPauseModal: true
    });
  },

  resumeGame() {
    this.setData({
      isPaused: false,
      showPauseModal: false
    });
  },

  restartLevel() {
    if (!this.game) return;
    this.game.lives = Math.max(this.game.lives, 1);
    this.game.startLevel(this.game.stageIdx, this.game.levelIdx, true);
    if (this.game.gfx) {
      Assets.preloadLevel(this.game.gfx, this.canvasNode).catch(() => {});
    }
    this.setData({
      isPaused: false,
      showPauseModal: false,
      showResultModal: false
    });
    this.syncHudStats();
    this.showToast('重新开始当前关卡');
  },

  handleLevelWon() {
    const report = require('../../utils/minigame-report.js');
    report.report({
      game: 'zuma',
      result: 'win',
      score: this.game ? this.game.score : 0,
      levelNo: this.game ? this.game.stageIdx + 1 : 0,
      stars: 0
    });
    this.showToast('🎉 过关！');
    setTimeout(() => {
      if (this.game) {
        this.game.advance();
        if (this.game.gfx) {
          Assets.preloadLevel(this.game.gfx, this.canvasNode).catch(() => {});
        }
        this.syncHudStats();
      }
    }, 1500);
  },

  handleStageClear() {
    const nextUnlocked = Math.min(13, this.game.stageIdx + 2);
    if (nextUnlocked > this.data.unlockedStage) {
      this.setData({ unlockedStage: nextUnlocked });
      wx.setStorageSync(UNLOCKED_STAGE_KEY, nextUnlocked);
      this.buildStagesList();
    }

    this.setData({
      showResultModal: true,
      resultTitle: `恭喜征服第 ${this.game.stageIdx + 1} 阶段！`,
      resultIsWin: true,
      isNewRecord: this.game.score >= this.data.highScore
    });
  },

  handleLifeLost() {
    this.showToast('💔 失去一条生命');
    this.syncHudStats();
  },

  handleGameOver() {
    const report = require('../../utils/minigame-report.js');
    report.report({
      game: 'zuma',
      result: 'lose',
      score: this.game ? this.game.score : 0,
      levelNo: this.game ? this.game.stageIdx + 1 : 0,
      stars: 0
    });
    const isNew = this.game.score > this.data.highScore;
    if (isNew) {
      wx.setStorageSync(HIGH_SCORE_KEY, this.game.score);
      this.setData({ highScore: this.game.score });
    }

    this.setData({
      showResultModal: true,
      resultTitle: '游戏结束',
      resultIsWin: false,
      isNewRecord: isNew
    });
  },

  nextLevel() {
    this.setData({ showResultModal: false });
    if (this.game) {
      this.game.advance();
      if (this.game.gfx) {
        Assets.preloadLevel(this.game.gfx, this.canvasNode).catch(() => {});
      }
      this.syncHudStats();
    }
  },

  openStagesModal() {
    this.buildStagesList();
    this.setData({
      showStagesModal: true,
      isPaused: true
    });
  },

  closeStagesModal() {
    this.setData({
      showStagesModal: false,
      isPaused: false
    });
  },

  selectStage(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (index + 1 > this.data.unlockedStage) {
      wx.showToast({ title: '该关卡尚未解锁', icon: 'none' });
      return;
    }

    if (this.game) {
      this.game.startLevel(index, 0, false);
      if (this.game.gfx) {
        Assets.preloadLevel(this.game.gfx, this.canvasNode).catch(() => {});
      }
      this.syncHudStats();
      this.buildStagesList();
    }

    this.setData({
      showStagesModal: false,
      isPaused: false,
      showResultModal: false
    });
    this.showToast(`进入第 ${index + 1} 阶段`);
  },

  openHelpModal() {
    this.setData({
      showHelpModal: true,
      isPaused: true
    });
  },

  closeHelpModal() {
    this.setData({
      showHelpModal: false,
      isPaused: false
    });
  },

  showToast(msg) {
    this.setData({ toastMsg: msg });
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.setData({ toastMsg: '' });
    }, 1800);
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.reLaunch({ url: '/pages/home/home' });
      }
    });
  },

  preventMove() {},
  preventTap() {}
});
