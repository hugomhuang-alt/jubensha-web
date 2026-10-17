'use strict';
// 视觉特效：飘雪、点击涟漪、打字机、火花/彩带、卡片倾斜
const FX = (() => {
  // 手机/低配设备：关掉闪烁、发光、火花等持续特效，只留轻微飘雪，避免卡顿和闪烁
  const LITE = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4;
  try { if (LITE) document.documentElement.classList.add('lite'); } catch (e) {}
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 飘雪画布。返回 stop()
  function snow(canvas, o = {}) {
    if (!canvas || reduce()) return () => {};
    const ctx = canvas.getContext('2d');
    const count = LITE ? Math.min(o.count || 70, 22) : (o.count || 70), speed = o.speed || 1, alpha = o.alpha == null ? 0.7 : o.alpha;
    let w = 0, h = 0, raf = 0, flakes = [], dead = false;
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // 输入文字时（键盘弹出、页面反复重排）暂停飘雪并隐藏画布，避免输入卡顿
    const isTyping = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
    const onFocusIn = (e) => { if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) canvas.style.visibility = 'hidden'; };
    const onFocusOut = () => { setTimeout(() => { if (!isTyping()) canvas.style.visibility = ''; }, 150); };
    document.addEventListener('focusin', onFocusIn); document.addEventListener('focusout', onFocusOut);
    const mk = (top) => ({ x: Math.random() * w, y: top ? -10 : Math.random() * h, r: 0.6 + Math.random() * 2, v: 14 + Math.random() * 34, s: Math.random() * 6.28, a: 0.25 + Math.random() * 0.6 });
    fit();
    flakes = Array.from({ length: count }, () => mk(false));
    let last = performance.now(), lastDraw = 0;
    const tick = (t) => {
      if (dead) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (document.hidden) return;
      if (isTyping()) return;
      if (LITE && t - lastDraw < 40) return;
      lastDraw = t;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.v * dt * speed; f.s += dt * 0.8; f.x += Math.sin(f.s) * 10 * dt + 4 * dt;
        if (f.y > h + 6 || f.x > w + 6) Object.assign(f, mk(true));
        ctx.globalAlpha = f.a * alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);
    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (!isTyping()) fit(); }, 250); };
    window.addEventListener('resize', onResize);
    return () => { dead = true; cancelAnimationFrame(raf); clearTimeout(rt); window.removeEventListener('resize', onResize); document.removeEventListener('focusin', onFocusIn); document.removeEventListener('focusout', onFocusOut); };
  }

  // 点击涟漪
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn, .loc, .vote-card, .tabs button, .seal-btn');
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
  return { snow, typewriter, burst, tilt, sparkle, pop, reduce };
})();
if (typeof window !== 'undefined') window.FX = FX;
