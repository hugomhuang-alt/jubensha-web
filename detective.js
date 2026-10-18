'use strict';
// 单人侦探模式：纯前端。案件数据来自 window.__CASES（见 docs/detective-spec.md）。
// 进度存 localStorage（读写都包 try/catch，存不了也能玩）。
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = () => $('#det');
  let C = null;       // 当前案件
  let G = null;       // 当前进度
  let tab = 'brief';
  let sel = null;     // 当前审问的嫌疑人 id
  let pickClue = false;
  let lastClue = null;
  let confirmSubmit = false;
  let flash = null;     // 刚被问过话的人，用于触发一次表情动画
  let timers = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const muteBtn = () => `<button class="btn small ghost det-mute sfx-toggle" aria-label="音效开关">${window.SFX && SFX.muted() ? '🔇' : '🔊'}</button>`;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const cases = () => window.__CASES || [];
  const caseById = (id) => cases().find((c) => c.id === id);
  const key = (id) => 'det:' + id;
  let bstep = 0, mapOpen = null, fsel = null;
  const fresh = () => ({ ptr: {}, found: [], asked: {}, conf: {}, broken: [], log: [], mark: [], seen: {}, searches: 0, asks: 0, result: null, order: null });
  // 嫌疑人的显示顺序：每局随机，免得凶手总排在固定位置
  function suspectsOrdered() {
    if (!G.order || G.order.length !== C.suspects.length || !C.suspects.every((x) => G.order.includes(x.id))) {
      const a = C.suspects.map((x) => x.id);
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      G.order = a; save();
    }
    return G.order.map((id) => sus(id));
  }
  function save() { if (C) store.set(key(C.id), G); }

  const clueMap = () => { const m = {}; C.locations.forEach((l) => l.clues.forEach((k) => { m[k.id] = Object.assign({ loc: l.id, locName: l.name }, k); })); return m; };
  const sus = (id) => C.suspects.find((s) => s.id === id);
  const searchLeft = () => C.budget.search - G.searches;
  const askLeft = () => C.budget.ask - G.asks;
  const hasClue = (id) => G.found.includes(id);
  const isAsked = (sid, tid) => !!(G.asked[sid] && G.asked[sid].includes(tid));
  const isBroken = (sid, tid) => G.broken.includes(sid + '.' + tid);
  const needOk = (nd) => {
    if (nd.startsWith('clue:')) return hasClue(nd.slice(5));
    const [a, b] = nd.slice(4).split('.');
    return isAsked(a, b) || isBroken(a, b);
  };
  const toast = (m) => { if (window.toast) window.toast(m); };
  const sfx = (n) => { try { if (window.SFX && SFX[n]) SFX[n](); } catch (e) {} };
  const hashS = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ---------- 审问分层：先聊基本情况，再追问，最后才能深挖 ----------
  // 开场：每人前 3 个“不涉及谎言、没有前置条件”的话题，一开始就能问
  // 追问：其余没有前置条件的话题（含多数敏感问题），聊完两个开场话题后才出现
  // 深挖：需要证物/别人的口供作前置的话题，除满足前置外，还要先问过该人至少 3 件事
  const openersOf = (s) => {
    const o = s.topics.filter((t) => !t.lie && !(t.needs && t.needs.length)).slice(0, 3).map((t) => t.id);
    if (!o.length) { const f = s.topics.find((t) => !(t.needs && t.needs.length)); if (f) o.push(f.id); }
    return o;
  };
  const tierOf = (s, t) => (t.needs && t.needs.length ? 2 : openersOf(s).includes(t.id) ? 0 : 1);
  const talked = (s) => ((G.asked[s.id] || []).length) + Object.keys(G.conf).filter((k) => k.startsWith(s.id + '.')).length;
  const unlocked = (s, t) => {
    const tr = tierOf(s, t);
    if (tr === 0) return true;
    if (tr === 1) { const op = openersOf(s); return op.filter((id) => isAsked(s.id, id)).length >= Math.min(2, op.length); }
    return (t.needs || []).every(needOk) && talked(s) >= 3;
  };

  // ---------- 表情 ----------
  const MOOD_TXT = { nervous: '神色慌张', scared: '面露惧色', panic: '惊慌失措', shocked: '大吃一惊', angry: '怒形于色', annoyed: '明显不耐烦', weep: '神情黯然' };
  const RE_ANGRY = /凭什么|你敢|放肆|荒唐|荒谬|够了|无礼|滚|怀疑我|岂有此理|少废话|闭嘴|太过分|别太过分|我受够/;
  const RE_FEAR = /害怕|吓死|吓得|不敢|别过来|别问了|不要再|求你|别逼|我不想|我怕|发抖|救命/;
  const RE_SAD = /哭|眼泪|泪|难过|心痛|心疼|可怜|走得|不在了|舍不得|想念/;
  // 同一个人的同一句回答，每次表情都一样；说谎的人不一定紧张（也有面不改色的），老实人被问到敏感处也会不安
  function moodOfEntry(s, e) {
    const h = hashS(s.id + '|' + (e.t || e.title || '')) % 100;
    if (e.kind === 'c') {
      if (e.crack) return h < 55 ? 'panic' : 'scared';
      if (e.broke) return ['nervous', 'angry', 'shocked', 'weep'][h % 4];
      return h < 40 ? 'annoyed' : null;
    }
    const t = s.topics.find((x) => x.id === e.t) || {};
    if (t.mood) return t.mood === 'calm' ? null : t.mood;
    const txt = e.a || '';
    if (RE_ANGRY.test(txt)) return 'angry';
    if (RE_FEAR.test(txt)) return 'scared';
    if (RE_SAD.test(txt)) return 'weep';
    if (t.lie) return h < 28 ? null : h < 64 ? 'nervous' : h < 84 ? 'annoyed' : 'scared';
    if (t.needs && t.needs.length) return h < 38 ? 'nervous' : null;
    return null;
  }
  const portraitOf = (s, mood, crop) => ART.portrait(s.look, { age: s.age, crop: crop, mood: mood || null });
  const lastMood = (s) => { const l = G.log.filter((e) => e.s === s.id); return l.length ? moodOfEntry(s, l[l.length - 1]) : null; };

  // ---------- 入口 ----------
  function open() {
    $('#home').hidden = true; $('#room').hidden = true;
    root().hidden = false;
    delete document.body.dataset.tone;
    C = null; clearTimers(); renderList();
    try { SFX.music('menu', 'menu'); SFX.tension(false); } catch (e) {}
    window.scrollTo(0, 0);
  }
  function close() {
    root().hidden = true; C = null; clearTimers();
    try { SFX.stop(); } catch (e) {}
    delete document.body.dataset.tone;
    if (window.showHome) window.showHome();
  }

  function stars(n) { return '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i>'; }
  function renderList() {
    const list = cases();
    root().innerHTML = `
      <div class="det-wrap">
        <div class="det-top"><button class="btn small ghost" data-act="home">‹ 返回</button><div class="det-title">单人侦探</div>${muteBtn()}</div>
        <p class="det-lead">你是被请来的侦探。搜证、审问、对质，最后指认凶手。不需要朋友，也不需要开麦。</p>
        <div class="det-list">${list.map((c) => {
          const g = store.get(key(c.id)); const r = g && g.result;
          const badge = r ? `<span class="det-badge g-${r.grade}">${r.grade}</span>` : g && (g.searches || g.asks) ? '<span class="det-badge go">进行中</span>' : '';
          return `<button class="sc-card det-case" data-case="${esc(c.id)}">
            <div class="sc-art">${ART.sceneFor(c.id, 'cover', c.cover, { title: c.title, text: c.title + c.tagline })}</div>
            <div class="sc-info"><div class="sc-name">${esc(c.title)} ${badge}</div>
            <div class="sc-tag">${esc(c.tagline)}</div>
            <div class="sc-meta">难度 <span class="stars">${stars(c.difficulty)}</span> · 搜证 ${c.budget.search} 次 · 提问 ${c.budget.ask} 次</div></div></button>`;
        }).join('') || '<p class="det-lead">还没有案件。</p>'}</div>
      </div>`;
  }

  function start(id) {
    C = caseById(id); if (!C) return;
    const g = store.get(key(id));
    G = g && g.log ? Object.assign(fresh(), g) : fresh();
    tab = G.result ? 'accuse' : 'brief'; bstep = 0; mapOpen = null; fsel = null; sel = null; pickClue = false; lastClue = null; flash = null;
    clearTimers();
    document.body.dataset.tone = C.tone || 'none';
    try { FX.ambient(FX.caseAmb(C.id) || 'dust'); } catch (e) {}
    try { SFX.music('case', C.id, C.tone); SFX.tension(false); SFX.theme(C.id); } catch (e) {}
    window.scrollTo(0, 0);
    if (!G.result && !G.searches && !G.asks && !G.introDone) return showIntro();
    renderCase();
  }

  // ---------- 开场动画：只用淡入/缩放/位移（GPU 合成），播完就静止，不会卡 ----------
  function showIntro() {
    const idx = cases().findIndex((x) => x.id === C.id) + 1;
    const chars = [...C.title].map((ch, i) => `<span style="animation-delay:${(0.7 + i * 0.16).toFixed(2)}s">${esc(ch)}</span>`).join('');
    root().innerHTML = `<div class="det-intro" data-act="skipintro" role="button" aria-label="点击开始调查">
      <div class="di-bg">${ART.sceneFor(C.id, 'cover', C.cover, { title: C.title, text: C.title + C.tagline })}</div>
      <div class="di-shade"></div>
      <button class="btn small ghost di-back" data-act="introback" aria-label="返回案件列表">‹ 返回</button>
      <div class="di-c">
        <p class="di-no">CASE FILE · No.${String(idx).padStart(2, '0')} · 难度 ${'★'.repeat(C.difficulty)}</p>
        <h2 class="di-t">${chars}</h2>
        <p class="di-tag">${esc(C.tagline)}</p>
        <div class="di-stamp">卷宗开启</div>
        <p class="di-hint">轻点屏幕，开始调查</p>
      </div></div>`;
    sfx('swell'); later(() => sfx('stamp'), 1750);
  }
  function endIntro() {
    clearTimers(); if (!C) return;
    G.introDone = true; save(); window.scrollTo(0, 0); sfx('click');
    if (!G.cineDone && C.deathReport) return startCinema();
    renderCase();
  }

  // ---------- 主界面 ----------
  const TABS = [['brief', '档案'], ['search', '搜证'], ['ask', '审问'], ['notes', '笔记'], ['accuse', '指认']];
  function renderCase() {
    const keepY = window.scrollY; // 重绘后保持滚动位置，连续提问不用再往下拖
    confirmSubmit = false;
    if (G.result) tab = 'accuse';
    const body = { brief: viewBrief, search: viewSearch, ask: viewAsk, notes: viewNotes, accuse: viewAccuse }[tab]();
    root().innerHTML = `
      <div class="det-wrap">
        <div class="det-top"><button class="btn small ghost" data-act="list">‹ 返回</button><div class="det-title">${esc(C.title)}</div>
          <div class="det-tr">${muteBtn()}${G.result ? '' : `<div class="det-meter" title="剩余搜证 / 提问次数"><b>${searchLeft()}</b> 搜 · <b>${askLeft()}</b> 问</div>`}</div></div>
        ${G.result ? '' : `<nav class="tabs det-tabs">${TABS.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}${k === 'notes' && G.found.length ? `<em>${G.found.length}</em>` : ''}</button>`).join('')}</nav>`}
        ${guideBar()}
        <div class="det-body">${body}</div>
      </div>`;
    wireFx();
    if (keepY) { const back = () => window.scrollTo(0, keepY); back(); try { requestAnimationFrame(back); } catch (e) {} setTimeout(back, 30); }
    if (tab === 'brief') { fitFile(); try { requestAnimationFrame(fitFile); } catch (e) {} }
    try { SFX.tension((tab === 'ask' && !!sel) || (tab === 'accuse' && !G.result)); } catch (e) {}
  }
  function wireFx() { try { root().querySelectorAll('.det-fx').forEach((el) => FX.sparkle(el, 6, { min: 5, max: 8 })); } catch (e) {} }

  // ---------- 开场动画：发现尸体 → 在场的人 → 验尸；结束后进“档案” ----------
  let cineAt = 0, cineRun = null;
  // ---------- 电影式开场：一幕一幕的画面（淡入、镜头推拉、雾、月光、剪影），字幕取自本案时间线 ----------
  const SIL = '#04060d', RIM = '#c98a3c';
  const fmSky = (id, c1, c2) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
  const fmMoon = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r * 2.6}" fill="#fff6d0" opacity=".10"/><circle cx="${x}" cy="${y}" r="${r * 1.6}" fill="#fff6d0" opacity=".14"/><circle cx="${x}" cy="${y}" r="${r}" fill="#fdf6d8"/><circle cx="${x - r * .3}" cy="${y - r * .2}" r="${r * .2}" fill="#e6dcb0" opacity=".6"/><circle cx="${x + r * .25}" cy="${y + r * .3}" r="${r * .14}" fill="#e6dcb0" opacity=".5"/>`;
  const fmStars = (k) => Array.from({ length: k }, (_, i) => `<circle class="fm-st" style="animation-delay:${(i % 7) * .4}s" cx="${(i * 97 + 31) % 390}" cy="${(i * 53 + 11) % 230}" r="${i % 5 === 0 ? 1.5 : 1}" fill="#fff"/>`).join('');
  const fmFog = () => `<g class="fm-fog"><ellipse cx="80" cy="430" rx="200" ry="26" fill="#9fb2d8" opacity=".13"/><ellipse cx="300" cy="455" rx="220" ry="30" fill="#9fb2d8" opacity=".12"/></g>`;
  const person = (x, y, sc, fill, extra) => `<g transform="translate(${x} ${y}) scale(${sc})" fill="${fill || SIL}"><circle cx="0" cy="-46" r="9"/><path d="M-13 0 Q-14 -30 0 -34 Q14 -30 13 0Z"/>${extra || ''}</g>`;
  const FM = {
    establish: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice">${fmSky('g1', '#01030a', '#22345a')}<rect width="390" height="520" fill="url(#g1)"/>${fmStars(46)}${fmMoon(290, 120, 32)}
      <g class="fm-cloud"><ellipse cx="90" cy="110" rx="70" ry="9" fill="#2c3e66" opacity=".7"/><ellipse cx="140" cy="100" rx="44" ry="8" fill="#2c3e66" opacity=".7"/></g>
      <path d="M0 330 Q90 290 190 322 T390 310 V520H0Z" fill="#0b1224"/>
      <g fill="${SIL}"><path d="M10 380 l18 -120 l18 120z"/><path d="M36 384 l14 -86 l14 86z"/><path d="M330 384 l20 -130 l20 130z"/><path d="M360 388 l12 -70 l12 70z"/></g>
      <g class="fm-cam-in"><rect x="98" y="300" width="194" height="110" fill="#0e1528"/><polygon points="84,302 195,222 306,302" fill="#090e1d"/><rect x="240" y="228" width="16" height="40" fill="#090e1d"/>
        <rect class="fm-w" x="116" y="330" width="34" height="26" fill="#f1b955"/><rect class="fm-w" x="170" y="330" width="34" height="26" fill="#f1b955" style="animation-delay:.6s"/><rect class="fm-w" x="224" y="330" width="34" height="26" fill="#f1b955" style="animation-delay:1.1s"/><rect x="170" y="262" width="30" height="24" fill="#f1b955" opacity=".85"/><rect x="212" y="372" width="26" height="38" fill="#05070f"/><path d="M0 410 H390" stroke="#05070f" stroke-width="3"/></g>${fmFog()}</svg>`,
    arrive: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice">${fmSky('g2', '#050a16', '#141f38')}<rect width="390" height="520" fill="url(#g2)"/>
      <g class="fm-pan"><rect x="40" y="60" width="310" height="380" fill="#0b1224"/><path d="M150 440 V210 Q195 150 240 210 V440Z" fill="#06080f"/>
        <path class="fm-spill" d="M150 440 V210 Q195 150 240 210 V440Z" fill="#f4bb5e"/><path class="fm-beam" d="M150 440 L110 520 H280 L240 440Z" fill="#f4bb5e" opacity=".0"/>
        <rect x="86" y="130" width="6" height="40" fill="#222"/><rect x="74" y="152" width="30" height="40" rx="6" fill="#f6c36a" class="fm-lamp"/><circle cx="89" cy="172" r="46" fill="#f6c36a" opacity=".14" class="fm-lamp"/>
        ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${60 + i * 52}" y="60" width="2" height="380" fill="#10182c"/>`).join('')}
        <path d="M0 440 H390 V520 H0Z" fill="#070a14"/><path d="M0 456 H390" stroke="#141c30" stroke-width="2"/></g>
      ${Array.from({ length: Math.min(8, n) }, (_, i) => `<g class="fm-walker" style="--d:${(i * .8).toFixed(1)}s;--y:${462 + (i % 3) * 14}px;--s:${(1.15 + (i % 3) * .12).toFixed(2)}">${person(0, 0, 1, SIL, `<rect x="-3" y="0" width="6" height="22"/>`)}</g>`).join('')}${fmFog()}</svg>`,
    seated: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice"><rect width="390" height="520" fill="#0b0a0e"/><rect y="0" width="390" height="330" fill="#1a1318"/>
      <g><rect x="130" y="150" width="130" height="170" fill="#0d090b"/><rect x="144" y="170" width="102" height="150" fill="#05030a"/><ellipse class="fm-fire" cx="195" cy="300" rx="44" ry="26" fill="#ff8a2a"/><ellipse class="fm-fire" cx="195" cy="292" rx="26" ry="36" fill="#ffc35a" style="animation-delay:.2s"/><circle class="fm-fire" cx="195" cy="260" r="150" fill="#ff8a2a" opacity=".10" style="animation-delay:.1s"/></g>
      <rect x="40" y="100" width="46" height="60" fill="#0c0a0f" stroke="#33261a"/><rect x="304" y="96" width="46" height="60" fill="#0c0a0f" stroke="#33261a"/><circle cx="195" cy="110" r="16" fill="#120d0f" stroke="#4a3822"/><path d="M195 110 V100 M195 110 L202 114" stroke="#caa14a" stroke-width="1.5"/>
      <path d="M0 330 H390 V520 H0Z" fill="#0a0709"/><ellipse cx="195" cy="450" rx="150" ry="22" fill="#120c0d"/><rect x="186" y="418" width="8" height="26" fill="#d9c9a0"/><ellipse class="fm-fire" cx="190" cy="414" rx="4" ry="8" fill="#ffd27a"/>
      <g class="fm-seatrow">${Array.from({ length: Math.min(8, n) }, (_, i) => { const k = Math.min(8, n), ang = Math.PI * (0.12 + 0.76 * (i / Math.max(1, k - 1))); const x = 195 - Math.cos(ang) * 170, y = 440 + Math.sin(ang) * 46, sc = 0.9 + Math.sin(ang) * 0.35; return `<g class="fm-p" style="animation-delay:${(i * .25).toFixed(2)}s">${person(x, y, sc, '#050307', `<path d="M-13 -34 Q0 -40 13 -34" stroke="${RIM}" stroke-width="1.4" fill="none" opacity=".6"/>`)}</g>`; }).join('')}</g></svg>`,
    stairs: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice"><rect width="390" height="520" fill="#0b0b12"/><rect width="390" height="520" fill="#1a1520" opacity=".8"/>
      <rect x="40" y="60" width="64" height="86" fill="#0a0a10" stroke="#3a2c1c"/><rect x="290" y="90" width="56" height="74" fill="#0a0a10" stroke="#3a2c1c"/><circle cx="195" cy="64" r="20" fill="#120e12" stroke="#5a4528"/><path d="M195 64 V50 M195 64 L206 70" stroke="#caa14a" stroke-width="2"/>
      ${Array.from({ length: 9 }, (_, i) => `<polygon points="${20 + i * 38},${470 - i * 38} ${58 + i * 38},${470 - i * 38} ${58 + i * 38},${520} ${20 + i * 38},${520}" fill="${i % 2 ? '#14101a' : '#181320'}" stroke="#05040a"/><rect x="${20 + i * 38}" y="${466 - i * 38}" width="38" height="5" fill="#2a2030"/>`).join('')}
      <path d="M20 440 L360 100" stroke="#3a2a1a" stroke-width="4"/><path d="M20 440 L360 100" stroke="#caa14a" stroke-width="1" opacity=".4"/>
      <g class="fm-climb">${person(0, 0, 1.25, SIL, `<rect x="6" y="-30" width="14" height="10" fill="#e8e0c8" transform="rotate(-12)"/>`)}</g>
      <rect class="fm-lamp" x="250" y="40" width="130" height="260" fill="#f4bb5e" opacity=".07"/></svg>`,
    corridor: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice"><rect width="390" height="520" fill="#08070c"/>
      <polygon points="0,0 390,0 250,190 140,190" fill="#120f18"/><polygon points="0,520 390,520 250,330 140,330" fill="#0d0a10"/><polygon points="0,0 140,190 140,330 0,520" fill="#171320"/><polygon points="390,0 250,190 250,330 390,520" fill="#171320"/>
      <rect x="140" y="190" width="110" height="140" fill="#05040a"/>
      <rect class="fm-end" x="176" y="212" width="38" height="118" fill="#f4bb5e"/><rect x="176" y="212" width="38" height="118" fill="none" stroke="#2a1d10" stroke-width="3"/>
      <polygon class="fm-endlight" points="176,330 214,330 330,520 60,520" fill="#f4bb5e"/>
      ${[[40, 210, 70], [30, 150, 100]].map(([x, y, h]) => `<polygon points="${x},${y} ${x + 60},${y + 40} ${x + 60},${y + 40 + h} ${x},${y + h + 60}" fill="#0b0810" stroke="#2a2030"/>`).join('')}
      <polygon points="352,210 292,250 292,320 352,380" fill="#0b0810" stroke="#2a2030"/>
      <g class="fm-nanny"><g fill="${SIL}"><circle cx="0" cy="-46" r="9"/><path d="M-14 0 Q-15 -30 0 -34 Q15 -30 14 0 L20 44 H-20Z"/><rect x="8" y="-22" width="34" height="4"/></g><rect x="14" y="-30" width="9" height="8" fill="#e8e0c8"/><path class="fm-steam" d="M18 -34 q-3 -8 0 -14 q3 -6 0 -12" stroke="#e8e0c8" stroke-width="1.5" fill="none"/></g></svg>`,
    find: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice"><rect width="390" height="520" fill="#08060a"/>
      <rect x="40" y="60" width="310" height="300" fill="#150f12"/><rect x="40" y="60" width="60" height="300" fill="#0b0809"/><rect x="290" y="60" width="60" height="300" fill="#0b0809"/>
      ${Array.from({ length: 4 }, (_, i) => `<rect x="${52 + (i % 2) * 238}" y="${80 + Math.floor(i / 2) * 120}" width="34" height="100" fill="#201512" stroke="#3a2a1c"/>`).join('')}
      <path d="M0 360 H390 V520 H0Z" fill="#0b0709"/><polygon points="120,360 270,360 330,520 60,520" fill="#1a1210"/>
      <rect x="140" y="300" width="110" height="10" fill="#2a1a12"/><rect x="146" y="310" width="8" height="50" fill="#2a1a12"/><rect x="236" y="310" width="8" height="50" fill="#2a1a12"/><rect class="fm-lamp" x="226" y="270" width="20" height="30" fill="#f4bb5e"/>
      <g class="fm-body"><ellipse cx="195" cy="440" rx="62" ry="18" fill="#05030a"/><circle cx="148" cy="436" r="11" fill="#05030a"/><path d="M158 430 Q200 420 238 436 L250 450 Q200 462 160 448Z" fill="#05030a"/><ellipse cx="170" cy="452" rx="26" ry="6" fill="#5a0d12" opacity=".7"/></g>
      <g fill="#e8e0c8" opacity=".8"><rect x="250" y="452" width="16" height="10" transform="rotate(14 258 457)"/><rect x="108" y="468" width="16" height="10" transform="rotate(-20 116 473)"/></g>
      <g class="fm-door"><polygon points="0,0 60,40 60,420 0,520" fill="#0b0809"/><rect x="0" y="0" width="60" height="520" fill="#05030a" opacity=".5"/></g>
      <rect class="fm-redflash" width="390" height="520" fill="#d4121a"/></svg>`,
    police: (n) => `<svg viewBox="0 0 390 520" preserveAspectRatio="xMidYMid slice">${fmSky('g7', '#02040c', '#1a2a4c')}<rect width="390" height="520" fill="url(#g7)"/>${fmStars(30)}
      <g fill="${SIL}"><path d="M0 330 Q60 300 120 326 T250 318 T390 322 V360 H0Z"/><path d="M300 330 l16 -90 l16 90z"/><path d="M30 330 l14 -70 l14 70z"/></g>
      <rect x="150" y="282" width="90" height="52" fill="#0a1020"/><polygon points="142,284 195,246 248,284" fill="#070c18"/><rect x="170" y="296" width="14" height="12" fill="#f1b955"/><rect x="204" y="296" width="14" height="12" fill="#f1b955"/>
      <polygon points="160,360 230,360 360,520 30,520" fill="#0a0e1a"/><path d="M195 360 L195 520" stroke="#2a3558" stroke-width="3" stroke-dasharray="14 16"/>
      <g class="fm-rain">${Array.from({ length: 36 }, (_, i) => `<line x1="${(i * 41) % 390}" y1="${(i * 67) % 520}" x2="${(i * 41) % 390 - 6}" y2="${(i * 67) % 520 + 26}" stroke="#9fb4e0" stroke-width=".8" opacity=".35"/>`).join('')}</g>
      <g class="fm-pcar"><rect x="-70" y="-30" width="140" height="48" rx="14" fill="#e7eaf2"/><rect x="-52" y="-52" width="104" height="30" rx="10" fill="#c8cfdf"/><rect x="-46" y="-48" width="92" height="22" rx="6" fill="#16213a"/><rect x="-70" y="-6" width="140" height="10" fill="#1a2438"/><circle cx="-44" cy="20" r="14" fill="#05070f"/><circle cx="44" cy="20" r="14" fill="#05070f"/><circle cx="-52" cy="-8" r="8" fill="#fff6c8"/><circle cx="52" cy="-8" r="8" fill="#fff6c8"/><rect class="fm-lr" x="-34" y="-62" width="30" height="10" rx="3"/><rect class="fm-lb" x="4" y="-62" width="30" height="10" rx="3"/></g>
      <rect class="fm-wash" width="390" height="520"/></svg>`
  };
  function startCinema() {
    clearTimers(); try { SFX.tension(false); } catch (e) {}
    const R = C.deathReport || {}, v = C.victim, list = suspectsOrdered();
    root().innerHTML = `<div class="det-cine"><div class="dc-stage" id="dcStage" data-act="cinenext"></div><div class="fm-bar t"></div><div class="fm-bar b"></div><div class="fm-grain"></div><div class="fm-vig"></div><button class="btn small ghost dc-skip" data-act="cineskip">跳过 ›</button></div>`;
    const st = () => $('#dcStage');
    const type = (el, text, step, gap) => { let i = 0; const run = () => { if (!el || !el.isConnected) return; i = Math.min(text.length, i + (step || 1)); el.textContent = text.slice(0, i); if (i % 2 === 0) sfx('tick'); if (i < text.length) later(run, gap || 55); }; run(); };
    const beats = (k, every, from) => { for (let i = 0; i < k; i++) later(() => sfx('heartbeat'), (from || 0) + i * every); };
    const tl = (C.timeline || []).slice(0, 8), N = tl.length;
    const scenes = [];
    const film = (kind, tm, text, snd) => { // 一幕：黑场淡入 → 镜头缓动 → 字幕
      st().innerHTML = `<div class="fm fm-${kind}"><div class="fm-view">${FM[kind](list.length)}</div><div class="cs-cap"><b>${esc(tm)}</b><p id="csX"></p></div></div>`;
      later(() => type($('#csX'), text, 1, 55), 700); snd && snd();
    };
    scenes.push([5600, () => { sfx('suspense'); st().innerHTML = `<div class="fm fm-establish"><div class="fm-view">${FM.establish(list.length)}</div><div class="fm-title"><p class="dc-k">CASE FILE</p><h2>${esc(C.title)}</h2><p>${esc(C.tagline)}</p></div></div>`; later(() => sfx('owl'), 1500); later(() => sfx('cricket'), 600); }]);
    tl.forEach((e, i) => {
      const state = i === N - 1 ? 'police' : i === N - 2 ? 'find' : i < Math.ceil((N - 2) / 2) ? 'gather' : 'act';
      const kind = state === 'police' ? 'police' : state === 'find' ? 'find' : state === 'gather' ? (i % 2 === 0 ? 'arrive' : 'seated') : (i % 2 === 0 ? 'stairs' : 'corridor');
      const dur = Math.max(4200, 2200 + e.text.length * 60);
      scenes.push([dur, () => film(kind, e.t, e.text, () => {
        if (kind === 'arrive') { sfx('footsteps'); later(() => sfx('knock'), 2200); later(() => sfx('bell'), 2900); }
        if (kind === 'seated') { sfx('chat'); later(() => sfx('clink'), 1200); later(() => sfx('chat'), 2600); }
        if (kind === 'stairs') { sfx('footsteps'); later(() => sfx('creak'), 1500); later(() => sfx('footsteps'), 2400); }
        if (kind === 'corridor') { sfx('footsteps'); later(() => sfx('clink'), 1400); later(() => sfx('footsteps'), 2400); }
        if (kind === 'find') { beats(3, 800, 200); later(() => sfx('creak'), 1400); later(() => { sfx('stinger'); sfx('scream'); const c = $('.fm'); if (c) c.classList.add('boom'); }, 2600); }
        if (kind === 'police') { sfx('siren'); later(() => sfx('whoosh'), 400); }
      })]);
    });
    // —— 人物：八个人一个画面 ——
    scenes.push([7600, () => {
      st().innerHTML = `<div class="dc-all"><p class="dc-k">在场的人</p><div class="dc-ag">${list.map((x, i) => `<div class="dc-ap" style="animation-delay:${(0.3 + i * 0.45).toFixed(2)}s"><div class="dc-apav">${portraitOf(x, null, 'head')}</div><b>${esc(x.name)}</b><small>${esc(x.role)}</small></div>`).join('')}</div><p class="dc-line" style="animation-delay:${(0.5 + list.length * 0.45).toFixed(2)}s">他们之中，有一个人在说谎。</p></div>`;
      list.forEach((x, i) => later(() => sfx('lit'), 300 + i * 450)); later(() => sfx('stinger'), 500 + list.length * 450);
    }]);
    // —— 验尸：播完停住，等玩家自己点“开始调查” ——
    scenes.push([0, () => {
      const rows = [['死者', v.name], ['死亡时间', R.time], ['死因', R.cause], ['发现地点', R.loc ? ((C.locations.find((l) => l.id === R.loc) || {}).name || '') : '']].filter((r) => r[1]);
      st().innerHTML = `<div class="dc-s3"><div class="dc-paper"><div class="dc-ph"><span>现场勘验报告</span></div>${rows.map((r, i) => `<div class="dc-pr"><b>${r[0]}</b><span id="dcR${i}"></span></div>`).join('')}<ul class="dc-pn">${(R.notes || []).slice(0, 3).map((n, i) => `<li id="dcN${i}"></li>`).join('')}</ul><i class="dc-stamp">已验尸</i></div><div class="dc-flash w"></div><button class="btn primary dc-go" data-act="cineskip">开始调查 ›</button></div>`;
      $('.dc-skip').style.display = 'none';
      sfx('shutter'); later(() => sfx('shutter'), 380);
      let at = 900;
      rows.forEach((r, i) => { const t0 = at; later(() => type($('#dcR' + i), String(r[1]), 1, 45), t0); at += Math.min(1200, 200 + String(r[1]).length * 45); });
      (R.notes || []).slice(0, 3).forEach((n, i) => { const t0 = at; later(() => type($('#dcN' + i), n, 1, 38), t0); at += Math.min(1400, 200 + n.length * 38); });
      later(() => { const sp = $('.dc-stamp'); if (sp) sp.classList.add('on'); sfx('stamp'); }, at + 300);
      later(() => { const g = $('.dc-go'); if (g) g.classList.add('on'); }, at + 900);
    }]);
    cineRun = (i) => {
      if (i >= scenes.length) return;
      cineAt = i; clearTimers(); scenes[i][1]();
      if (scenes[i][0] > 0) later(() => cineRun(i + 1), scenes[i][0]);
    };
    cineRun(0);
    cineLast = scenes.length - 1;
  }
  let cineLast = 0;
  function cineNext() { if (cineRun && cineAt < cineLast) cineRun(cineAt + 1); }
  function endCinema() {
    clearTimers(); try { SFX.suspenseStop(); } catch (e) {}
    if (!C) return; G.cineDone = true; save(); tab = 'brief'; bstep = 0; renderCase(); window.scrollTo(0, 0); sfx('click');
  }

  // ---------- 档案：案情 / 人物 / 地图 / 时间线 / 死因，每页一屏、不用上下滑 ----------
  const BSTEPS = ['案情', '人物', '地图', '时间线', '死因'];
  function viewBrief() {
    bstep = Math.max(0, Math.min(BSTEPS.length - 1, bstep));
    const page = [filePage0, filePage1, filePage2, filePage3, filePage4][bstep]();
    return `<div class="det-file"><nav class="df-seg">${BSTEPS.map((n, i) => `<button data-bs="${i}" class="${i === bstep ? 'on' : ''}">${n}</button>`).join('')}</nav>
      <div class="df-page" id="dfPage">${page}</div>
      <div class="df-foot"><button class="btn ghost" data-act="cinereplay">重播开场</button><button class="btn primary det-fx" data-tab="search">开始调查</button></div></div>`;
  }
  function filePage0() {
    return `<div class="df-in"><h3 class="df-t">${esc(C.title)}</h3><p class="df-p">${esc(C.brief).replace(/\n/g, '<br>')}</p>
      <h4 class="df-h">已知事实</h4><ul class="df-ul">${C.publicFacts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
  }
  function filePage1() {
    const R = C.relations || {}, list = suspectsOrdered();
    if (!fsel || !sus(fsel)) fsel = list[0].id;
    const cur = sus(fsel);
    const links = (C.links || []).filter((k) => k.a === fsel || k.b === fsel).map((k) => { const o = sus(k.a === fsel ? k.b : k.a); return `<li><b>${esc(o.name)}</b>：${esc(k.text)}</li>`; }).join('');
    return `<div class="df-in df-people"><div class="df-grid">${list.map((x) => `<button class="df-pc ${x.id === fsel ? 'on' : ''}" data-fsel="${x.id}"><div class="df-pav">${portraitOf(x, null, 'head')}</div><b>${esc(x.name)}</b><small>${esc(x.role)}</small></button>`).join('')}</div>
      <div class="df-detail"><div class="df-dh"><b>${esc(cur.name)}</b><span>${esc(cur.role)}${cur.age ? ' · ' + cur.age + ' 岁' : ''}</span></div>
      <p class="df-p"><em>与死者</em>${esc(R[cur.id] || cur.bio || '')}</p>${links ? `<ul class="df-ul tight">${links}</ul>` : ''}</div></div>`;
  }
  function filePage2() {
    const dead = C.deathReport && C.deathReport.loc;
    if (!mapOpen || !C.locations.some((l) => l.id === mapOpen)) mapOpen = C.locations[0].id;
    const cur = C.locations.find((l) => l.id === mapOpen);
    return `<div class="df-in df-map"><div class="df-mgrid">${C.locations.map((l) => `<button class="df-mt ${l.id === mapOpen ? 'on' : ''} ${l.id === dead ? 'dead' : ''}" data-maploc="${l.id}"><div class="df-mav">${ART.sceneFor(C.id, l.id, l.scene, { text: l.name + l.desc })}</div><b>${esc(l.name)}</b>${l.id === dead ? '<em>发现死者</em>' : ''}</button>`).join('')}</div>
      <div class="df-detail"><div class="df-dh"><b>${esc(cur.name)}</b>${cur.id === dead ? '<span class="red">发现死者的地方</span>' : ''}</div><p class="df-p">${esc(cur.desc)}</p></div></div>`;
  }
  function filePage3() {
    return `<div class="df-in"><h4 class="df-h first">现场时间线</h4><div class="df-tl">${C.timeline.map((t) => `<div><b>${esc(t.t)}</b><span>${esc(t.text)}</span></div>`).join('')}</div></div>`;
  }
  function filePage4() {
    const d = C.deathReport || {}, v = C.victim;
    const where = d.loc ? (C.locations.find((l) => l.id === d.loc) || {}).name : '';
    const rows = [['死亡时间', d.time], ['死因', d.cause], ['发现经过', d.scene], ['发现地点', where]].filter((r) => r[1]);
    return `<div class="df-in"><div class="df-victim"><div class="df-pav big">${ART.portrait(v.look, { age: v.age || 50 })}</div><div><h4 class="df-h first">死者 · ${esc(v.name)}</h4><p class="df-p sm">${esc(v.desc)}</p></div></div>
      <div class="det-report">${rows.map(([k, t]) => `<div class="det-rp-r"><b>${k}</b><span>${esc(t)}</span></div>`).join('')}${d.notes && d.notes.length ? `<div class="det-rp-n"><b>勘验记录</b><ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}</div></div>`;
  }
  // 让档案页刚好装进一屏：先量剩余高度，内容太多就缩小字号
  function fitFile() {
    const root0 = $('.det-file'), pg = $('#dfPage'); if (!root0 || !pg) return;
    const top = root0.getBoundingClientRect().top + window.scrollY;
    root0.style.height = Math.max(320, window.innerHeight - top - 42) + 'px';
    let fs = 15; pg.style.setProperty('--fs', fs + 'px');
    for (let i = 0; i < 12 && pg.scrollHeight > pg.clientHeight + 1 && fs > 10; i++) { fs -= 0.5; pg.style.setProperty('--fs', fs + 'px'); }
  }

  // ---------- 新手引导：四步流程条 + 每一步当前该做什么 ----------
  const STEPS = [['brief', '看档案'], ['search', '搜证'], ['ask', '审问'], ['accuse', '指认']];
  function guideBar() {
    if (G.result) return '';
    const done = [!!G.cineDone && G.tutDone, G.searches > 0, G.asks > 0, false];
    const found = G.found.length;
    let tip = '';
    if (tab === 'brief') tip = '先读完档案（案情、人物、地图、时间线、死因），然后点“开始调查”。';
    else if (tab === 'search') tip = G.searches === 0 ? `第 2 步：点一个地点，再点里面的东西搜证。总共能搜 ${C.budget.search} 次，先去最可疑的地方。` : (G.asks === 0 && found >= 3 ? `已找到 ${found} 条线索。下一步：去“审问”，当面问嫌疑人。` : `已找到 ${found} 条线索，还能搜 ${searchLeft()} 次。线索自动存进“笔记”。`);
    else if (tab === 'ask') tip = !sel ? '第 3 步：点上面一个人物，开始审问。' : (G.asks === 0 ? '点下面的问题向他提问。注意回答里前后矛盾、含糊其辞的地方。' : '回答有破绽？点“出示证物”拿线索质问他。问得差不多了，就去“指认”。');
    else if (tab === 'notes') tip = '这里是你找到的线索和标记的嫌疑人。自己对照，找出谁在说谎。';
    else if (tab === 'accuse') tip = '第 4 步：依次选 凶手 → 作案手法 → 动机，最后点“提交指认”。只能指认一次，提交后案件结束。';
    const cur = tab === 'notes' ? -1 : STEPS.findIndex((x) => x[0] === tab);
    return `<div class="det-guide"><div class="dg-steps">${STEPS.map((x, i) => `<button data-tab="${x[0]}" class="${i === cur ? 'on' : ''} ${done[i] ? 'ok' : ''}"><i>${done[i] ? '✓' : i + 1}</i>${x[1]}</button>`).join('<span class="dg-ar">›</span>')}</div><p class="dg-tip">${esc(tip)}</p></div>`;
  }
  function showTut() {
    root().insertAdjacentHTML('beforeend', `<div class="det-tut"><div class="dt-card"><h3>怎么玩</h3><ol>
      <li><b>搜证</b><span>点地点 → 点里面的东西，找到线索。次数有限（${C.budget.search} 次）。</span></li>
      <li><b>审问</b><span>点人物 → 点问题。回答里的矛盾就是突破口；有了证物，可以“出示证物”质问他（共 ${C.budget.ask} 问）。</span></li>
      <li><b>指认</b><span>选 凶手、手法、动机，然后提交。只能一次，提交后案件结束。</span></li>
      <li><b>随时翻档案</b><span>人物关系、地图、时间线都在“档案”里；线索都在“笔记”里。</span></li></ol>
      <button class="btn primary" data-act="tutok">明白了，去搜证</button></div></div>`);
  }
  function viewSearch() {
    const cm = clueMap();
    const locs = C.locations.map((l) => {
      const got = (G.ptr[l.id] || 0), left = l.clues.length - got;
      const list = l.clues.slice(0, got).map((k) => `<button class="det-ev ${lastClue === k.id ? 'new' : ''}" data-ev="${k.id}"><b>${esc(k.title)}</b></button>`).join('');
      return `<div class="det-loc"><div class="det-loc-art">${ART.sceneFor(C.id, l.id, l.scene, { text: l.name + l.desc })}<div class="det-loc-n">${esc(l.name)}</div></div>
        <div class="det-loc-b"><p class="det-d">${esc(l.desc)}</p>
        <div class="det-evs">${list}</div>
        <button class="btn small ${left > 0 && searchLeft() > 0 ? 'det-go' : ''}" data-search="${l.id}" ${left <= 0 || searchLeft() <= 0 ? 'disabled' : ''}>${left <= 0 ? '已搜遍' : searchLeft() <= 0 ? '次数用完' : got ? '再仔细搜一次' : '搜查这里'}</button></div></div>`;
    }).join('');
    const ev = lastClue && cm[lastClue] ? evCard(cm[lastClue], true) : '';
    return `${ev}<div class="det-grid">${locs}</div>`;
  }
  const evCard = (k, pop) => `<div class="card det-evcard${pop ? ' pop' : ''}"><h4>证物 · ${esc(k.title)} <small>${esc(k.locName)}</small></h4><p class="det-p">${esc(k.text)}</p></div>`;

  // ---------- 审问 ----------
  function viewAsk() {
    const chips = suspectsOrdered().map((s) => {
      const star = G.mark.includes(s.id);
      return `<button class="det-sus ${sel === s.id ? 'on' : ''}" data-sus="${s.id}"><div class="av">${ART.portrait(s.look, { age: s.age, crop: 'head' })}</div><div class="nm">${esc(s.name)}</div><div class="ch">${esc(s.role)}</div>${star ? '<i class="mk">★</i>' : ''}</button>`;
    }).join('');
    return `<div class="det-sus-row">${chips}</div>${sel ? panel(sus(sel)) : '<div class="card"><p class="det-p"><b>审问怎么做</b></p><ol class="det-how"><li>点上面的人物头像，选中一个人</li><li>点下面的问题提问，看他怎么回答</li><li>发现矛盾？点“出示证物”质问</li><li>每个人只说自己知道的，也会隐瞒</li></ol></div>'}`;
  }
  function panel(s) {
    const cm = clueMap();
    const seen = G.seen[s.id];
    const vis = s.topics.filter((t) => unlocked(s, t));
    const lockedP = s.topics.filter((t) => tierOf(s, t) === 1 && !unlocked(s, t)).length;
    const lockedD = s.topics.filter((t) => tierOf(s, t) === 2 && !unlocked(s, t)).length;
    const btn = (t) => {
      const asked = isAsked(s.id, t.id), br = isBroken(s.id, t.id), fresh = seen && !seen.includes(t.id) && !asked;
      return `<button class="det-q ${asked ? 'done' : ''} ${br ? 'broken' : ''} ${fresh ? 'fresh' : ''}" data-q="${t.id}">${esc(t.q)}${br ? ' <em>已揭穿</em>' : ''}${fresh ? ' <em class="nw">新</em>' : ''}</button>`;
    };
    const GROUPS = [[0, '开场 · 先聊聊基本情况'], [1, '追问 · 他对你松口了'], [2, '深挖 · 拿住他的破绽']];
    const btns = GROUPS.map(([tr, label]) => {
      const list = vis.filter((t) => tierOf(s, t) === tr); if (!list.length) return '';
      return `<div class="det-grp">${label}</div>${list.map(btn).join('')}`;
    }).join('');
    const hint = [];
    if (lockedP) hint.push(`🔒 还有 ${lockedP} 个更敏感的问题：先把开场的话题聊两个，对方才肯往下说。`);
    if (lockedD) hint.push(`🔒 还有 ${lockedD} 个深挖话题：需要更多证物或别人的口供，也要先和他多聊几句。`);
    const found = G.found.map((id) => cm[id]).filter(Boolean);
    const showList = pickClue ? `<div class="det-pick">${found.length ? found.map((k) => `<button class="det-ev" data-conf="${k.id}"><b>${esc(k.title)}</b><small>${esc(k.locName)}</small></button>`).join('') : '<p class="det-dim">你还没有证物。先去搜证。</p>'}</div>` : '';
    const log = G.log.filter((e) => e.s === s.id);
    const recent = log.length - 6;
    const lg = log.map((e, i) => {
      const mood = moodOfEntry(s, e);
      const mini = i >= recent ? `<div class="mini">${portraitOf(s, mood, 'head')}</div>` : `<div class="mini dot">${esc(s.name.charAt(0))}</div>`;
      return e.kind === 'q'
        ? `<div class="det-msg me"><span>${esc(e.q)}</span></div><div class="det-msg them ${isBroken(s.id, e.t) ? 'lie' : ''}">${mini}<span>${esc(e.a)}${MOOD_TXT[mood] ? `<i class="det-mt">（${MOOD_TXT[mood]}）</i>` : ''}</span></div>`
        : `<div class="det-msg me ev"><span>出示：${esc(e.title)}</span></div><div class="det-msg them ${e.crack ? 'crack' : e.broke ? 'lie' : ''}">${mini}<span>${esc(e.a)}${MOOD_TXT[mood] ? `<i class="det-mt">（${MOOD_TXT[mood]}）</i>` : ''}</span></div>${e.truth ? `<div class="det-note">${esc(s.name)}改口：${esc(e.truth)}</div>` : ''}`;
    }).join('');
    const mood = lastMood(s), act = flash === s.id; flash = null;
    return `<div class="card det-panel">
      <div class="det-ph"><div class="det-big m-${mood || 'calm'} ${act ? 'act' : ''}">${portraitOf(s, mood)}${MOOD_TXT[mood] ? `<em class="det-moodtag">${MOOD_TXT[mood]}</em>` : ''}</div><div><h4>${esc(s.name)} · ${esc(s.role)}</h4><p class="det-p">${esc(s.bio)}</p><p class="det-dim">语气：${esc(s.demeanor)}</p></div></div>
      <div class="det-log" id="detLog">${lg || '<p class="det-dim">还没问过话。从开场的话题聊起。</p>'}</div>
      <div class="det-qs">${btns}${hint.map((h) => `<p class="det-dim det-lock">${h}</p>`).join('')}</div>
      <div class="det-actions"><button class="btn small ${pickClue ? 'danger' : ''}" data-act="pick">${pickClue ? '取消' : '出示证物 ›'}</button>
      <button class="btn small ghost" data-mark="${s.id}">${G.mark.includes(s.id) ? '取消标记嫌疑' : '标记为嫌疑'}</button></div>${showList}</div>`;
  }
  function ask(sid, tid) {
    const s = sus(sid), t = s.topics.find((x) => x.id === tid); if (!t) return;
    const again = isAsked(sid, tid);
    if (!again) {
      if (askLeft() <= 0) return toast('提问次数用完了。可以去指认了。');
      G.seen[sid] = s.topics.filter((x) => unlocked(s, x)).map((x) => x.id);
      G.asks++; (G.asked[sid] = G.asked[sid] || []).push(tid);
      G.log.push({ s: sid, kind: 'q', t: tid, q: t.q, a: t.a, lie: !!t.lie });
    }
    flash = sid; save(); renderCase(); scrollLog();
    const e = G.log.filter((x) => x.s === sid).pop();
    if (!again) {
      sfx('ask'); reactSfx(moodOfEntry(s, e), e && e.a, sid); later(() => { try { SFX.voice(sid, s.age, String(e && e.a || '').length); } catch (x) {} }, 160);
      const n = s.topics.filter((x) => unlocked(s, x) && !G.seen[sid].includes(x.id)).length;
      if (n > 0) later(() => toast(`${s.name} 松了口，多出 ${n} 个可问的话题`), 350);
    }
  }
  // 人物反应音：生气低吼、受惊吸气、哭泣；紧张咳嗽、不耐烦哼声；回答里带叹息或迟疑时叹气 / “嗯……”
  function reactSfx(m, text, sid) {
    if (m === 'angry') return later(() => sfx('growl'), 120);
    if (m === 'scared' || m === 'panic' || m === 'shocked') return later(() => sfx('gasp'), 120);
    if (m === 'weep') return later(() => sfx('sob'), 150);
    if (m === 'nervous') return later(() => sfx('cough'), 140);
    if (m === 'annoyed') return later(() => sfx('huff'), 120);
    const t = String(text || ''), h = hashS((sid || '') + '|' + t) % 100;
    if (/唉|叹了|叹气|无奈|算了|罢了|没办法/.test(t)) later(() => sfx('sigh'), 120);
    else if (/呃|嗯|……|…|我想想|记不清|不太记得|说不好/.test(t) && h < 70) later(() => sfx('hmm'), 120);
  }
  function confront(cid) {
    const s = sus(sel), cm = clueMap(), k = cm[cid]; if (!k) return;
    const ck = sel + '.' + cid;
    pickClue = false;
    if (G.conf[ck]) { renderCase(); return scrollLog(); }
    if (askLeft() <= 0) { renderCase(); return toast('提问次数用完了。'); }
    G.asks++; G.conf[ck] = 1;
    const f = (s.confronts || []).find((x) => x.clue === cid);
    G.seen[sel] = s.topics.filter((x) => unlocked(s, x)).map((x) => x.id);
    const e = { s: sel, kind: 'c', title: k.title, a: f ? f.a : s.fallback };
    if (f && f.breaks && !isBroken(sel, f.breaks)) {
      G.broken.push(sel + '.' + f.breaks);
      const t = s.topics.find((x) => x.id === f.breaks);
      e.broke = true; e.truth = t && t.truth; e.crack = !!f.crack;
    }
    G.log.push(e); flash = sel; save(); renderCase(); scrollLog();
    sfx('confront'); later(() => { try { SFX.voice(sel, s.age, String(e.a || '').length); } catch (x) {} }, 420);
    if (e.crack) later(() => sfx('crack'), 260); else if (e.broke) later(() => sfx('lie'), 260); else reactSfx(moodOfEntry(s, e), e.a, s.id);
    if (e.crack) { try { const b = FX.burst(root(), 'gold'); setTimeout(() => b.remove(), 4500); } catch (x) {} }
  }
  function scrollLog() { const el = $('#detLog'); if (el) el.scrollTop = el.scrollHeight; }

  // ---------- 笔记 ----------
  function viewNotes() {
    const cm = clueMap();
    const ev = G.found.length ? G.found.map((id) => evCard(cm[id])).join('') : '<div class="card"><p class="det-dim">还没有证物。去搜证吧。</p></div>';
    const broken = G.broken.map((b) => { const [sid, tid] = b.split('.'); const s = sus(sid), t = s.topics.find((x) => x.id === tid); return `<li><b>${esc(s.name)}</b>：${esc(t.q)} → ${esc(t.truth)}</li>`; }).join('');
    const marks = G.mark.map((id) => esc(sus(id).name)).join('、');
    return `<div class="card"><h4>被揭穿的谎言</h4>${broken ? `<ul class="det-ul">${broken}</ul>` : '<p class="det-dim">暂无。用证物对质，才能让他们改口。</p>'}</div>
      <div class="card"><h4>标记的嫌疑人</h4><p class="det-p">${marks || '<span class="det-dim">暂无</span>'}</p></div>
      <h4 class="det-h">证物（${G.found.length}）</h4>${ev}`;
  }

  // ---------- 指认 ----------
  function viewAccuse() {
    const r = G.result;
    if (r) return resultView(r);
    const A = G.draft || {};
    const sol = C.solution;
    return `<div class="card"><h4>谁是凶手？</h4><div class="det-pickrow">${suspectsOrdered().map((s) => `<button class="det-opt ${A.culprit === s.id ? 'on' : ''}" data-draft="culprit:${s.id}">${esc(s.name)}<small>${esc(s.role)}</small></button>`).join('')}</div></div>
      <div class="card"><h4>${esc(sol.method.q)}</h4>${sol.method.options.map((o, i) => `<button class="det-opt wide ${A.method === i ? 'on' : ''}" data-draft="method:${i}">${esc(o)}</button>`).join('')}</div>
      <div class="card"><h4>${esc(sol.motive.q)}</h4>${sol.motive.options.map((o, i) => `<button class="det-opt wide ${A.motive === i ? 'on' : ''}" data-draft="motive:${i}">${esc(o)}</button>`).join('')}</div>
      <p class="det-dim">只能指认一次。想清楚再提交。</p>
      <button class="btn primary det-fx" data-act="submit" ${A.culprit && A.method != null && A.motive != null ? '' : 'disabled'}>提交指认</button>`;
  }
  function submit() {
    const A = G.draft || {}, sol = C.solution;
    const okC = A.culprit === sol.culprit, okM = A.method === sol.method.correct, okV = A.motive === sol.motive.correct;
    const keys = sol.keyClues.filter(hasClue).length;
    const score = (okC ? 40 : 0) + (okM ? 15 : 0) + (okV ? 15 : 0) + Math.round(30 * keys / sol.keyClues.length);
    const grade = !okC ? 'C' : score >= 95 ? 'S' : score >= 80 ? 'A' : 'B';
    G.result = { okC, okM, okV, keys, total: sol.keyClues.length, score, grade, culprit: A.culprit, asks: G.asks, searches: G.searches };
    save(); reveal();
  }
  // 指认后的揭晓：鼓点、被指认者的脸、真相一击；点一下可跳过
  function reveal() {
    const r = G.result, acc = sus(r.culprit); clearTimers();
    root().insertAdjacentHTML('beforeend', `<div class="det-reveal" data-act="skipreveal" role="button" aria-label="跳过">
      <div class="dr-in"><p class="dr-a">你指认的是</p><div class="dr-p">${portraitOf(acc, null)}</div><h3 class="dr-n">${esc(acc.name)}</h3><p class="dr-b">……</p></div></div>`);
    sfx('drum');
    later(() => {
      const ov = $('.det-reveal'); if (!ov) return;
      ov.classList.add(r.okC ? 'yes' : 'no');
      $('.dr-p', ov).innerHTML = portraitOf(acc, r.okC ? 'panic' : 'angry');
      $('.dr-b', ov).textContent = r.okC ? '没错。就是他。' : '不是他。你抓错人了。';
      if (r.okC) { sfx('crack'); later(() => sfx('cuff'), 450); } else sfx('laugh');
    }, 2200);
    later(endReveal, r.okC ? 6000 : 5600);
  }
  function endReveal() {
    clearTimers(); const ov = $('.det-reveal'); if (ov) ov.remove();
    if (!C || !G.result) return;
    renderCase(); window.scrollTo(0, 0);
    if (G.result.okC) { sfx('win'); try { const b = FX.burst(root(), 'gold'); setTimeout(() => b.remove(), 4500); } catch (e) {} }
  }
  function resultView(r) {
    const sol = C.solution, cu = sus(sol.culprit), cm = clueMap();
    const mk = (b, t) => `<li class="${b ? 'ok' : 'no'}">${b ? '✓' : '✗'} ${t}</li>`;
    return `<div class="det-result ${r.okC ? 'win' : 'lose'}">
      <div class="det-grade g-${r.grade}">${r.grade}</div>
      <h3>${r.okC ? '案件告破' : '抓错了人'}</h3>
      <ul class="det-ul">${mk(r.okC, `凶手：${esc(cu.name)}`)}${mk(r.okM, `手法：${esc(sol.method.options[sol.method.correct])}`)}${mk(r.okV, `动机：${esc(sol.motive.options[sol.motive.correct])}`)}
      <li class="${r.keys === r.total ? 'ok' : 'no'}">关键证物 ${r.keys} / ${r.total}　用掉搜证 ${r.searches}、提问 ${r.asks}</li></ul></div>
      <div class="card"><h4>完整真相</h4>${sol.truth.map((p) => `<p class="det-p">${esc(p)}</p>`).join('')}</div>
      <div class="card"><h4>关键证物</h4><ul class="det-ul">${sol.keyClues.map((id) => `<li class="${hasClue(id) ? 'ok' : 'no'}">${hasClue(id) ? '✓' : '✗ 错过'} ${esc(cm[id].title)}（${esc(cm[id].locName)}）</li>`).join('')}</ul></div>
      <div class="det-actions"><button class="btn" data-act="again">重新调查此案</button><button class="btn ghost" data-act="list">换一个案件</button></div>`;
  }

  // ---------- 事件 ----------
  document.addEventListener('click', (e) => {
    const r = root(); if (!r || r.hidden || !r.contains(e.target)) return;
    if (e.target.closest('[data-act="introback"]')) return back();
    const ov = e.target.closest('[data-act="skipintro"],[data-act="skipreveal"]');
    if (ov) return ov.dataset.act === 'skipintro' ? endIntro() : endReveal();
    if (e.target.closest('[data-act="cinenext"]') && !e.target.closest('button')) return cineNext();
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.case) { sfx('click'); return start(d.case); }
    if (d.act === 'home') { sfx('click'); return close(); }
    if (d.act === 'list') { sfx('click'); clearTimers(); C = null; try { FX.ambient('fire'); } catch (x) {} delete document.body.dataset.tone; try { SFX.music('menu', 'menu'); SFX.tension(false); } catch (x) {} return renderList(); }
    if (!C) return;
    if (G.result && (d.bs !== undefined || d.maploc || d.fsel || d.tab || d.search || d.ev || d.sus || d.q || d.conf || d.mark || d.draft)) return; // 指认之后案件结束，不能再回去调查
    if (d.bs !== undefined) { sfx('tab'); bstep = Number(d.bs); renderCase(); return window.scrollTo(0, 0); }
    if (d.maploc) { sfx('click'); mapOpen = d.maploc; return renderCase(); }
    if (d.fsel) { sfx('pick'); fsel = d.fsel; return renderCase(); }
    if (d.tab === 'search' && tab === 'brief' && !G.tutDone) { sfx('click'); G.tutDone = true; save(); tab = 'search'; renderCase(); return showTut(); }
    if (d.tab) { sfx('tab'); tab = d.tab; pickClue = false; renderCase(); return window.scrollTo(0, 0); }
    if (d.search) {
      const l = C.locations.find((x) => x.id === d.search), got = G.ptr[l.id] || 0;
      if (got >= l.clues.length) return;
      if (searchLeft() <= 0) return toast('搜证次数用完了。');
      const k = l.clues[got]; G.ptr[l.id] = got + 1; G.searches++; if (!hasClue(k.id)) G.found.push(k.id);
      lastClue = k.id; save(); renderCase(); sfx('search'); later(() => sfx('clue'), 420); return window.scrollTo(0, 0);
    }
    if (d.ev) { lastClue = d.ev; renderCase(); return window.scrollTo(0, 0); }
    if (d.sus) { sfx('pick'); try { SFX.motif(d.sus); } catch (x) {} sel = d.sus; pickClue = false; renderCase(); return scrollLog(); }
    if (d.q) return ask(sel, d.q);
    if (d.act === 'pick') { pickClue = !pickClue; renderCase(); return; }
    if (d.conf) return confront(d.conf);
    if (d.mark) { const i = G.mark.indexOf(d.mark); if (i >= 0) G.mark.splice(i, 1); else G.mark.push(d.mark); save(); return renderCase(); }
    if (d.draft) {
      const [k, v] = d.draft.split(':'); G.draft = G.draft || {}; G.draft[k] = k === 'culprit' ? v : Number(v); save(); renderCase(); return;
    }
    if (d.act === 'submit') {
      if (!confirmSubmit) { confirmSubmit = true; t.textContent = '再点一次确认（提交后不能更改）'; return; }
      confirmSubmit = false; return submit();
    }
    if (d.act === 'tutok') { const o = $('.det-tut'); if (o) o.remove(); sfx('click'); return window.scrollTo(0, 0); }
    if (d.act === 'cineskip') return endCinema();
    if (d.act === 'cinereplay') return startCinema();
    if (d.act === 'again') { const id = C.id; store.set(key(id), null); start(id); }
  });

  // 返回键：reveal → 跳过；案件内 → 案件列表；案件列表 → 首页（多人模式入口）
  function back() {
    if (root().hidden) return false;
    if ($('.det-reveal')) { endReveal(); return true; }
    if (C) {
      clearTimers(); C = null; delete document.body.dataset.tone;
      try { FX.ambient('fire'); SFX.music('menu', 'menu'); SFX.tension(false); } catch (e) {}
      renderList(); window.scrollTo(0, 0); return true;
    }
    close(); return true;
  }
  window.DET = { open, close, back, available: () => cases().length > 0 };
})();
