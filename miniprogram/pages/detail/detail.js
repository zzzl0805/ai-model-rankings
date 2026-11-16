// pages/detail/detail.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');

function getRankings() {
  try {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings) return app.globalData.cloudRankings;
  } catch(e) {}
  return rankings;
}

Page({
  data: {
    modelName: '',
    displayName: '',
    provider: '',
    loading: true,
    votes: 0,
    confidence: {},
    review: '',
    price: null,
    context: '',
    categoryList: [],
    showSourcePopup: false,
    sourceInfo: null,
    rankInOverall: 0,
    overallElo: 0,
    updatedDate: '',
    shareTitle: '',
    inCompare: false,
  },

  onLoad: function (options) {
    var app = getApp();
    if (app.globalData && app.globalData.rankingsData) {
      rankings = app.globalData.rankingsData;
    }
    var name = options.name ? decodeURIComponent(options.name) : '';
    if (!name) {
      this.setData({ loading: false });
      return;
    }
    this.loadModel(name);
  },

  loadModel: function (name) {
    var that = this;
    var r = getRankings();
    var data, categories;

    try {
      data = r.data || r;
      categories = r.categories || [];
    } catch(e) {
      that.setData({ loading: false, displayName: name });
      return;
    }

    var catScores = {};
    var price = null;
    var votes = 0;
    var context = '';
    var rankInOverall = 0;
    var overallElo = 0;

    try {
      Object.keys(data).forEach(function (catId) {
        var catData = data[catId];
        if (!catData || typeof catData !== 'object') return;
        Object.keys(catData).forEach(function (dimId) {
          var arr = catData[dimId];
          if (!arr || !arr.length) return;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].name === name) {
              if (!catScores[catId]) catScores[catId] = {};
              catScores[catId][dimId] = arr[i];
              if (!price && arr[i].price && arr[i].price.input > 0) price = arr[i].price;
              if (!votes && arr[i].votes) votes = arr[i].votes;
              if (!context && arr[i].context) context = arr[i].context;
              break;
            }
          }
        });
      });
    } catch(e) {
      console.error('[Detail] search error:', e);
    }

    try {
      var textOverall = ((data.text || data).overall) || [];
      for (var j = 0; j < textOverall.length; j++) {
        if (textOverall[j].name === name) {
          rankInOverall = j + 1;
          overallElo = textOverall[j].elo || 0;
          break;
        }
      }
    } catch(e) {}

    var dimNames = { overall: '综合', coding: '编程', math: '数学', writing: '写作', hardprompts: '难题', instruction: '指令', expert: '专家', multiturn: '长对话' };
    var catList = [];
    try {
      Object.keys(catScores).forEach(function (catId) {
        var catInfo = null;
        for (var k = 0; k < categories.length; k++) {
          if (categories[k].id === catId) { catInfo = categories[k]; break; }
        }
        var dims = [];
        Object.keys(dimNames).forEach(function (dimId) {
          if (catScores[catId][dimId]) {
            dims.push({ id: dimId, name: dimNames[dimId], elo: catScores[catId][dimId].elo, margin: catScores[catId][dimId].margin || 0, votes: catScores[catId][dimId].votes || 0 });
          }
        });
        if (dims.length > 0) {
          catList.push({ id: catId, name: catInfo ? (catInfo.icon + ' ' + catInfo.name) : catId, dims: dims });
        }
      });
    } catch(e) {}

    var inCompare = false;
    try {
      var cl = wx.getStorageSync('compareList');
      inCompare = Array.isArray(cl) && cl.indexOf(name) >= 0;
    } catch (e) {}

    that.setData({
      modelName: name,
      displayName: meta.getDisplayName(name),
      provider: meta.getProviderCN(name),
      votes: votes,
      confidence: meta.getConfidence(votes),
      review: meta.getReview(name, catScores.text ? (catScores.text.overall || {}).elo || 0 : 0, price),
      price: price,
      context: context,
      categoryList: catList,
      rankInOverall: rankInOverall,
      overallElo: overallElo,
      updatedDate: r.lastUpdated || '',
      inCompare: inCompare,
      loading: false,
    });

    // 动态标题：让分享卡片和搜索展示更有信息量
    var displayName = meta.getDisplayName(name);
    var shareTitle = rankInOverall > 0
      ? displayName + ' 综合第' + rankInOverall + '名｜AI模型排行'
      : displayName + '｜AI模型排行';
    that.setData({ shareTitle: shareTitle });
    try { wx.setNavigationBarTitle({ title: displayName + (rankInOverall ? ' · 第' + rankInOverall + '名' : '') }); } catch (e) {}
  },

  // 云端数据晚到时重新加载（否则从分享卡片进来的用户看到的是旧快照）
  onCloudDataReady: function () {
    if (this.data.modelName) this.loadModel(this.data.modelName);
  },

  // 转发给好友
  onShareAppMessage: function () {
    var name = this.data.modelName;
    var title = this.data.shareTitle || (this.data.displayName + '｜AI模型排行');
    if (this.data.price && this.data.price.input > 0) {
      title += '，$' + this.data.price.input + '/百万token';
    }
    return {
      title: title,
      path: '/pages/detail/detail?name=' + encodeURIComponent(name || '') + '&from=share',
    };
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: this.data.shareTitle || (this.data.displayName + '｜AI模型排行'),
      query: 'name=' + encodeURIComponent(this.data.modelName || '') + '&from=timeline',
    };
  },

  // 加入/移出对比（与 compareList 本地存储同步）
  toggleCompare: function () {
    var that = this;
    var name = this.data.modelName;
    if (!name) return;

    var compareList = [];
    try {
      // 只接受数组，防止存储被污染为字符串/对象时调用数组方法崩溃
      var stored = wx.getStorageSync('compareList');
      compareList = Array.isArray(stored) ? stored : [];
    } catch (e) {}

    // 已在对比 → 直接移出
    if (this.data.inCompare) {
      var newList = compareList.filter(function (n) { return n !== name; });
      try { wx.setStorageSync('compareList', newList); } catch (e) {}
      try { getApp().globalData.compareList = newList; } catch (e) {}
      this.setData({ inCompare: false });
      wx.showToast({ title: '已移出对比', icon: 'none' });
      return;
    }

    // 存储里有但页面状态没同步（异常情况），补状态
    if (compareList.indexOf(name) >= 0) {
      this.setData({ inCompare: true });
      wx.showToast({ title: '已在对比', icon: 'none' });
      return;
    }

    // 满 3 个，引导去对比页管理
    if (compareList.length >= 3) {
      wx.showModal({
        title: '最多对比3个模型',
        content: '对比列表已满（3个），请先移除一个模型再添加。',
        confirmText: '去对比页',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) wx.switchTab({ url: '/pages/compare/compare' });
        },
      });
      return;
    }

    compareList.push(name);
    try { wx.setStorageSync('compareList', compareList); } catch (e) {}
    try { getApp().globalData.compareList = compareList; } catch (e) {}
    this.setData({ inCompare: true });
    wx.showToast({ title: '已加入对比', icon: 'success' });
  },

  goCompare: function () {
    wx.switchTab({ url: '/pages/compare/compare' });
  },

  // 从分享卡片冷启动时页面栈只有 1 页，navigateBack 会失败 → 兜底回首页
  goBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); },
    });
  },

  // 查看完整排行（分享落地页的关键出口）
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },
  showSourceInfo: function (e) {
    var cat = e.currentTarget.dataset.cat;
    var dim = e.currentTarget.dataset.dim;
    var catData = this.data.categoryList.find(function (c) { return c.id === cat; });
    if (!catData) return;
    var dimData = catData.dims.find(function (d) { return d.id === dim; });
    if (dimData) {
      this.setData({ showSourcePopup: true, sourceInfo: { cat: catData.name, dim: dimData.name, elo: dimData.elo, margin: dimData.margin, votes: dimData.votes } });
    }
  },
  closeSourcePopup: function () { this.setData({ showSourcePopup: false, sourceInfo: null }); },
  noop: function () {},
});
