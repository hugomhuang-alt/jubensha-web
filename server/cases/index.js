'use strict';
// 侦探模式案件注册表：自动加载本目录下所有案件文件；校验不过的案件会被跳过。按难度从低到高排序。
const fs = require('fs'), path = require('path');
const { check } = require('../tools/validate-case');
const list = [];
for (const f of fs.readdirSync(__dirname).sort()) {
  if (!f.endsWith('.js') || f === 'index.js') continue;
  try {
    const c = require('./' + f);
    const r = check(c);
    if (r.E.length) console.warn('案件校验失败，已跳过：' + f);
    else list.push(c);
  } catch (e) { console.warn('案件加载失败：' + f, e.message); }
}
list.sort((a, b) => a.difficulty - b.difficulty);
module.exports = list;
