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
    if (!(breaksBy[s.id] || []).length) e(s.id + ' 没有任何 breaks 对质');
    for (const t of s.topics || []) if (t.lie && !(s.confronts || []).some(f => f.breaks === t.id)) w(`${s.id}.${t.id} 是 lie 但没有对质能揭穿`);
  }
  // needs 成环检查（话题依赖图）
  const dep = {}; for (const s of sus) for (const t of s.topics || []) dep[s.id + '.' + t.id] = (t.needs || []).filter(x => x.startsWith('ask:')).map(x => x.slice(4));
  const vis = {}; const dfs = (k, st) => { if (st.includes(k)) { e('needs 成环：' + st.concat(k).join('>')); return; } if (vis[k]) return; vis[k] = 1; (dep[k] || []).forEach(d => dfs(d, st.concat(k))); };
  Object.keys(dep).forEach(k => dfs(k, []));
  const cu = breaksBy[sol.culprit] || [];
  const locs = new Set(cu.map(f => clueLoc[f.clue]));
  if (cu.length < 2 || locs.size < 2) e('凶手谎言需被 ≥2 个不同地点的证物揭穿');
  if (!cu.some(f => f.crack)) e('凶手缺 crack:true 对质');
  if (S[sol.culprit] && S[sol.culprit].topics.filter(t => t.lie).length < 2) e('凶手 lie 话题 <2');
  return { E, W };
}
module.exports = { check };
if (require.main === module) {
  const f = path.resolve(process.argv[2]); const c = require(f); const { E, W } = check(c);
  E.forEach(x => console.log('错误：' + x)); W.forEach(x => console.log('提醒：' + x));
  console.log(`${c.id}《${c.title}》：${E.length} 个错误，${W.length} 个提醒`); process.exit(E.length ? 1 : 0);
}
