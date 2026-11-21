// utils/catalog.js — 模型档案查询与格式化
// 数据由 pipeline/build_catalog.py 生成，随小程序包发布。

var catalog = require('../data/model-catalog.js');

function baseName(name) {
  return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function findModel(name) {
  if (!name) return null;
  var id = catalog.aliases[name] || catalog.aliases[baseName(name)];
  return id ? (catalog.models[id] || null) : null;
}

function findModelById(id) {
  return id ? (catalog.models[id] || null) : null;
}

function companyOf(model) {
  return model && model.companyId ? (catalog.companies[model.companyId] || null) : null;
}

function familyOf(model) {
  return model && model.familyId ? (catalog.families[model.familyId] || null) : null;
}

function familyModels(familyId) {
  var fam = familyId ? catalog.families[familyId] : null;
  if (!fam || !fam.modelIds) return [];
  return fam.modelIds.map(function (id) { return catalog.models[id]; }).filter(Boolean);
}

function eventsForModel(model) {
  var ids = {};
  if (model) ids[model.id] = 1;
  if (model && model.familyId) {
    familyModels(model.familyId).forEach(function (m) { ids[m.id] = 1; });
  }
  return (catalog.events || []).filter(function (e) { return ids[e.refId]; })
    .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
    .slice(0, 8);
}

function formatTokens(n) {
  n = Number(n) || 0;
  if (!n) return '';
  if (n >= 1000000) {
    var m = n / 1000000;
    return (m >= 10 ? Math.round(m) : (Math.round(m * 10) / 10)) + 'M tokens';
  }
  if (n >= 1000) return Math.round(n / 1000) + 'K tokens';
  return n + ' tokens';
}

var MOD_LABELS = { text: '文本', image: '图片', audio: '音频', video: '视频', file: '文件' };

function modalityText(list) {
  return (list || []).map(function (x) { return MOD_LABELS[x] || x; }).join(' / ') || '—';
}

function parseContext(str) {
  var s = String(str || '').trim().toLowerCase();
  if (!s) return 0;
  var m = s.match(/([0-9.]+)\s*(m|k)/);
  if (m) return Math.round(parseFloat(m[1]) * (m[2] === 'm' ? 1000000 : 1000));
  var n = parseInt(s, 10);
  return n > 0 ? n : 0;
}

module.exports = {
  catalog: catalog,
  baseName: baseName,
  findModel: findModel,
  findModelById: findModelById,
  companyOf: companyOf,
  familyOf: familyOf,
  familyModels: familyModels,
  eventsForModel: eventsForModel,
  formatTokens: formatTokens,
  modalityText: modalityText,
  parseContext: parseContext,
};
