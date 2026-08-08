// pages/calculator/calculator.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');

function getAllPricedModels() {
  var modelMap = {};
  var data = rankings.data;
  Object.keys(data).forEach(function (catId) {
    var catData = data[catId];
    if (!catData || typeof catData !== 'object') return;
    Object.keys(catData).forEach(function (dimId) {
      var arr = catData[dimId];
      if (!arr || !arr.length) return;
      arr.forEach(function (m) {
        if (m && m.price && m.price.input > 0 && !modelMap[m.name]) {
          modelMap[m.name] = {
            name: m.name,
            displayName: meta.getDisplayName(m.name),
            provider: meta.getProviderCN(m.name),
            inputPrice: m.price.input,
            outputPrice: m.price.output,
            inputCNY: m.price.inputCNY,
            outputCNY: m.price.outputCNY,
            elo: m.elo,
          };
        }
      });
    });
  });
  return Object.keys(modelMap).map(function(k) { return modelMap[k]; }).sort(function (a, b) { return a.inputPrice - b.inputPrice; });
}

var ALL_MODELS = getAllPricedModels();

var SCENES = [
  { id: 'chat', name: '💬 日常聊天', input: 50, output: 50 },
  { id: 'coding', name: '💻 编程助手', input: 200, output: 200 },
  { id: 'writing', name: '✍ 写作', input: 100, output: 300 },
  { id: 'data', name: '📊 数据处理', input: 1000, output: 100 },
  { id: 'enterprise', name: '🏢 企业API', input: 5000, output: 5000 },
];

Page({
  data: {
    scenes: SCENES,
    activeScene: 'chat',
    customInput: '',
    customOutput: '',
    useCustom: false,
    results: [],
    filteredResults: [],
    calcSearch: '',
    activeProvider: 'all',
    providers: [
      { id: 'all', label: '全部' },
      { id: 'Anthropic', label: 'Anthropic' },
      { id: 'OpenAI', label: 'OpenAI' },
      { id: 'Google', label: 'Google' },
      { id: 'DeepSeek', label: 'DeepSeek' },
      { id: '智谱', label: '智谱' },
      { id: '月之暗面', label: 'Kimi' },
      { id: '阿里', label: '通义' },
      { id: '国产', label: '其他国产' },
    ],
    sortBy: 'cost',
    sortOrder: 'asc',
  },

  onLoad: function () {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings) rankings = app.globalData.cloudRankings;
    ALL_MODELS = getAllPricedModels();
    this.calculate(SCENES[0].input, SCENES[0].output);
  },

  onSceneTap: function (e) {
    var id = e.currentTarget.dataset.id;
    var scene = SCENES.find(function (s) { return s.id === id; });
    if (!scene) return;
    this.setData({ activeScene: id, useCustom: false, customInput: '', customOutput: '' });
    this.calculate(scene.input, scene.output);
  },

  onCustomInput: function (e) {
    this.setData({ customInput: e.detail.value, useCustom: true, activeScene: '' });
    this.calculateFromCustom();
  },

  onCustomOutput: function (e) {
    this.setData({ customOutput: e.detail.value, useCustom: true, activeScene: '' });
    this.calculateFromCustom();
  },

  calculateFromCustom: function () {
    var input = parseInt(this.data.customInput) || 0;
    var output = parseInt(this.data.customOutput) || 0;
    if (input > 0 && output > 0) {
      this.calculate(input, output);
    }
  },

  calculate: function (inputTokens, outputTokens) {
    var models = ALL_MODELS;
    var results = models.map(function (m) {
      var costUSD = (inputTokens / 1000) * m.inputPrice + (outputTokens / 1000) * m.outputPrice;
      costUSD = Math.round(costUSD * 100) / 100;
      return {
        name: m.name,
        displayName: m.displayName || m.name,
        provider: m.provider || '',
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
        monthlyCostUSD: costUSD,
        monthlyCostCNY: Math.round(costUSD * 7.2 * 100) / 100,
        elo: m.elo,
      };
    });
    this.setData({ results: results });
    this.applySort();
  },

  toggleSort: function () {
    this.setData({ sortOrder: this.data.sortOrder === 'asc' ? 'desc' : 'asc' });
    this.applySort();
  },

  switchSortBy: function (e) {
    this.setData({ sortBy: e.currentTarget.dataset.sort });
    this.applySort();
  },

  applySort: function () {
    var results = this.data.results.slice();
    var sortBy = this.data.sortBy;
    var order = this.data.sortOrder;
    results.sort(function (a, b) {
      var va = sortBy === 'cost' ? a.monthlyCostUSD : a.elo;
      var vb = sortBy === 'cost' ? b.monthlyCostUSD : b.elo;
      return order === 'asc' ? va - vb : vb - va;
    });
    var maxVal = results.length > 0 ? Math.max.apply(null, results.map(function (r) { return sortBy === 'cost' ? r.monthlyCostUSD : r.elo; })) : 1;
    results.forEach(function (r) {
      var val = sortBy === 'cost' ? r.monthlyCostUSD : r.elo;
      r.barWidth = maxVal > 0 ? (val / maxVal) * 100 : 0;
    });
    this.setData({ results: results });
    this.applyCalcSearch();
  },

  onCalcSearch: function (e) {
    this.setData({ calcSearch: (e.detail.value || '').toLowerCase().trim() });
    this.applyCalcSearch();
  },

  onCalcSearchClear: function () {
    this.setData({ calcSearch: '' });
    this.applyCalcSearch();
  },

  onProviderFilter: function (e) {
    this.setData({ activeProvider: e.currentTarget.dataset.provider });
    this.applyCalcSearch();
  },

  applyCalcSearch: function () {
    var results = this.data.results;
    var search = this.data.calcSearch;
    var provider = this.data.activeProvider;
    var DOMESTIC = ['深度求索', '智谱', '月之暗面', '阿里', '百度', '腾讯', '小米', '快手', '字节', 'MiniMax'];

    var filtered = results;
    if (provider !== 'all') {
      if (provider === '国产') {
        filtered = filtered.filter(function (r) { return DOMESTIC.some(function (d) { return (r.provider || '').indexOf(d) >= 0; }); });
      } else {
        filtered = filtered.filter(function (r) { return (r.provider || '').indexOf(provider) >= 0; });
      }
    }
    if (search) {
      filtered = filtered.filter(function (r) {
        return (r.displayName || '').toLowerCase().indexOf(search) >= 0 ||
               (r.provider || '').toLowerCase().indexOf(search) >= 0 ||
               (r.name || '').toLowerCase().indexOf(search) >= 0;
      });
    }
    this.setData({ filteredResults: filtered });
  },

  onResultTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },
});
