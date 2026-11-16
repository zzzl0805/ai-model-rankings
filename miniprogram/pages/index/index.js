// pages/index/index.js
var localRankings = require('../../data/rankings.js');
var meta = require('../../utils/model-meta.js');
var rankings = localRankings;

Page({
  data: {
    statusBarHeight: 44,
    activeCategory: 'text',
    activeDimension: 'overall',
    categories: [],
    dimensions: [],
    allDimensions: [],
    models: [],
    displayModels: [],
    allDisplayModels: [],
    loading: false,
    medals: ['🥇', '🥈', '🥉'],
    searchText: '',
    sortOrder: 'desc',
    isAgent: false,
    showGuide: false,
    lastUpdated: '',
    dataSource: '本地', // 云端 or 本地
  },

  onLoad: function (options) {
    var that = this;
    var app = getApp();
    var source = '本地';
    if (app.globalData && app.globalData.cloudRankings) {
      rankings = app.globalData.cloudRankings;
      source = '云端';
    }
    try {
      var info = wx.getSystemInfoSync();
      that.setData({ statusBarHeight: info.statusBarHeight || 44 });
    } catch (e) {}

    that.setData({
      categories: rankings.categories,
      allDimensions: rankings.dimensions,
      lastUpdated: rankings.lastUpdated || '',
      dataSource: source,
    });

    that.checkFirstVisit();

    // 支持深链直达某个榜单：?category=coding&dim=overall
    var cat = (options && options.category) || '';
    var dim = (options && options.dim) || 'overall';
    var validCat = false;
    (rankings.categories || []).forEach(function (c) { if (c.id === cat) validCat = true; });
    that.loadRankings(validCat ? cat : 'text', dim);
  },

  // 首次访问：改成顶部可关闭提示条（原来整屏黑遮罩会挡住分享进来的新用户）
  checkFirstVisit: function () {
    try {
      var visited = wx.getStorageSync('hasVisited');
      if (!visited) {
        this.setData({ showGuide: true });
        wx.setStorageSync('hasVisited', true);
      }
    } catch (e) {}
  },

  closeGuide: function () {
    this.setData({ showGuide: false });
  },

  // 下拉刷新：用户手动拉一下就能同步云端最新数据
  onPullDownRefresh: function () {
    var that = this;
    try {
      var app = getApp();
      if (app && typeof app.loadCloudData === 'function') app.loadCloudData();
    } catch (e) {}
    setTimeout(function () {
      that.applyCloudData();
      wx.stopPullDownRefresh();
    }, 1200);
  },

  // 转发给好友：标题带榜单信息，落地到当前榜单
  onShareAppMessage: function () {
    var cat = this.data.activeCategory;
    var dim = this.data.activeDimension;
    var catInfo = null;
    (this.data.categories || []).forEach(function (c) { if (c.id === cat) catInfo = c; });
    var catName = catInfo ? catInfo.name : 'AI模型';
    var dimName = this.getDimName(dim);
    var top = (this.data.allDisplayModels || [])[0];
    var title = top
      ? catName + dimName + '第一是' + top.displayName + '｜AI模型排行'
      : catName + dimName + '排行｜AI模型排行';
    return {
      title: title,
      path: '/pages/index/index?category=' + cat + '&dim=' + dim + '&from=share',
    };
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    var cat = this.data.activeCategory;
    var dim = this.data.activeDimension;
    var top = (this.data.allDisplayModels || [])[0];
    return {
      title: top ? this.getCatName(cat) + '第一：' + top.displayName + '（' + this.data.lastUpdated + '）' : 'AI模型排行',
      query: 'category=' + cat + '&dim=' + dim + '&from=timeline',
    };
  },

  getCatName: function (catId) {
    var name = 'AI模型';
    (this.data.categories || []).forEach(function (c) { if (c.id === catId) name = c.name; });
    return name;
  },

  getDimName: function (dimId) {
    var names = { overall: '综合', coding: '编程', math: '数学', writing: '写作', hardprompts: '难题', instruction: '指令', expert: '专家', multiturn: '长对话' };
    return names[dimId] || '';
  },

  onShow: function () {
    // 云端数据可能刚加载完
    this.applyCloudData();
  },

  // 云端数据加载完成后，由 app.js 主动通知刷新
  onCloudDataReady: function () {
    this.applyCloudData();
  },

  applyCloudData: function () {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings && rankings !== app.globalData.cloudRankings) {
      rankings = app.globalData.cloudRankings;
      this.setData({ dataSource: '云端', lastUpdated: rankings.lastUpdated || '' });
      this.loadRankings(this.data.activeCategory, this.data.activeDimension);
    }
  },

  loadRankings: function (categoryId, dimensionId) {
    var that = this;
    that.setData({ loading: true });

    try {
      var catData = rankings.data[categoryId] || {};
      var isAgent = categoryId === 'agent';

      var availableDimensions = [];
      if (isAgent) {
        availableDimensions = [{ id: 'overall', name: '综合', icon: '🏆' }];
      } else {
        (rankings.dimensions || []).forEach(function (dim) {
          if (catData[dim.id] && catData[dim.id].length > 0) {
            availableDimensions.push(dim);
          }
        });
      }

      var models = catData[dimensionId] || [];

      that.setData({
        models: models,
        allDisplayModels: models.map(function(m) {
          // 把名称末尾的变体（如 "(High)"、"(Max)"）拆出来单独展示，
          // 否则模型名过长会被截断成 "Gemini 4 Carbon (…"
          var full = meta.getDisplayName(m.name);
          var vm = full.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          return {
            rank: m.rank,
            name: m.name,
            displayName: full,
            baseName: vm ? vm[1] : full,
            variant: vm ? vm[2] : '',
            provider: meta.getProviderCN(m.name),
            elo: m.elo,
            margin: m.margin,
            votes: m.votes,
            confidence: (function () {
              var c = meta.getConfidence(m.votes);
              // 列表空间紧张，标签缩短（详情页仍显示完整文案）
              return { color: c.color, label: (c.label || '').replace('样本', '') };
            })(),
            price: m.price,
            context: m.context,
          };
        }),
        displayModels: [],
        loading: false,
        activeCategory: categoryId,
        activeDimension: dimensionId,
        dimensions: availableDimensions,
        isAgent: isAgent,
        searchText: '',
      });
      that.applyFilter();
    } catch (e) {
      console.error('[Index] loadRankings error:', e);
      that.setData({ loading: false, models: [], displayModels: [] });
    }
  },

  onCategoryChange: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    this.loadRankings(id, 'overall');
  },

  onDimensionChange: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    this.loadRankings(this.data.activeCategory, id);
  },

  onSearchInput: function (e) {
    var text = (e.detail.value || '').toLowerCase().trim();
    this.setData({ searchText: text });
    this.applyFilter();
  },

  onSearchClear: function () {
    this.setData({ searchText: '' });
    this.applyFilter();
  },

  toggleSort: function () {
    var newOrder = this.data.sortOrder === 'desc' ? 'asc' : 'desc';
    this.setData({ sortOrder: newOrder });
    this.applyFilter();
  },

  applyFilter: function () {
    var allModels = this.data.allDisplayModels || [];
    var searchText = this.data.searchText;
    var sortOrder = this.data.sortOrder;

    var filtered = allModels;
    if (searchText) {
      filtered = allModels.filter(function (m) {
        return (m.displayName || '').toLowerCase().indexOf(searchText) >= 0 ||
               (m.provider || '').toLowerCase().indexOf(searchText) >= 0 ||
               (m.name || '').toLowerCase().indexOf(searchText) >= 0;
      });
    }

    var sorted = filtered.slice();
    if (sortOrder === 'asc') {
      sorted.reverse();
    }

    this.setData({ displayModels: sorted });
  },

  onRulesTap: function () {
    wx.navigateTo({ url: '/pages/methodology/methodology' });
  },

  onModelTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) {
      wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
    }
  },
});
