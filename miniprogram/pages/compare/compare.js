// pages/compare/compare.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');

Page({
  data: {
    models: [],
    compareSlots: [],
    compareGroups: [],
    showPicker: false,
    pickerSearch: '',
    filteredPickerModels: [],
    allModels: [],
    loading: false,
  },

  onLoad: function () {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings) rankings = app.globalData.cloudRankings;
    var modelMap = {};
    var data = rankings.data;

    Object.keys(data).forEach(function (catId) {
      var catData = data[catId];
      Object.keys(catData).forEach(function (dimId) {
        catData[dimId].forEach(function (m) {
          if (!modelMap[m.name]) {
            modelMap[m.name] = {
              name: m.name,
              displayName: meta.getDisplayName(m.name),
              provider: meta.getProviderCN(m.name),
              elo: m.elo,
              votes: m.votes,
              price: m.price,
            };
          }
        });
      });
    });

    var allModels = Object.keys(modelMap).map(function(key) {
      return modelMap[key];
    }).sort(function(a, b) { return b.elo - a.elo; });

    this.setData({ allModels: allModels });
  },

  onShow: function () {
    var compareIds = [];
    try { compareIds = wx.getStorageSync('compareList') || []; } catch (e) {}
    // 始终调用 loadModels：即使对比列表为空也要渲染「+」添加按钮，
    // 否则全新用户（storage 为空）页面没有入口，无法添加第一个模型
    this.loadModels(compareIds);
  },

  loadModels: function (names) {
    var that = this;
    var data = rankings.data;
    var models = [];
    var dimNames = { overall: '综合', coding: '编程', math: '数学', writing: '写作', hardprompts: '难题', instruction: '指令', expert: '专家', multiturn: '长对话' };

    names.forEach(function (name) {
      var modelData = { name: name, categories: {}, price: null, votes: 0, context: '' };
      Object.keys(data).forEach(function (catId) {
        var catData = data[catId];
        Object.keys(catData).forEach(function (dimId) {
          var found = null;
          for (var i = 0; i < catData[dimId].length; i++) {
            if (catData[dimId][i].name === name) { found = catData[dimId][i]; break; }
          }
          if (found) {
            if (!modelData.categories[catId]) modelData.categories[catId] = {};
            modelData.categories[catId][dimId] = found;
            if (!modelData.price && found.price && found.price.input > 0) modelData.price = found.price;
            if (!modelData.votes && found.votes) modelData.votes = found.votes;
            if (!modelData.context && found.context) modelData.context = found.context;
          }
        });
      });
      models.push(modelData);
    });

    var groups = [];
    Object.keys(data).forEach(function (catId) {
      var catInfo = null;
      for (var i = 0; i < (rankings.categories || []).length; i++) {
        if (rankings.categories[i].id === catId) { catInfo = rankings.categories[i]; break; }
      }
      var groupRows = [];
      Object.keys(dimNames).forEach(function (dimId) {
        var cells = [];
        var hasData = false;
        models.forEach(function (model) {
          var catData = model.categories[catId];
          var dimData = catData ? catData[dimId] : null;
          if (dimData) {
            cells.push({ value: dimData.elo, display: String(dimData.elo) });
            hasData = true;
          } else {
            cells.push({ value: 0, display: '-' });
          }
        });
        if (hasData) {
          var maxVal = Math.max.apply(null, cells.map(function (c) { return c.value; }));
          cells.forEach(function (c) { c.isBest = c.value === maxVal && c.value > 0; });
          groupRows.push({ key: catId + '-' + dimId, label: dimNames[dimId], cells: cells });
        }
      });
      if (groupRows.length > 0) {
        groups.push({ id: catId, name: catInfo ? (catInfo.icon + ' ' + catInfo.name) : catId, rows: groupRows, expanded: catId === 'text' });
      }
    });

    var priceRows = [
      { key: 'inputPrice', label: '输入价格($)', extract: function(m) { return m.price ? m.price.input : 0; }, format: function(v) { return v > 0 ? '$' + v + '/M' : '-'; }, lowerIsBetter: true },
      { key: 'outputPrice', label: '输出价格($)', extract: function(m) { return m.price ? m.price.output : 0; }, format: function(v) { return v > 0 ? '$' + v + '/M' : '-'; }, lowerIsBetter: true },
      { key: 'inputCNY', label: '输入价格(¥)', extract: function(m) { return m.price ? m.price.inputCNY : 0; }, format: function(v) { return v > 0 ? '¥' + v + '/M' : '-'; }, lowerIsBetter: true },
      { key: 'outputCNY', label: '输出价格(¥)', extract: function(m) { return m.price ? m.price.outputCNY : 0; }, format: function(v) { return v > 0 ? '¥' + v + '/M' : '-'; }, lowerIsBetter: true },
      { key: 'context', label: '上下文窗口', extract: function(m) { return m.context || ''; }, format: function(v) { return v || '-'; }, lowerIsBetter: false },
      { key: 'votes', label: '票数', extract: function(m) { return m.votes || 0; }, format: function(v) { return v > 0 ? String(v) : '-'; }, lowerIsBetter: false },
    ];

    var priceGroupRows = [];
    priceRows.forEach(function (pr) {
      var cells = [];
      var hasData = false;
      var values = [];
      models.forEach(function (model) {
        var val = pr.extract(model);
        cells.push({ value: val, display: pr.format(val), isBest: false });
        if (val && val !== '-' && val !== 0) { hasData = true; values.push(val); }
      });
      if (hasData && values.length > 1 && typeof values[0] === 'number') {
        var bestVal = pr.lowerIsBetter ? Math.min.apply(null, values) : Math.max.apply(null, values);
        cells.forEach(function (c) { if (c.value === bestVal && c.value > 0) c.isBest = true; });
      }
      if (hasData) priceGroupRows.push({ key: pr.key, label: pr.label, cells: cells });
    });
    if (priceGroupRows.length > 0) {
      groups.push({ id: 'price', name: '💰 费用对比', rows: priceGroupRows, expanded: true });
    }

    var slots = models.map(function (m) {
      return { id: 'model-' + m.name, type: 'model', name: m.name, provider: meta.getProviderCN(m.name) };
    });
    if (slots.length < 3) slots.push({ id: 'add', type: 'add' });

    that.setData({
      models: models,
      compareSlots: slots,
      compareGroups: groups,
      loading: false,
    });
  },

  toggleGroup: function (e) {
    var id = e.currentTarget.dataset.id;
    var groups = this.data.compareGroups.map(function (g) {
      if (g.id === id) g.expanded = !g.expanded;
      return g;
    });
    this.setData({ compareGroups: groups });
  },

  openPicker: function () {
    if (this.data.models.length >= 3) {
      wx.showToast({ title: '最多对比3个模型', icon: 'none' });
      return;
    }
    this.setData({ showPicker: true, pickerSearch: '' });
    this.updateFilteredModels();
  },

  closePicker: function () {
    this.setData({ showPicker: false, pickerSearch: '' });
  },

  onPickerSearch: function (e) {
    this.setData({ pickerSearch: e.detail.value || '' });
    this.updateFilteredModels();
  },

  updateFilteredModels: function () {
    var all = this.data.allModels;
    var q = this.data.pickerSearch.toLowerCase().trim();
    var currentNames = this.data.models.map(function (m) { return m.name; });

    var filtered = all;
    if (q) {
      filtered = all.filter(function (m) {
        return (m.displayName || '').toLowerCase().indexOf(q) >= 0 ||
               (m.provider || '').toLowerCase().indexOf(q) >= 0 ||
               (m.name || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    var result = filtered.map(function (m) {
      return {
        name: m.name,
        displayName: m.displayName || m.name,
        provider: m.provider,
        elo: m.elo,
        inCompare: currentNames.indexOf(m.name) >= 0
      };
    });
    this.setData({ filteredPickerModels: result });
  },

  onSelectModel: function (e) {
    var name = e.currentTarget.dataset.name;
    if (!name) return;
    if (this.data.models.length >= 3) {
      wx.showToast({ title: '最多对比3个模型', icon: 'none' });
      return;
    }
    var currentNames = this.data.models.map(function (m) { return m.name; });
    if (currentNames.indexOf(name) >= 0) return;

    currentNames.push(name);
    try { wx.setStorageSync('compareList', currentNames); } catch (e) {}
    this.closePicker();
    this.loadModels(currentNames);
  },

  removeModel: function (e) {
    var name = e.currentTarget.dataset.name;
    if (!name) return;
    var that = this;
    wx.showModal({
      title: '移除模型',
      content: '确定移除 ' + name + '？',
      success: function (res) {
        if (res.confirm) {
          var currentNames = that.data.models.map(function (m) { return m.name; });
          var newNames = currentNames.filter(function (n) { return n !== name; });
          try { wx.setStorageSync('compareList', newNames); } catch (e) {}
          that.loadModels(newNames);
        }
      },
    });
  },

  goToDetail: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  noop: function () {},
});
