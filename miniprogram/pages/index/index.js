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

  onLoad: function () {
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
    that.loadRankings('text', 'overall');
  },

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
          return {
            rank: m.rank,
            name: m.name,
            displayName: meta.getDisplayName(m.name),
            provider: meta.getProviderCN(m.name),
            elo: m.elo,
            margin: m.margin,
            votes: m.votes,
            confidence: meta.getConfidence(m.votes),
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
