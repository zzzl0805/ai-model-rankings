// pages/recommend/recommend.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');

var SCENES = [
  { id: 'chat', name: '日常对话', icon: '💬', category: 'text', dimension: 'overall', desc: '通用聊天问答', reason: '综合文本能力最强' },
  { id: 'code', name: '写代码', icon: '💻', category: 'webdev', dimension: 'overall', desc: '编程、调试、建站', reason: 'Web开发能力最强' },
  { id: 'reasoning', name: '数学推理', icon: '🧮', category: 'text', dimension: 'math', desc: '数学、逻辑、科学', reason: '数学推理最强' },
  { id: 'writing', name: '写作创作', icon: '✍', category: 'text', dimension: 'writing', desc: '文案、故事、创意', reason: '创意写作最强' },
  { id: 'hard', name: '复杂难题', icon: '🌶', category: 'text', dimension: 'hardprompts', desc: '高难度任务', reason: '处理复杂任务最强' },
  { id: 'agent', name: 'Agent工具', icon: '🤖', category: 'agent', dimension: 'overall', desc: '工具调用、自动化', reason: 'Agent能力最强', isAgent: true },
  { id: 'vision', name: '图片理解', icon: '👁', category: 'vision', dimension: 'overall', desc: '看图、OCR、视觉', reason: '视觉理解最强' },
  { id: 'doc', name: '文档处理', icon: '📄', category: 'document', dimension: 'overall', desc: '读文档、总结', reason: '文档理解最强' },
];

Page({
  goBudget: function () { wx.navigateTo({ url: '/pages/budget/budget' }); },

  onLoad: function () {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings) rankings = app.globalData.cloudRankings;
  },

  data: {
    scenes: SCENES,
    selectedScene: null,
    recommendedModels: [],
    maxCount: 5,
    loading: false,
    medals: ['🥇', '🥈', '🥉'],
  },

  onSceneTap: function (e) {
    var sceneId = e.currentTarget.dataset.id;
    var scene = null;
    for (var i = 0; i < SCENES.length; i++) {
      if (SCENES[i].id === sceneId) { scene = SCENES[i]; break; }
    }
    if (!scene) return;

    this.setData({ selectedScene: scene, loading: true });

    try {
      var catData = rankings.data[scene.category] || {};
      var models = catData[scene.dimension] || [];
      var top = models.slice(0, this.data.maxCount).map(function (m) {
        return {
          rank: m.rank,
          name: m.name,
          displayName: meta.getDisplayName(m.name),
          provider: meta.getProviderDisplay(m.provider, m.name),
          confidence: meta.getConfidence(m.votes),
          elo: m.elo,
          margin: m.margin,
          votes: m.votes,
          price: m.price,
          context: m.context,
          isAgent: scene.isAgent,
        };
      });
      this.setData({ recommendedModels: top, loading: false });
    } catch (err) {
      this.setData({ loading: false, recommendedModels: [] });
    }
  },

  onCountChange: function (e) {
    var count = parseInt(e.currentTarget.dataset.count);
    if (!count) return;
    this.setData({ maxCount: count });
    if (this.data.selectedScene) {
      var scene = this.data.selectedScene;
      var catData = rankings.data[scene.category] || {};
      var models = catData[scene.dimension] || [];
      this.setData({ recommendedModels: models.slice(0, count).map(function(m) {
        return {
          rank: m.rank, name: m.name, displayName: meta.getDisplayName(m.name),
          provider: meta.getProviderDisplay(m.provider, m.name), confidence: meta.getConfidence(m.votes),
          elo: m.elo, margin: m.margin, votes: m.votes, price: m.price, context: m.context,
          isAgent: scene.isAgent,
        };
      })});
    }
  },

  onBackToScenes: function () {
    this.setData({ selectedScene: null, recommendedModels: [] });
  },

  onModelTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  goToCompare: function () {
    var names = this.data.recommendedModels.slice(0, 3).map(function (m) { return m.name; });
    try { wx.setStorageSync('compareList', names); } catch (e) {}
    wx.showToast({ title: '已加入对比', icon: 'success', duration: 1200 });
    setTimeout(function () { wx.switchTab({ url: '/pages/compare/compare' }); }, 800);
  },
});
