'use strict';
// 视觉特效：飘雪、点击涟漪、打字机、火花/彩带、卡片倾斜
const FX = (() => {
  // 画质：auto（按设备和实时帧率自动）/ high（全部特效）/ low（省电，几乎静止）
  const DEVLITE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  let quality = 'auto', degraded = false;
  try { quality = localStorage.getItem('jbs_q') || 'auto'; } catch (e) {}
  const isLite = () => quality === 'low' || (quality === 'auto' && (DEVLITE || degraded));
  const applyQ = () => { try { document.documentElement.classList.toggle('lite', isLite()); document.documentElement.dataset.q = quality; } catch (e) {} };
  applyQ();
  const LITE = DEVLITE; // 兼容旧代码
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setQuality(q) { quality = q; degraded = false; try { localStorage.setItem('jbs_q', q); } catch (e) {} applyQ(); }
  const QNAME = { auto: '自动', high: '高', low: '省电' };

  // 柔光雪花精灵：先画好再 drawImage，比每帧画圆路径快得多
  const sprites = {};
  function sprite(r) {
    if (sprites[r]) return sprites[r];
    const c = document.createElement('canvas'), n = Math.ceil(r * 2 + 2); c.width = c.height = n;
    const x = c.getContext('2d'), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    return (sprites[r] = c);
  }
  // 当前环境：fire / rain 时全局雪花暂停（由 body[data-amb] 决定）
  const ambOff = () => { const a = document.body && document.body.dataset.amb; return !!a && a !== 'snow'; };

  // 飘雪画布（三层景深 + 阵风）。返回 stop()
  function snow(canvas, o = {}) {
    if (!canvas || reduce()) return () => {};
    const ctx = canvas.getContext('2d');
    const want = o.count || 70, speed = o.speed || 1, alpha = o.alpha == null ? 0.8 : o.alpha;
    let w = 0, h = 0, raf = 0, flakes = [], dead = false, shrink = 1;
    const target = () => Math.max(8, Math.round((isLite() ? Math.min(want, 36) : want) * shrink));
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, isLite() ? 1.5 : 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // 输入文字时（键盘弹出、页面反复重排）暂停飘雪并隐藏画布，避免输入卡顿
    const isTyping = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
    const onFocusIn = (e) => { if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) canvas.style.visibility = 'hidden'; };
    const onFocusOut = () => { setTimeout(() => { if (!isTyping()) canvas.style.visibility = ''; }, 150); };
    document.addEventListener('focusin', onFocusIn); document.addEventListener('focusout', onFocusOut);
    // z：0 远（小、慢、淡）/ 1 中 / 2 近（大、快、虚）
    const mk = (top) => {
      const z = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2;
      const r = [1.6, 2.8, 6][z] * (0.8 + Math.random() * 0.5);
      return { x: Math.random() * (w + 60) - 30, y: top ? -12 : Math.random() * h, z, r, spr: sprite(Math.round(r)), v: [16, 30, 62][z] * (0.8 + Math.random() * 0.5), s: Math.random() * 6.28, a: [0.5, 0.8, 0.45][z] * (0.7 + Math.random() * 0.3) };
    };
    fit();
    flakes = Array.from({ length: target() }, () => mk(false));
    let last = performance.now(), lastDraw = 0, ema = 0.016, slow = 0, frames = 0, gust = 0;
    const tick = (t) => {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      const dtRaw = (t - last) / 1000; last = t;
      const dt = Math.min(0.05, dtRaw);
      if (document.hidden || isTyping()) return;
      if (o.global && ambOff()) { if (canvas._on) { ctx.clearRect(0, 0, w, h); canvas._on = false; } return; }
      canvas._on = true;
      const lite = isLite();
      if (lite && t - lastDraw < 33) return;
      lastDraw = t;
      // 帧率监测：自动画质下，连续卡顿就降级，绝不让特效拖慢操作
      ema += (dtRaw - ema) * 0.05; frames++;
      if (frames > 40 && ema > (lite ? 0.05 : 0.036)) { slow++; } else slow = Math.max(0, slow - 1);
      if (slow > 60) { slow = 0; if (quality === 'auto' && !lite) { degraded = true; applyQ(); } else shrink = Math.max(0.35, shrink * 0.7); }
      if (frames % 90 === 0) { const n = target(); while (flakes.length > n) flakes.pop(); while (flakes.length < n) flakes.push(mk(true)); }
      gust = Math.sin(t / 3400) * 0.6 + Math.sin(t / 1300) * 0.4;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.v * dt * speed; f.s += dt * (0.5 + f.z * 0.3);
        f.x += (Math.sin(f.s) * (8 + f.z * 6) + (6 + gust * 18) * (0.5 + f.z * 0.5)) * dt;
        if (f.y > h + 12) Object.assign(f, mk(true));
        if (f.x > w + 30) f.x = -20; else if (f.x < -40) f.x = w + 20;
        ctx.globalAlpha = f.a * alpha;
        const d = f.spr.width; ctx.drawImage(f.spr, f.x - d / 2, f.y - d / 2);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (!isTyping()) fit(); }, 250); };
    window.addEventListener('resize', onResize);
    return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(rt); window.removeEventListener('resize', onResize); document.removeEventListener('focusin', onFocusIn); document.removeEventListener('focusout', onFocusOut); };
  }

  // 每个案件 / 剧本的专属氛围：snow 飘雪 · fire 烛火炉火 · rain 雨 · storm 暴雨+闪电 · mist 雾气 · dust 灰尘光柱 · petals 花瓣 · spot 追光 · neon 霓虹
  const CASE_AMB = {
    ferry: 'mist', lastdish: 'fire', library: 'dust', wedding: 'petals', antique: 'dust', blackout: 'storm', homestay: 'snow',
    troupe: 'spot', liaoyang: 'storm', paimai: 'spot', zujie: 'neon', mirror: 'mist', twins: 'mist',
    haishen: 'mist', xizhong: 'spot', jiye: 'snow', shoulingye: 'rain', yunqi: 'snow', test: 'snow',
    teahouse: 'fire', bookclub: 'dust', campus: 'dust', lighthouse: 'storm', vineyard: 'dust', railway: 'snow', filmset: 'spot', museum: 'spot', onsen: 'snow', greenhouse: 'mist',
    casino: 'neon', observatory: 'rain', bank: 'rain', clanhall: 'fire', deepstation: 'mist',
    birthday: 'fire', reunion: 'dust', camping: 'fire', yacht: 'mist', circus: 'spot', castle: 'storm', tvshow: 'neon', watertown: 'rain', skiresort: 'snow', colliery: 'dust',
    oldtrain: 'mist', princepalace: 'snow', biolab: 'mist', island: 'storm', hotel1937: 'rain'
  };
  const AMB_SND = { snow: 'snow', mist: 'snow', fire: 'fire', rain: 'rain', storm: 'rain', neon: 'rain' };
  const caseAmb = (id) => CASE_AMB[id] || null;
  // 环境光层：全部是纯 CSS，只动 transform 和 opacity，GPU 合成，不占主线程
  function ambient(kind) {
    kind = kind || 'snow';
    try { document.body.dataset.amb = kind; } catch (e) {}
    try { if (window.SFX) SFX.amb(AMB_SND[kind] || null); } catch (e) {}
    let el = document.getElementById('amb');
    if (!el) {
      const n = (k, fn) => Array.from({ length: k }, (_, i) => fn(i)).join('');
      el = document.createElement('div'); el.id = 'amb';
      el.innerHTML = '<div class="fire-glow fx-loop"></div><div class="fire-glow2 fx-loop"></div>'
        + n(12, (i) => `<i class="ember fx-loop" style="--x:${(8 + i * 7.6 + (i % 3) * 3).toFixed(0)}%;--d:${(3.2 + (i * 0.7) % 3.4).toFixed(1)}s;--w:-${(i * 1.3) % 4}s"></i>`)
        + '<div class="rain r1 fx-loop"></div><div class="rain r2 fx-loop"></div><div class="flash fx-loop"></div>'
        + '<div class="mist m1 fx-loop"></div><div class="mist m2 fx-loop"></div><div class="mist m3 fx-loop"></div>'
        + '<div class="beam b1 fx-loop"></div><div class="beam b2 fx-loop"></div>'
        + n(14, (i) => `<i class="mote fx-loop" style="--x:${(4 + i * 7) % 96}%;--y:${(10 + i * 13) % 80}%;--d:${(7 + (i * 1.7) % 6).toFixed(1)}s;--w:-${(i * 1.9) % 7}s;--s:${(2 + (i % 3)).toFixed(0)}px"></i>`)
        + n(10, (i) => `<i class="petal fx-loop" style="--x:${(i * 10 + 3) % 98}%;--d:${(7 + (i * 1.3) % 5).toFixed(1)}s;--w:-${(i * 2.1) % 9}s;--r:${(i * 47) % 360}deg"></i>`)
        + '<div class="neon n1 fx-loop"></div><div class="neon n2 fx-loop"></div>';
      document.body.insertBefore(el, document.body.firstChild);
    }
  }

  // 点击涟漪
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn, .loc, .vote-card, .tabs button, .seal-btn, .door, .det-case, .sc-card');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement('span');
    const d = Math.max(r.width, r.height) * 1.6;
    s.className = 'rip';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
    pop(e.clientX, e.clientY);
  }, { passive: true });

  // 打字机
  function typewriter(el, text, speed, done) {
    let i = 0, timer = 0, finished = false;
    el.textContent = '';
    const finish = () => { if (finished) return; finished = true; clearInterval(timer); el.textContent = text; done && done(); };
    if (reduce()) { finish(); return { skip: finish, done: () => finished }; }
    timer = setInterval(() => { i++; el.textContent = text.slice(0, i); if (i % 3 === 0 && window.SFX) { try { SFX.type(); } catch (e) {} } if (i >= text.length) finish(); }, speed || 34);
    return { skip: finish, done: () => finished };
  }

  // 火花 / 彩带：kind = 'gold' | 'fog'
  function burst(parent, kind) {
    const wrap = document.createElement('div');
    wrap.className = 'burst ' + kind;
    const n = kind === 'gold' ? (LITE ? 16 : 46) : 8;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const x = Math.random() * 100;
      if (kind === 'gold') {
        const c = ['#e2b86f', '#fff1c4', '#f0a58b', '#84c9a0', '#cfe0ff'][i % 5];
        p.style.cssText = `left:${x}%;background:${c};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.8).toFixed(2)}s;--dx:${(Math.random() * 120 - 60).toFixed(0)}px;--rot:${(Math.random() * 720 - 360).toFixed(0)}deg`;
      } else {
        p.style.cssText = `left:${(x - 20).toFixed(0)}%;animation-delay:${(i * 0.4).toFixed(2)}s;top:${(30 + Math.random() * 50).toFixed(0)}%`;
      }
      wrap.appendChild(p);
    }
    parent.appendChild(wrap);
    return wrap;
  }

  // 卡片 3D 倾斜（鼠标/手指移动）
  function tilt(el) {
    if (!el || reduce()) return;
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5), y = ((e.clientY - r.top) / r.height - 0.5);
      el.style.transform = `perspective(700px) rotateY(${(x * 14).toFixed(1)}deg) rotateX(${(-y * 14).toFixed(1)}deg)`;
      el.style.setProperty('--sx', (x + 0.5) * 100 + '%');
    };
    const reset = () => { el.style.transform = ''; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', reset);
    el.addEventListener('pointerup', reset);
  }

  // 闪烁的小星星，撒在一个元素里
  function sparkle(el, n, o = {}) {
    if (!el || reduce() || LITE) return null;
    const w = document.createElement('div');
    w.className = 'spk-wrap';
    for (let i = 0; i < (n || 8); i++) {
      const s = document.createElement('i');
      s.className = 'spk';
      s.style.cssText = `left:${(Math.random() * 96).toFixed(0)}%;top:${(Math.random() * 96).toFixed(0)}%;--s:${(o.min || 6) + Math.random() * (o.max || 12)}px;animation-delay:-${(Math.random() * 3).toFixed(2)}s;animation-duration:${(1.5 + Math.random() * 2).toFixed(2)}s`;
      w.appendChild(s);
    }
    el.appendChild(w);
    return w;
  }
  // 点击处迸出一圈火花
  function pop(x, y) {
    if (reduce() || LITE) return;
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('i');
      const a = (i / 9) * 6.283 + Math.random() * 0.5, d = 26 + Math.random() * 30;
      s.className = 'popk';
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${(Math.random() * 180).toFixed(0)}deg`;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 750);
    }
  }
  return { snow, typewriter, burst, tilt, sparkle, pop, reduce, ambient, caseAmb, setQuality, quality: () => quality, qname: () => QNAME[quality], isLite };
})();
if (typeof window !== 'undefined') window.FX = FX;
