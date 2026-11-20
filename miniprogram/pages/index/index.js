// pages/index/index.js
var localRankings = require('../../data/rankings.js');
var meta = require('../../utils/model-meta.js');
var rankings = localRankings;

// 国产厂商判断统一走 model-meta（落地页共用同一份白名单）
var isDomestic = meta.isDomestic;

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
    generatingPoster: false,
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

    // 记录冷启动已处理的分享参数序号（onShow 避免重复应用）
    try {
      var app2 = getApp();
      if (app2 && app2.globalData) that._seenLaunchSeq = app2.globalData.launchSeq || 0;
    } catch (e3) {}

    // 支持深链直达某个榜单：?category=coding&dim=overall
    that.applyDeepLink(options);
  },

  // 解析分享/小程序码参数，切换到对应榜单
  applyDeepLink: function (options) {
    options = options || {};
    var cat = options.category || '';
    var dim = options.dim || 'overall';
    var region = options.region || 'all';

    // 小程序码：scene='c=7&d=0&r=1'（类目/维度按下标编码，控制在 32 字符内）
    if (options.scene) {
      var that = this;
      var scene = String(options.scene);
      try { scene = decodeURIComponent(scene); } catch (e) {}
      scene.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        var k = kv[0];
        var v = kv[1] || '';
        if (k === 'c') {
          var ci = parseInt(v, 10);
          var cats = that.data.categories || [];
          if (ci >= 0 && ci < cats.length) cat = cats[ci].id;
        } else if (k === 'd') {
          var di = parseInt(v, 10);
          var dims = that.data.allDimensions || [];
          if (di >= 0 && di < dims.length) dim = dims[di].id;
        } else if (k === 'r') {
          region = v === '1' ? 'cn' : (v === '2' ? 'intl' : 'all');
        }
      });
    }
    if (['all', 'cn', 'intl'].indexOf(region) < 0) region = 'all';
    var validCat = false;
    (this.data.categories || []).forEach(function (c) { if (c.id === cat) validCat = true; });
    this.setData({ region: region });
    this.loadRankings(validCat ? cat : 'text', dim);
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
    // 搜索态不能用筛选结论（接收方打开的是完整榜），改用中性标题
    var title;
    if (this.data.searchText) {
      title = 'AI模型排行｜搜索「' + this.data.searchText + '」看完整榜单';
    } else {
      title = this.data.conclusion
        ? this.data.conclusion + '｜AI模型排行'
        : (top ? catName + dimName + '第一是' + top.displayName + '｜AI模型排行' : catName + dimName + '排行｜AI模型排行');
    }
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
    var regionPrefix = this.data.region === 'cn' ? '国产' : (this.data.region === 'intl' ? '海外' : '');
    var dimName = this.getDimName(dim);
    var title;
    if (this.data.searchText) {
      title = 'AI模型排行｜按能力查主流大模型';
    } else {
      title = top
        ? regionPrefix + this.getCatName(cat) + (dimName && dimName !== '综合' ? '·' + dimName : '') + '第一：' + top.displayName + '（' + this.data.lastUpdated + '）'
        : 'AI模型排行';
    }
    return {
      title: title,
      query: 'category=' + cat + '&dim=' + dim + '&region=' + (this.data.region || 'all') + '&from=timeline',
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

  onMineTap: function () {
    wx.navigateTo({ url: '/pages/mine/mine' });
  },

  onMoreBoardTap: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url: url });
  },

  // 生成榜单海报：TOP10 + 结论 + 落款
  onGeneratePoster: function () {
    if (this.data.generatingPoster) return;

    // 搜索/升序时列表是筛选子集或被重排，不能当完整榜单对外传播
    if (this.data.searchText) {
      wx.showToast({ title: '请先清空搜索再生成', icon: 'none' });
      return;
    }
    if (this.data.sortOrder === 'asc') {
      wx.showToast({ title: '请恢复降序再生成', icon: 'none' });
      return;
    }

    var that = this;
    var list = (this.data.displayModels || []).slice(0, 10);
    if (!list.length) return;

    var cat = this.data.activeCategory;
    var dim = this.data.activeDimension;
    var catName = this.getCatName(cat);
    var dimName = this.getDimName(dim);
    var regionPrefix = this.data.region === 'cn' ? '国产' : (this.data.region === 'intl' ? '海外' : '');
    var title = regionPrefix + catName + (dimName && dimName !== '综合' ? '·' + dimName : '') + '榜';
    var subtitle = this.data.isAgent ? '按净提升率排名' : ('按' + (dimName || '综合') + '能力排名');
    var unit = this.data.isAgent ? '%' : '';

    var rows = list.map(function (m, i) {
      return {
        rank: m.origRank || (i + 1),
        name: m.displayName,
        provider: m.provider,
        elo: m.eloText + unit,
        priceText: m.priceText ? (m.priceText + '/M') : '',
      };
    });

    // 小程序码落点：榜单一致（编程/国产/画图用落地页，其余用 scene 编码回首页）
    var qrPage = 'pages/index/index';
    var qrScene = '';
    if (cat === 'text' && dim === 'coding' && this.data.region === 'all') {
      qrPage = 'pages/board-coding/board-coding';
    } else if (cat === 'text' && dim === 'overall' && this.data.region === 'cn') {
      qrPage = 'pages/board-cn/board-cn';
    } else if (cat === 'text-to-image' && dim === 'overall' && this.data.region === 'all') {
      qrPage = 'pages/board-image/board-image';
    } else {
      var cats = this.data.categories || [];
      var dims = this.data.allDimensions || [];
      var ci = 0;
      var di = 0;
      cats.forEach(function (c, i) { if (c.id === cat) ci = i; });
      dims.forEach(function (d, i) { if (d.id === dim) di = i; });
      var regionCode = this.data.region === 'cn' ? '1' : (this.data.region === 'intl' ? '2' : '0');
      qrScene = 'c=' + ci + '&d=' + di + '&r=' + regionCode;
    }

    var poster = this.selectComponent('#poster');
    if (!poster) {
      wx.showToast({ title: '生成组件未就绪', icon: 'none' });
      return;
    }

    this.setData({ generatingPoster: true });
    poster.generate({
      title: title,
      subtitle: subtitle,
      rows: rows,
      conclusion: this.data.conclusion || '',
      updated: this.data.lastUpdated || '',
      qrPage: qrPage,
      qrScene: qrScene,
    }, function (err, path) {
      that.setData({ generatingPoster: false });
      if (err) {
        console.error('[Index] poster error:', err);
        wx.showToast({ title: '生成失败，请重试', icon: 'none' });
        return;
      }
      that.usePoster(path);
    });
  },

  usePoster: function (path) {
    wx.showActionSheet({
      itemList: ['保存到相册', '分享图片'],
      success: function (res) {
        if (res.tapIndex === 0) {
          wx.saveImageToPhotosAlbum({
            filePath: path,
            success: function () { wx.showToast({ title: '已保存到相册' }); },
            fail: function (e) {
              var msg = (e && e.errMsg) || '';
              // 112：后台《用户隐私保护指引》未声明「相册（仅写入）」，只能预览后长按保存
              if (e && e.errno === 112) {
                wx.previewImage({ urls: [path] });
                wx.showToast({ title: '请长按图片保存', icon: 'none' });
                return;
              }
              if (msg.indexOf('auth') >= 0) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '保存榜单图片需要访问相册，请在设置中允许。',
                  confirmText: '去设置',
                  success: function (r) { if (r.confirm) wx.openSetting(); },
                });
              } else {
                wx.previewImage({ urls: [path] });
              }
            },
          });
        } else if (res.tapIndex === 1) {
          if (wx.showShareImageMenu) {
            wx.showShareImageMenu({
              path: path,
              fail: function () { wx.previewImage({ urls: [path] }); },
            });
          } else {
            wx.previewImage({ urls: [path] });
          }
        }
      },
    });
  },

  onShow: function () {
    var app = getApp();
    // 落地页「查看完整榜单」通过 globalData 传参（switchTab 不能带参数）
    if (app && app.globalData && app.globalData.pendingBoard) {
      var pending = app.globalData.pendingBoard;
      app.globalData.pendingBoard = null;
      this.applyDeepLink(pending);
    }

    // 热启动：从分享卡片/小程序码切回已存在的首页时不会走 onLoad
    if (app && app.globalData) {
      var seq = app.globalData.launchSeq || 0;
      if (seq !== this._seenLaunchSeq) {
        this._seenLaunchSeq = seq;
        var launch = app.globalData.launch;
        // 60 秒内的入口才算「本次分享」，避免之后回前台被陈旧入口拉回旧榜单
        var fresh = launch && launch.at && (Date.now() - launch.at < 60000);
        if (fresh && launch.path && launch.path.indexOf('pages/index/index') >= 0 && launch.query) {
          var q = launch.query;
          if (q.category || q.dim || q.region || q.scene) this.applyDeepLink(q);
        }
      }
    }
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
            provider: meta.getProviderDisplay(m.provider, m.name),
            providerRaw: m.provider || '',
            overallRank: overallRank[m.name] || 0,
            isCN: isDomestic(m.provider, m.name),
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
