// utils/landing-data.js — 固定路径模型/系列落地页的数据组装
var local = require('../data/rankings.js');
var catalog = require('./catalog.js');
var meta = require('./model-meta.js');
var cfg = require('./landing-config.js');

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

function baseName(name) {
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// 名称/基础名 -> 物理页路径
var MODEL_PAGE = {};
var MODEL_PAGE_BASE = {};
cfg.models.forEach(function (m) {
  var p = 'pages/model-' + m.slug + '/model-' + m.slug;
  MODEL_PAGE[m.name] = p;
  MODEL_PAGE_BASE[baseName(m.name)] = p;
});
var FAMILY_PAGE = {};
cfg.families.forEach(function (f) { FAMILY_PAGE[f.id] = 'pages/family-' + f.slug + '/family-' + f.slug; });

function findRow(data, name) {
  var found = null;
  Object.keys(data).forEach(function (catId) {
    if (found) return;
    var rows = ((data[catId] || {}).overall) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].name === name) { found = { catId: catId, row: rows[i], index: i }; return; }
    }
  });
  if (found) return found;
  // 用基础名回退到榜单里的变体
  var base = baseName(name);
  Object.keys(data).forEach(function (catId) {
    if (found) return;
    var rows = ((data[catId] || {}).overall) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && baseName(rows[i].name) === base) { found = { catId: catId, row: rows[i], index: i }; return; }
    }
  });
  return found;
}

function priceText(row) {
  var p = row.price || {};
  if (!(p.input > 0 || p.output > 0 || p.inputCNY > 0 || p.outputCNY > 0)) return '暂无公开 API 价格';
  if (p.currency === 'CNY') return '¥' + fmt(p.inputCNY) + ' / ¥' + fmt(p.outputCNY) + ' /M';
  return '$' + fmt(p.input) + ' / $' + fmt(p.output) + ' /M';
}

function modelData(name) {
  var rankings = getRankings();
  var data = rankings.data || {};
  var hit = findRow(data, name);
  var row = hit ? hit.row : null;
  var cm = catalog.findModel(name);
  var company = catalog.companyOf(cm);
  var family = catalog.familyOf(cm);
  var displayName = cm ? cm.displayName : meta.getDisplayName(name);
  var provider = company ? (company.nameZh || company.name) : meta.getProviderDisplay((row && row.provider) || '', name);

  var catNames = {};
  (rankings.categories || []).forEach(function (c) { catNames[c.id] = c.name; });

  var ranks = [];
  Object.keys(data).forEach(function (catId) {
    var rows = ((data[catId] || {}).overall) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].name === (row ? row.name : name)) {
        var rank = rows[i].rank || (i + 1);
        var total = rows.length;
        ranks.push({
          name: (catNames[catId] || catId),
          rank: rank,
          total: total,
          topPct: total ? Math.round(rank / total * 1000) / 10 : 0,
        });
        break;
      }
    }
  });
  var primary = null;
  ranks.forEach(function (r) { if (!primary && r.name === '文本') primary = r; });
  primary = primary || ranks[0] || null;

  var context = (cm && cm.contextTokens) ? catalog.formatTokens(cm.contextTokens) : (row && row.context ? (catalog.formatTokens(catalog.parseContext(row.context)) || row.context) : '');
  var price = row ? priceText(row) : (cm && cm.price ? '$' + fmt(cm.price.input) + ' / $' + fmt(cm.price.output) + ' 每百万 tokens' : '暂无公开 API 价格');
  var score = row ? (row.elo ? Math.round(row.elo * 10) / 10 : '-') : '-';

  var summary = (cm && cm.summary) || '';
  if (!summary) summary = provider + '的 ' + displayName + (primary ? '，当前在' + primary.name + '榜第 ' + primary.rank + ' / ' + primary.total : '') + '。';

  var specs = [];
  if (cm) {
    if (cm.releaseDate) specs.push({ label: '发布', value: cm.releaseDate });
    if (cm.license) specs.push({ label: '许可证', value: cm.license.replace(/\s*license$/i, ' 许可') });
    if (cm.modalities && cm.modalities.input && cm.modalities.input.length) specs.push({ label: '输入', value: catalog.modalityText(cm.modalities.input) });
    if (cm.modalities && cm.modalities.output && cm.modalities.output.length) specs.push({ label: '输出', value: catalog.modalityText(cm.modalities.output) });
    if (cm.apiModelIds && cm.apiModelIds[0]) specs.push({ label: 'API ID', value: cm.apiModelIds[0] });
  }

  var familyPath = family ? FAMILY_PAGE[family.id] : '';
  var links = [];
  if (family) {
    catalog.familyModels(family.id).forEach(function (m) {
      if (m.id === cm.id) return;
      var p = MODEL_PAGE[m.rankingName] || MODEL_PAGE_BASE[baseName(m.rankingName || m.displayName)] || '';
      links.push({
        label: m.displayName,
        meta: m.primaryRank ? ('#' + m.primaryRank + ' / ' + m.primaryTotal) : '',
        path: p || ('/pages/detail/detail?name=' + encodeURIComponent(m.rankingName || m.displayName)),
      });
    });
    links = links.slice(0, 6);
  }

  var description = displayName + ' 是 ' + provider + ' 的模型' +
    (family ? '，属于 ' + (family.nameZh || family.name) : '') +
    '。本页提供它在 LMArena 榜单中的最新排名、API 价格、上下文与关键规格。';

  return {
    kind: 'model',
    title: displayName + ' 排名与价格',
    heroTitle: displayName,
    subtitle: provider + (family ? ' · ' + (family.nameZh || family.name) : ''),
    description: description,
    summary: summary,
    strengths: (cm && cm.strengths) || [],
    stats: [
      { label: '主榜名次', value: primary ? '#' + primary.rank + ' / ' + primary.total : '—' },
      { label: '上下文', value: context || '—' },
      { label: 'Elo', value: String(score) },
      { label: '价格', value: price },
    ],
    ranks: ranks,
    specs: specs,
    links: links,
    linkTitle: family ? (family.nameZh || family.name) + ' 其他版本' : '相关模型',
    detailName: row ? row.name : name,
    familyPath: familyPath,
    updated: rankings.lastUpdated || '',
    sourceNote: cm ? '档案核对于 ' + (cm.verifiedAt || '') : '',
    shareTitle: displayName + (primary ? ' 在' + primary.name + '榜第' + primary.rank : '') + '｜AI模型排行',
  };
}

function familyData(familyId) {
  var rankings = getRankings();
  var data = rankings.data || {};
  var fam = catalog.familyOf({ familyId: familyId });
  if (!fam) fam = { id: familyId, name: familyId, nameZh: familyId, description: '', modelIds: [] };
  var members = catalog.familyModels(familyId);
  var catNames = {};
  (rankings.categories || []).forEach(function (c) { catNames[c.id] = c.name; });

  var links = [];
  var best = null;
  members.forEach(function (m) {
    var name = m.rankingName || m.displayName;
    var hit = findRow(data, name);
    var row = hit ? hit.row : null;
    var rank = row ? (row.rank || 0) : 0;
    var total = hit ? (((data[hit.catId] || {}).overall) || []).length : 0;
    if (rank && (!best || rank < best.rank)) best = { rank: rank, total: total, name: m.displayName };
    var p = MODEL_PAGE[name] || MODEL_PAGE_BASE[baseName(name)] || '';
    links.push({
      label: m.displayName,
      meta: rank ? ('#' + rank + ' / ' + total + ' · ' + priceText(row || {})) : '暂无排名',
      path: p || ('/pages/detail/detail?name=' + encodeURIComponent(name)),
    });
  });

  var company = catalog.companyOf(fam.modelIds && fam.modelIds.length ? catalog.findModelById(fam.modelIds[0]) : null);
  return {
    kind: 'family',
    title: (fam.nameZh || fam.name) + ' 模型排行',
    heroTitle: (fam.nameZh || fam.name),
    subtitle: company ? (company.nameZh || company.name) + ' · ' + members.length + ' 个版本' : members.length + ' 个版本',
    description: fam.description || ((fam.nameZh || fam.name) + ' 系列模型的排名、价格与版本对比。'),
    summary: fam.description || '',
    strengths: [],
    stats: [
      { label: '系列版本', value: String(members.length) },
      { label: '系列最佳', value: best ? '#' + best.rank + ' / ' + best.total : '—' },
      { label: '代表模型', value: best ? best.name : '—' },
    ],
    ranks: [],
    specs: [],
    links: links.slice(0, 12),
    linkTitle: '系列成员',
    detailName: '',
    updated: rankings.lastUpdated || '',
    sourceNote: '数据来自 LMArena 与公开档案',
    shareTitle: (fam.nameZh || fam.name) + ' 模型排行｜AI模型排行',
  };
}

module.exports = {
  modelData: modelData,
  familyData: familyData,
  MODEL_PAGE: MODEL_PAGE,
  FAMILY_PAGE: FAMILY_PAGE,
};
