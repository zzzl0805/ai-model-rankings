// utils/priced-models.js — 预算选型：只统计有公开 API 价格的文本模型
var local = require('../data/rankings.js');
var catalog = require('./catalog.js');
var meta = require('./model-meta.js');

function getRankings() {
  try {
    var app = getApp();
    if (app && app.globalData && app.globalData.cloudRankings) return app.globalData.cloudRankings;
  } catch (e) {}
  return local;
}

function fmt(v) {
  v = Number(v) || 0;
  return v > 0 && v < 0.01 ? v.toFixed(3) : v.toFixed(2);
}

function build() {
  var r = getRankings();
  var data = r.data || {};
  var rate = r.exchangeRate || 7.2;
  var catNames = {};
  (r.categories || []).forEach(function (c) { catNames[c.id] = c.name; });

  // 榜单名次索引
  var rankIndex = {};
  Object.keys(data).forEach(function (catId) {
    Object.keys(data[catId] || {}).forEach(function (dimId) {
      var arr = data[catId][dimId] || [];
      arr.forEach(function (m, i) {
        if (!m || !m.name) return;
        var key = catId + '.' + dimId;
        if (!rankIndex[key]) rankIndex[key] = {};
        rankIndex[key][m.name] = { rank: m.rank || (i + 1), total: arr.length };
      });
    });
  });

  var models = [];
  var seen = {};
  Object.keys(data).forEach(function (catId) {
    var arr = ((data[catId] || {}).overall) || [];
    arr.forEach(function (m) {
      if (!m || !m.name || seen[m.name]) return;
      var p = m.price || {};
      if (!(p.input > 0 || p.output > 0)) return;
      seen[m.name] = 1;
      var cm = catalog.findModel(m.name);
      models.push({
        name: m.name,
        displayName: cm ? cm.displayName : m.name,
        provider: meta.getProviderDisplay(m.provider, m.name),
        inputPrice: p.input || 0,
        outputPrice: p.output || 0,
        currency: p.currency || 'USD',
        elo: m.elo || 0,
        context: cm && cm.contextTokens ? catalog.formatTokens(cm.contextTokens) : (m.context || ''),
        strengths: (cm && cm.strengths) || [],
        catId: catId,
      });
    });
  });

  return { models: models, rankIndex: rankIndex, rate: rate, catNames: catNames, updated: r.lastUpdated || '' };
}

function estimateCNY(m, scene, rate) {
  return (scene.input / 100 * m.inputPrice + scene.output / 100 * m.outputPrice) * rate;
}

function rankFor(m, scene, idx) {
  var key = scene.rankCat + '.' + scene.rankDim;
  var hit = (idx[key] || {})[m.name];
  if (hit) return hit;
  var ov = (idx['text.overall'] || {})[m.name];
  return ov || null;
}

function recommend(scene, budget, priority) {
  var idx = build();
  var rows = idx.models.map(function (m) {
    var cost = estimateCNY(m, scene, idx.rate);
    var rk = rankFor(m, scene, idx.rankIndex);
    var rank = rk ? rk.rank : 0;
    var total = rk ? rk.total : 0;
    var pct = total ? (1 - (rank - 1) / total) : 0;
    return { m: m, cost: cost, rank: rank, total: total, pct: pct };
  }).filter(function (x) { return x.rank > 0; });

  var within = rows.filter(function (x) { return x.cost <= budget; });
  var overBudget = within.length === 0;
  var pool = overBudget ? rows.slice().sort(function (a, b) { return a.cost - b.cost; }).slice(0, 3) : within;

  if (!overBudget) {
    if (priority === 'value') {
      // 先限制在能力前 50%，再按质量/成本排序
      var capable = pool.filter(function (x) { return x.pct >= 0.5; });
      if (capable.length >= 3) pool = capable;
      pool.sort(function (a, b) {
        var va = a.pct / Math.max(a.cost, 1);
        var vb = b.pct / Math.max(b.cost, 1);
        return vb - va;
      });
    } else {
      pool.sort(function (a, b) { return (b.pct - a.pct) || (a.cost - b.cost); });
    }
  }

  // 厂商去重，避免 3 个同厂版本
  var picked = [];
  var used = {};
  pool.forEach(function (x) {
    var key = String(x.m.provider || '').toLowerCase();
    if (key && used[key] && picked.length < 3) return;
    used[key] = 1;
    picked.push(x);
  });
  if (picked.length < 3) {
    pool.forEach(function (x) {
      if (picked.length >= 3) return;
      if (picked.indexOf(x) < 0) picked.push(x);
    });
  }

  return {
    items: picked.slice(0, 3).map(function (x) {
      return {
        name: x.m.name,
        displayName: x.m.displayName,
        provider: x.m.provider,
        cost: Math.round(x.cost * 100) / 100,
        costText: '¥' + Math.round(x.cost * 100) / 100,
        rank: x.rank,
        total: x.total,
        pct: Math.round(x.pct * 100),
        context: x.m.context || '—',
        priceText: '$' + fmt(x.m.inputPrice) + ' / $' + fmt(x.m.outputPrice) + ' /M',
        strengths: (x.m.strengths || []).slice(0, 2),
        reason: (scene.name + '场景第 ' + x.rank + ' / ' + x.total + '，月成本 ' + Math.round(x.cost) + ' 元'),
      };
    }),
    overBudget: overBudget,
    minCost: rows.length ? Math.round(rows.reduce(function (a, b) { return a.cost < b.cost ? a : b; }).cost) : 0,
    updated: idx.updated,
    modelCount: idx.models.length,
  };
}

module.exports = {
  recommend: recommend,
  estimateCNY: estimateCNY,
};
