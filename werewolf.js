'use strict';
// 狼人杀 客户端。与 app.js 共用全局（ws / send / connected / toast / snd / esc / account / needAuth）。
const WWG = (() => {
  const EMO = { wolf: '🐺', wolfking: '👑', villager: '🧑‍🌾', seer: '🔮', witch: '🧪', hunter: '🏹', guard: '🛡️' };
  const RN = { wolf: '狼人', wolfking: '狼王', villager: '村民', seer: '预言家', witch: '女巫', hunter: '猎人', guard: '守卫' };
  let W = null, wid = null, tab = 'join', cap = 9, rooms = null, poll = null, tick = null, offset = 0;
  let resuming = false, pendingPw = null, lastPhase = null, lastLog = 0, lastKey = '', witchPick = false, mode = '';
  const $w = (s) => document.querySelector(s);
  const body = () => $w('#wwBody');
  const ses = () => { try { return JSON.parse(localStorage.getItem('jbs_ww') || 'null'); } catch (e) { return null; } };
  const saveSes = (s) => { try { localStorage.setItem('jbs_ww', JSON.stringify(s)); } catch (e) {} };
  const clearSes = () => { try { localStorage.removeItem('jbs_ww'); } catch (e) {} };
  const hasSession = () => !!ses();
  const nameOf = () => {
    if (account && needAuth) return account.nick;
    const el = $w('#wwName'); let n = el ? el.value.trim() : '';
    if (!n) { try { n = localStorage.getItem('jbs_name') || ''; } catch (e) {} }
    try { if (n) localStorage.setItem('jbs_name', n); } catch (e) {}
    return n;
  };
  const NOT_CONN = '还没连上联机服务器，请稍等几秒再点（免费服务器睡醒要约 30–60 秒）';
  const deckText = (n) => {
    const c = { seer: 1, witch: 1 }; if (n >= 7) c.hunter = 1; if (n >= 10) c.guard = 1;
    const w = n >= 11 ? 4 : n >= 8 ? 3 : 2; if (n >= 11) { c.wolfking = 1; c.wolf = w - 1; } else c.wolf = w;
    c.villager = n - Object.values(c).reduce((a, b) => a + b, 0);
    return ['wolf', 'wolfking', 'seer', 'witch', 'hunter', 'guard', 'villager'].filter((r) => c[r]).map((r) => `<i class="ww-chip ${r === 'wolf' || r === 'wolfking' ? 'bad' : ''}">${EMO[r]} ${RN[r]}${c[r] > 1 ? '×' + c[r] : ''}</i>`).join('');
  };

  // ---------------- 进入 / 离开 ----------------
  function hideOthers() { ['#home', '#mp', '#auth', '#room', '#hub', '#det'].forEach((s) => { const e = $w(s); if (e) e.hidden = true; }); }
  function open() {
    hideOthers(); $w('#ww').hidden = false; $w('#ww').dataset.th = 'night';
    try { window.scrollTo(0, 0); } catch (e) {}
    try { FX.ambient('snow'); SFX.music('menu', 'ww'); SFX.tension(false); } catch (e) {}
    if (W) renderGame(); else renderEntry();
  }
  function visible() { const e = $w('#ww'); return !!e && !e.hidden; }
  function resume() {
    const s = ses(); if (!s) return false;
    if (!connected()) return false;
    resuming = true; send({ type: 'ww-rejoin', code: s.code, token: s.token }); return true;
  }
  function leaveRoom() {
    send({ type: 'ww-leave' }); clearSes(); W = null; wid = null; mode = ''; stopTick();
    document.body.dataset.ww = '';
  }
  function exitToHub() { stopPoll(); stopTick(); $w('#ww').hidden = true; showHub(); }
  function back() {
    const o = $w('#wwOv'); if (o) { o.remove(); return true; }
    if (!visible()) return false;
    if (W) {
      if (W.phase === 'lobby' || W.phase === 'over') { leaveRoom(); renderEntry(); return true; }
      askLeave(); return true;
    }
    exitToHub(); return true;
  }
  function overlay(html, onClick) {
    const old = $w('#wwOv'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'wwOv'; el.className = 'leave-ov'; el.innerHTML = html;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) { if (e.target === el) el.remove(); return; } onClick(b, el); });
    return el;
  }
  function askLeave() {
    overlay(`<div class="leave-card"><h3>离开牌桌？</h3><p>游戏还在进行。你离开后由机器人接替你，不会卡住其他人。</p>
      <div class="actions"><button class="btn" data-x="no">继续玩</button><button class="btn primary" data-x="leave" style="width:auto">离开</button></div></div>`,
      (b, el) => { el.remove(); if (b.dataset.x === 'leave') { leaveRoom(); renderEntry(); } });
  }
  function askPassword(code, wrong) {
    pendingPw = code;
    const el = overlay(`<div class="leave-card"><h3>这个房间有密码</h3><p>${wrong ? '密码不对，请再试一次。' : '向房主要密码，输入后就能进房间。'}</p>
      <label class="uf"><span>房间密码</span><input id="wwPwIn" maxlength="12" autocomplete="off"></label>
      <div class="actions"><button class="btn" data-x="no">取消</button><button class="btn primary" data-x="ok" style="width:auto">进入房间</button></div></div>`,
      (b, el2) => { if (b.dataset.x === 'ok') go(el2); else el2.remove(); });
    const go = (e2) => { const v = e2.querySelector('#wwPwIn').value.trim(); if (!v) return; e2.remove(); join(code, v); };
    el.querySelector('#wwPwIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(el); });
    setTimeout(() => { try { el.querySelector('#wwPwIn').focus(); } catch (e) {} }, 60);
  }
  function join(code, pw) {
    const name = nameOf(); if (!name) return toast('先输入昵称');
    if (!connected()) return toast(NOT_CONN);
    pendingPw = code; send({ type: 'ww-join', code, name, password: pw || '' });
  }

  // ---------------- 入口页 ----------------
  function stopPoll() { clearInterval(poll); poll = null; }
  function startPoll() { stopPoll(); poll = setInterval(() => { if (!visible() || W || tab !== 'join') return stopPoll(); if (connected()) send({ type: 'ww-listrooms' }); }, 3000); }
  function renderEntry() {
    mode = 'entry'; stopTick(); body().onclick = null; body()._h = null; document.body.dataset.ww = '';
    $w('#wwTitle').textContent = '狼人杀'; $w('#wwTimer').textContent = ''; $w('#ww').dataset.th = 'night';
    let nm = ''; try { nm = localStorage.getItem('jbs_name') || ''; } catch (e) {}
    const nameRow = account && needAuth ? '' : `<label class="uf"><span>你的昵称</span><input id="wwName" maxlength="12" placeholder="游戏里别人看到的名字" value="${esc(nm)}"></label>`;
    body().innerHTML = `<div class="ww-art">${ART.scene('wolfmoon')}</div>
      <p class="sub ww-intro">6–12 人，人不够可以加机器人。狼人、预言家、女巫、猎人、守卫……天黑请闭眼。</p>
      ${nameRow}
      <div class="seg" id="wwSeg"><button data-t="join" class="${tab === 'join' ? 'on' : ''}">加入房间</button><button data-t="create" class="${tab === 'create' ? 'on' : ''}">创建房间</button></div>
      <div id="wwJoinP" ${tab === 'join' ? '' : 'hidden'}>
        <div class="ww-code"><input id="wwCode" maxlength="4" placeholder="房间码" autocomplete="off"><button class="btn primary" id="wwJoinBtn">加入</button></div>
        <div id="wwRooms" class="ww-rooms"></div>
      </div>
      <div id="wwCreP" ${tab === 'create' ? '' : 'hidden'}>
        <div class="ww-deck" id="wwDeckP"></div>
        <label class="uf"><span>房间密码（可不填）</span><input id="wwPw" maxlength="12" placeholder="不填则任何人都能加入" autocomplete="off"></label>
        <div class="mp-bar"><div class="cap-row"><span>房间人数（含机器人）</span><div class="stepper"><button class="btn" id="wwMinus">−</button><b id="wwCap">${cap}</b><button class="btn" id="wwPlus">+</button></div></div>
        <button class="btn primary cta" id="wwCreate">创建房间</button><p class="fine">创建后可以添加机器人补位，也可以邀请朋友用房间码加入。</p></div>
      </div>`;
    const deck = () => { $w('#wwCap').textContent = cap; $w('#wwDeckP').innerHTML = `<h4>${cap} 人局配置</h4><div>${deckText(cap)}</div>`; $w('#wwMinus').disabled = cap <= 6; $w('#wwPlus').disabled = cap >= 12; };
    deck(); renderRooms();
    const ni = $w('#wwName'); if (ni) ni.oninput = () => { try { localStorage.setItem('jbs_name', ni.value.trim()); } catch (e) {} };
    $w('#wwSeg').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; renderEntry(); if (tab === 'join') { if (connected()) send({ type: 'ww-listrooms' }); startPoll(); } else stopPoll(); };
    $w('#wwMinus').onclick = () => { cap = Math.max(6, cap - 1); deck(); };
    $w('#wwPlus').onclick = () => { cap = Math.min(12, cap + 1); deck(); };
    $w('#wwCode').oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    $w('#wwJoinBtn').onclick = () => { const c = $w('#wwCode').value.trim().toUpperCase(); if (c.length !== 4) return toast('房间码是 4 个字母'); join(c); };
    $w('#wwCreate').onclick = () => {
      const name = nameOf(); if (!name) return toast('先输入昵称');
      if (!connected()) return toast(NOT_CONN);
      send({ type: 'ww-create', name, cap, password: $w('#wwPw').value.trim() });
    };
    $w('#wwRooms').onclick = (e) => {
      const b = e.target.closest('[data-code]'); if (!b) return;
      if (!nameOf()) return toast('先输入昵称');
      if (b.dataset.lock === '1') askPassword(b.dataset.code); else join(b.dataset.code);
    };
    if (tab === 'join') { if (connected()) send({ type: 'ww-listrooms' }); startPoll(); }
  }
  function renderRooms() {
    const el = $w('#wwRooms'); if (!el) return;
    if (rooms === null) { el.innerHTML = `<p class="empty">${connected() ? '正在查找房间…' : '正在连接服务器…'}</p>`; return; }
    el.innerHTML = rooms.length ? rooms.map((r) => `<button class="room-row" data-code="${esc(r.code)}" data-lock="${r.locked ? 1 : 0}"><span class="rr-img ww-rr">🐺</span>
      <span class="rr-tx"><b>狼人杀 · ${esc(r.code)}</b><small>房主 ${esc(r.host)}</small></span><span class="rr-n"><b>${r.n}/${r.cap}</b><i>${r.locked ? '有密码' : '可直接加入'}</i></span></button>`).join('')
      : '<p class="empty">暂时没有在等人的房间。<br>去“创建房间”开一个吧！</p>';
  }

  // ---------------- 计时 ----------------
  function stopTick() { clearInterval(tick); tick = null; }
  function startTick() {
    stopTick();
    const f = () => {
      const t = $w('#wwTimer'); if (!t) return;
      if (!W || !W.phaseEnd) { t.textContent = ''; return; }
      const r = Math.max(0, Math.ceil((W.phaseEnd - (Date.now() + offset)) / 1000));
      t.textContent = r + 's'; t.classList.toggle('hot', r <= 8);
    };
    f(); tick = setInterval(f, 500);
  }

  // ---------------- 游戏界面 ----------------
  const PH = { lobby: '等待开始', night: '黑夜', dawn: '天亮了', shot: '开枪', last: '遗言', speech: '白天发言', vote: '投票放逐', over: '游戏结束' };
  function sounds(m) {
    try {
      const key = m.phase + ':' + (m.day || 0);
      if (m.phase !== lastPhase) {
        if (m.phase === 'night') { snd('howl'); SFX.tension(true); }
        if (m.phase === 'dawn' && lastPhase === 'night') { snd('rooster'); SFX.tension(false); }
        if (m.phase === 'vote') SFX.tension(true);
        if (m.phase === 'speech') SFX.tension(false);
        if (m.phase === 'over') { SFX.tension(false); const me = m.you; const win = me && m.over && ((m.over.winner === 'good') === (me.team === 'good')); snd(win ? 'win' : 'lose'); }
      }
      const n = (m.log || []).length;
      if (lastLog && n > lastLog) { const fresh = m.log.slice(lastLog - n); if (fresh.some((l) => /开枪带走/.test(l.text))) snd('gunshot'); else if (fresh.some((l) => /自爆|出局|被放逐|死亡/.test(l.text))) snd('lose'); }
      lastLog = n; lastPhase = m.phase;
      const p = m.prompt && m.prompt.kind; const k2 = key + ':' + (p || '') + ':' + (m.step || '');
      if (p && /^(guard|wolf|witch|seer|shot|last|speech|vote)$/.test(p) && k2 !== lastKey) snd('turn');
      lastKey = k2;
    } catch (e) {}
  }
  function onState(m) {
    const first = !W;
    offset = (m.now || Date.now()) - Date.now();
    const prevPhase = W && W.phase;
    sounds(m);
    W = m;
    if (resuming) {
      resuming = false;
      if (m.phase === 'over') { toast('上一局已经结束，回到游戏选择'); leaveRoom(); if (visible() || true) { $w('#ww').hidden = true; showHub(); } return; }
    }
    if (!visible()) { hideOthers(); $w('#ww').hidden = false; }
    if (first || prevPhase === undefined) { try { window.scrollTo(0, 0); } catch (e) {} }
    renderGame();
  }
  const bySeat = (id) => W.players.find((p) => p.id === id);
  const seatTag = (p) => `<b class="wseat">${p.seat || '·'}</b>`;
  function renderGame() {
    if (!W) return renderEntry();
    stopPoll();
    $w('#ww').dataset.th = W.phase === 'night' || W.phase === 'lobby' ? 'night' : W.phase === 'dawn' || W.phase === 'over' ? 'dawn' : 'day';
    document.body.dataset.ww = $w('#ww').dataset.th;
    const SH = { night: '黑夜', dawn: '天亮', shot: '开枪', last: '遗言', speech: '发言', vote: '投票', over: '游戏结束' };
    $w('#wwTitle').textContent = W.phase === 'lobby' ? '房间 ' + W.code : W.phase === 'over' ? SH.over : `第${W.day}${W.phase === 'night' ? '夜' : '天'} ${W.phase === 'night' ? '' : SH[W.phase]}`;
    startTick();
    if (W.phase === 'lobby') return renderLobby();
    if (mode !== 'game') {
      mode = 'game'; body().onclick = null; body()._h = null;
      body().innerHTML = `<div id="wwRole" class="ww-role"></div><div id="wwAct" class="ww-act"></div><div id="wwPl" class="ww-pl"></div>
        <div class="ww-feedwrap"><div id="wwFeed" class="ww-feed"></div>
        <form id="wwChatF" class="ww-chat" autocomplete="off"><input id="wwIn" maxlength="200" placeholder="" enterkeyhint="send"><button class="btn primary small" type="submit">发送</button></form></div>`;
      $w('#wwChatF').onsubmit = (e) => { e.preventDefault(); const i = $w('#wwIn'); const t = i.value.trim(); if (!t || i.disabled) return; send({ type: 'ww-chat', text: t }); i.value = ''; };
      $w('#wwAct').onclick = onAct; $w('#wwPl').onclick = null;
    }
    renderRole(); renderAct(); renderPlayers(); renderFeed();
  }

  function renderLobby() {
    mode = 'lobby';
    const host = W.hostId === wid, n = W.players.length;
    const seats = [];
    for (let i = 0; i < W.cap; i++) {
      const p = W.players[i];
      seats.push(p ? `<div class="ww-seat ${p.id === wid ? 'me' : ''} ${p.connected ? '' : 'off'}"><span>${p.bot ? '🤖' : (p.id === W.hostId ? '👑' : '🙂')}</span><b>${esc(p.name)}</b><small>${p.id === wid ? '你' : p.connected ? (p.id === W.hostId ? '房主' : '已就位') : '离线'}</small></div>`
        : '<div class="ww-seat empty"><span>＋</span><small>空位</small></div>');
    }
    const need = 6 - n;
    const ctrl = host ? `<div class="ww-hostc"><div class="cap-row"><span>房间人数</span><div class="stepper"><button class="btn" data-a="capm" ${W.cap <= Math.max(6, n) ? 'disabled' : ''}>−</button><b>${W.cap}</b><button class="btn" data-a="capp" ${W.cap >= 12 ? 'disabled' : ''}>+</button></div></div>
      <div class="ww-botrow"><button class="btn" data-a="addbot" ${n >= W.cap ? 'disabled' : ''}>＋ 机器人</button><button class="btn" data-a="rmbot" ${W.players.some((p) => p.bot) ? '' : 'disabled'}>－ 机器人</button></div></div>` : '';
    const html = `<div class="ww-lob"><div class="ww-share"><small>房间码</small><b>${esc(W.code)}</b>${W.locked ? `<small>密码 ${host ? esc(W.password || '') : '已设置'}</small>` : '<small>无密码</small>'}</div>
      <div class="ww-seats">${seats.join('')}</div>
      <div class="ww-deck"><h4>${W.cap} 人局配置</h4><div>${deckText(W.cap)}</div><p class="fine">人数变化时身份会按人数重新配置；开局时随机分配身份和座位。</p></div>
      ${ctrl}
      <div class="mp-bar">${host ? `<button class="btn primary cta" data-a="start" ${n < 6 ? 'disabled' : ''}>${n < 6 ? `还差 ${need} 人 · 添加机器人补位` : '开始游戏 · ' + n + ' 人'}</button>` : '<p class="fine">等房主开始游戏…</p>'}
      <button class="btn ghost" data-a="leave">离开房间</button></div></div>`;
    if (body()._h !== html) { body()._h = html; body().innerHTML = html; }
    body().onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'capm') send({ type: 'ww-setcap', cap: W.cap - 1 });
      else if (a === 'capp') send({ type: 'ww-setcap', cap: W.cap + 1 });
      else if (a === 'addbot') send({ type: 'ww-addbot' });
      else if (a === 'rmbot') send({ type: 'ww-rmbot' });
      else if (a === 'start') send({ type: 'ww-start' });
      else if (a === 'leave') { leaveRoom(); renderEntry(); }
    };
  }

  function renderRole() {
    const y = W.you; if (!y || !y.role) { setH('#wwRole', ''); return; }
    const team = y.team === 'wolf';
    const mates = team ? y.wolves.filter((id) => id !== wid).map((id) => { const p = bySeat(id); return p ? `${p.seat}号${esc(p.name)}` : ''; }).filter(Boolean) : [];
    const extras = [];
    if (y.witch) extras.push(`解药 ${y.witch.save ? '✅' : '已用'}　毒药 ${y.witch.poison ? '✅' : '已用'}`);
    if (y.seerResults && y.seerResults.length) extras.push('查验：' + y.seerResults.map((r) => `${bySeat(r.id) ? bySeat(r.id).seat + '号' : ''}${esc(r.name)} ${r.wolf ? '🐺狼人' : '👍好人'}`).join('；'));
    if (mates.length) extras.push('队友：' + mates.join('、'));
    setH('#wwRole', `<div class="ww-rc ${team ? 'bad' : 'good'} ${y.alive ? '' : 'dead'}"><div class="ww-rc-h"><span class="big">${EMO[y.role]}</span><div><b>你是 ${esc(y.roleName)}</b><small>${team ? '狼人阵营' : '好人阵营'}${y.alive ? '' : ' · 已出局'}</small></div></div>
      <p>${esc(y.desc)}</p>${extras.map((x) => `<p class="ex">${x}</p>`).join('')}</div>`);
  }
  function setH(sel, html) { const el = $w(sel); if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }

  function targets(list, kind, opts) {
    opts = opts || {};
    return `<div class="ww-tg">${list.map((p) => `<button class="ww-t ${opts.sel === p.id ? 'sel' : ''}" data-k="${kind}" data-id="${p.id}" ${opts.dis && opts.dis(p) ? 'disabled' : ''}>${seatTag(p)}<span>${esc(p.name)}</span>${opts.mark && opts.mark(p) ? `<em>${opts.mark(p)}</em>` : ''}</button>`).join('')}</div>`;
  }
  function renderAct() {
    const y = W.you, P = W.prompt, alive = W.players.filter((p) => p.alive);
    let h = '';
    if (W.phase === 'over') {
      const o = W.over || {}; const win = y && ((o.winner === 'good') === (y.team === 'good'));
      const rl = (o.roles || []).map((r) => { const p = bySeat(r.id); return p ? `<div class="ww-ov ${r.role === 'wolf' || r.role === 'wolfking' ? 'bad' : ''} ${r.alive ? '' : 'dead'}">${seatTag(p)}<span>${esc(p.name)}</span><em>${EMO[r.role]} ${RN[r.role]}</em></div>` : ''; }).join('');
      h = `<div class="ww-result ${win ? 'win' : 'lose'}"><h3>${o.winner === 'good' ? '好人阵营获胜' : '狼人阵营获胜'}</h3><p>${esc(o.why || '')}</p><p class="ww-me">${win ? '🎉 你赢了' : '这局输了'}</p></div>
        <div class="ww-ovs">${rl}</div>
        <div class="ww-over-act">${W.hostId === wid ? '<button class="btn primary cta" data-a="again">再来一局</button>' : '<p class="fine">等房主开下一局…</p>'}<button class="btn ghost" data-a="leave">离开房间</button></div>`;
    } else if (!y || !y.role) h = '';
    else if (!y.alive && !(P && P.kind === 'shot')) {
      h = `<div class="ww-say">💀 你已出局。可以继续看戏，也能在“亡者频道”聊天（活人看不到）。${W.phase === 'speech' || W.phase === 'vote' || W.phase === 'night' ? '' : ''}</div>`;
      if (P && P.kind === 'listen') h += `<div class="ww-say sub">现在是 ${bySeat(P.speaker) ? bySeat(P.speaker).seat + '号' + esc(bySeat(P.speaker).name) : ''} 发言</div>`;
    } else if (W.phase === 'night') {
      if (!P) h = `<div class="ww-say night">🌙 天黑请闭眼…${W.step === null ? '' : ''}<small>等待天亮</small></div>`;
      else if (P.kind === 'guard') {
        h = P.acted ? '<div class="ww-say ok">🛡️ 已守护，等待天亮…</div>' : `<div class="ww-say"><b>守卫请睁眼</b>今晚守护谁？（可以守自己，不能连续两晚守同一人）</div>${targets(alive, 'guard', { dis: (p) => p.id === P.last, mark: (p) => (p.id === P.last ? '昨晚守过' : '') })}<button class="btn ghost" data-k="guard" data-skip="1">今晚不守</button>`;
      } else if (P.kind === 'wolf') {
        const picks = {}; (P.picks || []).forEach((x) => { const w = bySeat(x.id); if (w) picks[x.target] = (picks[x.target] || []).concat(w.seat + '号'); });
        h = `<div class="ww-say bad"><b>狼人请睁眼</b>和队友商量，选定今晚要杀的人（可用下面的聊天框交流）。票数最多的人被杀；队友意见一致就会提前结束。</div>${targets(alive, 'wolf', { sel: P.mine, mark: (p) => (picks[p.id] ? '🐺' + picks[p.id].join(',') : '') })}<button class="btn ghost ${P.mine === 'none' ? 'sel' : ''}" data-k="wolf" data-id="none">空刀（今晚不杀人）</button>`;
      } else if (P.kind === 'witch') {
        if (P.acted) h = '<div class="ww-say ok">🧪 已操作，等待天亮…</div>';
        else if (witchPick) h = `<div class="ww-say"><b>毒谁？</b>选一个人使用毒药。</div>${targets(alive.filter((p) => p.id !== wid), 'poison')}<button class="btn ghost" data-a="wback">返回</button>`;
        else {
          const v = P.victim && bySeat(P.victim);
          const info = P.victimIsMe ? '今晚你被狼人袭击了（女巫不能自救）。' : v ? `今晚被杀的是 <b>${v.seat}号 ${esc(v.name)}</b>。` : (P.canSave ? '今晚是平安夜（没有人被刀）。' : '解药已用完，不知道今晚谁被刀。');
          h = `<div class="ww-say"><b>女巫请睁眼</b>${info}<br><small>同一晚只能用一瓶药。</small></div><div class="ww-wb">
            <button class="btn primary" data-k="witch" data-op="save" ${P.canSave && v ? '' : 'disabled'}>🧪 用解药救人</button>
            <button class="btn" data-a="wpoison" ${P.canPoison ? '' : 'disabled'}>☠️ 用毒药</button>
            <button class="btn ghost" data-k="witch" data-op="none">什么都不做</button></div>`;
        }
      } else if (P.kind === 'seer') {
        const last = (P.results || [])[(P.results || []).length - 1];
        h = P.acted ? `<div class="ww-say ok">🔮 查验结果：<b>${last ? esc(last.name) + (last.wolf ? ' 是狼人 🐺' : ' 是好人 👍') : ''}</b><small>等待天亮…</small></div>`
          : `<div class="ww-say"><b>预言家请睁眼</b>今晚验谁？你会知道他是好人还是狼人。</div>${targets(alive.filter((p) => p.id !== wid), 'seer', { mark: (p) => { const r = (P.results || []).find((x) => x.id === p.id); return r ? (r.wolf ? '🐺' : '👍') : ''; } })}`;
      }
    } else if (P && P.kind === 'shot') {
      h = `<div class="ww-say bad"><b>${esc(P.skill)}</b>你出局了，可以开枪带走一名玩家。</div>${targets(alive, 'shot')}<button class="btn ghost" data-k="shot" data-skip="1">放弃开枪</button>`;
    } else if (W.phase === 'shot') {
      h = '<div class="ww-say">🔫 有人要开枪了…</div>';
    } else if (P && P.kind === 'last') {
      h = '<div class="ww-say"><b>轮到你留遗言</b>在下面输入框说话，说完点“说完了”。</div><button class="btn primary" data-a="done">说完了</button>';
    } else if (W.phase === 'last') {
      h = '<div class="ww-say">🕯️ 正在留遗言…</div>';
    } else if (P && P.kind === 'speech') {
      h = `<div class="ww-say ok"><b>轮到你发言</b>${P.pk ? '（平票加赛）' : ''}在下面输入框说话，可以说多句，说完点“说完了”。</div><button class="btn primary" data-a="done">说完了</button>`;
    } else if (P && P.kind === 'listen') {
      const sp = bySeat(P.speaker);
      h = `<div class="ww-say">🗣️ 正在发言：<b>${sp ? sp.seat + '号 ' + esc(sp.name) : ''}</b>${P.pk ? '（平票加赛）' : ''}<small>听他说，想想谁像狼。</small></div>`;
      if (W.hostId === wid && sp && sp.id !== wid) h += '<button class="btn ghost small" data-a="skip">房主：跳过这位</button>';
    } else if (P && P.kind === 'vote') {
      const cand = W.players.filter((p) => P.cand.includes(p.id));
      h = `<div class="ww-say"><b>${P.pk ? '平票，重新投票' : '投票放逐'}</b>选一个你认为是狼人的人。得票最多者出局；也可以弃票。</div>${targets(cand, 'vote', { sel: P.mine, dis: (p) => p.id === wid && false })}<button class="btn ghost ${P.mine === 'abstain' ? 'sel' : ''}" data-k="vote" data-id="abstain">弃票</button>`;
    } else if (P && P.kind === 'watch') {
      h = '<div class="ww-say">🗳️ 正在投票…</div>';
    } else if (W.phase === 'dawn') {
      h = '<div class="ww-say night">☀️ 天亮了…</div>';
    }
    // 白天狼人可以自爆
    if (y && y.alive && y.team === 'wolf' && (W.phase === 'speech' || W.phase === 'vote')) h += '<button class="btn ghost small ww-boom" data-a="boom">💥 自爆（立刻进入黑夜）</button>';
    if (W.lastVotes && W.phase !== 'vote' && W.phase !== 'over') {
      const t = W.lastVotes.map((v) => { const a = bySeat(v.from), b = v.to === 'abstain' ? null : bySeat(v.to); return `${a ? a.seat : '?'}→${b ? b.seat : '弃'}`; }).join('　');
      h += `<details class="ww-lv"><summary>上轮投票明细</summary><p>${t}</p></details>`;
    }
    setH('#wwAct', h);
    // 聊天框状态
    const inp = $w('#wwIn');
    if (inp) {
      let ok = false, ph = '现在不能发言';
      const P2 = W.prompt;
      if (W.phase === 'over') { ok = true; ph = '赛后聊聊…'; }
      else if (y && !y.alive && W.phase !== 'shot') { ok = true; ph = '亡者频道（活人看不到）'; }
      else if (W.phase === 'night' && y && y.team === 'wolf' && y.alive) { ok = true; ph = '狼人频道（只有狼队友能看到）'; }
      else if (P2 && (P2.kind === 'speech' || P2.kind === 'last')) { ok = true; ph = '轮到你了，说点什么…'; }
      else if (W.phase === 'speech') ph = '还没轮到你发言';
      inp.disabled = !ok; inp.placeholder = ph;
      const bt = inp.nextElementSibling; if (bt) bt.disabled = !ok;
    }
  }
  function renderPlayers() {
    const speaker = W.prompt && W.prompt.speaker;
    const h = W.players.map((p) => {
      const known = p.role ? `<em>${EMO[p.role]}</em>` : '';
      return `<div class="ww-p ${p.alive ? '' : 'dead'} ${p.id === wid ? 'me' : ''} ${p.id === speaker ? 'talk' : ''} ${p.connected ? '' : 'off'}">${seatTag(p)}<span class="n">${esc(p.name)}</span>${known}${p.voted ? '<i class="vt">✓</i>' : ''}${!p.alive ? '<i class="skull">💀</i>' : ''}</div>`;
    }).join('');
    setH('#wwPl', h);
  }
  function renderFeed() {
    const feed = $w('#wwFeed'); if (!feed) return;
    const items = [];
    (W.log || []).forEach((l) => items.push({ t: l.t, sys: true, text: l.text }));
    (W.chat || []).forEach((c) => items.push({ t: c.t, c }));
    items.sort((a, b) => a.t - b.t);
    const h = items.slice(-90).map((it) => {
      if (it.sys) return `<div class="ln sys">${esc(it.text)}</div>`;
      const c = it.c, p = bySeat(c.id), tag = c.ch === 'wolf' ? '<i class="ch w">狼</i>' : c.ch === 'dead' ? '<i class="ch d">亡</i>' : '';
      return `<div class="ln ${c.id === wid ? 'me' : ''}">${tag}<b>${p ? p.seat + '号 ' : ''}${esc(c.name)}</b>${esc(c.text)}</div>`;
    }).join('');
    if (feed._h !== h) { const atEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60; feed._h = h; feed.innerHTML = h; if (atEnd || true) feed.scrollTop = feed.scrollHeight; }
  }

  function onAct(e) {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const a = b.dataset.a, k = b.dataset.k;
    if (a) {
      snd('click');
      if (a === 'done') send({ type: 'ww-done' });
      else if (a === 'skip') send({ type: 'ww-skip' });
      else if (a === 'boom') send({ type: 'ww-boom' });
      else if (a === 'again') send({ type: 'ww-restart' });
      else if (a === 'leave') { leaveRoom(); renderEntry(); }
      else if (a === 'wpoison') { witchPick = true; renderAct(); }
      else if (a === 'wback') { witchPick = false; renderAct(); }
      return;
    }
    if (!k) return;
    snd('click');
    if (k === 'witch') { send({ type: 'ww-act', kind: 'witch', op: b.dataset.op }); witchPick = false; }
    else if (k === 'poison') { send({ type: 'ww-act', kind: 'witch', op: 'poison', target: b.dataset.id }); witchPick = false; }
    else if (b.dataset.skip) send({ type: 'ww-act', kind: k, skip: true });
    else send({ type: 'ww-act', kind: k, target: b.dataset.id });
  }
  // 结束页的按钮在 #wwAct 里，lobby 的在 body 上，这里统一用 onAct 的 data-a
  function onMsg(m) {
    switch (m.type) {
      case 'ww-rooms': rooms = m.rooms || []; renderRooms(); break;
      case 'ww-joined': wid = m.id; saveSes({ code: m.code, token: m.token }); break;
      case 'ww-state': onState(m); break;
      case 'ww-need-password': askPassword(m.code); break;
      case 'ww-rejoin-failed':
        clearSes(); resuming = false;
        if (!W && visible()) renderEntry();
        break;
      case 'error':
        if (pendingPw && /密码/.test(m.message || '')) { askPassword(pendingPw, true); return true; }
        return false;
      default: return false;
    }
    return true;
  }
  // 连接断开后 app.js 会重连并调用 resume()
  return { open, onMsg, back, resume, hasSession, visible, isOpen: () => !!W, leaveSilently: leaveRoom };
})();
