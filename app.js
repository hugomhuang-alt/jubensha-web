'use strict';
// 前端：原生 JS，无构建步骤。语音使用 WebRTC 网状连接（8 人以内足够）。

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ws = null;
let S = null;            // 最新的房间状态
let myId = null;
let ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
let clockOffset = 0;
let tab = 'role';
let unread = 0;
let lastPhase = null;
let reconnectTimer = null;
const chatLog = [];
let roleOpened = false, introShown = false, pendingLoc = null, lastTabKey = null, modal = null, revealShown = false;
const freshClues = new Set(), seenClues = new Set();
const snd = (n) => { try { if (window.SFX && SFX[n]) SFX[n](); } catch (e) {} };
let prevIds = null, prevCode = null, lastSpeaker = null, lastWarn = -1;
const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八'];
const isSearchPhase = (p) => /^search\d$/.test(p);
function phaseOrder() {
  const r = (S && S.script && S.script.rounds) || 3, o = ['reading', 'turns'];
  for (let i = 1; i <= r; i++) o.push('search' + i, 'discuss' + i);
  return o.concat(['vote', 'reveal']);
}
// 立绘：优先用剧本里的外观设定生成；旧剧本用手绘立绘
const portraitOf = (c, o) => {
  if (!c) return ART.portrait('none', o);
  o = Object.assign({ age: c.age }, o);
  return ART.portrait(c.look ? c.look : (c.id || c.charId), o);
};
const sceneKey = (name) => { const l = S && S.script.locations.find((x) => x.name === name || x.id === name); return l ? l.scene : 'study'; };

const PHASE = {
  lobby: ['大厅', '等人到齐。房主点“开始游戏”后会随机分配角色。'],
  reading: ['阅读剧本', '仔细读你的角色卡。别把它直接给别人看，但在讨论里你可以撒谎。读完点“我读完了”，全员读完会自动进入下一步。'],
  turns: ['轮流自我介绍', '每人 60 秒，只有轮到的人可以开麦。说说你是谁、当晚在哪、和死者什么关系。说完可点“我说完了”。'],
  search1: ['第一轮搜证', '选一个地点搜证。你会私下得到一条线索，可以公开，也可以藏着。'],
  discuss1: ['第一轮讨论', '自由讨论：对时间线、质疑别人的说法。语音和文字都可以。'],
  search2: ['第二轮搜证', '再搜一次。想想哪些地点还没人去过；在同一个地点再搜，会得到更深一层的线索。'],
  discuss2: ['第二轮讨论', '把手里的线索摆出来，对一对时间线，找出谁的话前后矛盾。'],
  search3: ['第三轮搜证', '最后一次搜证机会。想好你最想验证的那个猜测。'],
  discuss3: ['最终讨论', '最后的讨论时间。下一步就是投票指认凶手。'],
  vote: ['投票指认', '选出你认为的凶手。得票最多且唯一的人被抓获；如果抓错或平票，凶手逃脱。'],
  reveal: ['真相揭晓', '']
};

// ================= 网络 =================
// 内容没变就不重写 DOM（否则动画会被重置，看起来一闪一闪）
function setHTML(el, html) { if (el._h === html) return false; el._h = html; el.innerHTML = html; return true; }
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function session() {
  try { return JSON.parse(localStorage.getItem('jbs_session') || 'null'); } catch { return null; }
}
function saveSession(s) { try { localStorage.setItem('jbs_session', JSON.stringify(s)); } catch {} }
function clearSession() { try { localStorage.removeItem('jbs_session'); } catch {} }

// 联机服务器地址：网页放在别处（如 GitHub Pages）时由 config.js 指定；服务器自己托管网页时留空即可
const SERVER = String(window.__SERVER || '').replace(/\/+$/, '');
const wsUrl = () => {
  if (SERVER) return SERVER.replace(/^http/, 'ws') + '/ws';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
};
let everConnected = false, tries = 0;
const connected = () => !!(ws && ws.readyState === 1);
// 连接指示灯：绿 = 已连上联机服务器；黄 = 正在连接；红 = 连不上（自动重试中）
function updateNet() {
  const st = connected() ? 'ok' : (ws && ws.readyState === 0 && !everConnected ? 'wait' : 'bad');
  document.querySelectorAll('.net').forEach((el) => {
    el.dataset.s = st;
    const mini = el.classList.contains('mini');
    el.querySelector('span').textContent = st === 'ok' ? (mini ? '已连接' : '已连接联机服务器')
      : st === 'wait' ? (mini ? '连接中' : '正在连接联机服务器…（免费服务器睡醒要 30–60 秒）')
      : (mini ? '连不上' : '连不上联机服务器，正在重试…（可先玩单人侦探）');
  });
}
function setBanner() {
  const b = $('#banner');
  // 从没连上过时不打扰（单人侦探不需要服务器；点“创建房间”时会有提示）；连上后掉线才显示横幅
  if (!everConnected) { b.hidden = true; return; }
  b.textContent = '连接已断开，正在重连…';
  b.hidden = false;
}
function wakeServer() {
  // 免费服务器闲置会休眠；一打开 App 就先敲一下门，等玩家点“创建房间”时多半已经醒了
  if (!SERVER) return;
  try { fetch(SERVER.replace(/^ws/, 'http') + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {}
}
function connect() {
  tries++;
  ws = new WebSocket(wsUrl());
  updateNet();
  ws.onopen = () => {
    everConnected = true; tries = 0; updateNet();
    $('#banner').hidden = true;
    authedWs = false;
    if (account) send({ type: 'auth', token: account.token });
    const s = session();
    if (s) send({ type: 'rejoin', code: s.code, token: s.token });
  };
  ws.onclose = () => {
    updateNet(); setBanner();
    voiceTeardownPeers();
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => { wakeServer(); connect(); }, tries > 3 ? 4000 : 1500);
  };
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
}

function onMsg(m) {
  switch (m.type) {
    case 'hello':
      ICE = m.ice || ICE;
      $('#homeTitle').textContent = m.meta.title;
      $('#homeSub').textContent = m.meta.subtitle;
      $('#homeFine').textContent = `${(m.meta.scripts || []).length} 个剧本 · 4–8 人 · 需要麦克风（可选）`;
      scriptsList = m.meta.scripts || [];
      needAuth = m.auth === true;
      gotHello = true;
      afterHello();
      break;
    case 'auth-ok':
      authedWs = true;
      if (account) { account.tester = !!m.tester; saveAcct(); }
      break;
    case 'auth-failed':
      authedWs = false;
      if (needAuth) { clearAcct(); toast('登录已过期，请重新登录'); if (S) doLeave(); showAuth(); }
      break;
    case 'scripts':
      scriptsList = m.scripts || scriptsList;
      if (!$('#mp').hidden) renderMpScripts();
      break;
    case 'rooms':
      renderRooms(m.rooms || []);
      break;
    case 'joined':
      myId = m.id; try { window.scrollTo(0, 0); } catch (e) {}
      saveSession({ code: m.code, token: m.token });
      break;
    case 'rejoin-failed':
      clearSession();
      showHome();
      break;
    case 'state':
      clockOffset = m.now - Date.now();
      S = m;
      onState();
      break;
    case 'chatlog':
      chatLog.length = 0;
      m.log.forEach((x) => chatLog.push(x));
      renderChat();
      break;
    case 'chat':
      chatLog.push(m.msg);
      renderChat(); snd('chat');
      if (tab !== 'chat') { unread++; updateDot(); }
      break;
    case 'sys':
      chatLog.push({ sys: true, text: m.text });
      renderChat();
      break;
    case 'searchResult':
      showSearch(m.loc, m.clue);
      break;
    case 'need-password':
      askPassword(m.code, false);
      break;
    case 'kicked':
      toast(m.reason || '你已被请出房间'); clearSession();
      try { if (voice.on) voiceOff(); } catch (e) {}
      closeAllOverlays(); S = null; lastPhase = null; chatLog.length = 0; $('#phaseCard')._h = null; $('#players')._h = null;
      showHome();
      break;
    case 'error':
      if (pendingJoin && /密码/.test(m.message || '')) { askPassword(pendingJoin, true); break; }
      toast(m.message);
      break;
    case 'voice-peers':
      m.peers.forEach((id) => voiceCall(id));
      break;
    case 'voice-left':
      voiceClosePeer(m.id);
      break;
    case 'signal':
      voiceSignal(m.from, m.data);
      break;
  }
}

// ================= 小工具 =================
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4200);
}
let heroDone = false, stopSnow = null;
// 阶段名称：最后一轮讨论叫“最终讨论”
function phaseInfo(phase) {
  const m = /^discuss(\d)$/.exec(phase);
  if (m && S && Number(m[1]) === (S.script.rounds || 3)) return ['最终讨论', '最后的讨论时间。下一步就是投票指认凶手。'];
  return PHASE[phase];
}
function showHome() {
  S = null; prevIds = null; prevCode = null; lastPhase = null; lastSpeaker = null;
  delete document.body.dataset.tone;
  try { SFX.music('menu', 'menu'); SFX.tension(false); SFX.amb('snow'); } catch (e) {}
  FX.ambient('snow');
  if (!heroDone) { heroDone = true; $('#artSolo').innerHTML = ART.scene('study'); $('#artMulti').innerHTML = ART.scene('coverTheater'); }
  if (!stopSnow) stopSnow = FX.snow($('#snow'), { count: 80, global: true });
  $('#home').hidden = false; $('#mp').hidden = true; $('#auth').hidden = true;
  $('#room').hidden = true;
  renderAcct();
}
function me() { return S && S.players.find((p) => p.id === myId); }
function isHost() { return S && S.hostId === myId; }
function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function playerName(id) { const p = S.players.find((x) => x.id === id); return p ? p.name : '?'; }

// ================= 状态变化 =================
const ambOf = (tone) => FX.caseAmb(S && S.scriptId) || (tone === 'sepia' ? 'fire' : tone === 'green' ? 'rain' : 'snow');
function stateSounds() {
  try {
    const ids = S.players.map((p) => p.id + ':' + (p.connected ? 1 : 0));
    if (prevCode === S.code && prevIds) {
      const a = new Set(prevIds.map((x) => x.split(':')[0])), b = new Set(S.players.map((p) => p.id));
      if (S.players.some((p) => !a.has(p.id))) snd('join');
      else if ([...a].some((x) => !b.has(x))) snd('leave');
    }
    prevIds = ids; prevCode = S.code;
    const tone = S.script.tone;
    try { FX.ambient(ambOf(tone)); } catch (e) {}
    if (S.phase === 'lobby') SFX.music('menu', 'lobby:' + S.scriptId, tone);
    else SFX.music('case', S.scriptId || S.script.id || 'game', tone);
    const last = (S.script.rounds || 3);
    SFX.tension(S.phase === 'vote' || S.phase === 'discuss' + last);
    if (S.phase === 'turns' && S.speakerId !== lastSpeaker) { lastSpeaker = S.speakerId; if (S.speakerId === myId) snd('turn'); else snd('lit'); }
    if (S.phase !== 'turns') lastSpeaker = null;
  } catch (e) {}
}
function onState() {
  document.body.dataset.tone = S.script.tone || 'none';
  $('#home').hidden = true; $('#mp').hidden = true; $('#auth').hidden = true;
  $('#room').hidden = false; $('#room').dataset.phase = S.phase;
  stateSounds();
  if (S.phase !== lastPhase) {
    // 新阶段时回到合适的页签
    if (S.phase === 'reading') tab = 'role';
    if (S.phase === 'reveal') tab = 'case';
    const prev = lastPhase;
    lastPhase = S.phase;
    if (S.phase === 'lobby') { roleOpened = false; introShown = false; revealShown = false; }
    render();
    onPhaseEnter(S.phase, prev);
    voiceApplyGate();
    return;
  }
  render();
  voiceApplyGate();
}

function render() {
  $('#roomCode').textContent = '房间码 ' + S.code;
  $('#phaseName').textContent = phaseInfo(S.phase)[0];
  renderPlayers();
  renderPhaseCard();
  renderTabs();
  renderVoiceBar();
  updateTimer();
}

function renderPlayers() {
  setHTML($('#players'), S.players.map((p) => {
    const initial = p.char ? portraitOf(p.char, { crop: 'face' }) : esc(p.name.slice(0, 1));
    const ch = p.char ? `${esc(p.char.name)} · ${esc(p.char.title)}` : (p.id === S.hostId ? '房主' : '');
    let st = '';
    if (S.phase === 'reading') st = p.ready ? '✓' : '…';
    else if (isSearchPhase(S.phase)) st = p.searched ? '✓' : '…';
    else if (S.phase === 'vote') st = p.voted ? '✓' : '…';
    const mic = p.bot ? '🤖' : (p.voice ? '🎙' : '');
    const cls = ['chip', p.id === myId ? 'me' : '', p.connected ? '' : 'off', p.id === S.speakerId ? 'speaker' : ''].join(' ');
    return `<div class="${cls}" data-pid="${p.id}"><div class="av">${initial}</div><div><div class="nm">${esc(p.name)}${p.id === myId ? '（你）' : ''} <span class="st">${st}${mic}</span></div><div class="ch">${ch || '&nbsp;'}</div></div></div>`;
  }).join(''));
}

let lobPick = false;
function scriptPicker() {
  const host = isHost();
  const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
  const card = (sc, sel) => `<button class="sc-card ${sel ? 'sel' : ''}" data-tone="${sc.tone}" data-script="${sc.id}" ${host ? '' : 'disabled'}><div class="sc-img">${ART.scene(sc.cover)}</div>
    <div class="sc-tx"><b>${esc(sc.title)}</b><span class="sc-tag">${esc(sc.tagline)}</span><span class="sc-meta"><em>难度 ${dots(sc.difficulty)}</em> · ${sc.minPlayers}–${sc.maxPlayers} 人 · ${esc(sc.duration)}</span></div>${sel ? '<i class="sc-check">已选</i>' : ''}</button>`;
  const list = host ? S.scripts : S.scripts.filter((x) => x.id === S.scriptId);
  return `<h3>${host ? '选择剧本' : '本局剧本'}</h3><div class="sc-list">${list.map((x) => card(x, x.id === S.scriptId)).join('')}</div>${host ? '' : '<p style="font-size:13px">房主正在选剧本，选定后会显示在这里。</p>'}`;
}
function renderPhaseCard() {
  const el = $('#phaseCard');
  const [name, hint] = phaseInfo(S.phase);
  const m = me();
  let body = '';

  if (S.phase === 'lobby') {
    const n = S.players.length;
    const ok = n >= S.script.minPlayers && n <= S.script.maxPlayers;
    const auto = !!S.requireAuth, cap = S.cap || S.script.maxPlayers, host = isHost();
    const nowS = Date.now() + clockOffset;
    const rdyN = S.players.filter((p) => p.rdy).length, allRdy = rdyN === n;
    const seat = (i) => {
      const p = S.players[i];
      if (!p) return i < cap ? `<div class="seat empty"><span class="no">${i + 1}</span><div class="av">+</div><div class="nm">空位</div><div class="st">等待加入</div></div>`
        : `<div class="seat closed"><span class="no">${i + 1}</span><div class="av"></div><div class="nm">未开放</div><div class="st">&nbsp;</div></div>`;
      const isH = p.id === S.hostId;
      let st = isH ? '房主' : p.bot ? '机器人' : !auto ? '在房间' : p.rdy ? '已准备' : `未准备 <em data-by="${p.rdyBy || 0}">${Math.max(0, Math.ceil(((p.rdyBy || 0) - nowS) / 1000))}</em>`;
      if (auto && isH) st = '房主 · 已就绪';
      const cls = ['seat', isH ? 'host' : '', p.id === myId ? 'me' : '', auto && p.rdy && !isH ? 'rdy' : '', p.connected ? '' : 'off'].join(' ');
      return `<div class="${cls}"><span class="no">${i + 1}</span><div class="av">${p.bot ? '🤖' : esc(p.name.slice(0, 1))}</div><div class="nm">${esc(p.name)}${p.id === myId ? '（你）' : ''}</div><div class="st">${st}</div></div>`;
    };
    const col = (a, b) => `<div class="col">${[0, 1, 2, 3].map((k) => seat(a + k)).join('')}</div>`;
    const midTx = !auto ? `${n} 人在房间` : S.autoAt ? '即将开始' : n < cap ? `还差 ${cap - n} 人` : '等待全员准备';
    const mid = `<div class="mid"><div class="table ${S.autoAt ? 'go' : ''}">${S.autoAt ? '<b class="tn" id="autoCd"></b>' : `<b class="tn">${n}<em>/${auto ? cap : S.script.maxPlayers}</em></b>`}<span>${midTx}</span></div>
      <div class="hint">${auto ? `已准备 ${rdyN}/${n}` : ''}</div></div>`;
    const me0 = me();
    const capRow = host && auto ? `<div class="lob-tools"><div class="cap-row"><span>房间人数</span><div class="stepper"><button class="btn small" id="lobCapMinus" ${cap <= Math.max(S.script.minPlayers, n) ? 'disabled' : ''}>−</button><b>${cap}</b><button class="btn small" id="lobCapPlus" ${cap >= S.script.maxPlayers ? 'disabled' : ''}>+</button></div></div></div>` : '';
    let act = '';
    if (auto && !host) act = `<button class="btn ${me0 && me0.rdy ? 'ready-on' : 'primary cta'}" id="rdyBtn">${me0 && me0.rdy ? '已准备 · 点击取消' : '准备'}</button><p class="rdy-note">${me0 && me0.rdy ? '等其他人准备，满员后自动开始。' : '请在一分钟内点“准备”，否则会被请出房间。'}</p>`;
    else if (auto) act = `<p class="rdy-note">你是房主，不用点准备。人满并且大家都准备好，游戏自动开始。${n < cap ? '' : allRdy ? '' : ' 有人还没准备。'}</p>`;
    else if (host) act = `<button class="btn primary ${ok ? 'cta' : ''}" id="startBtn" ${ok ? '' : 'disabled'}>开始游戏</button>`;
    else act = '<p class="rdy-note">等待房主开始。</p>';
    const legacy = auto ? '' : `<p class="rdy-note">把房间码 <b>${esc(S.code)}</b> 发给朋友。需要 ${S.script.minPlayers}–${S.script.maxPlayers} 人。${host ? (ok ? '人齐了就可以开始。' : '人数还不够。') : '等待房主开始。'}</p>`;
    const bots = host && S.botsAllowed ? `<div class="actions"><button class="btn" id="addBotBtn" ${n >= S.script.maxPlayers ? 'disabled' : ''}>添加机器人</button>${S.players.some((p) => p.bot) ? '<button class="btn ghost" id="rmBotBtn">移除机器人</button>' : ''}</div><p class="rdy-note">机器人只会自动读完、搜证、投票，仅用于内部测试流程。</p>` : '';
    body = `<div class="lob-banner">${ART.scene(S.script.cover)}<div class="lb-tx"><small>本局剧本</small><b>${esc(S.script.title)}</b><span>${esc(S.script.duration)} · ${S.script.minPlayers}–${S.script.maxPlayers} 人</span></div>${host ? `<button class="btn small" id="lobChange">${lobPick ? '收起' : '换剧本'}</button>` : ''}</div>
      ${host && lobPick ? scriptPicker() : ''}
      <div class="board">${col(0)}${mid}${col(4)}</div>
      ${capRow}
      <div class="lob-code"><div class="c1">房间码<b>${esc(S.code)}</b>${S.locked ? `<span class="pw">🔒 房间密码<b>${esc(S.password)}</b></span>` : ''}</div><button class="btn small" id="copyCode">复制</button><button class="btn small" id="shareCode">邀请朋友</button></div>
      <div class="lob-act">${act}${legacy}${bots}</div>`;
  } else if (S.phase === 'reveal') {
    body = revealCard();
  } else {
    let extra = '';
    if (S.phase === 'reading') {
      extra = `<div class="actions"><button class="btn primary" style="width:auto" id="readyBtn" ${m && m.ready ? 'disabled' : ''}>${m && m.ready ? '已读完，等待其他人…' : '我读完了'}</button></div>`;
    } else if (S.phase === 'turns') {
      const mine = S.speakerId === myId;
      const i = S.speakerOrder.indexOf(S.speakerId) + 1;
      const sp = S.players.find((x) => x.id === S.speakerId);
      extra = `<div class="stage"><div class="spot"></div><div class="speaker-av"><i class="ring"></i><i class="ring"></i><i class="ring"></i><div class="face">${portraitOf(sp && sp.char, { crop: 'face' })}</div></div>
        <div class="info"><span>第 ${i}/${S.speakerOrder.length} 位发言</span><b>${esc(sp && sp.char ? sp.char.name : playerName(S.speakerId))}</b>
        <span>${esc(playerName(S.speakerId))}${mine ? '（你）' : ''}<span class="wave"><i></i><i></i><i></i><i></i></span></span></div></div>
        <p style="margin:0 0 10px">${mine ? '轮到你了，开麦说话。' : '正在发言，其他人已被静音。'}</p>
        <div class="actions">${mine ? '<button class="btn primary" style="width:auto" id="doneBtn">我说完了</button>' : ''}</div>`;
    } else if (isSearchPhase(S.phase)) {
      extra = `<div class="loc-grid">${S.script.locations.map((l) =>
        `<button class="loc place" data-loc="${l.id}" ${m && m.searched ? 'disabled' : ''}><div class="th">${ART.scene(l.scene)}${m && m.searched ? '<span class="tick">已搜</span>' : ''}</div><div class="tx"><b>${esc(l.name)}</b><small>${esc(l.desc)}</small></div></button>`).join('')}</div>
        ${m && m.searched ? '<p style="margin-top:10px">你这一轮已经搜过了，等其他人。</p>' : ''}`;
    } else if (S.phase === 'vote') {
      const picked = S.you.vote;
      extra = `<div class="vote-grid">${S.players.filter((p) => p.id !== myId).map((p) =>
        `<button class="vote-card ${picked === p.id ? 'picked' : ''}" data-vote="${p.id}"><div class="ph">${portraitOf(p.char)}</div><div class="tx"><b>${esc(p.char ? p.char.name : p.name)}</b><small>${esc(p.name)}${picked === p.id ? ' · 已选' : ''}</small></div></button>`).join('')}</div>`;
    }
    const skip = isHost() ? `<div class="actions" style="margin-top:12px"><button class="btn small ghost" id="skipBtn">跳到下一阶段（房主）</button></div>` : '';
    body = `<h3>${esc(name)}</h3><p>${esc(hint)}</p>${extra}${skip}`;
  }
  if (!setHTML(el, body)) return;

  const on = (sel, ev, fn) => { const x = el.querySelector(sel); if (x) x.addEventListener(ev, fn); };
  el.querySelectorAll('[data-script]').forEach((b) => b.addEventListener('click', () => { if (isHost()) { send({ type: 'setscript', id: b.dataset.script }); lobPick = false; } }));
  on('#startBtn', 'click', () => { snd('start'); send({ type: 'start' }); });
  on('#rdyBtn', 'click', () => { const mm = me(); snd(mm && mm.rdy ? 'click' : 'pick'); send({ type: 'lobbyready', on: !(mm && mm.rdy) }); });
  on('#lobChange', 'click', () => { lobPick = !lobPick; el._h = null; renderPhaseCard(); });
  on('#copyCode', 'click', async () => { try { await navigator.clipboard.writeText(S.code); toast('房间码 ' + S.code + ' 已复制，发给朋友吧'); } catch (e) { toast('房间码：' + S.code); } });
  on('#shareCode', 'click', async () => {
    const text = `来玩线上剧本杀！房间码：${S.code}${S.locked ? '，房间密码：' + S.password : ''}。打开 App，进“多人剧本杀”，在列表里找到房间，或输入房间码加入。`;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text); toast('邀请文字已复制，粘贴给朋友即可'); } catch (e) { toast(text); }
  });
  on('#addBotBtn', 'click', () => send({ type: 'addbot' }));
  on('#lobCapMinus', 'click', () => send({ type: 'setcap', cap: (S.cap || 4) - 1 }));
  on('#lobCapPlus', 'click', () => send({ type: 'setcap', cap: (S.cap || 4) + 1 }));
  on('#rmBotBtn', 'click', () => send({ type: 'removebot' }));
  on('#readyBtn', 'click', () => { snd('clue'); send({ type: 'ready' }); });
  on('#doneBtn', 'click', () => send({ type: 'speakdone' }));
  on('#skipBtn', 'click', () => send({ type: 'next' }));
  el.querySelectorAll('[data-loc]').forEach((b) => b.addEventListener('click', () => { snd('pick'); snd('creak'); pendingLoc = b.dataset.loc; send({ type: 'search', loc: b.dataset.loc }); }));
  el.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => { snd('vote'); send({ type: 'vote', target: b.dataset.vote }); }));
  const rs = el.querySelector('#restartBtn');
  if (rs) rs.addEventListener('click', () => { snd('whoosh'); send({ type: 'restart' }); });
}

function revealCard() {
  const r = S.reveal;
  if (!r) return '<h3>真相揭晓</h3>';
  const caught = r.result.caught;
  const culprit = r.cast.find((c) => c.playerId === r.result.culpritId);
  const maxV = Math.max(1, ...Object.values(r.result.counts));
  const bars = S.players.map((p) => {
    const n = r.result.counts[p.id] || 0;
    const c = r.cast.find((x) => x.playerId === p.id);
    return `<div class="vote-bar"><span style="width:110px">${esc(c.charName)}</span><span class="bar" style="width:${(n / maxV) * 140}px"></span><span>${n} 票</span></div>`;
  }).join('');
  return `<p class="reveal-win ${caught ? 'good' : 'bad'}">${caught ? '凶手被抓获了！' : '凶手逃脱了……'}</p>
    <p style="color:var(--text)">真凶是 <b>${esc(culprit.charName)}</b>（${esc(culprit.playerName)}）。</p>
    ${bars}
    ${isHost() ? '<div class="actions" style="margin-top:12px"><button class="btn primary" style="width:auto" id="restartBtn">再来一局</button></div>' : ''}`;
}

function renderTabs() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const chatOn = tab === 'chat';
  $('#chatPane').hidden = !chatOn;
  $('#tabBody').hidden = chatOn;
  if (chatOn) { unread = 0; updateDot(); renderChat(); return; }
  const el = $('#tabBody');
  // 同一页面内的刷新不要重播入场动画
  const key = tab + '|' + S.phase + '|' + (S.reveal ? 1 : 0) + '|' + (roleOpened ? 1 : 0);
  el.classList.toggle('noanim', key === lastTabKey);
  lastTabKey = key;
  const html = tab === 'role' ? roleTab() : tab === 'case' ? caseTab() : cluesTab();
  if (!setHTML(el, html)) return;
  if (tab === 'role') {
    const open = el.querySelector('[data-open]');
    if (open) open.addEventListener('click', () => { roleOpened = true; snd('envelope'); renderTabs(); });
    FX.tilt(el.querySelector('.frame'));
    FX.sparkle(el.querySelector('.frame'), 6);
    FX.sparkle(el.querySelector('.role-hero'), 10);
    FX.sparkle(el.querySelector('.sealed'), 12);
  } else if (tab === 'clues') {
    el.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => send({ type: 'share', clueId: b.dataset.share })));
    freshClues.clear();
  }
}

function roleTab() {
  if (S.phase === 'lobby' || !S.you || !S.you.char) return '<div class="card"><p class="empty">游戏开始后，这里会显示你的角色。</p></div>';
  const c = S.you.char;
  if (S.phase === 'reading' && !roleOpened) {
    return `<div class="sealed"><h4>密封的角色档案</h4><p>只有你自己能看。拆开之前，先确认身边没有别人在偷看。</p>
      <button class="seal-btn" data-open="1">拆封</button></div>`;
  }
  return `<div class="role-hero ${S.phase === 'reading' ? 'unseal' : ''}">
      <div class="frame">${portraitOf(c, { label: c.name })}</div>
      <div class="role-info"><span class="big">${esc(c.name)}</span><span class="meta">${esc(c.title)} · ${c.age} 岁</span>
        <p>${esc(c.blurb)}</p>${c.isCulprit ? '<span class="stamp">你是凶手</span>' : ''}</div>
    </div>
    <div class="card"><h4>你的故事</h4><p>${esc(c.story)}</p></div>
    <div class="card"><h4>你的时间线</h4><ul>${c.timeline.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="card secret"><h4>你的秘密（不要轻易说出口）</h4><p>${esc(c.secret)}</p></div>
    <div class="card ${c.isCulprit ? 'culprit' : ''}"><h4>你的目标</h4><p>${esc(c.goal)}</p></div>`;
}

function caseTab() {
  const sc = S.script;
  const tl = (sc.timeline || []).map((t, i) =>
    `<div class="tl-item ${t.icon === 'skull' ? 'hot' : ''}" style="animation-delay:${(0.15 + i * 0.14).toFixed(2)}s"><span class="dot2">${ART.icon(t.icon)}</span><div class="tm">${esc(t.t)}</div><div class="tx">${esc(t.text)}</div></div>`).join('');
  const cover = `<div class="cover-card">${ART.scene(sc.cover || 'cover')}<div class="cap"><b>${esc(sc.title)}</b><span>${esc(sc.subtitle)}</span></div></div>`;
  let html = cover + `<div class="card"><h4>故事背景</h4>${sc.intro.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    ${tl ? `<div class="card"><h4>案发经过</h4><div class="tl">${tl}</div></div>` : ''}
    <div class="card"><h4>已知的事实</h4><ul>${sc.publicFacts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
    <div class="card"><h4>死者</h4><div class="victim"><div class="frame">${ART.portrait(sc.victim.look || 'victim', { label: sc.victim.name, age: sc.victim.age, cls: 'ph-victim' })}</div>
      <div><b style="font-family:var(--serif);font-size:20px;letter-spacing:.1em">${esc(sc.victim.name)}</b><div style="color:var(--muted);font-size:13px;margin:2px 0 6px">${sc.victim.age} 岁</div><p style="margin:0;font-size:14px">${esc(sc.victim.desc)}</p></div></div></div>`;
  if (S.phase !== 'lobby') {
    html += `<div class="card"><h4>在场的人</h4><div class="cast">${S.players.map((p, i) => p.char
      ? `<div class="cast-card ${p.id === myId ? 'me' : ''}" style="animation-delay:${(i * 0.06).toFixed(2)}s"><div class="ph">${portraitOf(p.char)}</div><span class="who">${esc(p.name)}${p.id === myId ? '（你）' : ''}</span>
        <div class="tx"><b>${esc(p.char.name)}</b><small>${esc(p.char.title)} · ${p.char.age} 岁</small><p>${esc(p.char.blurb)}</p></div></div>` : '').join('')}</div></div>`;
  }
  if (S.reveal) {
    const truth = S.reveal.truth.map((p, i) => `<p style="animation-delay:${(0.4 + i * 1.1).toFixed(1)}s">${esc(p)}</p>`).join('');
    html = `<div class="card culprit truth"><div class="truth-cover">${ART.scene(S.script.cover || 'study')}</div><h4>真相</h4>${truth}</div>
      <div class="card"><h4>每个人的结局</h4><ul style="list-style:none;padding:0">${S.reveal.cast.map((c) =>
        `<li class="ending ${c.isCulprit ? 'c' : ''}"><div class="mini">${portraitOf(c, { crop: 'face' })}</div><div><b>${esc(c.charName)}</b>（${esc(c.playerName)}）${c.isCulprit ? '<span class="tag" style="color:var(--danger)">凶手</span>' : ''}<br>${esc(c.reveal)}</div></li>`).join('')}</ul></div>` + html;
  }
  return html;
}

function cluesTab() {
  const mine = (S.you && S.you.clues) || [];
  const sharedIds = new Set(S.shared.map((s) => s.id));
  const locId = sceneKey;
  const mineHtml = mine.length
    ? mine.map((c) => `<div class="clue ${freshClues.has(c.id) ? 'fresh' : ''}"><div class="cth">${ART.scene(locId(c.loc))}</div><div class="cbody"><div class="t"><b>${esc(c.title)}</b><span class="loc-tag">${esc(c.loc)}</span></div><p>${esc(c.text)}</p>
        <div style="margin-top:10px">${sharedIds.has(c.id) ? '<span class="tag">已公开</span>' : `<button class="btn small" data-share="${c.id}">公开给所有人</button>`}</div></div></div>`).join('')
    : '<p class="empty">你还没有线索。搜证阶段选一个地点吧。</p>';
  const shared = S.shared.length
    ? S.shared.map((c) => `<div class="clue"><div class="cth">${ART.scene(locId(c.loc))}</div><div class="cbody"><div class="t"><b>${esc(c.title)}</b><span class="loc-tag">${esc(c.loc)} · ${esc(c.by)} 公开</span></div><p>${esc(c.text)}</p></div></div>`).join('')
    : '<p class="empty">还没有人公开线索。</p>';
  return `<div class="card"><h4>我的线索（只有你看得到）</h4>${mineHtml}</div><div class="card"><h4>公开的线索</h4>${shared}</div>`;
}

// ================= 全屏特效：开场、转场、搜证、揭晓 =================
function mountOverlay(cls, html) {
  const el = document.createElement('div');
  el.className = 'ov ' + cls;
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
function closeModal(el, after) {
  if (!el) return;
  el.classList.add('out');
  if (el._stop) el._stop();
  if (el._timers) el._timers.forEach(clearTimeout);
  setTimeout(() => { el.remove(); if (modal === el) modal = null; if (after) after(); }, 400);
}
function setModal(el) {
  if (modal && modal !== el) { modal._timers && modal._timers.forEach(clearTimeout); modal._stop && modal._stop(); modal.remove(); }
  modal = el;
  el._timers = el._timers || [];
}

function onPhaseEnter(phase, prev) {
  if (phase === 'reading' && !introShown) { introShown = true; return showIntro(); }
  if (phase === 'reveal') return showReveal();
  if (phase === 'lobby') return;
  if (!modal) showSplash(phase);
}

function showSplash(phase) {
  snd('splash');
  if (isSearchPhase(phase)) setTimeout(() => snd('footsteps'), 400); else if (/^discuss/.test(phase)) setTimeout(() => snd('match'), 500); else if (phase === 'vote') setTimeout(() => snd('knock'), 400);
  const i = phaseOrder().indexOf(phase) + 1;
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<div class="bgscene">${ART.scene((S.script.phaseScenes && S.script.phaseScenes[phase]) || S.script.cover || 'cover')}</div><div class="inner"><small>第 ${NUM[i] || i} 幕</small><b>${esc(phaseInfo(phase)[0])}</b><i></i></div>`;
  document.body.appendChild(el);
  FX.sparkle(el.querySelector('.inner'), 14);
  setTimeout(() => el.remove(), 2200);
}

function showIntro() {
  const sc = S.script;
  const slides = [{ scene: sc.cover || 'cover', title: true }, ...sc.intro.map((t, i) => ({ scene: (sc.introScenes && sc.introScenes[i]) || sc.cover || 'cover', text: t }))];
  const el = mountOverlay('intro', `<div class="slides"></div><div class="shade"></div><canvas class="ovsnow"></canvas>
    <button class="skip">跳过 ▸▸</button><div class="titlecard" hidden><h1>${esc(sc.title)}</h1><p>${esc(sc.subtitle)}</p></div>
    <div class="textbox"><div class="tt"></div><div class="hint"><div class="dots">${slides.map(() => '<i></i>').join('')}</div><span class="next">点击继续 ▸</span></div></div>`);
  setModal(el); snd('swell');
  el._stop = FX.snow(el.querySelector('canvas'), { count: 90, speed: 1.2 });
  FX.sparkle(el.querySelector('.titlecard'), 16, { min: 8, max: 14 });
  let idx = -1, tw = null;
  const slidesEl = el.querySelector('.slides'), tt = el.querySelector('.tt'), title = el.querySelector('.titlecard');
  const go = () => {
    idx++;
    if (idx >= slides.length) return closeModal(el);
    const sl = slides[idx];
    if (idx > 0) snd('whoosh');
    const d = document.createElement('div');
    d.className = 'slide';
    d.innerHTML = `<div class="bgscene">${ART.scene(sl.scene)}</div>`;
    slidesEl.appendChild(d);
    // 等图片解码好再淡入，避免淡入时先露出黑底
    const im = d.querySelector('img');
    const show = () => requestAnimationFrame(() => d.classList.add('on'));
    if (im && im.decode) im.decode().then(show, show); else show();
    const old = slidesEl.querySelectorAll('.slide');
    // 旧画面保持不透明，等新画面完全淡入后再移除，避免两张图交叉淡入时中间变暗（一闪）
    if (old.length > 1) { const o = old[0]; setTimeout(() => o.remove(), 1000); }
    el.querySelectorAll('.dots i').forEach((x, k) => x.classList.toggle('on', k <= idx));
    title.hidden = !sl.title;
    tt.textContent = '';
    el.querySelector('.next').textContent = idx === slides.length - 1 ? '开始游戏 ▸' : '点击继续 ▸';
    if (sl.text) tw = FX.typewriter(tt, sl.text, 38);
    else tw = null;
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('.skip')) return closeModal(el);
    if (tw && !tw.done()) return tw.skip();
    go();
  });
  go();
}

function showSearch(locName, clue) {
  const loc = S.script.locations.find((l) => l.id === pendingLoc) || S.script.locations.find((l) => l.name === locName) || S.script.locations[0];
  pendingLoc = null;
  const el = mountOverlay('searchov', `<div class="bgscene">${ART.scene(loc.scene || loc.id)}</div><div class="shade" style="opacity:.55"></div>
    <div class="darkmask"></div><div class="lens"></div><div class="locname">${esc(loc.name)}</div><div class="result"><div></div></div>`);
  setModal(el); snd('search'); setTimeout(() => snd('rustle'), 500);
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const path = [[.2, .7], [.78, .35], [.35, .45], [.62, .68], [.5, .5]];
  const T = 2300, t0 = performance.now();
  let raf = 0, done = false;
  const setPos = (x, y) => { el.style.setProperty('--x', x + 'px'); el.style.setProperty('--y', y + 'px'); };
  setPos(W() * path[0][0], H() * path[0][1]);
  const finish = () => {
    if (done) return; done = true; cancelAnimationFrame(raf);
    setPos(W() * .5, H() * .5);
    el.querySelector('.darkmask').classList.add('off'); el.querySelector('.lens').classList.add('off');
    const res = el.querySelector('.result > div');
    res.innerHTML = clue
      ? `<div class="clue-reveal"><span class="new">新线索</span><h3>${esc(clue.title)}</h3><p>${esc(clue.text)}</p><button class="btn primary">收入线索</button></div>`
      : `<div class="clue-reveal empty"><h3 style="color:var(--text)">什么也没有</h3><p>你翻遍了这里，没有新的发现。</p><button class="btn primary">继续</button></div>`;
    if (clue) { freshClues.add(clue.id); FX.sparkle(res.querySelector('.clue-reveal'), 14); snd('paper'); snd('clue'); } else snd('nothing');
    res.querySelector('.btn').addEventListener('click', () => closeModal(el, () => { if (clue) { tab = 'clues'; if (S) renderTabs(); } }));
  };
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / T), seg = (path.length - 1) * k, i = Math.min(path.length - 2, Math.floor(seg)), f = seg - i;
    const ease = f * f * (3 - 2 * f);
    setPos(W() * (path[i][0] + (path[i + 1][0] - path[i][0]) * ease), H() * (path[i][1] + (path[i + 1][1] - path[i][1]) * ease));
    if (k >= 1) return finish();
    raf = requestAnimationFrame(tick);
  };
  if (document.documentElement.classList.contains('lite')) {
    // 手机：不做手电筒移动动画（每帧重绘全屏渐变很卡），停一下直接出结果
    setPos(W() * .5, H() * .5);
    const to = setTimeout(finish, 900);
    el._stop = () => clearTimeout(to);
  } else {
    raf = requestAnimationFrame(tick);
    el._stop = () => cancelAnimationFrame(raf);
  }
  el.addEventListener('click', (e) => { if (!done && !e.target.closest('.btn')) finish(); });
}

function showReveal() {
  const r = S.reveal;
  if (!r || revealShown) return;
  revealShown = true;
  const culprit = r.cast.find((c) => c.playerId === r.result.culpritId) || r.cast.find((c) => c.isCulprit);
  const caught = r.result.caught;
  const others = r.cast.filter((c) => c !== culprit).sort(() => Math.random() - 0.5);
  const order = [...others, culprit];
  const el = mountOverlay('revealov', `<div class="beam"></div><canvas class="ovsnow"></canvas><button class="skip">跳过 ▸▸</button>
    <h2>真相，只有一个</h2>
    <div class="suspects">${r.cast.map((c) => `<div class="suspect" data-pid="${c.playerId}"><div class="pic">${portraitOf(c, { crop: 'face' })}</div><span>${esc(c.charName)}</span></div>`).join('')}</div>
    <div class="verdict ${caught ? 'good' : 'bad'}"><b>${caught ? '凶手落网' : '凶手逃脱'}</b><p>真凶是 ${esc(culprit.charName)}（${esc(culprit.playerName)}）</p><button class="btn primary cta" id="seeTruth">查看完整真相</button></div>
    <div class="flash"></div>`);
  setModal(el); snd('drum');
  el._stop = FX.snow(el.querySelector('canvas'), { count: 50, alpha: 0.5 });
  const pick = (pid) => el.querySelector(`.suspect[data-pid="${pid}"]`);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); el._timers.push(t); };
  let shown = false;
  const verdict = () => {
    if (shown) return; shown = true;
    el._timers.forEach(clearTimeout);
    el.querySelectorAll('.suspect').forEach((x) => { x.classList.remove('lit'); });
    el.querySelectorAll('.suspect').forEach((x) => { if (x.dataset.pid !== culprit.playerId) x.classList.add('dim'); });
    pick(culprit.playerId).classList.add('culprit');
    el.querySelector('.flash').classList.add('go');
    snd('crack'); later(() => snd(caught ? 'win' : 'lose'), 1100);
    el._burst = FX.burst(el, caught ? 'gold' : 'fog');
    FX.sparkle(pick(culprit.playerId), 10, { min: 8, max: 12 });
    later(() => el.querySelector('.verdict').classList.add('on'), 700);
  };
  const STEP = 520, START = 1300;
  order.forEach((c, k) => {
    if (k === order.length - 1) return;
    later(() => { snd('lit'); el.querySelectorAll('.suspect.lit').forEach((x) => x.classList.remove('lit')); pick(c.playerId).classList.add('lit'); }, START + k * STEP);
  });
  later(verdict, START + (order.length - 1) * STEP + 500);
  el.querySelector('.skip').addEventListener('click', () => { verdict(); el.querySelector('.skip').remove(); });
  el.querySelector('#seeTruth').addEventListener('click', () => closeModal(el, () => { tab = 'case'; lastTabKey = null; $('#tabBody')._h = null; if (S) { renderTabs(); } window.scrollTo(0, 0); }));
}

function renderChat() {
  const log = $('#chatLog');
  if (!log) return;
  const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  log.innerHTML = chatLog.map((m) => m.sys
    ? `<div class="msg sys">${esc(m.text)}</div>`
    : `<div class="msg"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join('') || '<div class="msg sys">还没有消息</div>';
  if (stick || tab === 'chat') log.scrollTop = log.scrollHeight;
}
function updateDot() { $('#chatDot').hidden = unread === 0; }

function updateTimer() {
  const t = $('#timer');
  if (!S || !S.phaseEnd) { t.textContent = ''; return; }
  const left = (S.phaseEnd - (Date.now() + clockOffset)) / 1000;
  t.textContent = fmt(left);
  t.classList.toggle('low', left < 30);
  const sec = Math.ceil(left);
  if (left > 0 && sec <= 10 && sec !== lastWarn && !$('#room').hidden) { lastWarn = sec; snd('warn'); } else if (sec > 10) lastWarn = -1;
}
setInterval(() => {
  if (S) updateTimer();
  document.querySelectorAll('[data-by]').forEach((x) => { const left = Math.max(0, Math.ceil((Number(x.dataset.by) - (Date.now() + clockOffset)) / 1000)); if (x.textContent !== String(left)) x.textContent = left; });
  const cd = document.getElementById('autoCd');
  if (cd && S && S.autoAt) { const left = Math.max(0, Math.ceil((S.autoAt - (Date.now() + clockOffset)) / 1000)); if (cd.textContent !== String(left)) { cd.textContent = left; if (left > 0) snd('tab'); } }
}, 500);

// ================= 语音（WebRTC 网状） =================
const voice = { stream: null, on: false, muted: false, pcs: new Map(), pending: new Map(), analysers: new Map() };
let audioCtx = null;

async function voiceOn() {
  if (voice.on) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return toast('这个浏览器不支持麦克风。请用 https 打开（或在本机用 localhost）。');
  }
  try {
    voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    return toast('无法使用麦克风。请在浏览器地址栏允许麦克风权限后重试。');
  }
  voice.on = true;
  voice.muted = false;
  watchLevel('me', voice.stream);
  send({ type: 'voice-join' });
  voiceApplyGate();
  renderVoiceBar();
}

function voiceOff() {
  if (!voice.on) return;
  send({ type: 'voice-leave' });
  voiceTeardownPeers();
  if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
  voice.stream = null;
  voice.on = false;
  renderVoiceBar();
}

function voiceTeardownPeers() {
  voice.pcs.forEach((pc) => { try { pc.close(); } catch {} });
  voice.pcs.clear();
  voice.pending.clear();
  document.querySelectorAll('audio[data-peer]').forEach((a) => a.remove());
  voice.analysers.forEach((x, k) => { if (k !== 'me') voice.analysers.delete(k); });
}

function voiceClosePeer(id) {
  const pc = voice.pcs.get(id);
  if (pc) { try { pc.close(); } catch {} voice.pcs.delete(id); }
  voice.pending.delete(id);
  const a = document.querySelector(`audio[data-peer="${id}"]`);
  if (a) a.remove();
  voice.analysers.delete(id);
}

function voiceMakePC(id) {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
  pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'signal', to: id, data: { candidate: e.candidate } }); };
  pc.ontrack = (e) => {
    let a = document.querySelector(`audio[data-peer="${id}"]`);
    if (!a) {
      a = document.createElement('audio');
      a.dataset.peer = id;
      a.autoplay = true;
      a.playsInline = true;
      document.body.appendChild(a);
    }
    a.srcObject = e.streams[0];
    a.play().catch(() => {});
    watchLevel(id, e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') toast('有一路语音连接失败（可能需要 TURN 服务器，见 README）。');
  };
  voice.pcs.set(id, pc);
  return pc;
}

async function voiceCall(id) {
  if (!voice.on) return;
  voiceClosePeer(id);
  const pc = voiceMakePC(id);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ type: 'signal', to: id, data: { sdp: pc.localDescription } });
}

async function voiceSignal(from, data) {
  if (!voice.on) return;
  try {
    if (data.sdp) {
      let pc = voice.pcs.get(from);
      if (data.sdp.type === 'offer') {
        if (pc) voiceClosePeer(from);
        pc = voiceMakePC(from);
        await pc.setRemoteDescription(data.sdp);
        await flushPending(from, pc);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        send({ type: 'signal', to: from, data: { sdp: pc.localDescription } });
      } else if (pc) {
        await pc.setRemoteDescription(data.sdp);
        await flushPending(from, pc);
      }
    } else if (data.candidate) {
      const pc = voice.pcs.get(from);
      if (pc && pc.remoteDescription) await pc.addIceCandidate(data.candidate);
      else { const q = voice.pending.get(from) || []; q.push(data.candidate); voice.pending.set(from, q); }
    }
  } catch (e) { console.warn('signal error', e); }
}
async function flushPending(id, pc) {
  const q = voice.pending.get(id) || [];
  voice.pending.delete(id);
  for (const c of q) { try { await pc.addIceCandidate(c); } catch {} }
}

// 轮流发言阶段：只有当前发言人的麦克风是开的
function micAllowed() {
  if (!voice.on || voice.muted) return false;
  if (S && S.phase === 'turns') return S.speakerId === myId;
  return true;
}
function voiceApplyGate() {
  if (voice.stream) voice.stream.getAudioTracks().forEach((t) => (t.enabled = micAllowed()));
  renderVoiceBar();
}

function watchLevel(key, stream) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    const an = audioCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    voice.analysers.set(key, an);
  } catch {}
}
setInterval(() => {
  if (!S) return;
  const buf = new Uint8Array(256);
  voice.analysers.forEach((an, key) => {
    an.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
    const pid = key === 'me' ? myId : key;
    const speaking = peak > 14 && (key !== 'me' || micAllowed());
    const chip = document.querySelector(`.chip[data-pid="${pid}"]`);
    if (chip) chip.classList.toggle('speaking', speaking);
  });
}, 200);

function renderVoiceBar() {
  const bar = $('#voiceBar');
  if (!S) { setHTML(bar, ''); return; }
  const n = S.players.filter((p) => p.voice).length;
  if (!voice.on) {
    if (!setHTML(bar, `<div class="inner"><div class="status"><b>语音未开启</b><br>${n ? `${n} 人已在语音中` : '开启后可以和大家直接说话'}</div><button class="btn mic-on" id="voiceOnBtn">开启语音</button></div>`)) return;
    $('#voiceOnBtn').addEventListener('click', voiceOn);
    return;
  }
  let status;
  if (S.phase === 'turns' && S.speakerId !== myId) status = `<b>已静音</b><br>轮到 ${esc(playerName(S.speakerId))} 发言`;
  else if (S.phase === 'turns') status = '<b>轮到你了</b><br>麦克风已打开';
  else status = voice.muted ? '<b>你已静音</b>' : '<b>麦克风已打开</b>';
  const gated = S.phase === 'turns' && S.speakerId !== myId;
  if (!setHTML(bar, `<div class="inner"><div class="status">${status}<br><span style="font-size:12px">${n} 人在语音中</span></div>
    <button class="btn ${gated ? 'mic-gated' : voice.muted ? '' : 'mic-on'}" id="muteBtn" ${gated ? 'disabled' : ''}>${voice.muted ? '取消静音' : '静音'}</button>
    <button class="btn ghost" id="voiceOffBtn">退出语音</button></div>`)) return;
  $('#muteBtn').addEventListener('click', () => { voice.muted = !voice.muted; voiceApplyGate(); });
  $('#voiceOffBtn').addEventListener('click', voiceOff);
}

// ================= 开屏 / 账号 / 多人大厅 =================
let account = null, guest = false, needAuth = false, gotHello = false, authedWs = false, scriptsList = [], splashDone = false;
try { account = JSON.parse(localStorage.getItem('jbs_acct') || 'null'); } catch (e) {}
function saveAcct() { try { localStorage.setItem('jbs_acct', JSON.stringify(account)); } catch (e) {} }
function clearAcct() { account = null; try { localStorage.removeItem('jbs_acct'); } catch (e) {} renderAcct(); }
const API = SERVER;
async function apiPost(path, body) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 75000);
  try {
    const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '服务器出错了');
    return j;
  } finally { clearTimeout(t); }
}
function startSplash() {
  const sp = $('#splash');
  const done = () => { if (splashDone) return; splashDone = true; sp.classList.add('out'); setTimeout(() => sp.remove(), 500); route(true); };
  sp.addEventListener('click', () => { snd('click'); done(); });
  setTimeout(() => snd('logo'), 250);
  setTimeout(done, 4000);
}
function visibleScreen() { return ['#home', '#mp', '#auth', '#room', '#det'].find((s) => !$(s).hidden); }
function route(first) {
  const v = visibleScreen();
  if (first) {
    if (session()) return; // 正在重连房间，等 state；超时后由兜底定时器显示首页
    if (account || guest) return showHome();
    if (gotHello) return needAuth ? showAuth() : showHome();
    if (SERVER) return showAuth(); // 服务器还在睡，先让用户填登录信息
    return; // 等 hello
  }
  if (!v) { if (session()) return; return (needAuth && !account && !guest) ? showAuth() : showHome(); }
  if (v === '#auth' && (!needAuth || account)) showHome();
}
function afterHello() { if (splashDone) route(false); }
function showAuth() {
  S = null; FX.ambient('snow'); try { SFX.music('menu', 'menu'); } catch (e) {}
  ['#home', '#mp', '#room'].forEach((s) => ($(s).hidden = true));
  $('#auth').hidden = false;
  if (!stopSnow) stopSnow = FX.snow($('#snow'), { count: 60, global: true });
}
function renderAcct() {
  const a = $('#acct'); if (!a) return;
  a.hidden = !account;
  if (account) { $('#acctNm').textContent = account.nick; $('#acctAv').textContent = account.nick.slice(0, 1); }
}
let authMode = 'login';
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('#authSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#auNickRow').hidden = m !== 'register';
  $('#auGo').textContent = m === 'login' ? '登录' : '注册并进入';
  $('#auTitle').textContent = m === 'login' ? '欢迎回来' : '创建账号';
  $('#auSub').textContent = m === 'login' ? '登录后可以创建房间、加入朋友的房间。' : '邮箱和密码就够了，Gmail 等任何邮箱都可以。';
  $('#auAltTx').textContent = m === 'login' ? '还没有账号？' : '已经有账号？';
  $('#auSwitch').textContent = m === 'login' ? '注册' : '登录';
  $('#auPw').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#auMsg').textContent = '';
}
async function submitAuth(e) {
  e.preventDefault();
  const email = $('#auEmail').value.trim(), password = $('#auPw').value, nick = $('#auNick').value.trim();
  const msg = $('#auMsg'), go = $('#auGo');
  if (!email || !password) { msg.textContent = '请填写邮箱和密码'; return; }
  if (authMode === 'register' && !nick) { msg.textContent = '请起一个昵称'; return; }
  go.disabled = true; msg.textContent = connected() ? '请稍候…' : '正在叫醒服务器（免费服务器要 30–60 秒），请稍候…';
  try {
    const j = await apiPost(authMode === 'login' ? '/api/login' : '/api/register', { email, password, nick });
    account = { token: j.token, nick: j.nick, email: j.email, tester: !!j.tester }; saveAcct();
    snd('win'); guest = false;
    if (connected()) send({ type: 'auth', token: account.token });
    msg.textContent = ''; showHome();
  } catch (err) {
    msg.textContent = err.name === 'AbortError' ? '服务器没有响应，稍后再试' : (err.message === 'Failed to fetch' ? '连不上服务器，请检查网络后重试' : err.message);
    snd('lose');
  } finally { go.disabled = false; }
}
function initAccountUI() {
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setAuthMode(b.dataset.m); });
  $('#auGuest').addEventListener('click', () => { guest = true; showHome(); });
  $('#auSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  $('#logoutBtn').addEventListener('click', () => { clearAcct(); authedWs = false; guest = false; try { ws && ws.close(); } catch (e) {} showAuth(); });
  $('#mpBtn').addEventListener('click', () => {
    if (needAuth && !account) { toast('多人游戏需要先登录'); return showAuth(); }
    showMp();
  });
  $('#mpBack').addEventListener('click', () => { snd('click'); goBack(); });
  $('#mpSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMpTab(b.dataset.m); });
  $('#roomsRefresh').addEventListener('click', pollRooms);
  $('#capMinus').addEventListener('click', () => { mpCap--; renderMpScripts(); });
  $('#capPlus').addEventListener('click', () => { mpCap++; renderMpScripts(); });
  $('#codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('#joinBtn').addEventListener('click', () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 4) return toast('房间码是 4 个字母');
    joinRoom(code);
  });
  $('#createBtn').addEventListener('click', () => {
    const name = mpName(); if (!name) return toast('先输入昵称');
    if (!connected()) return toast(NOT_CONN);
    send({ type: 'create', name, script: mpScript, cap: mpCap, password: $('#roomPw').value.trim() });
  });
  $('#roomList').addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (!b) return; if (b.dataset.lock === '1') { if (!mpName()) return toast('先输入昵称'); askPassword(b.dataset.code); } else joinRoom(b.dataset.code); });
  $('#mpScripts').addEventListener('click', (e) => { const b = e.target.closest('[data-script]'); if (b) { mpScript = b.dataset.script; renderMpScripts(); } });
  try { $('#nameInput').value = localStorage.getItem('jbs_name') || ''; } catch (e) {}
  renderAcct();
}
const NOT_CONN = '还没连上联机服务器，请稍等几秒再点（免费服务器睡醒要约 30–60 秒）';
const mpName = () => {
  if (account && needAuth) return account.nick;
  const n = $('#nameInput').value.trim(); try { localStorage.setItem('jbs_name', n); } catch (e) {}
  return n;
};
let pendingJoin = null;
function joinRoom(code, password) {
  const name = mpName(); if (!name) return toast('先输入昵称');
  if (!connected()) return toast(NOT_CONN);
  pendingJoin = code;
  send({ type: 'join', code, name, password: password || '' });
}
function askPassword(code, wrong) {
  const old = $('#pwOv'); if (old) old.remove();
  const el = document.createElement('div');
  el.id = 'pwOv'; el.className = 'leave-ov';
  el.innerHTML = `<div class="leave-card"><h3>这个房间有密码</h3><p>${wrong ? '密码不对，请再试一次。' : '向房主要密码，输入后就能进房间。'}</p>
    <label class="uf"><span>房间密码</span><input id="pwIn" maxlength="12" autocomplete="off" autofocus></label>
    <div class="actions"><button class="btn" data-x="no">取消</button><button class="btn primary" data-x="ok" style="width:auto">进入房间</button></div></div>`;
  document.body.appendChild(el);
  const go = () => { const v = el.querySelector('#pwIn').value.trim(); if (!v) return; el.remove(); joinRoom(code, v); };
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) { if (e.target === el) el.remove(); return; } if (b.dataset.x === 'ok') go(); else el.remove(); });
  el.querySelector('#pwIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  setTimeout(() => { try { el.querySelector('#pwIn').focus(); } catch (e) {} }, 60);
}
let mpTab = 'join', mpScript = null, mpCap = 4, roomPoll = null;
function showMp() {
  ['#home', '#auth', '#room'].forEach((s) => ($(s).hidden = true));
  $('#mp').hidden = false;
  $('#mpNameRow').hidden = !!(account && needAuth);
  setMpTab(mpTab);
}
function setMpTab(m) {
  mpTab = m;
  document.querySelectorAll('#mpSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#mpJoin').hidden = m !== 'join'; $('#mpCreate').hidden = m !== 'create';
  if (m === 'create') { renderMpScripts(); stopRoomPoll(); } else { renderRooms(null); pollRooms(); startRoomPoll(); }
}
function pollRooms() { if (connected()) send({ type: 'listrooms' }); }
function startRoomPoll() { stopRoomPoll(); roomPoll = setInterval(() => { if ($('#mp').hidden || mpTab !== 'join') return stopRoomPoll(); pollRooms(); }, 3000); }
function stopRoomPoll() { clearInterval(roomPoll); roomPoll = null; }
function renderRooms(list) {
  const el = $('#roomList');
  if (list === null) { setHTML(el, `<p class="empty">${connected() ? '正在查找房间…' : '正在连接服务器…'}</p>`); return; }
  setHTML(el, list.length ? list.map((r) => `<button class="room-row" data-code="${esc(r.code)}" data-lock="${r.locked ? 1 : 0}"><span class="rr-img">${ART.scene(r.cover)}</span>
    <span class="rr-tx"><b>${esc(r.title)}</b><small>房主 ${esc(r.host)}　房间码 ${esc(r.code)}</small></span><span class="rr-n"><b>${r.n}/${r.cap}</b><i>${r.locked ? '有密码' : '可直接加入'}</i></span></button>`).join('')
    : '<p class="empty">暂时没有在等人的房间。<br>去“创建房间”开一个吧！</p>');
}
function renderMpScripts() {
  const list = scriptsList;
  if (!list.length) { setHTML($('#mpScripts'), '<p class="empty">正在连接服务器获取剧本…</p>'); return; }
  if (!list.some((x) => x.id === mpScript)) mpScript = list[0].id;
  const sc = list.find((x) => x.id === mpScript);
  mpCap = Math.max(sc.minPlayers, Math.min(sc.maxPlayers, mpCap));
  const dots = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
  setHTML($('#mpScripts'), list.map((s) => `<button class="sc-card ${s.id === mpScript ? 'sel' : ''}" data-tone="${s.tone}" data-script="${s.id}"><div class="sc-img">${ART.scene(s.cover)}</div>
    <div class="sc-tx"><b>${esc(s.title)}</b><span class="sc-tag">${esc(s.tagline)}</span><span class="sc-meta"><em>难度 ${dots(s.difficulty)}</em> · ${s.minPlayers}–${s.maxPlayers} 人 · ${esc(s.duration)}</span></div>${s.id === mpScript ? '<i class="sc-check">已选</i>' : ''}</button>`).join(''));
  $('#capNum').textContent = mpCap;
  $('#capMinus').disabled = mpCap <= sc.minPlayers; $('#capPlus').disabled = mpCap >= sc.maxPlayers;
}

// ================= 页面事件 =================
if (window.DET && DET.available()) { $('#detBtn').hidden = false; $('#detBtn').addEventListener('click', () => { FX.ambient('fire'); try { SFX.amb('fire'); } catch (e) {} DET.open(); }); }
$('#qualBtn').addEventListener('click', () => { const n = { auto: 'high', high: 'low', low: 'auto' }[FX.quality()]; FX.setQuality(n); $('#qualBtn').textContent = '画质：' + FX.qname(); toast(n === 'low' ? '省电画质：减少动画，更流畅' : n === 'high' ? '高画质：全部特效' : '自动画质：卡顿时会自动降低特效'); });
$('#qualBtn').textContent = '画质：' + FX.qname();
initAccountUI();
$('#codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  tab = b.dataset.tab;
  if (S) renderTabs();
});
$('#roomCode').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(S.code); toast('房间码已复制'); } catch { toast('房间码：' + S.code); }
});
$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const i = $('#chatInput');
  const text = i.value.trim();
  if (text) send({ type: 'chat', text });
  i.value = '';
});

// ================= 返回键 / 离开房间 =================
// 通用按钮点击音（单人侦探模式自己管理音效，这里跳过）
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (!b || b.closest('#det') || b.classList.contains('sfx-toggle') || b.closest('.ov') || b.closest('.splash')) return;
  snd('click');
}, true);

function closeAllOverlays() {
  document.querySelectorAll('.ov, .splash, .leave-ov').forEach((x) => { x._stop && x._stop(); x._timers && x._timers.forEach(clearTimeout); x.remove(); });
  modal = null;
}
function doLeave() {
  send({ type: 'leave' }); clearSession();
  try { if (voice.on) voiceOff(); } catch (e) {}
  closeAllOverlays();
  S = null; lastPhase = null; roleOpened = false; introShown = false; revealShown = false; lastTabKey = null; $('#tabBody')._h = null; $('#phaseCard')._h = null; $('#players')._h = null;
  chatLog.length = 0; unread = 0; updateDot();
  showHome();
}
function askLeave() {
  if ($('#leaveOv')) return;
  const inGame = S && S.phase !== 'lobby' && S.phase !== 'reveal';
  const el = document.createElement('div');
  el.id = 'leaveOv'; el.className = 'leave-ov';
  el.innerHTML = `<div class="leave-card"><h3>离开房间？</h3><p>${inGame ? '游戏正在进行。离开后你不能再回到这一局，其他人会继续玩。' : '你会回到首页，之后可以重新创建或加入房间，也可以去玩单人侦探。'}</p>
    <div class="actions"><button class="btn" data-x="stay">留下</button><button class="btn primary" data-x="leave" style="width:auto">离开</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) { if (e.target === el) el.remove(); return; }
    el.remove(); if (b.dataset.x === 'leave') doLeave();
  });
}
// 返回上一页：返回 true 表示已处理（安卓手机的系统返回键也调用它）
function goBack() {
  const pw = $('#pwOv'); if (pw) { pw.remove(); return true; }
  const lv = $('#leaveOv'); if (lv) { lv.remove(); return true; }
  if (modal) {
    if (modal.classList.contains('searchov')) { const b = modal.querySelector('.result .btn'); if (b) b.click(); else modal.click(); return true; }
    if (modal.classList.contains('revealov')) { const sk = modal.querySelector('.skip'); if (sk) sk.click(); else { const t = modal.querySelector('#seeTruth'); if (t) t.click(); } return true; }
    closeModal(modal); return true;
  }
  if (!$('#det').hidden) return !!(window.DET && DET.back && DET.back());
  if (!$('#mp').hidden) { stopRoomPoll(); showHome(); return true; }
  if (!$('#room').hidden) { askLeave(); return true; }
  return false;
}
window.__back = () => goBack();
$('#backBtn').addEventListener('click', () => { snd('click'); goBack(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') goBack(); });


// 先把首页显示出来（单人侦探不需要服务器）；联机服务器在后台连接，连上之前提示“正在连接”
startSplash();
if (session()) setTimeout(() => { if (!S && $('#room').hidden && $('#det').hidden && splashDone) showHome(); }, 3500);
try { $('#ver').textContent = window.__BUILD ? '版本 ' + window.__BUILD : ''; } catch (e) {}
wakeServer();
connect();
