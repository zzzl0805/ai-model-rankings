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

// 价格格式化：去掉多余的小数位（2.00 → 2，0.43 → 0.43）
function fmtNum(v) {
  return (Number(v) || 0).toFixed(2);  // 全列统一两位，避免 2.87 / 20 / 8.00 混排
}

// 说明：场景快捷入口已移除（与分类/维度功能重叠，且增加视觉层级）。
// 不同类目的 Elo 尺度不可比，任何"跨类目合并"的榜单都不做。

Page({
  data: {
    statusBarHeight: 44,
    menuRight: 110,
    activeCategory: 'text',
    activeDimension: 'overall',
    categories: [],
    dimensions: [],
    allDimensions: [],
    models: [],
    displayModels: [],
    allDisplayModels: [],
    loading: false,
    searchText: '',
    sortOrder: 'desc',
    isAgent: false,
    showGuide: false,
    lastUpdated: '',
    dataSource: '本地', // 云端 or 本地
    region: 'all',      // all | cn | intl
    conclusion: '',     // 一句话结论卡
    cnCount: 0,         // 当前榜单里的国产模型数
    priceUnit: '$',     // 价格列币种（按视图统一）
    exchangeRate: 0,    // USD→CNY 汇率（来自 pipeline）
    exchangeRateDate: '',
    exchangeRateFallback: false,
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
      // 顶部右侧有微信胶囊按钮（返回/更多），自定义导航栏需避开它
      var menuRight = 110;
      try {
        var rect = wx.getMenuButtonBoundingClientRect();
        if (rect && rect.left) menuRight = Math.round(info.windowWidth - rect.left + 8);
      } catch (e2) {}
      that.setData({ statusBarHeight: info.statusBarHeight || 44, menuRight: menuRight });
    } catch (e) {}

    that.setData({
      categories: rankings.categories,
      allDimensions: rankings.dimensions,
      lastUpdated: rankings.lastUpdated || '',
      dataSource: source,
      exchangeRate: rankings.exchangeRate || 0,
      exchangeRateDate: rankings.exchangeRateDate || '',
      exchangeRateFallback: !!rankings.exchangeRateFallback,
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
      this.setData({
        dataSource: '云端',
        lastUpdated: rankings.lastUpdated || '',
        exchangeRate: rankings.exchangeRate || 0,
        exchangeRateDate: rankings.exchangeRateDate || '',
        exchangeRateFallback: !!rankings.exchangeRateFallback,
      });
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

      // 综合榜名次映射（用于筛选态下显示「综合第 N」）
      // 注意：不能用当前维度的 rank —— 编程榜第 13 名在综合榜可能是第 31 名
      var overallRank = {};
      (catData.overall || []).forEach(function (x) { overallRank[x.name] = x.rank; });

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
            overallRank: overallRank[m.name] || 0,
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


  // 生成一句话结论（同时也是分享标题），规则固定 + 永远有兜底
  buildConclusion: function (list, region) {
    if (!list || !list.length) return '';
    var catName = this.getCatName(this.data.activeCategory);
    var dimName = this.getDimName(this.data.activeDimension);
    var prefix = catName + (dimName && dimName !== '综合' ? '·' + dimName : '');

    if (region === 'cn') {
      // 与表格同源：取 rank ≤ 3 的模型（不使用 slice，避免与名次规则脱节）
      var top3 = list.filter(function (m) { return m.rank <= 3; });
      return '国产模型' + prefix + '前 3：' + top3.map(function (m) { return m.baseName; }).join('、');
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

  // 首屏常驻口径提示（一行）：协方差/跨榜/价格来源
  buildCtxNote: function (region, renumbered, allProxy) {
    var parts = [];
    if (this.data.activeDimension && this.data.activeDimension !== 'overall') {
      parts.push('子榜独立计分');
    }
    if (renumbered) parts.push('名次按筛选重排');
    parts.push('CI 重叠 ≠ 差异显著');
    if (allProxy) parts.push('均为代理价');
    if (this.data.exchangeRate) {
      var fx = '≈ 汇率 ' + this.data.exchangeRate;
      if (this.data.exchangeRateDate) fx += '（' + this.data.exchangeRateDate.slice(5) + '）';
      if (this.data.exchangeRateFallback) fx += ' 估算';
      parts.push(fx);
    }
    return parts.join(' · ');
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

    // 筛选/搜索后重新编号：用户看的是"国产榜"，主排名应是 1..N，
    // 全球排名保留在 meta 行（如"全球第 13"）
    var renumber = (region !== 'all' || !!searchText);
    var catNameForBadge = this.getCatName(this.data.activeCategory);
    sorted = sorted.map(function (m, i) {
      var copy = {};
      for (var k in m) copy[k] = m[k];
      copy.globalRank = renumber ? (m.overallRank || 0) : 0;
      copy.badgeRank = copy.globalRank ? (catNameForBadge + '综合 #' + copy.globalRank) : '';
      copy.origRank = renumber ? i + 1 : m.rank;
      copy.eloText = (Math.round(m.elo * 10) / 10).toFixed(1);
      copy.votesText = m.votes >= 1000 ? (m.votes / 1000).toFixed(1) + 'k' : String(m.votes || '');
      // 整列统一币种，保证可比：国产视图用 ¥，其余用 $
      copy.priceProxy = /openrouter/i.test((m.price && m.price.source) || '');
      if (m.price && m.price.input > 0) {
        var nativeCny = m.price.currency === 'CNY';
        var approxCny = region === 'cn' ? !nativeCny : nativeCny;
        var pre = approxCny ? '≈' : '';
        if (region === 'cn') {
          copy.priceText = pre + '¥' + fmtNum(m.price.inputCNY) + ' / ' + pre + '¥' + fmtNum(m.price.outputCNY);
        } else {
          copy.priceText = pre + '$' + fmtNum(m.price.input) + ' / ' + pre + '$' + fmtNum(m.price.output);
        }
        copy.priceProxy = /openrouter/i.test((m.price && m.price.source) || '');
      } else {
        copy.priceText = '';
        copy.priceProxy = false;
      }
      copy.tie = false;
      copy.lowSample = (m.votes > 0 && m.votes < 1000);
      copy.rank = copy.origRank;
      return copy;
    });

    // 误差区间重叠 → 并列（避免把统计噪声当成确定名次）
    // 用标准的 competition ranking：并列者共享靠前的名次，后续跳号
    // 名次保持严格递增（不做并列重编号）。
    // 统计不确定性由每行的 ±95%CI 表达；脚注说明"名次按点估计，重叠不能直接判定不显著"。
    // 这样规则全局一致，不会出现"前 3 并列、第 5 名不并列"的自相矛盾。

    var pricedRows = sorted.filter(function (x) { return x.price && x.price.input > 0; });
    var aProxy = pricedRows.length > 0 && pricedRows.every(function (x) { return x.priceProxy; });

    this.setData({
      displayModels: sorted,
      priceUnit: region === 'cn' ? '¥' : '$',
      allProxy: aProxy,
      ctxNote: this.buildCtxNote(region, renumber, aProxy),
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
