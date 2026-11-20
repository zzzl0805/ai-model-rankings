// utils/store.js — 本地资产：收藏、对比组、计算记录
// 全部走 wx storage，无后端改动。
// 设计原则：数据量小、结构简单、读失败不崩。

var KEY_FAV = 'favorites';            // string[] 模型 name
var KEY_FAV_SNAP = 'favoriteSnapshots'; // { name: {rank, priceInput, savedAt} }
var KEY_GROUPS = 'compareGroups';     // [{id, name, models: string[], savedAt}]
var KEY_CALC = 'calcHistory';         // [{model, displayName, inputTokens, outputTokens, costCNY, at}]

var MAX_GROUPS = 5;
var MAX_CALC = 10;

function read(key, fallback) {
  try {
    var v = wx.getStorageSync(key);
    if (v === '' || v === null || typeof v === 'undefined') return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try { wx.setStorageSync(key, value); return true; } catch (e) { return false; }
}

/* ---------------- 收藏 ---------------- */

function getFavorites() {
  var v = read(KEY_FAV, []);
  return Array.isArray(v) ? v : [];
}

function isFavorite(name) {
  return getFavorites().indexOf(name) >= 0;
}

function getFavoriteSnapshots() {
  var v = read(KEY_FAV_SNAP, {});
  return v && typeof v === 'object' ? v : {};
}

// 加入收藏：同时记下当时的排名与价格，用于下次回来对比
function addFavorite(name, snapshot) {
  var list = getFavorites();
  if (list.indexOf(name) >= 0) return list;
  list.push(name);
  write(KEY_FAV, list);
  if (snapshot) {
    var snaps = getFavoriteSnapshots();
    snaps[name] = snapshot;
    write(KEY_FAV_SNAP, snaps);
  }
  return list;
}

function removeFavorite(name) {
  var list = getFavorites().filter(function (n) { return n !== name; });
  write(KEY_FAV, list);
  var snaps = getFavoriteSnapshots();
  if (snaps[name]) {
    delete snaps[name];
    write(KEY_FAV_SNAP, snaps);
  }
  return list;
}

function toggleFavorite(name, snapshot) {
  if (isFavorite(name)) {
    removeFavorite(name);
    return false;
  }
  addFavorite(name, snapshot);
  return true;
}

/* ---------------- 对比组 ---------------- */

function getGroups() {
  var v = read(KEY_GROUPS, []);
  return Array.isArray(v) ? v : [];
}

// 默认组名：取现有「对比 N」的最大 N + 1，避免删除中间组后重名
function nextGroupName() {
  var groups = getGroups();
  var n = 1;
  var used = {};
  groups.forEach(function (g) {
    used[g.name] = 1;
    var m = /^对比\s*(\d+)$/.exec(g.name || '');
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  while (used['对比 ' + n]) n++;
  return '对比 ' + n;
}

function saveGroup(name, models) {
  var groups = getGroups();
  if (groups.length >= MAX_GROUPS) {
    return { ok: false, msg: '最多保存 ' + MAX_GROUPS + ' 组对比，请先删除一组' };
  }
  if (!models || !models.length) {
    return { ok: false, msg: '当前没有可保存的模型' };
  }
  var group = {
    id: 'g' + Date.now(),
    name: name || nextGroupName(),
    models: models.slice(0, 3),
    savedAt: Date.now(),
  };
  groups.unshift(group);
  write(KEY_GROUPS, groups);
  return { ok: true, id: group.id };
}

function deleteGroup(id) {
  write(KEY_GROUPS, getGroups().filter(function (g) { return g.id !== id; }));
}

function renameGroup(id, name) {
  var groups = getGroups();
  groups.forEach(function (g) { if (g.id === id) g.name = name; });
  write(KEY_GROUPS, groups);
}

/* ---------------- 计算记录 ---------------- */

function getCalcHistory() {
  var v = read(KEY_CALC, []);
  return Array.isArray(v) ? v : [];
}

function addCalcRecord(record) {
  var list = getCalcHistory();
  // 同一模型同一参数只保留最新一条
  list = list.filter(function (r) {
    return !(r.model === record.model &&
      r.inputTokens === record.inputTokens &&
      r.outputTokens === record.outputTokens);
  });
  list.unshift(record);
  write(KEY_CALC, list.slice(0, MAX_CALC));
}

module.exports = {
  MAX_GROUPS: MAX_GROUPS,
  getFavorites: getFavorites,
  isFavorite: isFavorite,
  addFavorite: addFavorite,
  removeFavorite: removeFavorite,
  toggleFavorite: toggleFavorite,
  getFavoriteSnapshots: getFavoriteSnapshots,
  getGroups: getGroups,
  nextGroupName: nextGroupName,
  saveGroup: saveGroup,
  deleteGroup: deleteGroup,
  renameGroup: renameGroup,
  getCalcHistory: getCalcHistory,
  addCalcRecord: addCalcRecord,
};
