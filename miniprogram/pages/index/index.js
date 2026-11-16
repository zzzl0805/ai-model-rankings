// pages/index/index.js
var localRankings = require('../../data/rankings.js');
var meta = require('../../utils/model-meta.js');
var rankings = localRankings;

// 国产厂商白名单（按厂商注册地）
// 数据里的 provider 字段取值见 docs/DATA_PIPELINE.md
var CN_PROVIDERS = {
  'alibaba': 1, 'ant-group': 1, 'aorizon': 1, 'baidu': 1, 'bytedance': 1,
  'deepseek': 1, 'hidream': 1, 'kling': 1, 'meituan': 1, 'minimax': 1,
  'moonshot': 1, 'shengshu': 1, 'skyreel': 1, 'stepfun': 1, 'tencent': 1,
  'unisound': 1, 'xiaomi': 1, 'zai': 1
};

function isDomestic(rawProvider) {
  return !!CN_PROVIDERS[String(rawProvider || '').toLowerCase()];
}

// 原始 provider 值 → 展示名（结论卡里用）
var PROVIDER_CN = {
  'alibaba': '阿里', 'ant-group': '蚂蚁', 'aorizon': '阿里', 'baidu': '百度', 'bytedance': '字节',
  'deepseek': 'DeepSeek', 'hidream': 'HiDream', 'kling': '快手', 'meituan': '美团', 'minimax': 'MiniMax',
  'moonshot': '月之暗面', 'shengshu': '生数', 'skyreel': '昆仑万维', 'stepfun': '阶跃', 'tencent': '腾讯',
  'unisound': '云知声', 'xiaomi': '小米', 'zai': '智谱',
  'google': 'Google', 'openai': 'OpenAI', 'anthropic': 'Anthropic', 'meta': 'Meta', 'xai': 'xAI',
  'mistral': 'Mistral', 'nvidia': 'NVIDIA', 'amazon': 'Amazon', 'cohere': 'Cohere',
  'microsoft': 'Microsoft', 'microsoft-ai': 'Microsoft', 'bfl': 'Black Forest',
  'luma-ai': 'Luma', 'runway': 'Runway', 'pika': 'Pika', 'ideogram': 'Ideogram',
  'recraft': 'Recraft', 'upstage': 'Upstage', 'perplexity': 'Perplexity', 'ibm': 'IBM',
  'allenai': 'AllenAI', 'poolside': 'Poolside', 'reflection': 'Reflection', 'reve': 'Reve',
  'genmo': 'Genmo', 'diffbot': 'Diffbot', 'inception-ai': 'Inception', 'krea': 'Krea',
  'leonardo-ai': 'Leonardo', 'kandinsky': 'Kandinsky', 'thinking machines': 'Thinking Machines'
};

function vendorName(raw) {
  var k = String(raw || '').toLowerCase();
  return PROVIDER_CN[k] || raw || '其他';
}

// 场景快捷入口：只做跳转，**不合并榜单**（不同类目的 Elo 尺度不可比）
var SCENES = [
  { id: 'coding', name: '💻 写代码', category: 'text', dim: 'coding' },
  { id: 'chat', name: '💬 日常对话', category: 'text', dim: 'overall' },
  { id: 'doc', name: '📄 长文档', category: 'document', dim: 'overall' },
  { id: 'vision', name: '👁 看图', category: 'vision', dim: 'overall' },
  { id: 'image', name: '🎨 生成图片', category: 'text-to-image', dim: 'overall' },
];

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
    region: 'all',      // all | cn | intl
    scenes: SCENES,
    conclusion: '',     // 一句话结论卡
    cnCount: 0,         // 当前榜单里的国产模型数
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
    var region = (options && options.region) || 'all';
    if (['all', 'cn', 'intl'].indexOf(region) < 0) region = 'all';
    var validCat = false;
    (rankings.categories || []).forEach(function (c) { if (c.id === cat) validCat = true; });
    that.setData({ region: region });
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
    // 优先用结论卡（更有信息量），带 region 让接收方看到同一视角
    var title = this.data.conclusion
      ? this.data.conclusion + '｜AI模型排行'
      : (top ? catName + dimName + '第一是' + top.displayName + '｜AI模型排行' : catName + dimName + '排行｜AI模型排行');
    return {
      title: title,
      path: '/pages/index/index?category=' + cat + '&dim=' + dim + '&region=' + (this.data.region || 'all') + '&from=share',
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
            providerRaw: m.provider || '',
            isCN: isDomestic(m.provider),
            delta: typeof m.delta === 'number' ? m.delta : 0,
            isNew: !!m.isNew,
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

  onRegionChange: function (e) {
    var region = e.currentTarget.dataset.region || 'all';
    this.setData({ region: region });
    this.applyFilter();
  },

  onSceneTap: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    var s = SCENES[idx];
    if (!s) return;
    this.loadRankings(s.category, s.dim);
  },

  // 生成一句话结论（同时也是分享标题），规则固定 + 永远有兜底
  buildConclusion: function (list, region) {
    if (!list || !list.length) return '';
    var catName = this.getCatName(this.data.activeCategory);
    var dimName = this.getDimName(this.data.activeDimension);
    var prefix = catName + (dimName && dimName !== '综合' ? '·' + dimName : '');

    if (region === 'cn') {
      return '国产模型' + prefix + '前 3：' + list.slice(0, 3).map(function (m) { return m.baseName; }).join('、');
    }

    var top1 = list[0];
    var cnList = list.filter(function (m) { return m.isCN; });
    var topVendor = list.slice(0, 3).map(function (m) { return m.providerRaw; });
    var vendorCount = {};
    topVendor.forEach(function (v) { if (v) vendorCount[v] = (vendorCount[v] || 0) + 1; });
    var dominant = Object.keys(vendorCount).filter(function (k) { return vendorCount[k] >= 2; })[0];

    // 规则 1：某厂商占据前 3 中的 2 席以上
    if (dominant) {
      return prefix + '前 3 有 ' + vendorCount[dominant] + ' 个来自 ' + vendorName(dominant) + '，榜首 ' + top1.baseName;
    }
    // 规则 2：榜首海外 + 有国产上榜
    if (!top1.isCN && cnList.length) {
      var bestCN = cnList[0];
      return prefix + '榜首 ' + top1.baseName + '，国产最强 ' + bestCN.baseName + ' 排第 ' + bestCN.rank;
    }
    // 规则 3：榜首是国产
    if (top1.isCN) {
      var top10CN = list.slice(0, 10).filter(function (m) { return m.isCN; }).length;
      return prefix + '榜首 ' + top1.baseName + '，前 10 里有 ' + top10CN + ' 个国产模型';
    }
    // 兜底：永远可用
    return prefix + '榜首 ' + top1.baseName + '（' + top1.elo + ' 分）';
  },

  applyFilter: function () {
    var allModels = this.data.allDisplayModels || [];
    var searchText = this.data.searchText;
    var sortOrder = this.data.sortOrder;
    var region = this.data.region;

    var filtered = allModels;

    // 国产 / 海外视角
    if (region === 'cn') {
      filtered = filtered.filter(function (m) { return m.isCN; });
    } else if (region === 'intl') {
      filtered = filtered.filter(function (m) { return !m.isCN; });
    }

    if (searchText) {
      filtered = filtered.filter(function (m) {
        return (m.displayName || '').toLowerCase().indexOf(searchText) >= 0 ||
               (m.provider || '').toLowerCase().indexOf(searchText) >= 0 ||
               (m.name || '').toLowerCase().indexOf(searchText) >= 0;
      });
    }

    var sorted = filtered.slice();
    if (sortOrder === 'asc') {
      sorted.reverse();
    }

    this.setData({
      displayModels: sorted,
      conclusion: this.buildConclusion(sorted, region),
      cnCount: allModels.filter(function (m) { return m.isCN; }).length,
    });
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
