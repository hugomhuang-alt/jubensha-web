'use strict';
// 线上剧本杀服务器：HTTP 静态文件 + WebSocket 房间/阶段/语音信令
// 所有私密信息（角色、线索）只存在服务器，只发给本人。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const SCRIPTS = require('./scripts');

const CASES = (() => { try { return require('./cases'); } catch (e) { return []; } })();
const PORT = Number(process.env.PORT) || 3000;
// 测试时可以加速计时器：TIME_SCALE=100 表示快 100 倍
const TIME_SCALE = Number(process.env.TIME_SCALE) || 1;
// 语音用的 ICE 服务器；生产环境强烈建议加 TURN，见 README
const ICE_SERVERS = process.env.ICE_SERVERS
  ? JSON.parse(process.env.ICE_SERVERS)
  : [{ urls: 'stun:stun.l.google.com:19302' }];

// ---------- 账号 ----------
// 设置了 AUTH_SECRET 才启用账号体系（正式服务器）；没设置时保持“无账号”模式（本地测试 / 离线试玩版）。
const AUTH_SECRET = process.env.AUTH_SECRET || '';
const REQUIRE_AUTH = !!AUTH_SECRET;
const TEST_EMAILS = String(process.env.TEST_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const isTester = (email) => !!email && TEST_EMAILS.includes(String(email).toLowerCase());
const AUTO_START_MS = Math.max(30, 5000 / TIME_SCALE);
function signToken(u) {
  const body = Buffer.from(JSON.stringify({ e: u.email, n: u.nick, x: Date.now() + 90 * 864e5 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
}
function verifyToken(t) {
  try {
    const [body, sig] = String(t || '').split('.');
    if (!body || !sig) return null;
    const want = crypto.createHmac('sha256', AUTH_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const j = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!j.e || j.x < Date.now()) return null;
    return { email: j.e, nick: j.n };
  } catch { return null; }
}
// 内部测试剧本（internal）：只有测试账号看得到，也只有这种剧本里能加机器人
const scriptAllowed = (sc, ws) => !sc.internal || !REQUIRE_AUTH || !!(ws && ws.user && isTester(ws.user.email));
const botsAllowed = (room) => !REQUIRE_AUTH || !!scriptOf(room).internal;

const PHASE_SECONDS = {
  reading: 480, turns: 60, search1: 180, discuss1: 420,
  search2: 150, discuss2: 420, search3: 120, discuss3: 480, vote: 180
};
const isSearch = (phase) => /^search\d$/.test(phase);
const scriptOf = (room) => SCRIPTS.byId(room.scriptId) || SCRIPTS.list[0];
// 阶段顺序随剧本的搜证轮数变化（默认 3 轮；旧剧本 2 轮）
function orderOf(room) {
  const rounds = scriptOf(room).rounds || 3;
  const o = ['lobby', 'reading', 'turns'];
  for (let r = 1; r <= rounds; r++) o.push('search' + r, 'discuss' + r);
  return o.concat(['vote', 'reveal']);
}

const rooms = new Map();

// ---------- 工具 ----------
const rid = (n) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[crypto.randomInt(chars.length)];
  return s;
};
const uid = () => crypto.randomBytes(6).toString('hex');
const shuffle = (a) => {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const send = (ws, obj) => {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
};
const connectedPlayers = (room) => room.players.filter((p) => p.connected);
const byId = (room, id) => room.players.find((p) => p.id === id);

function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
}

// ---------- 房间 ----------
function createRoom(scriptId, cap) {
  let code;
  do { code = rid(4); } while (rooms.has(code));
  const sc = SCRIPTS.byId(scriptId) || SCRIPTS.list.find((s) => !s.internal) || SCRIPTS.list[0];
  const room = {
    code, players: [], hostId: null, phase: 'lobby', phaseEnd: null, timer: null,
    speakerOrder: [], speakerIdx: 0, chat: [], shared: [], voice: new Set(),
    result: null, scriptId: sc.id, cap: clampCap(sc, cap), autoTimer: null, autoAt: null, touched: Date.now()
  };
  rooms.set(code, room);
  return room;
}
// 目标人数：在剧本允许的范围内；不指定就取上限（老接口不会因为凑够人数而自动开局）
function clampCap(sc, cap) {
  const n = Math.round(Number(cap));
  return Math.max(sc.minPlayers, Math.min(sc.maxPlayers, Number.isFinite(n) && n > 0 ? n : sc.maxPlayers));
}
// 满员自动开局（只在账号模式启用）：人齐后倒计时几秒，期间有人离开/换剧本就取消
function checkAutoStart(room) {
  const full = REQUIRE_AUTH && room.phase === 'lobby' && room.players.length >= room.cap &&
    room.players.length >= scriptOf(room).minPlayers && connectedPlayers(room).length === room.players.length;
  if (!full) { if (room.autoTimer) { clearTimeout(room.autoTimer); room.autoTimer = null; } room.autoAt = null; return; }
  if (room.autoTimer) return;
  room.autoAt = Date.now() + AUTO_START_MS;
  room.autoTimer = setTimeout(() => {
    room.autoTimer = null; room.autoAt = null;
    if (room.phase !== 'lobby') return;
    checkAutoStart(room);
    if (room.autoTimer) { clearTimeout(room.autoTimer); room.autoTimer = null; room.autoAt = null; startGame(room); }
  }, AUTO_START_MS);
}

function addPlayer(room, name, ws, email) {
  const p = {
    id: uid(), token: crypto.randomBytes(16).toString('hex'), name, email: email || null,
    ws, connected: true, charId: null, ready: false, searched: false,
    clues: [], vote: null
  };
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function ensureHost(room) {
  const host = byId(room, room.hostId);
  if (host && host.connected && !host.isBot) return;
  const next = connectedPlayers(room).find((p) => !p.isBot);
  if (next) room.hostId = next.id;
}

function currentSpeakerId(room) {
  return room.phase === 'turns' ? room.speakerOrder[room.speakerIdx] || null : null;
}

// ---------- 状态快照（按玩家定制，绝不泄露他人私密信息） ----------
function publicChar(c) {
  return { id: c.id, name: c.name, title: c.title, age: c.age, blurb: c.blurb, look: c.look || null };
}

function scriptMeta(sc) {
  return {
    id: sc.id, title: sc.title, subtitle: sc.subtitle, tagline: sc.tagline || '', difficulty: sc.difficulty || 3,
    duration: sc.duration, minPlayers: sc.minPlayers, maxPlayers: sc.maxPlayers,
    cover: sc.cover || 'cover', tone: sc.tone || 'none', internal: !!sc.internal
  };
}

function snapshot(room, me) {
  const script = scriptOf(room);
  const inGame = room.phase !== 'lobby';
  const revealed = room.phase === 'reveal';
  const state = {
    type: 'state',
    now: Date.now(),
    code: room.code,
    phase: room.phase,
    phaseEnd: room.phaseEnd,
    hostId: room.hostId,
    scriptId: script.id,
    cap: room.cap, autoAt: room.autoAt || null, requireAuth: REQUIRE_AUTH, botsAllowed: botsAllowed(room),
    manualStart: !REQUIRE_AUTH || !!script.internal,
    scripts: SCRIPTS.list.filter((sc) => scriptAllowed(sc, me && me.ws)).map(scriptMeta),
    speakerId: currentSpeakerId(room),
    speakerOrder: room.speakerOrder,
    script: {
      ...scriptMeta(script),
      intro: script.intro, publicFacts: script.publicFacts, victim: script.victim, timeline: script.timeline || [],
      introScenes: script.introScenes || [], phaseScenes: script.phaseScenes || {}, rounds: script.rounds || 3,
      locations: script.locations.map((l) => ({ id: l.id, name: l.name, desc: l.desc, scene: l.scene || l.id }))
    },
    players: room.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, ready: p.ready, bot: !!p.isBot,
      searched: p.searched, voted: p.vote !== null,
      voice: room.voice.has(p.id),
      char: inGame && p.charId ? publicChar(script.characters[p.charId]) : null
    })),
    shared: room.shared,
    you: null,
    reveal: null
  };

  if (me) {
    const you = { id: me.id, name: me.name, clues: me.clues, vote: me.vote, char: null };
    if (inGame && me.charId) {
      const c = script.characters[me.charId];
      you.char = {
        ...publicChar(c), story: c.story, timeline: c.timeline,
        secret: c.secret, goal: c.goal, isCulprit: !!c.isCulprit
      };
    }
    state.you = you;
  }

  if (revealed && room.result) {
    state.reveal = {
      truth: script.truth,
      result: room.result,
      cast: room.players.map((p) => {
        const c = script.characters[p.charId];
        return {
          playerId: p.id, playerName: p.name, charId: c.id, look: c.look || null, charName: c.name, title: c.title,
          isCulprit: !!c.isCulprit, reveal: c.reveal
        };
      })
    };
  }
  return state;
}

function broadcastState(room) {
  room.touched = Date.now();
  checkAutoStart(room);
  for (const p of room.players) if (p.connected) send(p.ws, snapshot(room, p));
}

function broadcast(room, obj, exceptId) {
  for (const p of room.players) {
    if (p.connected && p.id !== exceptId) send(p.ws, obj);
  }
}

// ---------- 阶段控制 ----------
function setTimer(room, seconds) {
  clearTimeout(room.timer);
  const ms = (seconds * 1000) / TIME_SCALE;
  room.phaseEnd = Date.now() + ms;
  room.timer = setTimeout(() => advance(room), ms);
}

function enterPhase(room, phase) {
  clearTimeout(room.timer);
  room.timer = null;
  room.phase = phase;
  room.phaseEnd = null;

  if (phase === 'reading') room.players.forEach((p) => (p.ready = false));
  if (isSearch(phase)) room.players.forEach((p) => (p.searched = false));
  if (phase === 'vote') room.players.forEach((p) => (p.vote = null));
  if (phase === 'turns') {
    room.speakerOrder = shuffle(room.players.map((p) => p.id));
    room.speakerIdx = 0;
  }
  if (phase === 'reveal') room.result = computeResult(room);

  if (PHASE_SECONDS[phase]) setTimer(room, PHASE_SECONDS[phase]);
  broadcastState(room);
  botTick(room);
}

function advance(room) {
  if (room.phase === 'turns') {
    room.speakerIdx += 1;
    if (room.speakerIdx < room.speakerOrder.length) {
      setTimer(room, PHASE_SECONDS.turns);
      broadcastState(room);
      botTick(room);
      return;
    }
  }
  const ORDER = orderOf(room);
  const next = ORDER[ORDER.indexOf(room.phase) + 1];
  if (next) enterPhase(room, next);
}

function computeResult(room) {
  const script = scriptOf(room);
  const culprit = room.players.find((p) => script.characters[p.charId].isCulprit);
  const counts = {};
  room.players.forEach((p) => (counts[p.id] = 0));
  const votes = [];
  room.players.forEach((p) => {
    if (p.vote && counts[p.vote] !== undefined) {
      counts[p.vote] += 1;
      votes.push({ from: p.id, to: p.vote });
    }
  });
  const top = Math.max(...Object.values(counts));
  const topIds = Object.keys(counts).filter((id) => counts[id] === top);
  // 凶手必须是得票最多且唯一，才算被抓获
  const caught = top > 0 && topIds.length === 1 && topIds[0] === culprit.id;
  return { culpritId: culprit.id, counts, votes, caught };
}


// ---------- 机器人（单人测试用）----------
// 机器人只做最基本的动作：读完、说完、随机搜证、随机投票，用来让一个人也能把流程走完。
const BOT_NAMES = ['机器人甲', '机器人乙', '机器人丙', '机器人丁', '机器人戊', '机器人己', '机器人庚'];
const botDelay = (min, max) => Math.max(5, (min + Math.random() * (max - min)) / TIME_SCALE);

function botTick(room) {
  const script = scriptOf(room);
  const phase = room.phase;
  const bots = room.players.filter((p) => p.isBot);
  if (!bots.length) return;
  const stillHere = () => room.phase === phase;

  if (phase === 'reading') {
    bots.forEach((b) => setTimeout(() => {
      if (!stillHere()) return;
      b.ready = true; broadcastState(room); checkEarlyAdvance(room);
    }, botDelay(1000, 3000)));
  } else if (phase === 'turns') {
    const speakerId = currentSpeakerId(room);
    const idx = room.speakerIdx;
    if (bots.some((b) => b.id === speakerId)) {
      setTimeout(() => {
        if (stillHere() && room.speakerIdx === idx) advance(room);
      }, botDelay(2500, 4500));
    }
  } else if (isSearch(phase)) {
    bots.forEach((b) => setTimeout(() => {
      if (!stillHere() || b.searched) return;
      const loc = script.locations[crypto.randomInt(script.locations.length)];
      const have = new Set(b.clues.map((c) => c.id));
      const clue = loc.clues.find((c) => !have.has(c.id));
      if (clue) b.clues.push({ ...clue, loc: loc.name });
      b.searched = true;
      broadcastState(room); checkEarlyAdvance(room);
    }, botDelay(1500, 6000)));
  } else if (phase === 'vote') {
    bots.forEach((b) => setTimeout(() => {
      if (!stillHere() || b.vote) return;
      const others = room.players.filter((p) => p.id !== b.id);
      b.vote = others[crypto.randomInt(others.length)].id;
      broadcastState(room); checkEarlyAdvance(room);
    }, botDelay(2000, 8000)));
  }
}

function checkEarlyAdvance(room) {
  const alive = connectedPlayers(room);
  if (!alive.length) return;
  if (room.phase === 'reading' && alive.every((p) => p.ready)) advance(room);
  else if (isSearch(room.phase) && alive.every((p) => p.searched)) advance(room);
  else if (room.phase === 'vote' && alive.every((p) => p.vote)) advance(room);
}

function startGame(room) {
  const script = scriptOf(room);
  const n = room.players.length;
  const chars = shuffle(script.coreOrder.slice(0, n));
  room.players.forEach((p, i) => {
    p.charId = chars[i];
    p.clues = [];
    p.vote = null;
    p.ready = false;
    p.searched = false;
  });
  room.shared = [];
  room.result = null;
  enterPhase(room, 'reading');
}

function resetToLobby(room) {
  clearTimeout(room.timer);
  room.phase = 'lobby';
  room.phaseEnd = null;
  room.result = null;
  room.shared = [];
  room.speakerOrder = [];
  room.players.forEach((p) => {
    p.charId = null; p.clues = []; p.vote = null; p.ready = false; p.searched = false;
  });
  // 清理掉线玩家
  room.players = room.players.filter((p) => p.connected);
  ensureHost(room);
  broadcastState(room);
}

// ---------- 消息处理 ----------
function onMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg.type !== 'string') return;

  const ctx = ws.ctx; // { room, player }
  const err = (m) => send(ws, { type: 'error', message: m });

  // 加入前的消息
  if (msg.type === 'auth') {
    const u = verifyToken(msg.token);
    if (!u) return send(ws, { type: 'auth-failed' });
    ws.user = u;
    send(ws, { type: 'auth-ok', nick: u.nick, tester: isTester(u.email) });
    send(ws, { type: 'scripts', scripts: SCRIPTS.list.filter((sc) => scriptAllowed(sc, ws)).map(scriptMeta) });
    return;
  }
  if (msg.type === 'listrooms') {
    if (REQUIRE_AUTH && !ws.user) return;
    const list = [];
    for (const r of rooms.values()) {
      if (r.phase !== 'lobby' || r.players.length >= r.cap) continue;
      const sc = scriptOf(r);
      if (!scriptAllowed(sc, ws)) continue;
      const host = r.players.find((x) => x.id === r.hostId);
      list.push({ code: r.code, title: sc.title, cover: sc.cover || 'cover', host: host ? host.name : '', n: r.players.length, cap: r.cap });
    }
    send(ws, { type: 'rooms', rooms: list.slice(0, 50) });
    return;
  }
  if (msg.type === 'create') {
    if (REQUIRE_AUTH && !ws.user) return send(ws, { type: 'auth-failed' });
    const name = REQUIRE_AUTH ? cleanName(ws.user.nick) : cleanName(msg.name);
    if (!name) return err('请输入昵称');
    const want = SCRIPTS.byId(String(msg.script || ''));
    if (want && !scriptAllowed(want, ws)) return err('没有这个剧本');
    const room = createRoom(want && want.id, msg.cap);
    const p = addPlayer(room, name, ws, ws.user && ws.user.email);
    ws.ctx = { room, player: p };
    send(ws, { type: 'joined', code: room.code, token: p.token, id: p.id });
    broadcastState(room);
    return;
  }
  if (msg.type === 'join') {
    if (REQUIRE_AUTH && !ws.user) return send(ws, { type: 'auth-failed' });
    const name = REQUIRE_AUTH ? cleanName(ws.user.nick) : cleanName(msg.name);
    const room = rooms.get(String(msg.code || '').toUpperCase());
    if (!name) return err('请输入昵称');
    if (!room) return err('没有这个房间');
    if (room.phase !== 'lobby') return err('游戏已经开始，不能加入');
    if (!scriptAllowed(scriptOf(room), ws)) return err('没有这个房间');
    if (room.players.length >= Math.min(room.cap, scriptOf(room).maxPlayers)) return err('房间已满');
    if (room.players.some((p) => p.name === name)) return err('这个昵称已被占用');
    const p = addPlayer(room, name, ws, ws.user && ws.user.email);
    ws.ctx = { room, player: p };
    send(ws, { type: 'joined', code: room.code, token: p.token, id: p.id });
    broadcast(room, { type: 'sys', text: `${name} 加入了房间` });
    broadcastState(room);
    send(ws, { type: 'chatlog', log: room.chat });
    return;
  }
  if (msg.type === 'rejoin') {
    const room = rooms.get(String(msg.code || '').toUpperCase());
    const p = room && room.players.find((x) => x.token === msg.token);
    if (!p) return send(ws, { type: 'rejoin-failed' });
    if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch {} }
    p.ws = ws; p.connected = true;
    ws.ctx = { room, player: p };
    send(ws, { type: 'joined', code: room.code, token: p.token, id: p.id });
    ensureHost(room);
    broadcastState(room);
    send(ws, { type: 'chatlog', log: room.chat });
    return;
  }

  if (!ctx) return;
  const { room, player: me } = ctx;
  room.touched = Date.now();

  switch (msg.type) {
    case 'start': {
      if (me.id !== room.hostId) return err('只有房主可以开始');
      if (room.phase !== 'lobby') return;
      if (REQUIRE_AUTH && !scriptOf(room).internal) return err('人满后会自动开始');
      const alive = connectedPlayers(room).length;
      if (room.players.length < scriptOf(room).minPlayers) return err(`至少需要 ${scriptOf(room).minPlayers} 人`);
      if (alive < room.players.length) return err('有人处于离线状态，请等他回来');
      startGame(room);
      break;
    }
    case 'setscript': {
      if (me.id !== room.hostId || room.phase !== 'lobby') return;
      const sc = SCRIPTS.byId(String(msg.id || ''));
      if (!sc) return err('没有这个剧本');
      if (!scriptAllowed(sc, ws)) return err('没有这个剧本');
      if (room.players.length > sc.maxPlayers) return err(`《${sc.title}》最多 ${sc.maxPlayers} 人，请先移除多余的玩家`);
      room.scriptId = sc.id;
      room.cap = clampCap(sc, Math.max(room.cap, room.players.length));
      broadcastState(room);
      break;
    }
    case 'setcap': {
      if (me.id !== room.hostId || room.phase !== 'lobby') return;
      const sc = scriptOf(room);
      room.cap = Math.max(clampCap(sc, msg.cap), Math.min(room.players.length, sc.maxPlayers));
      broadcastState(room);
      break;
    }
    case 'addbot': {
      if (me.id !== room.hostId || room.phase !== 'lobby') return;
      if (!botsAllowed(room)) return err('真人房间不能加机器人');
      if (room.players.length >= scriptOf(room).maxPlayers) return err('房间已满');
      const used = new Set(room.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n));
      room.players.push({
        id: uid(), token: crypto.randomBytes(16).toString('hex'), name, ws: null,
        connected: true, isBot: true, charId: null, ready: false, searched: false, clues: [], vote: null
      });
      broadcastState(room);
      break;
    }
    case 'removebot': {
      if (me.id !== room.hostId || room.phase !== 'lobby') return;
      const i = room.players.map((p) => !!p.isBot).lastIndexOf(true);
      if (i >= 0) room.players.splice(i, 1);
      broadcastState(room);
      break;
    }
    case 'ready': {
      if (room.phase !== 'reading') return;
      me.ready = true;
      broadcastState(room);
      checkEarlyAdvance(room);
      break;
    }
    case 'next': {
      if (me.id !== room.hostId) return err('只有房主可以跳过阶段');
      if (room.phase === 'lobby' || room.phase === 'reveal') return;
      advance(room);
      break;
    }
    case 'speakdone': {
      if (room.phase === 'turns' && currentSpeakerId(room) === me.id) advance(room);
      break;
    }
    case 'search': {
      if (!isSearch(room.phase)) return;
      if (me.searched) return err('这一轮你已经搜过证了');
      const script = scriptOf(room);
      const loc = script.locations.find((l) => l.id === msg.loc);
      if (!loc) return err('没有这个地点');
      const have = new Set(me.clues.map((c) => c.id));
      const clue = loc.clues.find((c) => !have.has(c.id));
      me.searched = true;
      if (clue) me.clues.push({ ...clue, loc: loc.name });
      send(ws, { type: 'searchResult', loc: loc.name, clue: clue ? { ...clue, loc: loc.name } : null });
      broadcastState(room);
      checkEarlyAdvance(room);
      break;
    }
    case 'share': {
      const clue = me.clues.find((c) => c.id === msg.clueId);
      if (!clue) return;
      if (room.shared.some((s) => s.id === clue.id)) return;
      room.shared.push({ ...clue, by: me.name });
      broadcastState(room);
      break;
    }
    case 'vote': {
      if (room.phase !== 'vote') return;
      const target = byId(room, msg.target);
      if (!target || target.id === me.id) return err('不能投给自己');
      me.vote = target.id;
      broadcastState(room);
      checkEarlyAdvance(room);
      break;
    }
    case 'chat': {
      const text = String(msg.text || '').trim().slice(0, 300);
      if (!text) return;
      const m = { name: me.name, text, t: Date.now() };
      room.chat.push(m);
      if (room.chat.length > 200) room.chat.shift();
      broadcast(room, { type: 'chat', msg: m });
      break;
    }
    case 'restart': {
      if (me.id !== room.hostId || room.phase !== 'reveal') return;
      resetToLobby(room);
      break;
    }
    case 'leave': {
      // 主动离开房间：大厅里直接退出；游戏中视同掉线（不再回来），不会卡住其他人
      ws.ctx = null;
      if (room.voice.delete(me.id)) broadcast(room, { type: 'voice-left', id: me.id }, me.id);
      if (room.phase === 'lobby') {
        const i = room.players.indexOf(me); if (i >= 0) room.players.splice(i, 1);
        if (!room.players.some((x) => !x.isBot)) { clearTimeout(room.timer); rooms.delete(room.code); send(ws, { type: 'left' }); return; }
        broadcast(room, { type: 'sys', text: `${me.name} 离开了房间` });
      } else {
        me.connected = false; me.ws = null;
        broadcast(room, { type: 'sys', text: `${me.name} 离开了游戏` });
      }
      ensureHost(room); broadcastState(room);
      if (room.phase !== 'lobby' && room.phase !== 'reveal') checkEarlyAdvance(room);
      send(ws, { type: 'left' });
      break;
    }
    // ----- 语音信令 -----
    case 'voice-join': {
      const existing = [...room.voice].filter((id) => id !== me.id);
      room.voice.add(me.id);
      send(ws, { type: 'voice-peers', peers: existing });
      broadcastState(room);
      break;
    }
    case 'voice-leave': {
      room.voice.delete(me.id);
      broadcast(room, { type: 'voice-left', id: me.id }, me.id);
      broadcastState(room);
      break;
    }
    case 'signal': {
      const to = byId(room, msg.to);
      if (to && to.connected && room.voice.has(me.id)) {
        send(to.ws, { type: 'signal', from: me.id, data: msg.data });
      }
      break;
    }
    default:
      break;
  }
}

function onClose(ws) {
  const ctx = ws.ctx;
  if (!ctx) return;
  const { room, player } = ctx;
  if (player.ws !== ws) return; // 已被新连接取代
  player.connected = false;
  if (room.voice.delete(player.id)) {
    broadcast(room, { type: 'voice-left', id: player.id }, player.id);
  }
  ensureHost(room);
  broadcastState(room);
  // 如果在等其他人，别因为掉线卡住
  if (room.phase !== 'lobby' && room.phase !== 'reveal') checkEarlyAdvance(room);
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.ico': 'image/x-icon'
};
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 用户存储：Upstash Redis（持久）或本地文件（临时） ----------
const UP_URL = process.env.UPSTASH_REDIS_REST_URL, UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USER_FILE = path.join(process.env.DATA_DIR || __dirname, '.users.json');
let fileUsers = null;
function loadFileUsers() { if (!fileUsers) { try { fileUsers = JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch { fileUsers = {}; } } return fileUsers; }
async function upstash(cmd) {
  const r = await fetch(UP_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + UP_TOKEN }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function getUser(email) {
  if (UP_URL) { const v = await upstash(['GET', 'user:' + email]); return v ? JSON.parse(v) : null; }
  return loadFileUsers()[email] || null;
}
async function putUser(u, onlyNew) {
  if (UP_URL) { const r = await upstash(onlyNew ? ['SET', 'user:' + u.email, JSON.stringify(u), 'NX'] : ['SET', 'user:' + u.email, JSON.stringify(u)]); return r === 'OK'; }
  const all = loadFileUsers();
  if (onlyNew && all[u.email]) return false;
  all[u.email] = u;
  try { fs.writeFileSync(USER_FILE, JSON.stringify(all)); } catch {}
  return true;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;
const loginFails = new Map(); // 简单限流：每个邮箱 10 分钟内最多 8 次失败
function readJson(req) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', (d) => { b += d; if (b.length > 4096) { reject(new Error('big')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  });
}
async function handleApi(req, res, url) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const out = (code, obj) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (!AUTH_SECRET) return out(404, { error: '服务器未开启账号功能' });
  try {
    if (url.pathname === '/api/me') {
      const u = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
      return u ? out(200, { email: u.email, nick: u.nick, tester: isTester(u.email) }) : out(401, { error: '登录已过期' });
    }
    if (req.method !== 'POST') return out(405, { error: 'method' });
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    const pw = String(b.password || '');
    if (!EMAIL_RE.test(email)) return out(400, { error: '邮箱格式不对' });
    if (url.pathname === '/api/register') {
      if (pw.length < 6 || pw.length > 100) return out(400, { error: '密码至少 6 位' });
      const nick = cleanName(b.nick) || email.split('@')[0].slice(0, 12);
      const salt = crypto.randomBytes(16).toString('hex');
      const u = { email, nick, salt, hash: hashPw(pw, salt), created: Date.now() };
      if (!(await putUser(u, true))) return out(409, { error: '这个邮箱已经注册过了，请直接登录' });
      return out(200, { token: signToken(u), nick, email, tester: isTester(email) });
    }
    if (url.pathname === '/api/login') {
      const f = loginFails.get(email);
      if (f && f.n >= 8 && Date.now() - f.t < 600000) return out(429, { error: '尝试次数太多，请稍后再试' });
      const u = await getUser(email);
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt)), Buffer.from(u.hash));
      if (!ok) { loginFails.set(email, { n: (f && Date.now() - f.t < 600000 ? f.n : 0) + 1, t: Date.now() }); return out(401, { error: '邮箱或密码不对' }); }
      loginFails.delete(email);
      return out(200, { token: signToken(u), nick: u.nick, email, tester: isTester(email) });
    }
    return out(404, { error: 'not found' });
  } catch (e) { return out(400, { error: '请求出错' }); }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  if (url.pathname === '/cases.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end('window.__CASES = ' + JSON.stringify(CASES) + ';');
  }
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  send(ws, {
    type: 'hello', ice: ICE_SERVERS,
    auth: REQUIRE_AUTH,
    meta: { title: '线上剧本杀', subtitle: '选一个剧本，和朋友一起破案', scripts: SCRIPTS.list.filter((sc) => !sc.internal || !REQUIRE_AUTH).map(scriptMeta) }
  });
  ws.on('message', (raw) => {
    try { onMessage(ws, raw.toString()); } catch (e) { console.error('handler error', e); }
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});

// 心跳 + 清理长期闲置的房间
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > 6 * 3600 * 1000) { clearTimeout(room.timer); rooms.delete(code); }
  }
}, 30000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`剧本杀服务器已启动： http://localhost:${PORT}`));
}
module.exports = { server, rooms };
