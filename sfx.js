'use strict';
// 音效与背景音乐：全部用 WebAudio 现场合成，不需要任何音频文件。
// 首次点击/触摸后才会真正出声（浏览器规定）；页面切到后台自动暂停；可静音，设置会记住。
const SFX = (() => {
  const KEY = 'sfx:muted';
  let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let muted = false, timer = null, mode = null, seed = 1, root = 50, scale = [0, 2, 3, 5, 7, 8, 10];
  let nextT = 0, bar = 0, tense = false, rnd = Math.random;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}
  const LITE = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4);

  const SCALES = {
    minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], lyd: [0, 2, 4, 6, 7, 9, 11]
  };
  const TONE_SCALE = { cold: 'dorian', dark: 'phryg', warm: 'minor', none: 'minor', red: 'harm', gold: 'dorian', sea: 'dorian', night: 'phryg' };
  const PROG = [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1], [0, 2, 4], [2, 4, 6], [5, 0, 2], [4, 6, 1]];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const degSemi = (d) => scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function ensure() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
      musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
      // 轻微回声，让音色有空间感
      const d = ac.createDelay(1); d.delayTime.value = 0.34; const fb = ac.createGain(); fb.gain.value = 0.32; const wet = ac.createGain(); wet.gain.value = 0.35;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      musicBus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
    return ac;
  }
  function wake() { const a = ensure(); if (a && a.state === 'suspended') { try { a.resume(); } catch (e) {} } return a; }
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (mode || ac) wake(); else ensure(); }, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    try { if (document.hidden) ac.suspend(); else if (!muted) ac.resume(); } catch (e) {}
  });

  // ---------- 基础合成 ----------
  function tone(f, t, dur, o) {
    if (!ac) return; o = o || {};
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    if (o.det) osc.detune.value = o.det;
    const a = o.attack == null ? 0.01 : o.attack, v = o.gain == null ? 0.2 : o.gain;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; osc.connect(fl); node = fl; }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(t, dur, o) {
    if (!ac) return; o = o || {};
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); f.Q.value = o.q || 0.8;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus); src.start(t); src.stop(t + dur + 0.05);
  }
  const T = () => ac.currentTime + 0.02;
  const play = (fn) => { if (muted) return; if (!wake()) return; try { fn(T()); } catch (e) {} };

  // ---------- 音效 ----------
  let susGain = null;
  const op = (i) => [196, 207.7, 185, 220][i % 4];
  const fx = {
    // ---------- 场景音效 ----------
    // 公司 logo：柔和的上行音 + 闪光
    logo: (t) => { [392, 587, 784, 1175].forEach((f, i) => { tone(f, t + i * 0.12, 1.6, { gain: 0.1 }); tone(f * 2, t + i * 0.12, 0.8, { gain: 0.03 }); }); tone(98, t, 2.2, { gain: 0.16, attack: 0.3 }); noise(t + 0.3, 0.9, { f: 2000, to: 7000, gain: 0.04, attack: 0.5, type: 'highpass' }); },
    // 拆开信封：撕开封蜡的脆响 + 纸张摩擦 + 抽出信纸
    envelope: (t) => {
      noise(t, 0.07, { f: 3200, q: 2, gain: 0.3 }); tone(2400, t, 0.04, { type: 'square', gain: 0.03, lp: 3000 });
      noise(t + 0.08, 0.35, { f: 1800, to: 4200, q: 0.7, gain: 0.12, attack: 0.05 });
      noise(t + 0.45, 0.5, { f: 900, to: 2600, q: 0.6, gain: 0.1, attack: 0.15 });
      tone(660, t + 0.95, 1.1, { gain: 0.05 }); tone(990, t + 1.0, 1.1, { gain: 0.04 });
    },
    // 翻纸 / 收起线索
    paper: (t) => { noise(t, 0.22, { f: 2600, to: 1200, q: 0.6, gain: 0.12, attack: 0.03 }); noise(t + 0.12, 0.2, { f: 3400, to: 1600, q: 0.6, gain: 0.08, attack: 0.03 }); },
    rustle: (t) => { for (let i = 0; i < 6; i++) noise(t + i * 0.09 + Math.random() * 0.04, 0.08, { f: 2200 + Math.random() * 2400, q: 0.9, gain: 0.06 + Math.random() * 0.04 }); },
    // 门轴吱呀
    creak: (t) => { tone(180, t, 0.9, { type: 'sawtooth', to: 340, gain: 0.05, lp: 900, attack: 0.2 }); tone(190, t + 0.1, 0.8, { type: 'sawtooth', to: 280, gain: 0.04, lp: 700, attack: 0.2 }); noise(t, 0.8, { f: 700, to: 1500, q: 3, gain: 0.04, attack: 0.3 }); },
    knock: (t) => { [0, 0.19, 0.38].forEach((d) => { tone(150, t + d, 0.12, { to: 70, gain: 0.5 }); noise(t + d, 0.05, { f: 500, gain: 0.25 }); }); },
    footsteps: (t) => { for (let i = 0; i < 5; i++) { const tt = t + i * 0.34; tone(95 - (i % 2) * 12, tt, 0.14, { to: 55, gain: 0.22 }); noise(tt, 0.06, { f: 400, gain: 0.1 }); } },
    // 划火柴
    match: (t) => { noise(t, 0.28, { f: 4200, to: 1500, q: 0.7, gain: 0.16, attack: 0.02 }); noise(t + 0.27, 0.9, { f: 2800, to: 600, q: 0.5, gain: 0.1, attack: 0.05 }); tone(900, t + 0.27, 0.1, { type: 'square', gain: 0.02, lp: 2000 }); },
    clink: (t) => { [2093, 3136, 4186].forEach((f, i) => tone(f * (1 + i * 0.003), t + i * 0.01, 0.9 - i * 0.2, { gain: 0.07 })); },
    keys: (t) => { for (let i = 0; i < 7; i++) tone(2600 + Math.random() * 2400, t + i * 0.045 + Math.random() * 0.02, 0.18, { gain: 0.045 }); },
    // 灯 / 煤油灯点亮
    lamp: (t) => { noise(t, 0.2, { f: 3000, to: 800, gain: 0.1 }); tone(180, t + 0.15, 0.5, { type: 'triangle', gain: 0.05, attack: 0.15 }); },
    // 门铃 / 房间满员提示
    bell: (t) => { [880, 1320, 1760].forEach((f, i) => tone(f, t + i * 0.01, 1.8, { gain: 0.1 / (i + 1) })); },
    click: (t) => tone(1100, t, 0.05, { type: 'triangle', gain: 0.08 }),
    tab: (t) => { noise(t, 0.12, { f: 2200, to: 800, gain: 0.07 }); tone(520, t, 0.08, { type: 'triangle', gain: 0.05 }); },
    ask: (t) => { tone(260, t, 0.16, { to: 130, gain: 0.18 }); tone(780, t + 0.02, 0.1, { type: 'triangle', gain: 0.05 }); },
    search: (t) => { noise(t, 0.5, { f: 600, to: 3200, q: 1.4, gain: 0.16 }); noise(t + 0.25, 0.3, { f: 3000, to: 900, gain: 0.08 }); },
    clue: (t) => { [880, 1175, 1568].forEach((f, i) => { tone(f, t + i * 0.09, 1.3, { gain: 0.14 }); tone(f * 2.01, t + i * 0.09, 0.6, { gain: 0.04 }); }); },
    nothing: (t) => tone(200, t, 0.3, { type: 'triangle', to: 150, gain: 0.1 }),
    pick: (t) => { tone(660, t, 0.1, { type: 'triangle', gain: 0.1 }); tone(990, t + 0.06, 0.14, { type: 'triangle', gain: 0.08 }); },
    // 证物对质：沉重一击
    confront: (t) => { tone(90, t, 0.7, { to: 40, gain: 0.5 }); noise(t, 0.25, { f: 900, to: 200, gain: 0.25 }); },
    // 谎言被揭穿：不和谐的刺音
    lie: (t) => {
      tone(80, t, 1.2, { to: 38, gain: 0.55 }); noise(t, 0.3, { f: 1500, to: 300, gain: 0.3 });
      tone(233, t, 1.1, { type: 'sawtooth', gain: 0.1, lp: 900 }); tone(247, t, 1.1, { type: 'sawtooth', gain: 0.1, lp: 900 });
      tone(1760, t + 0.04, 0.9, { gain: 0.05 });
    },
    // 关键破绽：重击 + 上升的和弦 + 铃声
    crack: (t) => {
      tone(70, t, 1.8, { to: 32, gain: 0.7 }); noise(t, 0.5, { f: 1200, to: 150, gain: 0.4 });
      [220, 277, 330, 440].forEach((f) => tone(f, t + 0.15, 2.4, { type: 'sawtooth', gain: 0.07, attack: 0.9, lp: 1300 }));
      [1320, 1760, 2093].forEach((f, i) => tone(f, t + 0.9 + i * 0.12, 1.6, { gain: 0.1 }));
    },
    stamp: (t) => { tone(65, t, 0.5, { to: 35, gain: 0.7 }); noise(t, 0.12, { f: 700, to: 200, gain: 0.45 }); },
    swell: (t) => { tone(55, t, 3.2, { type: 'sawtooth', gain: 0.16, attack: 2.2, lp: 400 }); tone(82.5, t, 3.2, { type: 'sawtooth', gain: 0.1, attack: 2.2, lp: 500 }); noise(t, 3, { f: 300, to: 2400, gain: 0.08, attack: 2.4 }); },
    drum: (t) => { for (let i = 0; i < 26; i++) { const tt = t + i * 0.075 + (i * i) * 0.0009; noise(tt, 0.07, { f: 220, q: 0.5, gain: 0.05 + i * 0.006 }); tone(110, tt, 0.07, { to: 80, gain: 0.04 + i * 0.006 }); } },
    splash: (t) => { noise(t, 0.7, { f: 300, to: 2600, gain: 0.12, attack: 0.35 }); tone(110, t + 0.4, 1.5, { to: 88, gain: 0.3, lp: 600 }); tone(220, t + 0.4, 1.2, { type: 'triangle', gain: 0.07 }); [660, 990].forEach((f, i) => tone(f, t + 0.55 + i * 0.09, 1, { gain: 0.05 })); },
    type: (t) => tone(1400 + Math.random() * 400, t, 0.03, { type: 'square', gain: 0.012, lp: 2400 }),
    turn: (t) => [784, 1047, 1319].forEach((f, i) => tone(f, t + i * 0.1, 0.55, { type: 'triangle', gain: 0.12 })),
    warn: (t) => tone(880, t, 0.12, { type: 'square', gain: 0.045, lp: 1800 }),
    join: (t) => { tone(523, t, 0.22, { type: 'triangle', gain: 0.1 }); tone(784, t + 0.1, 0.32, { type: 'triangle', gain: 0.1 }); },
    leave: (t) => { tone(659, t, 0.22, { type: 'triangle', gain: 0.08 }); tone(440, t + 0.1, 0.32, { type: 'triangle', gain: 0.08 }); },
    chat: (t) => { tone(1320, t, 0.1, { gain: 0.07 }); tone(1760, t + 0.06, 0.14, { gain: 0.05 }); },
    vote: (t) => { tone(150, t, 0.35, { to: 80, gain: 0.35 }); noise(t, 0.1, { f: 600, gain: 0.12 }); },
    lit: (t) => tone(300 + Math.random() * 90, t, 0.2, { type: 'triangle', gain: 0.1 }),
    whoosh: (t) => noise(t, 0.4, { f: 400, to: 3000, gain: 0.1, attack: 0.12 }),
    start: (t) => { tone(110, t, 1.4, { type: 'sawtooth', gain: 0.1, attack: 0.6, lp: 500 }); [392, 523, 659, 784].forEach((f, i) => tone(f, t + 0.2 + i * 0.12, 0.8, { type: 'triangle', gain: 0.1 })); },
    gasp: (t) => noise(t, 0.35, { f: 500, to: 2600, q: 1.1, gain: 0.14 }),
    growl: (t) => { tone(70, t, 0.45, { type: 'sawtooth', to: 55, gain: 0.16, lp: 300 }); noise(t, 0.3, { f: 200, gain: 0.07 }); },
    sob: (t) => { tone(330, t, 0.5, { to: 262, gain: 0.07, attack: 0.15 }); tone(310, t + 0.5, 0.5, { to: 247, gain: 0.06, attack: 0.15 }); },
    // 人物反应音：叹气 / 紧张咳嗽 / 迟疑的“嗯……” / 不耐烦的哼声
    sigh: (t) => {
      noise(t, 1.2, { f: 1100, to: 380, q: 0.7, gain: 0.22, attack: 0.3 });
      tone(240, t + 0.1, 1.0, { to: 150, gain: 0.05, attack: 0.3, lp: 700 });
    },
    cough: (t) => {
      [0, 0.17].forEach((d, i) => { noise(t + d, 0.1, { f: 1500 - i * 200, q: 1.3, gain: 0.34 }); tone(210 - i * 30, t + d, 0.1, { type: 'sawtooth', to: 120, gain: 0.1, lp: 700 }); });
      tone(170, t + 0.4, 0.28, { type: 'sawtooth', to: 140, gain: 0.05, lp: 500, attack: 0.08 });
    },
    hmm: (t) => {
      tone(200, t, 0.55, { type: 'sawtooth', to: 168, gain: 0.1, lp: 520, attack: 0.1 });
      tone(205, t + 0.02, 0.5, { to: 172, gain: 0.05, attack: 0.1 });
      tone(176, t + 0.62, 0.35, { type: 'sawtooth', to: 150, gain: 0.06, lp: 450, attack: 0.06 });
    },
    huff: (t) => {
      noise(t, 0.2, { f: 2800, to: 900, q: 0.9, gain: 0.3, attack: 0.02 });
      tone(280, t, 0.18, { type: 'square', to: 170, gain: 0.05, lp: 900 });
    },
    // ---------- 开场悬疑动画用 ----------
    stinger: (t) => {
      [233.1, 246.9, 311.1, 370].forEach((f, i) => tone(f, t, 1.6, { type: 'sawtooth', gain: 0.1 - i * 0.012, lp: 1400, attack: 0.02 }));
      noise(t, 0.5, { f: 1200, to: 300, q: 0.7, gain: 0.3 }); tone(46, t, 1.4, { to: 34, gain: 0.7 });
    },
    // 惊恐的尖叫（合成）
    scream: (t) => {
      const mk = (f0, f1, g) => {
        const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), env = ac.createGain();
        const a = ac.createBiquadFilter(), b = ac.createBiquadFilter(), c = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.35); o.frequency.exponentialRampToValueAtTime(f1 * 0.82, t + 1.5);
        lfo.frequency.value = 11; lg.gain.value = f0 * 0.05; lfo.connect(lg); lg.connect(o.frequency);
        a.type = 'bandpass'; a.frequency.value = 950; a.Q.value = 4; b.type = 'bandpass'; b.frequency.value = 2900; b.Q.value = 5; c.type = 'bandpass'; c.frequency.value = 4300; c.Q.value = 6;
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(g, t + 0.05); env.gain.setValueAtTime(g, t + 0.9); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
        o.connect(a); o.connect(b); o.connect(c); a.connect(env); b.connect(env); c.connect(env); env.connect(sfxBus);
        o.start(t); lfo.start(t); o.stop(t + 1.7); lfo.stop(t + 1.7);
      };
      mk(620, 1450, 0.5); mk(633, 1480, 0.3);
      noise(t, 1.5, { f: 3200, q: 0.8, gain: 0.1, attack: 0.05 });
    },
    heartbeat: (t) => {
      tone(62, t, 0.16, { to: 42, gain: 0.55 }); noise(t, 0.08, { f: 120, q: 0.6, gain: 0.2 });
      tone(54, t + 0.2, 0.2, { to: 38, gain: 0.4 });
    },
    tick: (t) => { noise(t, 0.03, { f: 3400, q: 3, gain: 0.1 }); tone(1900, t, 0.02, { type: 'square', gain: 0.025, lp: 4000 }); },
    shutter: (t) => { noise(t, 0.04, { f: 4500, q: 2, gain: 0.35 }); noise(t + 0.07, 0.09, { f: 1600, q: 1.5, gain: 0.22 }); tone(180, t + 0.07, 0.08, { type: 'square', to: 90, gain: 0.05, lp: 700 }); },
    // 悬疑氛围垫（约 30 秒，可用 SFX.suspenseStop() 提前淡出）
    suspense: (t) => {
      if (susGain) { try { susGain.gain.setTargetAtTime(0, ac.currentTime, 0.1); } catch (e) {} }
      const g = ac.createGain(); g.gain.value = 1; g.connect(sfxBus); susGain = g;
      const O = { bus: g };
      tone(55, t, 31, Object.assign({ type: 'sawtooth', gain: 0.1, attack: 5, lp: 280 }, O));
      tone(58.3, t, 31, Object.assign({ type: 'sawtooth', gain: 0.08, attack: 6, lp: 260 }, O));
      tone(1244.5, t + 3, 9, Object.assign({ gain: 0.018, attack: 4 }, O)); tone(1318.5, t + 5, 9, Object.assign({ gain: 0.014, attack: 4 }, O));
      tone(932, t + 13, 9, Object.assign({ gain: 0.016, attack: 4, to: 880 }, O)); tone(988, t + 15, 9, Object.assign({ gain: 0.012, attack: 4 }, O));
      noise(t, 30, Object.assign({ f: 420, to: 900, q: 0.6, gain: 0.04, attack: 8 }, O));
      [4, 11, 19, 25].forEach((d, i) => tone(op(i), t + d, 2.2, Object.assign({ type: 'triangle', gain: 0.03, attack: 1, lp: 700, to: op(i) * 0.97 }, O)));
    },
    // 凶手被抓：手铐咔嗒咔嗒锁上 → 铁链拖动 → 牢门哐当关上
    cuff: (t) => {
      [0, 0.09, 0.17, 0.24].forEach((d, i) => { noise(t + d, 0.04, { f: 3800 + i * 300, q: 6, gain: 0.32 }); tone(2600 + i * 220, t + d, 0.05, { type: 'square', gain: 0.07, lp: 5000 }); });
      [0.5, 0.58, 0.66].forEach((d, i) => { noise(t + d, 0.05, { f: 4200 + i * 250, q: 7, gain: 0.3 }); tone(3100 + i * 200, t + d, 0.06, { type: 'square', gain: 0.06, lp: 5200 }); });
      for (let i = 0; i < 9; i++) noise(t + 0.95 + i * 0.07 + Math.random() * 0.03, 0.05, { f: 2500 + Math.random() * 2500, q: 4, gain: 0.07 + Math.random() * 0.05 });
      const b = t + 1.75;
      [196, 311, 523, 817, 1290].forEach((f, i) => tone(f, b, 1.5 - i * 0.18, { type: 'triangle', gain: 0.2 / (1 + i * 0.6) }));
      noise(b, 0.25, { f: 900, q: 1, gain: 0.5 }); tone(60, b, 0.5, { to: 38, gain: 0.7 });
      tone(120, b + 0.55, 0.3, { type: 'square', to: 90, gain: 0.12, lp: 600 }); noise(b + 0.55, 0.08, { f: 1800, q: 3, gain: 0.25 });
    },
    // 凶手逃脱：低沉的奸笑 “嘿嘿嘿……哈哈哈哈”
    laugh: (t) => {
      const ha = (at, f0, dur, g, vib) => {
        const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), env = ac.createGain();
        const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, at + dur);
        lfo.frequency.value = vib || 7; lg.gain.value = f0 * 0.03; lfo.connect(lg); lg.connect(o.frequency);
        f1.type = 'bandpass'; f1.Q.value = 5; f1.frequency.setValueAtTime(700, at); f1.frequency.exponentialRampToValueAtTime(1100, at + dur * 0.6);
        f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.value = 2300;
        env.gain.setValueAtTime(0.0001, at); env.gain.linearRampToValueAtTime(g, at + 0.03); env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        o.connect(f1); o.connect(f2); f1.connect(env); f2.connect(env); env.connect(sfxBus);
        o.start(at); lfo.start(at); o.stop(at + dur + 0.05); lfo.stop(at + dur + 0.05);
        noise(at, dur * 0.7, { f: 1500, q: 1.2, gain: g * 0.22, attack: 0.02 });
      };
      [0, 0.2, 0.4].forEach((d, i) => ha(t + d, 150 - i * 6, 0.14, 0.55, 9));
      [0.85, 1.12, 1.4, 1.68].forEach((d, i) => ha(t + d, 175 - i * 9, 0.2, 0.6, 8));
      ha(t + 2.05, 165, 0.9, 0.55, 6.5);
      tone(55, t + 0.85, 1.9, { type: 'sawtooth', gain: 0.07, lp: 220, attack: 0.3 });
    },
    win: (t) => {
      [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => { tone(f, t + i * 0.13, 1.8, { type: 'triangle', gain: 0.16 }); tone(f * 2, t + i * 0.13, 1, { gain: 0.04 }); });
      [130.8, 196].forEach((f) => tone(f, t, 3.2, { gain: 0.2, attack: 0.1 }));
      [1568, 2093, 2637].forEach((f, i) => tone(f, t + 0.9 + i * 0.1, 1.4, { gain: 0.07 }));
    },
    lose: (t) => {
      [392, 349.2, 311.1, 261.6].forEach((f, i) => { tone(f, t + i * 0.38, 1.6, { type: 'triangle', gain: 0.15, lp: 1200 }); });
      tone(98, t, 3.4, { type: 'sawtooth', gain: 0.1, attack: 0.3, lp: 300 });
    }
  };
  // ---------- 案件专属点缀音 ----------
  Object.assign(fx, {
    woodblock: (t) => { tone(820, t, 0.07, { type: 'square', to: 520, gain: 0.12, lp: 1800 }); noise(t, 0.05, { f: 1500, gain: 0.1 }); },       // 醒木/木鱼
    toll: (t) => { [196, 392, 588, 785].forEach((f, i) => tone(f, t, 3.2 - i * 0.5, { gain: 0.1 / (i * 0.6 + 1) })); },                         // 钟声
    gong: (t) => { tone(98, t, 3.6, { gain: 0.16, attack: 0.02 }); tone(147, t, 3, { gain: 0.08 }); tone(263, t, 2.2, { gain: 0.04 }); noise(t, 0.3, { f: 700, gain: 0.07 }); },
    foghorn: (t) => { tone(87, t, 2.4, { type: 'sawtooth', gain: 0.1, attack: 0.5, lp: 260 }); tone(92, t, 2.4, { type: 'sawtooth', gain: 0.07, attack: 0.5, lp: 240 }); },
    gull: (t) => { for (let i = 0; i < 3; i++) tone(1500 - i * 120, t + i * 0.16, 0.22, { to: 2300 - i * 200, gain: 0.04, lp: 3200, attack: 0.05 }); },
    sonar: (t) => { tone(1250, t, 1.6, { gain: 0.07, attack: 0.005 }); tone(1250, t + 0.02, 0.5, { gain: 0.03, lp: 1500 }); },
    bubble: (t) => { const f = 420 + Math.random() * 500; tone(f, t, 0.12, { to: f * 1.7, gain: 0.07, attack: 0.01 }); if (Math.random() < 0.5) tone(f * 1.2, t + 0.1, 0.1, { to: f * 2, gain: 0.05 }); },
    hullcreak: (t) => { tone(70, t, 1.6, { type: 'sawtooth', to: 52, gain: 0.07, lp: 220, attack: 0.5 }); noise(t + 0.2, 0.9, { f: 300, to: 160, q: 3, gain: 0.05, attack: 0.4 }); },
    // 狼嚎（狼人杀入夜）
    howl: (t) => { tone(300, t, 2.2, { to: 560, gain: 0.07, attack: 0.5, lp: 1200 }); tone(450, t + 1.4, 1.6, { to: 260, gain: 0.07, attack: 0.1, lp: 1000 }); tone(602, t + 0.05, 2.2, { to: 1100, gain: 0.02, attack: 0.5, lp: 1500 }); },
    // 天亮鸡鸣
    rooster: (t) => { [[620, 880], [700, 1040], [660, 760]].forEach(([a, b], i) => tone(a, t + i * 0.32, 0.3, { type: 'sawtooth', to: b, gain: 0.05, lp: 1800, attack: 0.04 })); tone(560, t + 1.0, 0.7, { type: 'sawtooth', to: 380, gain: 0.05, lp: 1400, attack: 0.05 }); },
    // 枪响 / 遗言结束
    gunshot: (t) => { noise(t, 0.25, { f: 1800, to: 300, q: 0.5, gain: 0.5 }); tone(90, t, 0.4, { to: 40, gain: 0.4 }); },
    owl: (t) => { [0, 0.5].forEach((d, i) => tone(i ? 340 : 400, t + d, 0.4, { to: i ? 290 : 360, gain: 0.07, attack: 0.08, lp: 900 })); },
    cricket: (t) => { for (let i = 0; i < 4; i++) tone(4300, t + i * 0.06, 0.035, { type: 'square', gain: 0.012, lp: 5200 }); },
    chip: (t) => { for (let i = 0; i < 3; i++) { tone(2600 + Math.random() * 600, t + i * 0.05, 0.08, { type: 'triangle', gain: 0.06 }); noise(t + i * 0.05, 0.03, { f: 3800, gain: 0.05 }); } },
    slot: (t) => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.07, 0.18, { type: 'square', gain: 0.025, lp: 3000 })); },
    clack: (t) => { for (let i = 0; i < 4; i++) { const tt = t + i * 0.36; tone(120, tt, 0.07, { to: 70, gain: 0.12 }); tone(110, tt + 0.1, 0.07, { to: 65, gain: 0.1 }); noise(tt, 0.04, { f: 900, gain: 0.07 }); } },
    chime: (t) => { [2093, 1760, 2349, 1568].forEach((f, i) => tone(f * (1 + Math.random() * 0.01), t + i * 0.09 + Math.random() * 0.05, 1.3, { gain: 0.04 })); },
    piano: (t) => { const n = [262, 311, 392, 466, 523][(Math.random() * 5) | 0]; tone(n, t, 1.8, { type: 'triangle', gain: 0.08, lp: 2200 }); tone(n * 2, t, 0.8, { gain: 0.02 }); },
    drip: (t) => { tone(1500 + Math.random() * 400, t, 0.1, { to: 700, gain: 0.07 }); tone(500, t + 0.12, 0.2, { gain: 0.03, lp: 900 }); },
    thunder: (t) => { noise(t, 2.6, { f: 160, to: 70, q: 0.5, gain: 0.22, attack: 0.3 }); tone(45, t + 0.1, 2.2, { gain: 0.14, attack: 0.4 }); },
    shutter: (t) => { noise(t, 0.03, { f: 3000, gain: 0.2 }); noise(t + 0.07, 0.05, { f: 2000, gain: 0.15 }); },
    whistle: (t) => { tone(880, t, 1.2, { type: 'triangle', to: 840, gain: 0.05, attack: 0.1, lp: 2400 }); tone(1320, t, 1.1, { gain: 0.02, attack: 0.15 }); },
    static: (t) => { noise(t, 0.5, { f: 3200, q: 0.4, gain: 0.05, attack: 0.05 }); noise(t + 0.55, 0.2, { f: 1800, q: 0.4, gain: 0.04 }); },
    typewriter: (t) => { for (let i = 0; i < 6; i++) { const tt = t + i * 0.11 + Math.random() * 0.03; noise(tt, 0.02, { f: 2800, gain: 0.07 }); tone(240, tt, 0.03, { type: 'square', gain: 0.02, lp: 900 }); } tone(1760, t + 0.8, 0.5, { gain: 0.04 }); },
    tick: (t) => { for (let i = 0; i < 3; i++) tone(i % 2 ? 1700 : 2100, t + i * 0.5, 0.025, { type: 'square', gain: 0.03, lp: 3000 }); },
    firework: (t) => { tone(900, t, 0.6, { to: 2200, gain: 0.04, attack: 0.05 }); noise(t + 0.6, 0.4, { f: 600, to: 150, gain: 0.2 }); for (let i = 0; i < 6; i++) noise(t + 0.7 + i * 0.07, 0.03, { f: 3500, gain: 0.06 }); },
    vinyl: (t) => { for (let i = 0; i < 3; i++) noise(t + Math.random() * 0.4, 0.015, { f: 4200, gain: 0.07 }); },
    calliope: (t) => { [523, 659, 784, 659, 523, 784, 880].forEach((f, i) => tone(f, t + i * 0.16, 0.2, { type: 'square', gain: 0.025, lp: 2600 })); },
    pour: (t) => { noise(t, 0.9, { f: 2200, to: 3800, q: 1.2, gain: 0.06, attack: 0.2 }); tone(900, t + 0.7, 0.1, { gain: 0.03 }); },
    wind: (t) => { noise(t, 2.2, { f: 400, to: 1100, q: 1.5, gain: 0.07, attack: 0.9 }); },
    beep: (t) => { tone(1568, t, 0.08, { type: 'square', gain: 0.025, lp: 2600 }); tone(1568, t + 0.2, 0.08, { type: 'square', gain: 0.025, lp: 2600 }); },
    motorhum: (t) => { tone(60, t, 1.6, { type: 'sawtooth', gain: 0.035, attack: 0.5, lp: 180 }); },
    snowcrunch: (t) => { for (let i = 0; i < 3; i++) noise(t + i * 0.3, 0.12, { f: 2000, to: 900, q: 0.6, gain: 0.07 }); },
    rattle: (t) => { for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 800, t + i * 0.035, 0.03, { type: 'square', gain: 0.02, lp: 2800 }); },
    mouse: (t) => { for (let i = 0; i < 4; i++) tone(2800 + Math.random() * 600, t + i * 0.05, 0.03, { gain: 0.03 }); }
  });
  // ---------- 案件主题：环境床 + 随机点缀（按 case/script id 取，没有就不加） ----------
  // bed: rain/fire/snow/sea/wind/hum/deep；spots: [音效, 最短间隔秒, 最长间隔秒]
  const THEMES = {
    teahouse: { bed: 'rain', spots: [['woodblock', 14, 30], ['piano', 40, 70], ['clink', 20, 40]] },
    bookclub: { bed: 'fire', spots: [['paper', 12, 25], ['tick', 14, 26], ['typewriter', 30, 60]] },
    campus: { bed: 'wind', spots: [['toll', 40, 70], ['cricket', 10, 20], ['footsteps', 28, 50]] },
    lighthouse: { bed: 'sea', spots: [['foghorn', 22, 40], ['gull', 12, 24], ['creak', 25, 45]] },
    vineyard: { bed: 'wind', spots: [['pour', 20, 40], ['cricket', 10, 20], ['clink', 22, 40]] },
    railway: { bed: 'wind', spots: [['clack', 6, 10], ['whistle', 30, 55], ['rattle', 15, 30]] },
    filmset: { bed: 'hum', spots: [['shutter', 16, 30], ['beep', 18, 34], ['static', 22, 40]] },
    museum: { bed: 'hum', spots: [['tick', 10, 20], ['footsteps', 22, 40], ['chime', 30, 55]] },
    onsen: { bed: 'snow', spots: [['drip', 7, 14], ['woodblock', 26, 50], ['wind', 20, 35]] },
    greenhouse: { bed: 'rain', spots: [['drip', 5, 10], ['cricket', 8, 16], ['rustle', 18, 34]] },
    casino: { bed: 'hum', spots: [['chip', 7, 14], ['slot', 14, 26], ['clink', 16, 30]] },
    observatory: { bed: 'wind', spots: [['motorhum', 16, 30], ['cricket', 8, 16], ['beep', 28, 50]] },
    bank: { bed: 'rain', spots: [['tick', 8, 14], ['keys', 24, 44], ['beep', 30, 55]] },
    clanhall: { bed: 'fire', spots: [['woodblock', 6, 12], ['toll', 40, 70], ['wind', 24, 44]] },
    deepstation: { bed: 'deep', spots: [['sonar', 9, 16], ['bubble', 3, 7], ['hullcreak', 24, 44]] },
    birthday: { bed: 'fire', spots: [['firework', 28, 50], ['clink', 12, 24], ['chime', 30, 50]] },
    reunion: { bed: 'wind', spots: [['static', 24, 42], ['piano', 20, 38], ['clink', 14, 28]] },
    camping: { bed: 'fire', spots: [['owl', 20, 38], ['cricket', 7, 14], ['rustle', 16, 30]] },
    yacht: { bed: 'sea', spots: [['clink', 14, 26], ['gull', 20, 38], ['hullcreak', 30, 50]] },
    circus: { bed: 'wind', spots: [['calliope', 20, 38], ['drum', 55, 90], ['gasp', 28, 50]] },
    castle: { bed: 'rain', spots: [['thunder', 22, 42], ['creak', 16, 30], ['toll', 40, 70]] },
    tvshow: { bed: 'hum', spots: [['beep', 12, 22], ['static', 22, 40], ['shutter', 18, 34]] },
    watertown: { bed: 'rain', spots: [['drip', 4, 9], ['woodblock', 26, 46], ['gull', 40, 70]] },
    skiresort: { bed: 'snow', spots: [['snowcrunch', 12, 24], ['wind', 14, 28], ['whistle', 40, 70]] },
    colliery: { bed: 'deep', spots: [['drip', 5, 11], ['hullcreak', 20, 36], ['rattle', 22, 40]] },
    oldtrain: { bed: 'wind', spots: [['clack', 5, 9], ['whistle', 26, 46], ['keys', 24, 44]] },
    princepalace: { bed: 'snow', spots: [['woodblock', 14, 28], ['toll', 38, 64], ['chime', 20, 36]] },
    biolab: { bed: 'hum', spots: [['beep', 8, 16], ['drip', 14, 28], ['motorhum', 20, 36]] },
    island: { bed: 'sea', spots: [['thunder', 24, 44], ['gull', 14, 28], ['wind', 14, 26]] },
    hotel1937: { bed: 'rain', spots: [['piano', 14, 28], ['vinyl', 12, 24], ['clink', 16, 32]] },
    ferry: { bed: 'sea', spots: [['foghorn', 22, 40], ['hullcreak', 20, 36]] },
    lastdish: { bed: 'fire', spots: [['pour', 18, 34], ['clink', 12, 24]] },
    library: { bed: 'hum', spots: [['paper', 12, 24], ['tick', 14, 26]] },
    wedding: { bed: 'wind', spots: [['chime', 16, 30], ['clink', 14, 26]] },
    antique: { bed: 'hum', spots: [['tick', 8, 16], ['vinyl', 14, 28]] },
    blackout: { bed: 'rain', spots: [['thunder', 20, 38], ['creak', 16, 30]] },
    homestay: { bed: 'snow', spots: [['wind', 16, 30], ['snowcrunch', 20, 36]] },
    troupe: { bed: 'hum', spots: [['gong', 26, 46], ['woodblock', 12, 24]] },
    liaoyang: { bed: 'rain', spots: [['beep', 9, 16], ['thunder', 24, 44]] },
    paimai: { bed: 'hum', spots: [['woodblock', 18, 36], ['clink', 14, 28]] },
    zujie: { bed: 'rain', spots: [['vinyl', 10, 20], ['piano', 20, 38]] },
    mirror: { bed: 'hum', spots: [['chime', 18, 34], ['drip', 10, 20]] },
    twins: { bed: 'wind', spots: [['piano', 16, 30], ['creak', 20, 36]] },
    haishen: { bed: 'sea', spots: [['foghorn', 24, 44], ['hullcreak', 18, 34], ['gull', 30, 50]] },
    xizhong: { bed: 'hum', spots: [['gong', 20, 40], ['woodblock', 8, 16]] },
    jiye: { bed: 'snow', spots: [['wind', 12, 24], ['beep', 24, 44]] },
    shoulingye: { bed: 'rain', spots: [['woodblock', 8, 15], ['toll', 40, 70]] },
    yunqi: { bed: 'snow', spots: [['wind', 14, 26], ['creak', 22, 40]] }
  };
  let themeId = null, themeIv = 0, extKind = null, extAtTheme = null;
  function themeStop() { themeId = null; clearTimeout(themeIv); themeIv = 0; }
  function themeLoop(th, tok) {
    const sp = th.spots[(Math.random() * th.spots.length) | 0];
    themeIv = setTimeout(() => {
      if (themeId !== tok) return;
      if (!muted && !document.hidden && ac && ac.state === 'running') play(fx[sp[0]]);
      themeLoop(th, tok);
    }, (sp[1] + Math.random() * (sp[2] - sp[1])) * 1000);
  }
  // ---------- 人物声音：每个人固定的“嗓音”和登场动机，用 id 哈希生成 ----------
  function voiceOf(id, age) {
    const h = hashStr(String(id));
    const a = +age || 35;
    const f0 = 110 + (h % 120) + (a < 25 ? 30 : a > 60 ? -15 : 0);
    return { f0, h, form: [[700, 1100], [500, 1700], [350, 2300], [450, 900], [600, 1400]][h % 5], wave: ['triangle', 'sawtooth', 'square'][(h >> 3) % 3], rate: 0.075 + ((h >> 5) % 5) * 0.012 };
  }
  function api2voice() {
    api.motif = (id) => play((t) => {
      const v = voiceOf(id), pent = [0, 2, 4, 7, 9], base = 392 * Math.pow(2, ((v.h >> 7) % 5 - 2) / 12);
      const mk = [(v.h >> 9) % 5, (v.h >> 12) % 5, (v.h >> 15) % 5];
      mk.forEach((d, i) => { const f = base * Math.pow(2, pent[d] / 12); tone(f, t + i * 0.11, 0.7, { type: (v.h >> 18) % 2 ? 'triangle' : 'sine', gain: 0.1 }); tone(f * 2, t + i * 0.11, 0.3, { gain: 0.02 }); });
    });
    api.voice = (id, age, len) => play((t) => {
      const v = voiceOf(id, age), n = Math.max(2, Math.min(11, Math.ceil((len || 40) / 9)));
      const r = mulberry(v.h);
      for (let i = 0; i < n; i++) {
        const tt = t + i * v.rate * (0.9 + r() * 0.5), f = v.f0 * (0.85 + r() * 0.5) * (i === n - 1 ? 0.8 : 1);
        const fm = v.form[(r() * 2) | 0] * (0.85 + r() * 0.35);
        tone(f, tt, 0.07, { type: v.wave, gain: 0.05, lp: fm, attack: 0.008 });
        noise(tt, 0.04, { f: fm, q: 4, gain: 0.02 });
      }
    });
    api.theme = (id) => {
      if (id && id === themeId) return;
      themeStop();
      const th = id && THEMES[id];
      if (!th) return;
      themeId = id; extAtTheme = extKind; ambStart(th.bed); themeLoop(th, id);
    };
  }
  const syncBtns = () => { try { document.querySelectorAll('.sfx-toggle').forEach((b) => { b.textContent = muted ? '🔇' : '🔊'; b.setAttribute('aria-label', muted ? '声音已关闭' : '声音已开启'); }); } catch (e) {} };
  // 所有带 .sfx-toggle 的按钮都是同一个静音开关
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.sfx-toggle'); if (!b) return; e.stopPropagation(); api.toggle(); }, true);
  const api = {
    muted: () => muted,
    sync: syncBtns,
    toggle() {
      muted = !muted; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
      if (ac && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.05);
      if (!muted) { wake(); if (mode) start(); }
      syncBtns();
      return muted;
    },
    wake
  };
  Object.keys(fx).forEach((k) => { api[k] = () => play(fx[k]); });
  api2voice();

  // ---------- 背景音乐 ----------
  function playBar(t) {
    const prog = PROG[bar % PROG.length]; const len = barLen();
    const base = root + (mode === 'menu' ? 0 : 0);
    // 铺底和弦
    prog.forEach((d, i) => {
      const m = base + degSemi(d) + (i === 0 ? -12 : 0);
      tone(hz(m), t, len + 1.5, { type: i === 0 ? 'triangle' : 'sine', gain: 0.07, attack: 1.6, bus: musicBus, lp: 900 });
    });
    tone(hz(base + degSemi(prog[0]) - 12), t, len + 1, { gain: 0.1, attack: 0.8, bus: musicBus });
    // 零散的琴音
    const n = mode === 'menu' ? 3 : 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + 0.4 + rnd() * (len - 1.2);
      const d = prog[Math.floor(rnd() * 3)] + (rnd() < 0.5 ? 7 : 14) + (rnd() < 0.25 ? 1 : 0);
      tone(hz(base + 12 + degSemi(d)), at, 2.2, { type: 'triangle', gain: 0.07 + rnd() * 0.04, attack: 0.012, bus: musicBus, lp: 2600 });
    }
    if (mode === 'win') tone(hz(base + 24), t, 2, { gain: 0.04, bus: musicBus });
    // 心跳：审问时叠加
    if (tense) {
      const beats = Math.floor(len / 0.95);
      for (let i = 0; i < beats; i++) {
        const bt = t + i * 0.95;
        tone(58, bt, 0.22, { to: 38, gain: 0.34, bus: musicBus }); tone(52, bt + 0.2, 0.2, { to: 36, gain: 0.24, bus: musicBus });
      }
      tone(hz(base + 36 + 1), t, len, { type: 'sine', gain: 0.018, attack: 2, bus: musicBus });
    }
    bar++;
  }
  const barLen = () => (mode === 'menu' ? 6.5 : 5.2);
  function sched() {
    if (!ac || muted || !mode || document.hidden) return;
    if (ac.state === 'suspended') return;
    const now = ac.currentTime;
    if (nextT < now) nextT = now + 0.05;
    let guard = 0;
    while (nextT < now + 1.2 && guard++ < 3) { playBar(nextT); nextT += barLen(); }
  }
  function start() {
    if (!ensure()) return;
    clearInterval(timer); nextT = 0; timer = setInterval(sched, LITE ? 400 : 250); sched();
  }
  // seed: 案件 id；tone: 案件基调
  api.music = (m, sd, tn) => {
    const key = m + '|' + sd;
    if (mode === m && key === api._key && timer) return;
    api._key = key; mode = m; seed = hashStr(String(sd || 'menu'));
    rnd = mulberry(seed);
    root = 40 + (seed % 9);
    scale = SCALES[m === 'menu' ? 'dorian' : (TONE_SCALE[tn] || (['minor', 'dorian', 'phryg', 'harm'][seed % 4]))];
    bar = seed % 4; tense = false;
    ensure(); start();
  };

  // ---------- 环境声（风 / 火 / 雨）：循环噪声 + 随机爆裂，音量很低 ----------
  let amb = null, ambKind = null;
  function ambStop() {
    if (!amb) return; const a = amb; amb = null; ambKind = null;
    try { a.g.gain.setTargetAtTime(0, ac.currentTime, 0.4); setTimeout(() => { try { a.src.stop(); } catch (e) {} }, 1500); } catch (e) {}
    clearInterval(a.iv);
  }
  // 环境床：rain 雨 / fire 火 / snow 雪风 / sea 海浪 / wind 夜风 / hum 室内低鸣 / deep 深水或矿井的低频
  const BED = { rain: [5200, 0.1], fire: [260, 0.05], snow: [520, 0.07], sea: [700, 0.09], wind: [620, 0.06], hum: [240, 0.035], deep: [150, 0.07] };
  function ambStart(kind) {
    kind = kind || null;
    if (kind === ambKind) return;
    ambStop(); ambKind = kind;
    if (!kind || !ensure()) return;
    try {
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass';
      const g = ac.createGain(); g.gain.value = 0;
      const bed = BED[kind] || BED.snow;
      f.frequency.value = bed[0];
      src.connect(f); f.connect(g); g.connect(musicBus); src.start();
      g.gain.setTargetAtTime(bed[1], ac.currentTime, 1.2);
      amb = { src, g, iv: 0 };
      amb.iv = setInterval(() => {
        if (!ac || muted || document.hidden || ac.state !== 'running') return;
        const t = ac.currentTime + 0.02;
        if (kind === 'fire' && Math.random() < 0.7) noise(t, 0.03 + Math.random() * 0.05, { f: 1800 + Math.random() * 3000, q: 1, gain: 0.05 + Math.random() * 0.06, bus: musicBus });
        if (kind === 'snow' || kind === 'wind') { f.frequency.setTargetAtTime(380 + Math.random() * 520, t, 1.5); g.gain.setTargetAtTime(bed[1] * (0.5 + Math.random() * 0.9), t, 1.5); }
        if (kind === 'rain') g.gain.setTargetAtTime(0.08 + Math.random() * 0.04, t, 0.8);
        if (kind === 'sea') { f.frequency.setTargetAtTime(300 + Math.random() * 700, t, 2.2); g.gain.setTargetAtTime(0.03 + Math.random() * 0.09, t, 2.2); }
        if (kind === 'deep') { f.frequency.setTargetAtTime(90 + Math.random() * 120, t, 2); g.gain.setTargetAtTime(0.04 + Math.random() * 0.06, t, 2); }
        if (kind === 'hum') g.gain.setTargetAtTime(0.025 + Math.random() * 0.02, t, 1.5);
      }, kind === 'fire' ? 160 : kind === 'sea' ? 2400 : 1800);
    } catch (e) { amb = null; ambKind = null; }
  }
  // 对外的 amb：外部切换环境床时，同时结束当前案件的点缀音
  api.amb = (kind) => {
    kind = kind || null;
    if (themeId && kind === extAtTheme) { extKind = kind; return; }   // 案件主题生效期间，同一个外部环境请求不打断它
    extKind = kind; themeStop(); ambStart(kind);
  };
  api.tension = (on) => { tense = !!on; };
  api.suspenseStop = () => { try { if (susGain) { susGain.gain.cancelScheduledValues(ac.currentTime); susGain.gain.setTargetAtTime(0, ac.currentTime, 0.3); susGain = null; } } catch (e) {} };
  api.stop = () => { themeStop(); ambStop(); mode = null; api._key = null; clearInterval(timer); timer = null; tense = false; };
  return api;
})();
if (typeof window !== 'undefined') { window.SFX = SFX; document.addEventListener('DOMContentLoaded', () => SFX.sync()); setTimeout(() => SFX.sync(), 0); }
