// utils/board-data.js — 榜单落地页共用的数据组装
// 首页是「可切换的多视图」，落地页是「固定视角的静态榜单」：
// 只取一个类目 × 一个维度，输出可直接渲染的行数据。

var localRankings = require('../data/rankings.js');
var meta = require('./model-meta.js');

function getRankings() {
  try {
    var app = getApp();
    if (app && app.globalData && app.globalData.cloudRankings) return app.globalData.cloudRankings;
  } catch (e) {}
  return localRankings;
}

function fmtPrice(v) {
  v = Number(v) || 0;
  // 人民币模型折算成美元后可能小于 0.01，保留 3 位避免显示成 0.00
  if (v > 0 && v < 0.01) return v.toFixed(3);
  return v.toFixed(2);
}

// category: 类目 id；dim: 维度 id；region: all | cn；limit: 最多行数
function buildBoard(category, dim, region, limit) {
  var rankings = getRankings();
  var rate = rankings.exchangeRate || 7.2;
  var catData = (rankings.data || {})[category] || {};
  var list = catData[dim] || [];
  if (!list.length && dim !== 'overall') {
    dim = 'overall';
    list = catData.overall || [];
  }

  var rows = list.map(function (m) {
    var full = meta.getDisplayName(m.name);
    var price = m.price || {};
    var isCNY = price.currency === 'CNY';
    var hasPrice = price.input > 0 || price.output > 0 || price.inputCNY > 0 || price.outputCNY > 0;
    var priceText = '';
    // 人民币原生价的美元字段可能被舍入成 0，用汇率反推
    var usdIn = price.input || (isCNY && price.inputCNY ? price.inputCNY / rate : 0);
    var usdOut = price.output || (isCNY && price.outputCNY ? price.outputCNY / rate : 0);

    if (hasPrice) {
      if (region === 'cn') {
        // 国产视图统一用人民币；原生美元价为折算值，加 ≈
        var pre = isCNY ? '' : '≈';
        priceText = pre + '¥' + fmtPrice(isCNY ? price.inputCNY : (price.inputCNY || price.input * rate)) +
          ' / ' + pre + '¥' + fmtPrice(isCNY ? price.outputCNY : (price.outputCNY || price.output * rate));
      } else {
        // 海外/全部视图统一用美元；人民币原生价加 ≈
        var preUsd = isCNY ? '≈' : '';
        priceText = preUsd + '$' + fmtPrice(usdIn) + ' / ' + preUsd + '$' + fmtPrice(usdOut);
      }
    }

    return {
      rank: m.rank || 0,
      name: m.name,
      displayName: full,
      provider: meta.getProviderDisplay(m.provider, m.name),
      isCN: meta.isDomestic(m.provider, m.name),
      elo: m.elo ? (Math.round(m.elo * 10) / 10).toFixed(1) : '-',
      votes: m.votes || 0,
      priceText: priceText,
      priceProxy: /openrouter/i.test(price.source || ''),
    };
  });

  if (region === 'cn') {
    rows = rows.filter(function (r) { return r.isCN; });
    // 筛完重排名次，让「国产榜第 1」是页面上看到的第 1
    rows = rows.map(function (r, i) {
      var copy = {};
      for (var k in r) copy[k] = r[k];
      copy.rank = i + 1;
      return copy;
    });
  }

  var total = rows.length;
  if (limit > 0) rows = rows.slice(0, limit);

  return {
    rows: rows,
    total: total,
    updated: rankings.lastUpdated || '',
    dim: dim,
  };
}

module.exports = {
  buildBoard: buildBoard,
};
