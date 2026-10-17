'use strict';
// 用法：node tools/validate-script.js scripts/xxx.js  —— 检查剧本结构、词汇、基本逻辑
const path = require('path');
const V = require('../scripts/vocab');
const file = path.resolve(process.argv[2]);
const s = require(file);
const errs = [], warns = [];
const E = (m) => errs.push(m), W = (m) => warns.push(m);
const str = (v, min, label) => { if (typeof v !== 'string' || v.length < (min || 1)) E(`${label} 缺失或太短（<${min || 1}字）`); };
['id', 'title', 'subtitle', 'duration', 'tagline'].forEach((k) => str(s[k], 2, k));
if (s.minPlayers !== 4 || s.maxPlayers !== 8) E('minPlayers/maxPlayers 必须是 4 和 8');
if (![1, 2, 3, 4, 5].includes(s.difficulty)) E('difficulty 必须是 1-5');
if (!V.scenes.includes(s.cover)) E('cover 不在场景词汇表里：' + s.cover);
if (!V.tones.includes(s.tone)) E('tone 不合法：' + s.tone);
if (!Array.isArray(s.intro) || s.intro.length < 5 || s.intro.length > 7) E('intro 需要 5-7 段');
else {
  if (!Array.isArray(s.introScenes) || s.introScenes.length !== s.intro.length) E('introScenes 数量必须等于 intro 段数');
  else s.introScenes.forEach((x) => { if (!V.scenes.includes(x)) E('introScenes 非法场景 ' + x); });
  s.intro.forEach((t, i) => { if (t.length < 25) W(`intro[${i}] 很短`); });
}
if (!s.phaseScenes || typeof s.phaseScenes !== 'object') E('phaseScenes 缺失（键：reading,turns,search1,discuss1,search2,discuss2,search3,discuss3,vote）');
else ['reading', 'turns', 'search1', 'discuss1', 'search2', 'discuss2', 'search3', 'discuss3', 'vote'].forEach((k) => { if (!V.scenes.includes(s.phaseScenes[k])) E('phaseScenes.' + k + ' 非法'); });
if (!Array.isArray(s.timeline) || s.timeline.length < 6 || s.timeline.length > 9) E('timeline 需要 6-9 条');
else s.timeline.forEach((t, i) => { str(t.t, 1, `timeline[${i}].t`); str(t.text, 6, `timeline[${i}].text`); if (!V.icons.includes(t.icon)) E(`timeline[${i}].icon 非法：${t.icon}`); });
if (!Array.isArray(s.publicFacts) || s.publicFacts.length < 4 || s.publicFacts.length > 7) E('publicFacts 需要 4-7 条');
if (!s.victim || !s.victim.name || !s.victim.age || !s.victim.desc) E('victim 需要 name/age/desc');
checkLook(s.victim && s.victim.look, 'victim.look');
function checkLook(l, label) {
  if (!l || typeof l !== 'object') return E(label + ' 缺失');
  for (const k of ['skin', 'hair', 'hairColor', 'glasses', 'beard', 'outfit', 'mood']) if (!V.look[k].includes(l[k])) E(`${label}.${k} 非法：${l[k]}`);
  if (typeof l.female !== 'boolean') E(label + '.female 必须是 true/false');
  if (!/^#[0-9a-fA-F]{6}$/.test(l.outfitColor || '')) E(label + '.outfitColor 必须是 #rrggbb');
  if (!/^#[0-9a-fA-F]{6}$/.test(l.bg || '')) E(label + '.bg 必须是 #rrggbb');
  if (l.accent && !/^#[0-9a-fA-F]{6}$/.test(l.accent)) E(label + '.accent 必须是 #rrggbb');
  if (l.acc != null) { if (!Array.isArray(l.acc) || l.acc.some((a) => !V.look.acc.includes(a))) E(label + '.acc 非法'); }
}
const ids = Array.isArray(s.coreOrder) ? s.coreOrder : [];
if (ids.length !== 8) E('coreOrder 必须正好 8 个角色');
const ch = s.characters || {};
if (Object.keys(ch).length !== ids.length || ids.some((i) => !ch[i])) E('characters 必须和 coreOrder 一一对应');
let culprits = [];
ids.forEach((id, idx) => {
  const c = ch[id]; if (!c) return;
  if (c.id !== id) E(`${id}.id 不匹配`);
  ['name', 'title'].forEach((k) => str(c[k], 2, `${id}.${k}`)); ['blurb', 'story', 'secret', 'goal', 'reveal'].forEach((k) => str(c[k], 8, `${id}.${k}`));
  if (!c.age) E(id + '.age 缺失');
  if (!Array.isArray(c.timeline) || c.timeline.length < 3) E(id + '.timeline 至少 3 条');
  if (c.isCulprit) culprits.push({ id, idx });
  checkLook(c.look, id + '.look');
  if (typeof c.story === 'string' && c.story.length < 60) W(id + '.story 偏短');
});
if (culprits.length !== 1) E('必须正好 1 个凶手，现在是 ' + culprits.length);
else if (culprits[0].idx > 3) E('凶手必须在 coreOrder 的前 4 个里（保证 4 人局也有凶手）');
const names = ids.map((i) => ch[i] && ch[i].name);
if (new Set(names).size !== names.length) E('角色名重复');
if (!Array.isArray(s.locations) || s.locations.length !== 6) E('locations 必须正好 6 个');
else {
  const lid = new Set();
  s.locations.forEach((l) => {
    if (lid.has(l.id)) E('地点 id 重复 ' + l.id); lid.add(l.id);
    str(l.name, 2, l.id + '.name'); str(l.desc, 6, l.id + '.desc');
    if (!V.scenes.includes(l.scene)) E(l.id + '.scene 非法：' + l.scene);
    if (!Array.isArray(l.clues) || l.clues.length < 4) E(l.id + ' 至少 4 条线索');
    else l.clues.forEach((c) => { str(c.id, 1, l.id + ' 线索 id'); str(c.title, 2, c.id + '.title'); str(c.text, 15, c.id + '.text'); });
  });
  const cid = s.locations.flatMap((l) => l.clues.map((c) => c.id));
  if (new Set(cid).size !== cid.length) E('线索 id 全局必须唯一');
}
if (!Array.isArray(s.truth) || s.truth.length < 5 || s.truth.length > 8) E('truth 需要 5-8 段');
else if (culprits.length === 1 && !s.truth[0].includes(ch[culprits[0].id].name)) E('truth 第一段必须点出凶手姓名');
console.log(`${s.id || '?'}《${s.title}》：${errs.length} 个错误，${warns.length} 个提醒`);
errs.forEach((e) => console.log('  ✗ ' + e)); warns.forEach((e) => console.log('  ! ' + e));
const total = (o) => JSON.stringify(o).length;
console.log('  全文约 ' + total(s) + ' 字符');
process.exit(errs.length ? 1 : 0);
