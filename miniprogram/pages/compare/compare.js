// pages/compare/compare.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');
var store = require('../../utils/store.js');

// 模型名可能自带逗号（如 "Claude Opus 4.5 (High, 32K, 20251101)"），
// 所以不能「join(',') → decode → split(',')」。用 JSON 传递，接收端两种形态都能解析。
function encodeNames(names) {
  return encodeURIComponent(JSON.stringify(names || []));
}

function parseSharedNames(raw) {
  if (!raw) return [];
  var s = String(raw);
  var arr = null;
  try { arr = JSON.parse(s); } catch (e) {
    try { arr = JSON.parse(decodeURIComponent(s)); } catch (e2) {
      // 兼容旧版分享：空格串无法区分名字内逗号，尽力解析
      try { arr = decodeURIComponent(s).split(','); } catch (e3) { arr = s.split(','); }
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(function (n) { return typeof n === 'string' && n; }).slice(0, 3);
}

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
    activeGroupName: '',
  },

  // 转发：带上当前对比的模型（否则对方打开是空的）
  onShareAppMessage: function () {
    var models = this.data.models || [];
    var displayNames = models.map(function (m) { return m.displayName || m.name; });
    var rawNames = models.map(function (m) { return m.name; });
    var title = displayNames.length
      ? (this.data.activeGroupName
        ? '「' + this.data.activeGroupName + '」：' + displayNames.join(' vs ')
        : '我在对比：' + displayNames.join(' vs '))
      : '多个 AI 模型横向对比｜AI模型排行';
    return {
      title: title,
      path: '/pages/compare/compare?names=' + encodeNames(rawNames) + '&from=share',
    };
  },

  onShareTimeline: function () {
    var models = this.data.models || [];
    var displayNames = models.map(function (m) { return m.displayName || m.name; });
    var rawNames = models.map(function (m) { return m.name; });
    var title = displayNames.length
      ? (this.data.activeGroupName ? '「' + this.data.activeGroupName + '」：' : '') + displayNames.join(' vs ') + '｜AI模型对比'
      : 'AI模型横向对比';
    return {
      title: title,
      query: 'names=' + encodeNames(rawNames) + '&from=timeline',
    };
  },

  // 分享链接写入 storage 前先校验：只保留数据里真实存在的模型，去重。
  // 接收方本地包可能落后于云端（新模型只在云端），校验失败的参数先挂起，
  // 云端数据到达后由 applyCloudRankings 重试。
  applySharedNames: function (raw, authoritative) {
    var names = parseSharedNames(raw);
    if (!names.length) return false;
    var valid = [];
    var seen = {};
    var all = this.data.allModels || [];
    names.forEach(function (n) {
      var exists = false;
      for (var i = 0; i < all.length; i++) { if (all[i].name === n) { exists = true; break; } }
      if (exists && !seen[n]) { seen[n] = 1; valid.push(n); }
    });
    if (!valid.length) {
      if (!authoritative) this._pendingSharedNames = raw;
      return false;
    }
    try {
      wx.setStorageSync('compareList', valid);
      wx.removeStorageSync('activeGroupId');
    } catch (e) {}
    var app = getApp();
    if (app && app.globalData) app.globalData.compareList = valid;
    this._pendingSharedNames = (valid.length === names.length || authoritative) ? null : raw;
    return true;
  },

  onLoad: function (options) {
    var app = getApp();
    var cloudReady = !!(app.globalData && app.globalData.cloudRankings);
    if (cloudReady) rankings = app.globalData.cloudRankings;
    // 记录本次冷启动已处理的分享参数序号，避免 onShow 重复应用
    if (app && app.globalData) this._seenLaunchSeq = app.globalData.launchSeq || 0;

    var allModels = this.buildAllModels();
    this.setData({ allModels: allModels });

    // 从分享进入：参数校验后再写入 storage（名字可能带逗号）
    if (options && options.names) this.applySharedNames(options.names, cloudReady);
  },

  // 全量模型索引（picker 与分享参数校验共用）
  buildAllModels: function () {
    var modelMap = {};
    var data = (rankings && rankings.data) || {};
    Object.keys(data).forEach(function (catId) {
      var catData = data[catId];
      Object.keys(catData).forEach(function (dimId) {
        (catData[dimId] || []).forEach(function (m) {
          if (!m || !m.name || modelMap[m.name]) return;
          modelMap[m.name] = {
            name: m.name,
            displayName: meta.getDisplayName(m.name),
            provider: meta.getProviderDisplay(m.provider, m.name),
            elo: m.elo,
            votes: m.votes,
            price: m.price,
          };
        });
      });
    });
    return Object.keys(modelMap).map(function (key) { return modelMap[key]; })
      .sort(function (a, b) { return b.elo - a.elo; });
  },

  // 云端数据晚到：重建模型索引，重试挂起的分享参数，再按 storage 重载
  applyCloudRankings: function () {
    var app = getApp();
    if (!app || !app.globalData || !app.globalData.cloudRankings) return;
    if (rankings === app.globalData.cloudRankings) return;
    rankings = app.globalData.cloudRankings;
    this.setData({ allModels: this.buildAllModels() });
    if (this._pendingSharedNames) {
      var pending = this._pendingSharedNames;
      this._pendingSharedNames = null;
      this.applySharedNames(pending, true);
    }
    var ids = [];
    try { ids = wx.getStorageSync('compareList') || []; } catch (e) {}
    this.loadModels(ids);
  },

  onCloudDataReady: function () {
    this.applyCloudRankings();
  },

  // 保存当前对比组（可命名）
  saveCurrentGroup: function () {
    var models = (this.data.models || []).map(function (m) { return m.name; });
    if (!models.length) {
      wx.showToast({ title: '还没有添加模型', icon: 'none' });
      return;
    }
    var that = this;
    var suggest = store.nextGroupName();
    wx.showModal({
      title: '保存对比组',
      editable: true,
      placeholderText: '给这组对比起个名字',
      content: suggest,
      success: function (res) {
        if (!res.confirm) return;
        var name = (res.content || '').trim() || suggest;
        var r = store.saveGroup(name, models);
        if (r.ok) {
          try { wx.setStorageSync('activeGroupId', r.id); } catch (e) {}
          that.setData({ activeGroupName: name });
          wx.showToast({ title: '已保存', icon: 'success' });
        } else {
          wx.showModal({ title: '保存失败', content: r.msg, showCancel: false });
        }
      },
    });
  },

  onShow: function () {
    // 先吃云端数据（若已到达），再用最新索引处理分享参数
    var app = getApp();
    this.applyCloudRankings();

    // 热启动：从分享卡片切回已存在的小程序时不会走 onLoad，参数在 App.onShow 缓存
    if (app && app.globalData) {
      var seq = app.globalData.launchSeq || 0;
      if (seq !== this._seenLaunchSeq) {
        this._seenLaunchSeq = seq;
        var launch = app.globalData.launch;
        // 60 秒内的入口才算「本次分享」，避免之后打开对比页被陈旧入口覆盖
        var fresh = launch && launch.at && (Date.now() - launch.at < 60000);
        if (fresh && launch.path && launch.path.indexOf('pages/compare/compare') >= 0 &&
            launch.query && launch.query.names && (this.data.allModels || []).length) {
          this.applySharedNames(launch.query.names, !!(app.globalData.cloudRankings));
        }
      }
    }

    var compareIds = [];
    try { compareIds = wx.getStorageSync('compareList') || []; } catch (e) {}

    // 从「我的」载入的对比组：模型完全一致时才显示组名（分享标题用）
    var activeGroupName = '';
    var activeGroupId = '';
    try { activeGroupId = wx.getStorageSync('activeGroupId') || ''; } catch (e) {}
    if (activeGroupId) {
      var group = null;
      store.getGroups().forEach(function (g) { if (g.id === activeGroupId) group = g; });
      var same = group && group.models.length === compareIds.length &&
        group.models.every(function (n) { return compareIds.indexOf(n) >= 0; });
      if (same) {
        activeGroupName = group.name;
      } else {
        try { wx.removeStorageSync('activeGroupId'); } catch (e2) {}
      }
    }
    this.setData({ activeGroupName: activeGroupName });

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
            if (!modelData.providerRaw) modelData.providerRaw = found.provider || '';
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
      return { id: 'model-' + m.name, type: 'model', name: m.name, provider: meta.getProviderDisplay(m.providerRaw || '', m.name) };
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

  // 对比内容变了，已载入的对比组名不再适用
  clearGroupContext: function () {
    try { wx.removeStorageSync('activeGroupId'); } catch (e) {}
    this.setData({ activeGroupName: '' });
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
    this.clearGroupContext();
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
          that.clearGroupContext();
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
