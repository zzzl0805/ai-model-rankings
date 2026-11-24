// pages/budget/budget — 按场景与月预算选模型（同时是搜索落地页）
var SCENES = require('../../utils/scenes.js');
var priced = require('../../utils/priced-models.js');

Page({
  data: {
    scenes: SCENES,
    sceneId: 'coding',
    sceneName: '编程',
    usageText: '每月 200 万输入 + 200 万输出',
    budgets: [50, 100, 300, 1000],
    budget: 100,
    customBudget: '',
    priority: 'capability',
    results: [],
    overBudget: false,
    minCost: 0,
    updated: '',
    modelCount: 0,
    loading: true,
  },

  onLoad: function () {
    this.run();
  },

  onCloudDataReady: function () {
    this.run();
  },

  onSceneTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var scene = null;
    SCENES.forEach(function (s) { if (s.id === id) scene = s; });
    if (!scene) return;
    this.setData({
      sceneId: id,
      sceneName: scene.name,
      usageText: '每月 ' + scene.input + ' 万输入 + ' + scene.output + ' 万输出',
    });
    this.run();
  },

  onBudgetTap: function (e) {
    var b = Number(e.currentTarget.dataset.budget) || 0;
    this.setData({ budget: b, customBudget: '' });
    this.run();
  },

  onCustomBudget: function (e) {
    var v = parseInt(e.detail.value, 10) || 0;
    this.setData({ customBudget: e.detail.value, budget: v });
    if (v > 0) this.run();
  },

  onPriorityTap: function (e) {
    this.setData({ priority: e.currentTarget.dataset.priority || 'capability' });
    this.run();
  },

  run: function () {
    var scene = null;
    SCENES.forEach(function (s) { if (s.id === this.data.sceneId) scene = s; }, this);
    if (!scene) scene = SCENES[0];
    var budget = Number(this.data.budget) || 0;
    if (budget <= 0) return;
    var r = priced.recommend(scene, budget, this.data.priority);
    this.setData({
      results: r.items,
      overBudget: r.overBudget,
      minCost: r.minCost,
      updated: r.updated,
      modelCount: r.modelCount,
      loading: false,
    });
  },

  onModelTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  goRanking: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage: function () {
    var names = this.data.results.map(function (x) { return x.displayName; });
    return {
      title: '¥' + this.data.budget + '/月 ' + this.data.sceneName + '推荐：' + (names.join(' / ') || 'AI模型排行'),
      path: '/pages/budget/budget?from=share',
    };
  },

  onShareTimeline: function () {
    return {
      title: '¥' + this.data.budget + '/月 ' + this.data.sceneName + ' AI 模型推荐',
      query: 'from=timeline',
    };
  },
});
