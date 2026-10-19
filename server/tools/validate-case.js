'use strict';
const path = require('path'); const V = require('../scripts/vocab');
function check(c) {
  const E = [], W = []; const e = m => E.push(m), w = m => W.push(m);
  const L = (s, n, name) => { if (typeof s !== 'string' || s.length < n) e(`${name} 太短或缺失（≥${n}）`); };
  for (const k of ['id','title','tagline','brief']) L(c[k], 2, k);
  L(c.tagline, 8, 'tagline'); L(c.brief, 150, 'brief');
  if (!(c.difficulty >= 1 && c.difficulty <= 5)) e('difficulty 1–5');
  if (!V.scenes.includes(c.cover)) e('cover 非法'); if (!V.tones.includes(c.tone)) e('tone 非法');
  const chkLook = (lk, n) => { if (!lk) return e(n + ' 缺 look'); for (const k in lk) if (!V.look[k] || !V.look[k].includes(lk[k])) e(`${n}.look.${k}=${lk[k]} 非法`); };
  if (!c.victim) e('缺 victim'); else { L(c.victim.name, 2, 'victim.name'); L(c.victim.desc, 30, 'victim.desc'); chkLook(c.victim.look, 'victim'); }
  if (!c.publicFacts || c.publicFacts.length < 4 || c.publicFacts.length > 7) e('publicFacts 4–7');
  if (!c.timeline || c.timeline.length < 5 || c.timeline.length > 8) e('timeline 5–8');
  if (!c.budget || !(c.budget.search >= 6) || !(c.budget.ask >= 10)) e('budget 不合法');
  const clues = {}, clueLoc = {}, clueIdx = {};
  if (!c.locations || c.locations.length !== 6) e('locations 需要 6 个'); else for (const l of c.locations) {
    L(l.name, 2, 'loc.name'); L(l.desc, 20, l.id + '.desc'); if (!V.scenes.includes(l.scene)) e(l.id + ' scene 非法');
    if (!l.clues || l.clues.length < 3 || l.clues.length > 5) e(l.id + ' clues 3–5');
    (l.clues || []).forEach((k, i) => { if (clues[k.id]) e('重复证物 ' + k.id); clues[k.id] = k; clueLoc[k.id] = l.id; clueIdx[k.id] = i; L(k.title, 2, k.id + '.title'); if (k.title && k.title.length > 12) e(k.id + ' title>12'); L(k.text, 30, k.id + '.text'); });
  }
  const S = {}; const sus = c.suspects || [];
  if (sus.length !== 8) e('suspects 需要 8 个');
  for (const s of sus) S[s.id] = s;
  // 开场简报：人物关系 + 死亡报告
  if (!c.relations || typeof c.relations !== 'object') e('缺 relations（每个嫌疑人与死者的一句话关系）');
  else for (const x of sus) { const t = c.relations[x.id]; if (typeof t !== 'string' || t.length < 4 || t.length > 28) e(`relations.${x.id} 需 4–28 字`); }
  if (!Array.isArray(c.links) || c.links.length < 2 || c.links.length > 5) e('links 需要 2–5 条嫌疑人之间的关系');
  else for (const k of c.links) { if (!S[k.a] || !S[k.b] || k.a === k.b) e('links 里 a/b 必须是不同的嫌疑人 id'); if (typeof k.text !== 'string' || k.text.length < 4 || k.text.length > 24) e('links.text 需 4–24 字'); }
  const dr = c.deathReport;
  if (!dr) e('缺 deathReport'); else {
    for (const k of ['time', 'cause', 'scene']) if (typeof dr[k] !== 'string' || dr[k].length < 4) e(`deathReport.${k} 缺失或太短`);
    if (dr.scene && dr.scene.length > 60) e('deathReport.scene ≤60 字');
    if (dr.loc != null && !(c.locations || []).some((l) => l.id === dr.loc)) e('deathReport.loc 必须是地点 id 或省略');
    if (!Array.isArray(dr.notes) || dr.notes.length < 2 || dr.notes.length > 4 || dr.notes.some((n) => typeof n !== 'string' || n.length < 6 || n.length > 40)) e('deathReport.notes 需 2–4 条，每条 6–40 字');
  }
  for (const m of require('./check-cinema').checkCinema(c)) e('cinema：' + m);
  const sol = c.solution || {};
  if (!S[sol.culprit]) e('culprit 不存在');
  for (const k of ['method', 'motive']) { const m = sol[k]; if (!m || !m.options || m.options.length !== 4 || !(m[k] !== 0) && false) {} if (!m || !m.options || m.options.length !== 4 || !(m.correct >= 0 && m.correct <= 3)) e('solution.' + k + ' 不合法'); }
  if (!sol.keyClues || sol.keyClues.length < 4 || sol.keyClues.length > 6) e('keyClues 4–6');
  for (const k of sol.keyClues || []) { if (!clues[k]) e('keyClue 不存在 ' + k); else if (clueIdx[k] > 1) e(`keyClue ${k} 不在所在地点前 2 条`); }
  if (!sol.truth || sol.truth.length < 5 || sol.truth.length > 8) e('truth 5–8 段');
  else if (S[sol.culprit] && !sol.truth[0].includes(S[sol.culprit].name)) e('truth 第一段需含凶手姓名');
  const topicIds = {}; let withMotive = 0;
  for (const s of sus) {
    const n = s.id; L(s.name, 2, n + '.name'); L(s.role, 2, n + '.role'); L(s.bio, 40, n + '.bio'); L(s.demeanor, 2, n + '.demeanor'); L(s.fallback, 8, n + '.fallback'); chkLook(s.look, n);
    if (!s.topics || s.topics.length < 6 || s.topics.length > 9) e(n + ' topics 6–9'); topicIds[n] = {};
    for (const t of s.topics || []) { if (topicIds[n][t.id]) e(n + ' 重复话题 ' + t.id); topicIds[n][t.id] = t; L(t.q, 2, t.id + '.q'); if (t.q && t.q.length > 16) e(n + '.' + t.id + ' q>16'); L(t.a, 40, n + '.' + t.id + '.a'); if (t.a && t.a.length > 200) w(n + '.' + t.id + ' a 偏长'); if (t.lie) L(t.truth, 40, n + '.' + t.id + '.truth'); }
    if (!(s.topics || []).some(t => t.lie)) e(n + ' 没有任何 lie（红鲱鱼/凶手都需要）');
    if (!s.confronts || s.confronts.length < 3) e(n + ' confronts ≥3');
  }
  const breaksBy = {};
  for (const s of sus) {
    for (const t of s.topics || []) for (const nd of t.needs || []) {
      if (nd.startsWith('clue:')) { if (!clues[nd.slice(5)]) e(`${s.id}.${t.id} needs 不存在证物 ${nd}`); }
      else if (nd.startsWith('ask:')) { const [a, b] = nd.slice(4).split('.'); if (!topicIds[a] || !topicIds[a][b]) e(`${s.id}.${t.id} needs 不存在 ${nd}`); }
      else e(`${s.id}.${t.id} needs 格式错 ${nd}`);
    }
    for (const f of s.confronts || []) {
      if (!clues[f.clue]) e(`${s.id} confront 证物不存在 ${f.clue}`); L(f.a, 40, `${s.id}.confront.${f.clue}`);
      if (f.breaks) { const t = topicIds[s.id][f.breaks]; if (!t) e(`${s.id} breaks 话题不存在 ${f.breaks}`); else if (!t.lie) e(`${s.id} breaks 的话题不是 lie ${f.breaks}`); (breaksBy[s.id] = breaksBy[s.id] || []).push(f); }
    }
    if (s.id !== sol.culprit && !(breaksBy[s.id] || []).length) e(s.id + ' 没有任何 breaks 对质');
    for (const t of s.topics || []) if (s.id !== sol.culprit && t.lie && !(s.confronts || []).some(f => f.breaks === t.id)) w(`${s.id}.${t.id} 是 lie 但没有对质能揭穿`);
  }
  // needs 成环检查（话题依赖图）
  const dep = {}; for (const s of sus) for (const t of s.topics || []) dep[s.id + '.' + t.id] = (t.needs || []).filter(x => x.startsWith('ask:')).map(x => x.slice(4));
  const vis = {}; const dfs = (k, st) => { if (st.includes(k)) { e('needs 成环：' + st.concat(k).join('>')); return; } if (vis[k]) return; vis[k] = 1; (dep[k] || []).forEach(d => dfs(d, st.concat(k))); };
  Object.keys(dep).forEach(k => dfs(k, []));
  const cu = breaksBy[sol.culprit] || [];
  const locs = new Set(cu.map(f => clueLoc[f.clue]));
  if (cu.length) e('凶手的 confronts 不能有 breaks/crack：凶手永不认罪，只能狡辩（删掉 breaks 与 crack）');
  const cuC = (S[sol.culprit] && S[sol.culprit].confronts) || [];
  if (cuC.length < 4) e('凶手 confronts ≥4（每条是狡辩，不是认罪）');
  const names = (n) => [n, n.length >= 3 ? n.slice(-2) : n.slice(-1)].filter(x => x.length >= 2);
  const cname = S[sol.culprit] ? names(S[sol.culprit].name) : [];
  const nameHit = (sol.keyClues || []).filter(k => clues[k] && cname.some(n => (clues[k].title + clues[k].text).includes(n)));
  if (nameHit.length) e('关键证物不能直接写凶手姓名：' + nameHit.join(','));
  const lieSus = sus.filter(s => s.id !== sol.culprit && (s.topics || []).some(t => t.lie)).length;
  if (lieSus < 3) w('至少 3 个无辜者也应有 lie 话题（红鲱鱼）');
  const stub = sus.filter(s => s.id !== sol.culprit && (s.topics || []).some(t => t.lie && !(s.confronts || []).some(f => f.breaks === t.id))).length;
  if (stub < 1) e('至少 1 个无辜者的 lie 话题不能被一件证物揭穿（嘴硬的不只有凶手）');
  if (S[sol.culprit] && S[sol.culprit].topics.filter(t => t.lie).length < 2) e('凶手 lie 话题 <2');
  return { E, W };
}
module.exports = { check };
if (require.main === module) {
  const f = path.resolve(process.argv[2]); const c = require(f); const { E, W } = check(c);
  E.forEach(x => console.log('错误：' + x)); W.forEach(x => console.log('提醒：' + x));
  console.log(`${c.id}《${c.title}》：${E.length} 个错误，${W.length} 个提醒`); process.exit(E.length ? 1 : 0);
}
