'use strict';
// 剧本注册表：新增剧本时，在这里 require 并加入 list 即可。
const load = (p) => { try { return require(p); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return null; } };
const names = ['haishen', 'xizhong', 'jiye', 'shoulingye', 'yunqi', 'birthday', 'reunion', 'camping', 'yacht', 'circus', 'castle', 'tvshow', 'watertown', 'skiresort', 'colliery', 'oldtrain', 'princepalace', 'biolab', 'island', 'hotel1937', 'test'];
const list = names.map((n) => load('./' + n)).filter(Boolean)
  .map((s, i) => [s, i]).sort((a, b) => (a[0].internal ? 1 : 0) - (b[0].internal ? 1 : 0) || (a[0].difficulty || 3) - (b[0].difficulty || 3) || a[1] - b[1]).map((x) => x[0]);
module.exports = { list, byId: (id) => list.find((s) => s.id === id) };
