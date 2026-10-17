'use strict';
// 剧本注册表：新增剧本时，在这里 require 并加入 list 即可。
const load = (p) => { try { return require(p); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; return null; } };
const list = ['./haishen', './xizhong', './jiye', './shoulingye', './yunqi'].map(load).filter(Boolean);
module.exports = { list, byId: (id) => list.find((s) => s.id === id) };
