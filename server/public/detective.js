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
  // 夜景：月光、房子、人到场 → 上楼 → 推门尖叫 → 警车。文字取自本案时间线
  function nightSvg(n) {
    const heads = Array.from({ length: Math.min(8, n) }, (_, i) => `<g class="cs-seat" style="--d:${(1.6 + i * 0.35).toFixed(2)}s"><circle cx="${112 + i * 7.2}" cy="190" r="3.4"/><rect x="${108.8 + i * 7.2}" y="193" width="6.4" height="9" rx="2"/></g>`).join('');
    const walkers = Array.from({ length: Math.min(8, n) }, (_, i) => `<g class="cs-walk" style="--d:${(i * 0.55).toFixed(2)}s"><circle cx="0" cy="246" r="4"/><rect x="-3.5" y="250" width="7" height="14" rx="3"/></g>`).join('');
    return `<svg class="cs-svg" viewBox="30 30 300 270" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><linearGradient id="csSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050816"/><stop offset="1" stop-color="#1a2744"/></linearGradient><radialGradient id="csMoon"><stop offset="0" stop-color="#fffbe6" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe6" stop-opacity="0"/></radialGradient></defs>
      <rect width="360" height="300" fill="url(#csSky)"/>
      ${[[30,24],[70,52],[120,18],[160,44],[210,14],[260,40],[300,22],[330,60],[50,90],[180,70]].map(([x, y], i) => `<circle class="cs-star" style="animation-delay:${i * 0.3}s" cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join('')}
      <circle cx="285" cy="62" r="52" fill="url(#csMoon)"/><circle cx="285" cy="62" r="20" fill="#fdf6d8"/><circle cx="278" cy="57" r="4" fill="#e8dfb8" opacity=".6"/><circle cx="293" cy="70" r="3" fill="#e8dfb8" opacity=".5"/>
      <g class="cs-cloud"><ellipse cx="60" cy="70" rx="40" ry="8" fill="#2a3858" opacity=".7"/><ellipse cx="90" cy="64" rx="26" ry="7" fill="#2a3858" opacity=".7"/></g>
      <path d="M0 236 Q60 222 120 234 T240 232 T360 236 V300 H0Z" fill="#0a0f1c"/>
      <g fill="#070b15"><path d="M20 236 l12 -60 l12 60z"/><path d="M40 238 l10 -44 l10 44z"/><path d="M300 236 l12 -66 l12 66z"/><path d="M322 238 l9 -40 l9 40z"/></g>
      <g class="cs-house"><rect x="92" y="136" width="176" height="104" fill="#10172a"/><polygon points="82,138 180,84 278,138" fill="#0b1020"/><rect x="226" y="82" width="14" height="30" fill="#0b1020"/>
        <rect class="cs-win lo" x="104" y="176" width="72" height="34" rx="2"/>${heads}
        <rect class="cs-win up" x="196" y="148" width="46" height="30" rx="2"/><g class="cs-upfig"><circle cx="212" cy="160" r="4"/><rect x="208.5" y="164" width="7" height="12" rx="3"/></g><g class="cs-tray"><circle cx="228" cy="160" r="3.6"/><rect x="224.8" y="163.6" width="6.4" height="11" rx="2.5"/><rect x="221" y="167" width="6" height="2" fill="#c8b070"/></g>
        <rect class="cs-door" x="214" y="196" width="30" height="44" rx="2"/><circle cx="238" cy="219" r="1.6" fill="#caa14a"/>
        <rect class="cs-redwin" x="196" y="148" width="46" height="30" rx="2"/></g>
      ${walkers}
      <g class="cs-car"><g transform="translate(0 0)"><rect x="0" y="252" width="62" height="18" rx="5" fill="#e9ecf2"/><rect x="10" y="244" width="38" height="12" rx="4" fill="#cfd5e2"/><rect x="0" y="260" width="62" height="5" fill="#1b2438"/><circle cx="14" cy="271" r="6" fill="#0a0f1c"/><circle cx="48" cy="271" r="6" fill="#0a0f1c"/><rect class="cs-l r" x="16" y="239" width="12" height="5" rx="2"/><rect class="cs-l b" x="30" y="239" width="12" height="5" rx="2"/></g></g>
      <rect class="cs-glow" width="360" height="300"/></svg>`;
  }
  function startCinema() {
    clearTimers(); try { SFX.tension(false); } catch (e) {}
    const R = C.deathReport || {}, v = C.victim, list = suspectsOrdered();
    root().innerHTML = `<div class="det-cine"><div class="dc-stage" id="dcStage" data-act="cinenext"></div><button class="btn small ghost dc-skip" data-act="cineskip">跳过 ›</button></div>`;
    const st = () => $('#dcStage');
    const type = (el, text, step, gap) => { let i = 0; const run = () => { if (!el || !el.isConnected) return; i = Math.min(text.length, i + (step || 1)); el.textContent = text.slice(0, i); if (i % 2 === 0) sfx('tick'); if (i < text.length) later(run, gap || 55); }; run(); };
    const beats = (k, every, from) => { for (let i = 0; i < k; i++) later(() => sfx('heartbeat'), (from || 0) + i * every); };
    const tl = (C.timeline || []).slice(0, 8), N = tl.length;
    const scenes = [];
    // —— 夜景叙事：每条时间线一拍 ——
    tl.forEach((e, i) => {
      const state = i === N - 1 ? 'police' : i === N - 2 ? 'find' : i < Math.ceil((N - 2) / 2) ? 'gather' : 'act';
      const dur = Math.max(3400, 1600 + e.text.length * 60);
      scenes.push([dur, () => {
        const old = $('.cs');
        if (!old) { st().innerHTML = `<div class="cs st-${state}">${nightSvg(list.length)}<div class="cs-top"><p class="dc-k">${esc(C.title)}</p></div><div class="cs-cap"><b id="csT"></b><p id="csX"></p></div></div>`; if (i === 0) sfx('suspense'); }
        else { old.className = 'cs st-' + state; }
        $('#csT').textContent = e.t; const x = $('#csX'); x.textContent = '';
        later(() => type(x, e.text, 1, 55), 350);
        if (state === 'gather') { sfx('footsteps'); later(() => sfx('chat'), 900); }
        if (state === 'act') { sfx('footsteps'); later(() => sfx('creak'), 1200); later(() => sfx('clink'), 600); }
        if (state === 'find') { beats(3, 800, 200); later(() => { sfx('knock'); }, 1000); later(() => sfx('creak'), 1900); later(() => { sfx('stinger'); sfx('scream'); const c = $('.cs'); if (c) c.classList.add('boom'); }, 2700); }
        if (state === 'police') { sfx('siren'); }
      }]);
    });
    // —— 人物：每人一个画面 ——
    list.forEach((x, i) => scenes.push([3200, () => {
      const R0 = (C.relations || {})[x.id] || x.bio || '';
      st().innerHTML = `<div class="dc-sp"><p class="dc-k">在场的人 · ${i + 1} / ${list.length}</p><div class="dc-spav">${portraitOf(x, null)}</div><h3>${esc(x.name)}</h3><p class="dc-role">${esc(x.role)}${x.age ? ' · ' + x.age + ' 岁' : ''}</p><p class="dc-rel">${esc(R0)}</p></div>`;
      sfx('lit'); if (i % 2 === 0) sfx('heartbeat'); else sfx('stinger');
    }]));
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
    return `<div class="det-sus-row">${chips}</div>${sel ? panel(sus(sel)) : '<div class="card"><p class="det-p det-dim">选一个人开始审问。每个人只说自己知道的，也会隐瞒。</p></div>'}`;
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
