// pages/mine/mine.js — 我的：收藏 / 对比组 / 计算记录
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');
var store = require('../../utils/store.js');

var DIM_NAMES = { overall: '综合', coding: '编程', math: '数学', writing: '写作', hardprompts: '难题', instruction: '指令', expert: '专家', multiturn: '长对话' };

// 从全部类目建索引：name -> {rank, elo, price, catId, catLabel}
// 不能只看 text.overall：文生图/视频等模型不在文本榜里。
function buildLookup() {
  var map = {};
  try {
    var data = (rankings && rankings.data) || {};
    var cats = rankings.categories || [];
    var catName = {};
    cats.forEach(function (c) { catName[c.id] = c.name; });

    // 第一遍：各类目综合榜（名次最直观）
    Object.keys(data).forEach(function (catId) {
      ((data[catId] || {}).overall || []).forEach(function (m, i) {
        if (!m || !m.name || map[m.name]) return;
        map[m.name] = {
          rank: m.rank || (i + 1),
          elo: m.elo,
          price: m.price,
          catId: catId,
          catLabel: catName[catId] || catId,
          providerRaw: m.provider || '',
        };
      });
    });

    // 第二遍：只出现在子维度的模型（标注维度）
    Object.keys(data).forEach(function (catId) {
      var dims = data[catId] || {};
      Object.keys(dims).forEach(function (dimId) {
        if (dimId === 'overall') return;
        (dims[dimId] || []).forEach(function (m, i) {
          if (!m || !m.name || map[m.name]) return;
          map[m.name] = {
            rank: m.rank || (i + 1),
            elo: m.elo,
            price: m.price,
            catId: catId,
            catLabel: (catName[catId] || catId) + (DIM_NAMES[dimId] ? '·' + DIM_NAMES[dimId] : ''),
            providerRaw: m.provider || '',
          };
        });
      });
    });
  } catch (e) {}
  return map;
}

function fmtTokens(v) {
  v = Number(v) || 0;
  if (v >= 10000) {
    var w = v / 10000;
    return (Math.round(w * 10) / 10) + '万';
  }
  return String(v);
}

function fmtMoney(v) {
  return String(Math.round((Number(v) || 0) * 100) / 100);
}

Page({
  data: {
    statusBarHeight: 44,
    menuRight: 110,
    favorites: [],
    groups: [],
    calcHistory: [],
    stats: { favCount: 0, groupCount: 0, calcCount: 0 },
  },

  onLoad: function () {
    try {
      var info = wx.getSystemInfoSync();
      var menuRight = 110;
      try {
        var rect = wx.getMenuButtonBoundingClientRect();
        if (rect && rect.left) menuRight = Math.round(info.windowWidth - rect.left + 8);
      } catch (e2) {}
      this.setData({ statusBarHeight: info.statusBarHeight || 44, menuRight: menuRight });
    } catch (e) {}
  },

  onShow: function () {
    this.refresh();
  },

  // 云端数据晚到：立即重算排名/价格变化
  onCloudDataReady: function () {
    this.refresh();
  },

  refresh: function () {
    var app = getApp();
    if (app && app.globalData && app.globalData.cloudRankings) {
      rankings = app.globalData.cloudRankings;
    }

    var lookup = buildLookup();
    var snaps = store.getFavoriteSnapshots();

    // 收藏：带排名与价格变化（同币种、同来源才比较，避免汇率/代理价造成假涨跌）
    var favorites = store.getFavorites().map(function (name) {
      var cur = lookup[name] || {};
      var snap = snaps[name] || {};
      var rankDelta = (snap.rank && cur.rank) ? (snap.rank - cur.rank) : 0; // 正数=上升

      var curPrice = cur.price || null;
      var currency = (curPrice && curPrice.currency) || snap.currency || 'USD';
      var priceNow = curPrice
        ? (currency === 'CNY' ? (curPrice.inputCNY || 0) : (curPrice.input || 0))
        : 0;
      var priceDelta = 0;
      var sameSource = !snap.source || !curPrice || snap.source === (curPrice.source || '');
      if (snap.priceInput && priceNow && (!snap.currency || snap.currency === currency) && sameSource) {
        priceDelta = Math.round((priceNow - snap.priceInput) * 100) / 100;
      }
      // 当前数据缺失时展示收藏时的价格（不参与涨跌）
      var priceText = '';
      if (priceNow) {
        priceText = (currency === 'CNY' ? '¥' : '$') + fmtMoney(priceNow);
      } else if (snap.priceInput) {
        priceText = (snap.currency === 'CNY' ? '¥' : '$') + fmtMoney(snap.priceInput);
      }

      return {
        name: name,
        displayName: meta.getDisplayName(name),
        provider: meta.getProviderDisplay(cur.providerRaw || '', name),
        rank: cur.rank || 0,
        rankDelta: rankDelta,
        eloText: cur.elo ? String(Math.round(cur.elo)) : '—',
        catLabel: cur.catLabel || '',
        priceText: priceText,
        priceProxy: /openrouter/i.test((curPrice && curPrice.source) || ''),
        priceDelta: priceDelta,
        priceCurrency: currency,
      };
    });

    // 对比组
    var groups = store.getGroups().map(function (g) {
      return {
        id: g.id,
        name: g.name,
        models: g.models,
        modelNames: g.models.map(function (n) { return meta.getDisplayName(n); }).join(' vs '),
        timeText: formatTime(g.savedAt),
      };
    });

    // 计算记录（存绝对 token 数，展示成「万」）
    var calcHistory = store.getCalcHistory().map(function (r) {
      return {
        key: r.model + '@' + r.at,
        model: r.model,
        displayName: r.displayName || meta.getDisplayName(r.model),
        inputText: fmtTokens(r.inputTokens),
        outputText: fmtTokens(r.outputTokens),
        costCNY: fmtMoney(r.costCNY),
        timeText: formatTime(r.at),
      };
    });

    this.setData({
      favorites: favorites,
      groups: groups,
      calcHistory: calcHistory,
      stats: { favCount: favorites.length, groupCount: groups.length, calcCount: calcHistory.length },
    });
  },

  onModelTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  onRemoveFavorite: function (e) {
    var name = e.currentTarget.dataset.name;
    var that = this;
    wx.showModal({
      title: '取消收藏',
      content: '把「' + meta.getDisplayName(name) + '」从收藏中移除？',
      success: function (res) {
        if (!res.confirm) return;
        store.removeFavorite(name);
        that.refresh();
      },
    });
  },

  onGroupTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var group = null;
    store.getGroups().forEach(function (g) { if (g.id === id) group = g; });
    if (!group) return;
    try {
      wx.setStorageSync('compareList', group.models);
      wx.setStorageSync('activeGroupId', group.id);
    } catch (err) {}
    wx.switchTab({ url: '/pages/compare/compare' });
  },

  onDeleteGroup: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: '删除对比组',
      content: '删除后不可恢复，确定？',
      success: function (res) {
        if (!res.confirm) return;
        store.deleteGroup(id);
        that.refresh();
      },
    });
  },

  onCalcTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  onClearCalc: function () {
    var that = this;
    wx.showModal({
      title: '清空记录',
      content: '清空所有计算记录？',
      success: function (res) {
        if (!res.confirm) return;
        try { wx.setStorageSync('calcHistory', []); } catch (e) {}
        that.refresh();
      },
    });
  },

  goBack: function () {
    wx.navigateBack({
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); },
    });
  },

  goRanking: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },
});

function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  var now = new Date();
  var sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  if (sameDay) return '今天 ' + hh + ':' + mm;
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm;
}
