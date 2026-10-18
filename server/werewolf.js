'use strict';
// 狼人杀（6–12 人，可补机器人）。规则采用主流“屠边”板子：
//   狼人 / 狼王（出局可带走一人）；预言家（每晚验一人）；女巫（一瓶解药一瓶毒药，不能自救，同夜只能用一瓶）；
//   猎人（被刀或被放逐时可开枪，被毒不能开枪）；守卫（每晚守一人，不能连守同一人，同守同救则目标仍死）；村民。
//   好人胜：狼人全部出局。狼人胜：好人里的“神职全灭”或“村民全灭”（屠边）。
// 流程：夜晚（守卫→狼人→女巫→预言家）→ 天亮（公布死亡，猎人/狼王开枪，首夜死者留遗言）→ 按座位顺序发言 → 投票放逐
//       （平票 → 平票者再发言 → 再投；仍平票则无人出局）→ 被放逐者遗言（猎人/狼王开枪）→ 下一夜。
// 玩家掉线或离开后，由机器人代打，不会卡住全桌。
// 所有身份信息只存在服务器，只发给本人（狼人互相可见队友）。

module.exports = function createWW(h) {
  const { send, rid, uid, shuffle, cleanName, TIME_SCALE, REQUIRE_AUTH, crypto, codeTaken } = h;
  const rooms = new Map();

  const ROLE = {
    wolf: { name: '狼人', team: 'wolf', desc: '每晚和同伴一起选一名玩家杀死。白天隐藏身份，把怀疑引到好人身上。' },
    wolfking: { name: '狼王', team: 'wolf', desc: '狼人阵营。被投票放逐或被刀出局时，可以立刻开枪带走一名玩家（被毒死不能开枪）。' },
    villager: { name: '村民', team: 'good', desc: '没有技能。靠发言和投票找出狼人。' },
    seer: { name: '预言家', team: 'good', god: true, desc: '每晚可以查验一名玩家是“好人”还是“狼人”。要想好什么时候跳身份。' },
    witch: { name: '女巫', team: 'good', god: true, desc: '一瓶解药、一瓶毒药。解药可救当晚被刀的人（不能自救），毒药可毒死任何人；同一晚只能用一瓶。' },
    hunter: { name: '猎人', team: 'good', god: true, desc: '被狼人杀死或被放逐时，可以开枪带走一名玩家；被女巫毒死则不能开枪。' },
    guard: { name: '守卫', team: 'good', god: true, desc: '每晚守护一名玩家（可以守自己），被守护的人不会被狼刀杀死；不能连续两晚守同一人。同守同救会让目标死亡。' }
  };
  const isWolf = (p) => ROLE[p.role].team === 'wolf';

  // 人数 → 身份配置
  function deckFor(n) {
    const d = ['seer', 'witch'];
    if (n >= 7) d.push('hunter');
    if (n >= 10) d.push('guard');
    const wolves = n >= 11 ? 4 : n >= 8 ? 3 : 2;
    for (let i = 0; i < wolves; i++) d.push(n >= 11 && i === 0 ? 'wolfking' : 'wolf');
    while (d.length < n) d.push('villager');
    return d;
  }
  const deckInfo = (n) => { const c = {}; deckFor(n).forEach((r) => (c[r] = (c[r] || 0) + 1)); return Object.keys(c).map((r) => ({ role: r, name: ROLE[r].name, n: c[r] })); };

  const SEC = { night: 28, wolf: 45, fake: [3, 6], dawn: 6, shot: 22, last: 45, speech: 60, vote: 40 };
  const now = () => Date.now();
  const botMs = (a, b) => Math.max(5, (a + Math.random() * (b - a)) * 1000 / TIME_SCALE);
  const alive = (room) => room.players.filter((p) => p.alive);
  const byId = (room, id) => room.players.find((p) => p.id === id);
  const human = (p) => !p.bot;
  const pub = (room) => room.log.slice(-60);

  function createRoom(cap, password) {
    let code; do { code = rid(4); } while (codeTaken(code) || rooms.has(code));
    const room = {
      game: 'ww', code, players: [], hostId: null, phase: 'lobby', phaseEnd: null, timer: null, cap: Math.max(6, Math.min(12, cap || 9)),
      password: String(password || '').trim().slice(0, 12), chat: [], log: [], day: 0, tasks: [], touched: now(), over: null,
      night: null, step: null, steps: [], speech: null, voteInfo: null, lastVotes: null
    };
    rooms.set(code, room);
    return room;
  }
  function addPlayer(room, name, ws, bot) {
    const p = {
      id: uid(), token: crypto.randomBytes(16).toString('hex'), name, ws, connected: !bot, bot: !!bot, left: false,
      alive: true, role: null, seat: 0, ready: true, vote: undefined, pick: undefined, acted: false,
      seerResults: [], witchSave: false, witchPoison: false, guardLast: null, known: {}
    };
    room.players.push(p);
    if (!room.hostId && !bot) room.hostId = p.id;
    return p;
  }
  function ensureHost(room) {
    const cur = byId(room, room.hostId);
    if (cur && cur.connected && !cur.left) return;
    const n = room.players.find((p) => !p.bot && p.connected && !p.left);
    room.hostId = n ? n.id : (room.players.find((p) => !p.bot && !p.left) || {}).id || null;
  }
  function say(room, text, extra) { room.log.push({ t: now(), day: room.day, text, ...(extra || {}) }); }
  function postChat(room, p, text, ch) { room.chat.push({ t: now(), id: p.id, name: p.name, text, ch: ch || 'all' }); if (room.chat.length > 200) room.chat.shift(); }

  // ---------- 视图 ----------
  function actorsOf(room) {
    // 当前需要行动的玩家 id 列表（用于提示和机器人）
    if (room.phase === 'night') {
      const role = { guard: ['guard'], wolf: ['wolf', 'wolfking'], witch: ['witch'], seer: ['seer'] }[room.step] || [];
      return alive(room).filter((p) => role.includes(p.role));
    }
    if (room.phase === 'shot') return [byId(room, room.shot.pid)].filter(Boolean);
    if (room.phase === 'last') return [byId(room, room.lastPid)].filter(Boolean);
    if (room.phase === 'speech') return [byId(room, room.speech.order[room.speech.idx])].filter(Boolean);
    if (room.phase === 'vote') return alive(room).filter((p) => p.vote === undefined);
    return [];
  }
  function snapshot(room, me) {
    const over = room.phase === 'over';
    const wolfView = me && me.role && isWolf(me);
    const st = {
      type: 'ww-state', now: now(), code: room.code, phase: room.phase, phaseEnd: room.phaseEnd, hostId: room.hostId, cap: room.cap,
      locked: !!room.password, password: room.password && me && me.id === room.hostId ? room.password : '', day: room.day,
      deck: deckInfo(Math.max(6, Math.min(12, room.phase === 'lobby' ? room.cap : room.players.length))),
      players: room.players.map((p) => ({
        id: p.id, name: p.name, seat: p.seat, alive: p.alive, connected: p.connected || p.bot, bot: p.bot, left: p.left,
        voted: room.phase === 'vote' ? p.vote !== undefined : false,
        role: over || (me && p.id === me.id) ? p.role : (wolfView && isWolf(p) ? p.role : null)
      })),
      log: pub(room), chat: room.chat.filter((c) => c.ch === 'all' || over || (c.ch === 'wolf' && wolfView) || (c.ch === 'dead' && me && !me.alive)).slice(-120),
      lastVotes: room.lastVotes, step: null, prompt: null, you: null, over: over ? room.over : null
    };
    if (!me) return st;
    st.you = {
      id: me.id, alive: me.alive, role: me.role, roleName: me.role ? ROLE[me.role].name : null, team: me.role ? ROLE[me.role].team : null,
      desc: me.role ? ROLE[me.role].desc : '', wolves: wolfView ? room.players.filter(isWolf).map((p) => p.id) : [],
      seerResults: me.role === 'seer' ? me.seerResults : [], witch: me.role === 'witch' ? { save: !me.witchSave, poison: !me.witchPoison } : null,
      guardLast: me.role === 'guard' ? me.guardLast : null
    };
    // 当前提示
    const act = actorsOf(room).some((p) => p.id === me.id) && me.alive || ((room.phase === 'shot' || room.phase === 'last') && actorsOf(room).some((p) => p.id === me.id));
    const P = { who: null };
    if (room.phase === 'night') {
      st.step = null;
      if (act) {
        if (room.step === 'wolf') { P.kind = 'wolf'; P.picks = room.players.filter((p) => isWolf(p) && p.alive && p.pick !== undefined).map((p) => ({ id: p.id, target: p.pick })); P.mine = me.pick; }
        else if (room.step === 'witch') {
          P.kind = 'witch'; P.victim = !me.witchSave && room.night.wolfTarget && room.night.wolfTarget !== me.id ? room.night.wolfTarget : null;
          P.victimIsMe = room.night.wolfTarget === me.id; P.canSave = !me.witchSave; P.canPoison = !me.witchPoison; P.acted = me.acted;
        } else if (room.step === 'guard') { P.kind = 'guard'; P.last = me.guardLast; P.acted = me.acted; }
        else if (room.step === 'seer') { P.kind = 'seer'; P.acted = me.acted; P.results = me.seerResults; }
      }
    } else if (room.phase === 'shot' && act) { P.kind = 'shot'; P.skill = me.role === 'wolfking' ? '狼王爪' : '猎人枪'; }
    else if (room.phase === 'last' && act) { P.kind = 'last'; }
    else if (room.phase === 'speech') { P.kind = act ? 'speech' : 'listen'; P.speaker = room.speech.order[room.speech.idx]; P.order = room.speech.order; P.pk = !!room.speech.pk; }
    else if (room.phase === 'vote') { P.kind = me.alive ? 'vote' : 'watch'; P.cand = room.voteInfo.cand; P.mine = me.vote; P.pk = !!room.voteInfo.pk; }
    if (P.kind) st.prompt = P;
    return st;
  }
  function pushState(room) {
    room.touched = now();
    for (const p of room.players) if (p.connected && !p.bot) send(p.ws, snapshot(room, p));
  }

  // ---------- 计时 ----------
  function setTimer(room, sec, fn) {
    clearTimeout(room.timer);
    const ms = sec * 1000 / TIME_SCALE;
    room.phaseEnd = now() + ms;
    room.timer = setTimeout(() => { room.timer = null; fn(); }, ms);
  }
  function stopTimer(room) { clearTimeout(room.timer); room.timer = null; room.phaseEnd = null; }

  // ---------- 开局 / 夜晚 ----------
  function startGame(room) {
    const n = room.players.length;
    const deck = shuffle(deckFor(n));
    // 座位随机
    const order = shuffle(room.players.map((p) => p.id));
    room.players.forEach((p) => {
      p.role = deck.pop(); p.alive = true; p.seat = order.indexOf(p.id) + 1; p.vote = undefined; p.pick = undefined; p.acted = false;
      p.seerResults = []; p.witchSave = false; p.witchPoison = false; p.guardLast = null;
    });
    room.players.sort((a, b) => a.seat - b.seat);
    room.day = 0; room.log = []; room.chat = []; room.over = null; room.lastVotes = null; room.tasks = [];
    say(room, `游戏开始：${n} 人局（${deckInfo(n).map((d) => d.name + d.n).join('、')}）。天黑请闭眼。`);
    startNight(room);
  }
  function startNight(room) {
    room.day += 1;
    room.night = { guardTarget: null, wolfTarget: null, save: false, poison: null };
    room.steps = ['guard', 'wolf', 'witch', 'seer'];
    room.players.forEach((p) => { p.pick = undefined; p.acted = false; });
    room.lastVotes = null;
    room.phase = 'night';
    say(room, `第 ${room.day} 夜，天黑请闭眼。`, { sys: true });
    nextStep(room);
  }
  function nextStep(room) {
    if (!room.steps.length) return resolveNight(room);
    room.step = room.steps.shift();
    room.players.forEach((p) => { p.acted = false; });
    const acts = actorsOf(room);
    if (!acts.length) {
      // 该身份已死亡或本局没有：假装等一会儿，不让别人从时间上猜出来
      setTimer(room, SEC.fake[0] + Math.random() * (SEC.fake[1] - SEC.fake[0]), () => nextStep(room));
    } else {
      setTimer(room, room.step === 'wolf' ? SEC.wolf : SEC.night, () => endStep(room));
    }
    pushState(room); botTick(room);
  }
  function endStep(room) {
    if (room.phase !== 'night') return;
    const s = room.step;
    if (s === 'wolf') {
      const picks = actorsOf(room).map((p) => p.pick).filter((x) => x !== undefined && x !== 'none');
      if (picks.length) {
        const cnt = {}; picks.forEach((t) => (cnt[t] = (cnt[t] || 0) + 1));
        const mx = Math.max(...Object.values(cnt)); const top = Object.keys(cnt).filter((k) => cnt[k] === mx);
        room.night.wolfTarget = top[crypto.randomInt(top.length)];
      }
    }
    nextStep(room);
  }
  function stepDoneEarly(room) {
    // 全部行动者已行动：稍等一下再进入下一步
    const acts = actorsOf(room);
    const done = room.step === 'wolf'
      ? acts.length && acts.every((p) => p.pick !== undefined) && new Set(acts.map((p) => p.pick)).size === 1
      : acts.length && acts.every((p) => p.acted);
    if (done) setTimer(room, 1.2, () => endStep(room));
  }

  function die(room, p, cause) {
    p.alive = false; p.deathCause = cause; p.deathDay = room.day;
  }
  function resolveNight(room) {
    const N = room.night; const dead = [];
    const T = N.wolfTarget;
    if (T) {
      const guarded = N.guardTarget === T, saved = N.save;
      if ((guarded && saved) || (!guarded && !saved)) dead.push({ id: T, cause: 'wolf' });
    }
    if (N.poison) {
      const ex = dead.find((d) => d.id === N.poison);
      if (ex) ex.cause = 'poison'; else dead.push({ id: N.poison, cause: 'poison' });
    }
    const names = [];
    dead.forEach((d) => { const p = byId(room, d.id); if (p && p.alive) { die(room, p, d.cause); names.push(p.name); } });
    room.step = null; room.phase = 'dawn';
    say(room, names.length ? `天亮了。昨夜 ${names.join('、')} 死亡。` : '天亮了。昨夜是平安夜。', { sys: true });
    room.tasks = [];
    dead.forEach((d) => {
      const p = byId(room, d.id);
      if (p && !p.alive && (p.role === 'hunter' || p.role === 'wolfking') && d.cause !== 'poison') room.tasks.push({ t: 'shot', pid: p.id });
    });
    if (room.day === 1) dead.forEach((d) => room.tasks.push({ t: 'last', pid: d.id }));
    room.tasks.push({ t: 'speech' }, { t: 'vote' });
    if (checkWin(room)) return;
    setTimer(room, SEC.dawn, () => runTasks(room));
    pushState(room);
  }

  function checkWin(room) {
    const al = alive(room);
    const wolves = al.filter(isWolf).length;
    const gods = al.filter((p) => ROLE[p.role].god).length, vil = al.filter((p) => p.role === 'villager').length;
    let winner = null;
    if (wolves === 0) winner = 'good';
    else if (gods === 0 || vil === 0) winner = 'wolf';
    if (!winner) return false;
    stopTimer(room);
    room.phase = 'over'; room.tasks = [];
    room.over = { winner, why: winner === 'good' ? '狼人全部出局' : (gods === 0 ? '神职全部出局（屠边）' : '村民全部出局（屠边）'), roles: room.players.map((p) => ({ id: p.id, role: p.role, alive: p.alive })) };
    say(room, winner === 'good' ? '好人阵营获胜！' : '狼人阵营获胜！', { sys: true });
    pushState(room);
    return true;
  }

  // ---------- 白天任务队列 ----------
  function runTasks(room) {
    if (room.phase === 'over') return;
    const t = room.tasks.shift();
    if (!t) return startNight(room);
    if (t.t === 'shot') {
      const p = byId(room, t.pid);
      room.phase = 'shot'; room.shot = { pid: t.pid };
      say(room, `${p.name} 出局，可以发动技能。`, { sys: true });
      setTimer(room, SEC.shot, () => { say(room, `${p.name} 放弃了开枪。`, { sys: true }); runTasks(room); });
    } else if (t.t === 'last') {
      const p = byId(room, t.pid);
      room.phase = 'last'; room.lastPid = t.pid;
      setTimer(room, SEC.last, () => runTasks(room));
      say(room, `${p.name} 留遗言。`, { sys: true });
    } else if (t.t === 'speech') {
      const al = alive(room);
      if (!al.length) return startNight(room);
      const start = (room.day - 1) % al.length;
      const order = al.slice(start).concat(al.slice(0, start)).map((p) => p.id);
      room.phase = 'speech'; room.speech = { order, idx: 0, pk: false };
      say(room, '白天发言开始，按座位顺序轮流发言。', { sys: true });
      setTimer(room, SEC.speech, () => speechNext(room));
    } else if (t.t === 'pk') {
      room.phase = 'speech'; room.speech = { order: t.ids.slice(), idx: 0, pk: true };
      say(room, '平票！平票的玩家依次再发言一轮。', { sys: true });
      setTimer(room, SEC.speech, () => speechNext(room));
    } else if (t.t === 'vote') {
      room.phase = 'vote';
      const cand = t.cand || alive(room).map((p) => p.id);
      room.voteInfo = { cand, pk: !!t.cand };
      room.players.forEach((p) => { p.vote = undefined; });
      say(room, t.cand ? '再次投票，只能投平票的玩家。' : '开始投票放逐。', { sys: true });
      setTimer(room, SEC.vote, () => resolveVote(room));
    }
    pushState(room); botTick(room);
  }
  function speechNext(room) {
    if (room.phase !== 'speech') return;
    room.speech.idx += 1;
    if (room.speech.idx >= room.speech.order.length) return runTasks(room);
    setTimer(room, SEC.speech, () => speechNext(room));
    pushState(room); botTick(room);
  }
  function resolveVote(room) {
    if (room.phase !== 'vote') return;
    const tally = {}; const detail = [];
    alive(room).forEach((p) => {
      if (p.vote && p.vote !== 'abstain' && room.voteInfo.cand.includes(p.vote)) tally[p.vote] = (tally[p.vote] || 0) + 1;
      detail.push({ from: p.id, to: p.vote && room.voteInfo.cand.includes(p.vote) ? p.vote : 'abstain' });
    });
    room.lastVotes = detail;
    const mx = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((k) => tally[k] === mx);
    const nextNight = () => { room.tasks.push({ t: 'night' }); };
    stopTimer(room); room.tasks = [];
    if (!mx) { say(room, '没有人被投出，今天无人出局。', { sys: true }); room.phase = 'dawn'; nextNight(); }
    else if (top.length > 1) {
      if (!room.voteInfo.pk) {
        say(room, `投票结果：${top.map((id) => byId(room, id).name).join('、')} 平票。`, { sys: true });
        room.tasks.push({ t: 'pk', ids: top }, { t: 'vote', cand: top });
        room.phase = 'dawn';
      } else { say(room, '再次平票，今天无人出局。', { sys: true }); room.phase = 'dawn'; nextNight(); }
    } else {
      const p = byId(room, top[0]);
      die(room, p, 'vote');
      say(room, `${p.name} 以 ${mx} 票被放逐。`, { sys: true });
      room.tasks.push({ t: 'last', pid: p.id });
      if (p.role === 'hunter' || p.role === 'wolfking') room.tasks.push({ t: 'shot', pid: p.id });
      nextNight();
      if (checkWin(room)) return;
      room.phase = 'dawn';
    }
    setTimer(room, 5, () => runTasks(room));
    pushState(room);
  }
  function shoot(room, shooter, targetId) {
    const t = byId(room, targetId);
    if (!t || !t.alive || t.id === shooter.id) return false;
    die(room, t, 'shot');
    say(room, `${shooter.name} 开枪带走了 ${t.name}。`, { sys: true });
    if (checkWin(room)) return true;
    stopTimer(room); setTimer(room, 2, () => runTasks(room));
    pushState(room);
    return true;
  }

  // ---------- 机器人（也用于代打掉线玩家） ----------
  const CANNED = ['我是好人，这轮先听大家发言。', '昨晚的信息还不够，我暂时没有怀疑对象。', '我觉得发言太划水的人要小心一点。', '我没有技能，只能靠听。大家别乱投。', '过，听后面的人怎么说。', '我跟着发言逻辑清楚的人走。'];
  const isAuto = (p) => p.bot || !p.connected || p.left;
  function botTick(room) {
    if (room.phase === 'over' || room.phase === 'lobby') return;
    const phase = room.phase, step = room.step, snap = room.phaseEnd;
    const fire = (fn, a, b) => setTimeout(() => {
      if (room.phase !== phase || room.step !== step || room.phaseEnd !== snap) return;
      try { fn(); } catch (e) { console.error('ww bot', e); }
    }, botMs(a, b));
    if (phase === 'night') {
      for (const p of actorsOf(room)) if (isAuto(p)) fire(() => botNight(room, p), 1.5, 5);
    } else if (phase === 'shot') {
      const p = byId(room, room.shot.pid); if (p && isAuto(p)) fire(() => botShot(room, p), 1.5, 4);
    } else if (phase === 'last') {
      const p = byId(room, room.lastPid); if (p && isAuto(p)) fire(() => { postChat(room, p, '我的遗言：大家加油，别被狼人带偏。'); done(room); }, 2, 4);
    } else if (phase === 'speech') {
      const p = byId(room, room.speech.order[room.speech.idx]);
      if (p && isAuto(p)) fire(() => { postChat(room, p, CANNED[crypto.randomInt(CANNED.length)]); pushState(room); fire2(room, () => done(room)); }, 2, 5);
    } else if (phase === 'vote') {
      for (const p of alive(room)) if (isAuto(p)) fire(() => { if (p.vote === undefined) { p.vote = botVote(room, p); pushState(room); checkVoteDone(room); } }, 2, 9);
    }
  }
  function fire2(room, fn) { const ph = room.phase, e = room.phaseEnd; setTimeout(() => { if (room.phase === ph && room.phaseEnd === e) fn(); }, botMs(1, 2.5)); }
  const pick = (a) => a[crypto.randomInt(a.length)];
  function botNight(room, p) {
    if (room.step === 'guard') {
      const c = alive(room).filter((x) => x.id !== p.guardLast);
      const t = pick(c); p.guardLast = t.id; room.night.guardTarget = t.id; p.acted = true;
    } else if (room.step === 'wolf') {
      const c = alive(room).filter((x) => !isWolf(x));
      const t = c.length ? pick(c) : null; p.pick = t ? t.id : 'none';
    } else if (room.step === 'witch') {
      const v = room.night.wolfTarget;
      if (!p.witchSave && v && v !== p.id && Math.random() < 0.8) { p.witchSave = true; room.night.save = true; }
      else if (!p.witchPoison && room.day >= 3 && Math.random() < 0.25) {
        const c = alive(room).filter((x) => x.id !== p.id && !(p.known[x.id] === 'good')); if (c.length) { room.night.poison = pick(c).id; p.witchPoison = true; }
      }
      p.acted = true;
    } else if (room.step === 'seer') {
      const c = alive(room).filter((x) => x.id !== p.id && !(x.id in p.known));
      if (c.length) { const t = pick(c); const w = isWolf(t); p.known[t.id] = w ? 'wolf' : 'good'; p.seerResults.push({ day: room.day, id: t.id, name: t.name, wolf: w }); }
      p.acted = true;
    }
    pushState(room); stepDoneEarly(room);
  }
  function botShot(room, p) {
    const c = alive(room).filter((x) => x.id !== p.id);
    const known = c.filter((x) => p.known[x.id] === 'wolf');
    const pool = isWolf(p) ? c.filter((x) => !isWolf(x)) : (known.length ? known : c);
    if (pool.length) shoot(room, p, pick(pool).id); else runTasks(room);
  }
  function botVote(room, p) {
    const cand = room.voteInfo.cand.filter((id) => id !== p.id && byId(room, id).alive);
    if (!cand.length) return 'abstain';
    if (isWolf(p)) { const c = cand.filter((id) => !isWolf(byId(room, id))); return c.length ? pick(c) : 'abstain'; }
    const kw = cand.filter((id) => p.known[id] === 'wolf'); if (kw.length) return pick(kw);
    const ok = cand.filter((id) => p.known[id] !== 'good'); return pick(ok.length ? ok : cand);
  }
  function checkVoteDone(room) {
    if (room.phase === 'vote' && alive(room).every((p) => p.vote !== undefined)) { stopTimer(room); setTimer(room, 1.2, () => resolveVote(room)); }
  }
  function done(room) {
    if (room.phase === 'speech') { speechNext(room); }
    else if (room.phase === 'last') { runTasks(room); }
  }

  // ---------- 消息 ----------
  function resetToLobby(room) {
    stopTimer(room); room.phase = 'lobby'; room.day = 0; room.log = []; room.chat = []; room.over = null; room.tasks = []; room.lastVotes = null;
    room.players = room.players.filter((p) => !p.left && (p.bot || p.connected));
    room.players.forEach((p) => { p.role = null; p.alive = true; p.seat = 0; p.vote = undefined; p.pick = undefined; p.acted = false; });
    ensureHost(room);
  }
  function handle(ws, msg, err) {
    const t = msg.type;
    const needAuth = () => REQUIRE_AUTH && !ws.user;
    if (t === 'ww-listrooms') {
      if (needAuth()) return;
      const list = [];
      for (const r of rooms.values()) {
        if (r.phase !== 'lobby' || r.players.length >= r.cap) continue;
        const host = byId(r, r.hostId);
        list.push({ code: r.code, locked: !!r.password, host: host ? host.name : '', n: r.players.length, cap: r.cap });
      }
      return send(ws, { type: 'ww-rooms', rooms: list.slice(0, 50) });
    }
    if (t === 'ww-create') {
      if (needAuth()) return send(ws, { type: 'auth-failed' });
      const name = REQUIRE_AUTH ? cleanName(ws.user.nick) : cleanName(msg.name);
      if (!name) return err('请输入昵称');
      const room = createRoom(Math.round(Number(msg.cap)) || 9, msg.password);
      const p = addPlayer(room, name, ws, false);
      ws.wctx = { room, player: p };
      send(ws, { type: 'ww-joined', code: room.code, token: p.token, id: p.id });
      return pushState(room);
    }
    if (t === 'ww-join') {
      if (needAuth()) return send(ws, { type: 'auth-failed' });
      const name = REQUIRE_AUTH ? cleanName(ws.user.nick) : cleanName(msg.name);
      const room = rooms.get(String(msg.code || '').toUpperCase());
      if (!name) return err('请输入昵称');
      if (!room) return err('没有这个房间');
      if (room.phase !== 'lobby') return err('游戏已经开始，不能加入');
      if (room.password && String(msg.password || '').trim() !== room.password) return send(ws, { type: msg.password ? 'error' : 'ww-need-password', code: room.code, message: '房间密码不对' });
      if (room.players.length >= room.cap) return err('房间已满');
      if (room.players.some((p) => p.name === name)) return err('这个昵称已被占用');
      const p = addPlayer(room, name, ws, false);
      ws.wctx = { room, player: p };
      send(ws, { type: 'ww-joined', code: room.code, token: p.token, id: p.id });
      say(room, `${name} 加入了房间`, { sys: true });
      return pushState(room);
    }
    if (t === 'ww-rejoin') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      const p = room && room.players.find((x) => x.token === msg.token && !x.left);
      if (!p) return send(ws, { type: 'ww-rejoin-failed' });
      if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch (e) {} }
      p.ws = ws; p.connected = true; ws.wctx = { room, player: p };
      send(ws, { type: 'ww-joined', code: room.code, token: p.token, id: p.id });
      ensureHost(room);
      return pushState(room);
    }
    const ctx = ws.wctx; if (!ctx) return;
    const { room, player: me } = ctx;
    room.touched = now();
    const isHost = me.id === room.hostId;
    switch (t) {
      case 'ww-setcap': {
        if (!isHost || room.phase !== 'lobby') return;
        const n = Math.max(6, Math.min(12, Math.round(Number(msg.cap)) || 9));
        if (n < room.players.length) return err('房间里已经有更多人了');
        room.cap = n; return pushState(room);
      }
      case 'ww-addbot': {
        if (!isHost || room.phase !== 'lobby') return;
        if (room.players.length >= room.cap) return err('房间已满');
        const names = ['阿狼', '小羊', '老猎', '月影', '夜行', '白鸦', '灰雀', '青禾', '墨痕', '砚秋', '沐风', '听雪'];
        const nm = names.find((n) => !room.players.some((p) => p.name === '🤖' + n)) || ('机器人' + (room.players.length + 1));
        addPlayer(room, '🤖' + nm, null, true); return pushState(room);
      }
      case 'ww-rmbot': {
        if (!isHost || room.phase !== 'lobby') return;
        const i = room.players.map((p) => p.bot).lastIndexOf(true); if (i >= 0) room.players.splice(i, 1);
        return pushState(room);
      }
      case 'ww-start': {
        if (!isHost || room.phase !== 'lobby') return;
        if (room.players.length < 6) return err('至少需要 6 人（可以添加机器人补位）');
        if (room.players.some((p) => !p.bot && !p.connected)) return err('有人处于离线状态');
        room.cap = Math.max(room.cap, room.players.length);
        return startGame(room);
      }
      case 'ww-restart': {
        if (!isHost || room.phase !== 'over') return;
        resetToLobby(room); return pushState(room);
      }
      case 'ww-leave': {
        ws.wctx = null;
        if (room.phase === 'lobby' || room.phase === 'over') {
          const i = room.players.indexOf(me); if (i >= 0) room.players.splice(i, 1);
          ensureHost(room);
          if (!room.players.some((p) => !p.bot)) { stopTimer(room); rooms.delete(room.code); return; }
          if (room.phase === 'lobby') say(room, `${me.name} 离开了房间`, { sys: true });
        } else {
          me.left = true; me.connected = false;
          say(room, `${me.name} 离开了牌桌，由机器人代打。`, { sys: true });
          ensureHost(room);
          if (!room.players.some((p) => !p.bot && !p.left)) { stopTimer(room); rooms.delete(room.code); return; }
          botTick(room);
        }
        return pushState(room);
      }
      case 'ww-chat': {
        const text = String(msg.text || '').trim().slice(0, 200); if (!text) return;
        const ph = room.phase;
        if (ph === 'lobby' || ph === 'over') postChat(room, me, text, 'all');
        else if (!me.alive && ph !== 'shot') postChat(room, me, text, 'dead');
        else if (ph === 'night') { if (isWolf(me) && me.alive) postChat(room, me, text, 'wolf'); else return err('夜里不能说话'); }
        else if (ph === 'speech') { if (room.speech.order[room.speech.idx] !== me.id) return err('还没轮到你发言'); postChat(room, me, text, 'all'); }
        else if (ph === 'last') { if (room.lastPid !== me.id) return err('现在是别人的遗言'); postChat(room, me, text, 'all'); }
        else return err('现在不是发言时间');
        return pushState(room);
      }
      case 'ww-done': {
        if (room.phase === 'speech' && room.speech.order[room.speech.idx] === me.id) return done(room);
        if (room.phase === 'last' && room.lastPid === me.id) return done(room);
        return;
      }
      case 'ww-skip': {
        if (!isHost) return;
        if (room.phase === 'speech' || room.phase === 'last') return done(room);
        return;
      }
      case 'ww-boom': {
        // 狼人白天自爆：立即结束白天进入黑夜，自爆者出局
        if (!me.alive || !isWolf(me) || (room.phase !== 'speech' && room.phase !== 'vote')) return;
        die(room, me, 'boom'); say(room, `${me.name} 自爆了！身份：${ROLE[me.role].name}。白天结束。`, { sys: true });
        if (checkWin(room)) return;
        stopTimer(room); room.tasks = [{ t: 'night' }]; room.phase = 'dawn';
        setTimer(room, 4, () => runTasks(room)); return pushState(room);
      }
      case 'ww-act': return act(room, me, msg, err);
      default: return;
    }
  }
  function act(room, me, msg, err) {
    const kind = msg.kind, target = msg.target;
    const tp = byId(room, target);
    if (kind === 'vote') {
      if (room.phase !== 'vote' || !me.alive) return;
      if (target !== 'abstain' && !(tp && tp.alive && room.voteInfo.cand.includes(target))) return err('不能投这个人');
      me.vote = target; pushState(room); return checkVoteDone(room);
    }
    if (kind === 'shot') {
      if (room.phase !== 'shot' || room.shot.pid !== me.id) return;
      if (msg.skip) { say(room, `${me.name} 放弃了开枪。`, { sys: true }); stopTimer(room); return runTasks(room); }
      if (!shoot(room, me, target)) return err('不能选这个人'); return;
    }
    if (room.phase !== 'night' || !me.alive || room.step !== kind) return;
    if (!actorsOf(room).some((p) => p.id === me.id)) return;
    if (kind === 'guard') {
      if (msg.skip) { me.acted = true; }
      else {
        if (!tp || !tp.alive) return err('不能守护这个人');
        if (target === me.guardLast) return err('不能连续两晚守护同一个人');
        me.guardLast = target; room.night.guardTarget = target; me.acted = true;
      }
    } else if (kind === 'wolf') {
      if (target === 'none') me.pick = 'none';
      else { if (!tp || !tp.alive) return err('不能选这个人'); me.pick = target; }
    } else if (kind === 'witch') {
      const v = room.night.wolfTarget;
      if (msg.op === 'save') {
        if (me.witchSave || !v || v === me.id) return err('现在不能用解药');
        if (me.witchUsedThisNight) return;
        me.witchSave = true; room.night.save = true; me.acted = true;
      } else if (msg.op === 'poison') {
        if (me.witchPoison || room.night.save || !tp || !tp.alive || tp.id === me.id) return err('现在不能用毒药');
        me.witchPoison = true; room.night.poison = target; me.acted = true;
      } else { me.acted = true; }
    } else if (kind === 'seer') {
      if (me.acted) return;
      if (!tp || !tp.alive || tp.id === me.id) return err('不能查验这个人');
      const w = isWolf(tp);
      me.seerResults.push({ day: room.day, id: tp.id, name: tp.name, wolf: w }); me.acted = true;
    }
    pushState(room); stepDoneEarly(room);
  }
  function onClose(ws) {
    const ctx = ws.wctx; if (!ctx) return;
    const { room, player } = ctx;
    if (player.ws !== ws) return;
    player.connected = false;
    if (room.phase === 'lobby' || room.phase === 'over') {
      // 大厅里掉线：保留座位，回来可以接着用
    }
    ensureHost(room);
    pushState(room);
    if (room.phase !== 'lobby' && room.phase !== 'over') botTick(room);
  }
  // 清理：长时间没人的房间
  setInterval(() => {
    const t = now();
    for (const [code, r] of rooms) {
      if (t - r.touched > 3 * 3600 * 1000 || (!r.players.some((p) => !p.bot && p.connected) && t - r.touched > 15 * 60 * 1000)) { stopTimer(r); rooms.delete(code); }
    }
  }, 60000).unref && 0;
  return { handle, onClose, rooms, ROLE, deckFor };
};
