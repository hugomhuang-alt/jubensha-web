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
  api.amb = (kind) => {
    kind = kind || null;
    if (kind === ambKind) return;
    ambStop(); ambKind = kind;
    if (!kind || !ensure()) return;
    try {
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass';
      const g = ac.createGain(); g.gain.value = 0;
      f.frequency.value = kind === 'rain' ? 5200 : kind === 'fire' ? 260 : 520;
      src.connect(f); f.connect(g); g.connect(musicBus); src.start();
      const base = kind === 'rain' ? 0.1 : kind === 'fire' ? 0.05 : 0.07;
      g.gain.setTargetAtTime(base, ac.currentTime, 1.2);
      amb = { src, g, iv: 0 };
      amb.iv = setInterval(() => {
        if (!ac || muted || document.hidden || ac.state !== 'running') return;
        const t = ac.currentTime + 0.02;
        if (kind === 'fire' && Math.random() < 0.7) noise(t, 0.03 + Math.random() * 0.05, { f: 1800 + Math.random() * 3000, q: 1, gain: 0.05 + Math.random() * 0.06, bus: musicBus });
        if (kind === 'snow') { f.frequency.setTargetAtTime(380 + Math.random() * 420, t, 1.5); g.gain.setTargetAtTime(0.04 + Math.random() * 0.06, t, 1.5); }
        if (kind === 'rain') g.gain.setTargetAtTime(0.08 + Math.random() * 0.04, t, 0.8);
      }, kind === 'fire' ? 160 : 1800);
    } catch (e) { amb = null; ambKind = null; }
  };
  api.tension = (on) => { tense = !!on; };
  api.stop = () => { ambStop(); mode = null; api._key = null; clearInterval(timer); timer = null; tense = false; };
  return api;
})();
if (typeof window !== 'undefined') { window.SFX = SFX; document.addEventListener('DOMContentLoaded', () => SFX.sync()); setTimeout(() => SFX.sync(), 0); }
