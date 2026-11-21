// pages/detail/detail.js
var localRankings = require('../../data/rankings.js');
var rankings = localRankings;
var meta = require('../../utils/model-meta.js');
var store = require('../../utils/store.js');
var presentImage = require('../../utils/share-image.js');
var catalogUtil = require('../../utils/catalog.js');

var DIM_NAMES = { overall: '综合', coding: '编程', math: '数学', writing: '写作', hardprompts: '难题', instruction: '指令', expert: '专家', multiturn: '长对话' };
var VISUAL_CATS = { 'text-to-image': 1, 'image-edit': 1, 'text-to-video': 1, 'image-to-video': 1, 'video-edit': 1 };

function round1(v) { return Math.round((Number(v) || 0) * 10) / 10; }
function fmtPrice(v) {
  v = Number(v) || 0;
  return v > 0 && v < 0.01 ? v.toFixed(3) : v.toFixed(2);
}

function getRankings() {
  try {
    var app = getApp();
    if (app.globalData && app.globalData.cloudRankings) return app.globalData.cloudRankings;
  } catch(e) {}
  return rankings;
}

Page({
  data: {
    modelName: '',
    displayName: '',
    provider: '',
    loading: true,
    votes: 0,
    confidence: {},
    review: '',
    price: null,
    context: '',
    categoryList: [],
    showSourcePopup: false,
    sourceInfo: null,
    rankInOverall: 0,
    overallElo: 0,
    primaryRank: 0,
    primaryCatId: '',
    primaryElo: 0,
    updatedDate: '',
    shareTitle: '',
    inCompare: false,
    isFav: false,
    primaryCatLabel: '',
    variantLabel: '',
    generatingPoster: false,
    primaryIsAgent: false,
    scoreLabel: '综合 Elo',
    companyName: '',
    companySummary: '',
    companyMeta: '',
    companyWebsite: '',
    familyName: '',
    familyDescription: '',
    releaseDateText: '',
    statusText: '',
    licenseText: '',
    openWeightsText: '',
    contextText: '',
    maxOutputText: '',
    inputModsText: '',
    outputModsText: '',
    knowledgeCutoff: '',
    apiModelId: '',
    docsUrl: '',
    summary: '',
    strengths: [],
    bestFor: [],
    limitations: [],
    categoryRanks: [],
    dimensions: [],
    familyVariants: [],
    peers: [],
    timeline: [],
    priceView: {},
    archivePending: false,
    hasSpecs: false,
    specNote: '',
    catalogSources: [],
    verifiedAt: '',
  },

  onLoad: function (options) {
    var app = getApp();
    if (app.globalData && app.globalData.rankingsData) {
      rankings = app.globalData.rankingsData;
    }
    var name = options.name ? decodeURIComponent(options.name) : '';
    // 小程序码：scene='m=<模型名，空格用 + 代替>'
    if (!name && options.scene) {
      try {
        var scene = String(options.scene);
        try { scene = decodeURIComponent(scene); } catch (e0) {}
        if (scene.indexOf('m=') === 0) name = scene.slice(2).replace(/\+/g, ' ');
      } catch (e) {}
    }
    if (!name) {
      this.setData({ loading: false });
      return;
    }
    this.loadModel(name);
  },

  loadModel: function (name) {
    var that = this;
    var r = getRankings();
    var data, categories;

    try {
      data = r.data || r;
      categories = r.categories || [];
    } catch(e) {
      that.setData({ loading: false, displayName: name });
      return;
    }

    var catScores = {};
    var price = null;
    var votes = 0;
    var context = '';
    var rawProvider = '';

    try {
      Object.keys(data).forEach(function (catId) {
        var catData = data[catId];
        if (!catData || typeof catData !== 'object') return;
        Object.keys(catData).forEach(function (dimId) {
          var arr = catData[dimId];
          if (!arr || !arr.length) return;
          for (var i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].name === name) {
              if (!catScores[catId]) catScores[catId] = {};
              catScores[catId][dimId] = arr[i];
              if (!price && arr[i].price && arr[i].price.input > 0) price = arr[i].price;
              if (!votes && arr[i].votes) votes = arr[i].votes;
              if (!context && arr[i].context) context = arr[i].context;
              if (!rawProvider) rawProvider = arr[i].provider || '';
              break;
            }
          }
        });
      });
    } catch(e) {
      console.error('[Detail] search error:', e);
    }

    var catInfoById = {};
    categories.forEach(function (c) { catInfoById[c.id] = c; });

    // 每个类目的 overall 名次/百分位（不做跨类目 Elo 比较）
    var categoryRanks = [];
    var rankInOverall = 0;
    var overallElo = 0;
    Object.keys(data).forEach(function (catId) {
      var arr = ((data[catId] || {}).overall) || [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].name === name) {
          var rank = arr[i].rank || (i + 1);
          var total = arr.length;
          var info = catInfoById[catId];
          categoryRanks.push({
            id: catId,
            name: info ? info.name : catId,
            icon: info ? info.icon : '',
            rank: rank,
            total: total,
            pct: total ? Math.round((1 - (rank - 1) / total) * 100) : 0,
          });
          if (catId === 'text') { rankInOverall = rank; overallElo = arr[i].elo || 0; }
          break;
        }
      }
    });

    // 用基础名打开时（如从系列列表/旧分享），回退到榜单里同基础名的变体
    if (!categoryRanks.length) {
      var base = catalogUtil.baseName(name);
      var alt = '';
      Object.keys(data).forEach(function (catId) {
        if (alt) return;
        var rows = ((data[catId] || {}).overall) || [];
        for (var i = 0; i < rows.length; i++) {
          if (rows[i] && catalogUtil.baseName(rows[i].name) === base) { alt = rows[i].name; break; }
        }
      });
      if (alt && alt !== name) { that.loadModel(alt); return; }
    }

    // 主类目：优先文本，其次第一个上榜类目；只出现在子维度时兜底 catScores
    var primary = null;
    for (var ci = 0; ci < categoryRanks.length; ci++) {
      if (categoryRanks[ci].id === 'text') { primary = categoryRanks[ci]; break; }
    }
    if (!primary && categoryRanks.length) primary = categoryRanks[0];

    var primaryCatId = primary ? primary.id : '';
    var primaryCatName = primary ? primary.name : '';
    var primaryRank = primary ? primary.rank : 0;
    var primaryTotal = primary ? primary.total : 0;
    var primaryElo = 0;
    if (primaryCatId && catScores[primaryCatId]) {
      var ovRow = catScores[primaryCatId].overall;
      if (ovRow) primaryElo = ovRow.elo || 0;
      if (!primaryElo) {
        Object.keys(catScores[primaryCatId]).forEach(function (d) {
          if (!primaryElo && catScores[primaryCatId][d]) primaryElo = catScores[primaryCatId][d].elo || 0;
        });
      }
    }
    if (!primaryRank) primaryRank = rankInOverall;
    if (!primaryElo) primaryElo = overallElo;
    if (!primaryCatId && Object.keys(catScores).length) {
      primaryCatId = Object.keys(catScores)[0];
      primaryCatName = catInfoById[primaryCatId] ? catInfoById[primaryCatId].name : primaryCatId;
    }
    var primaryIsAgent = primaryCatId === 'agent';
    var scoreLabel = primaryIsAgent ? '净提升率' : (primaryCatId === 'text' || !primaryCatId ? '综合 Elo' : (primaryCatName + ' Elo'));

    // 档案（Top 70 有；长尾为空）
    var cm = catalogUtil.findModel(name);
    var company = catalogUtil.companyOf(cm);
    var family = catalogUtil.familyOf(cm);
    var displayName = cm ? cm.displayName : meta.getDisplayName(name);
    var vm = String(name || '').match(/\(([^)]+)\)\s*$/);
    var variantLabel = vm ? vm[1] : '';
    var providerName = company ? (company.nameZh || company.name) : meta.getProviderDisplay(rawProvider, name);

    // 价格口径
    var sourcePrice = price || (cm && cm.price) || null;
    var currency = (sourcePrice && sourcePrice.currency) || 'USD';
    var isCNY = currency === 'CNY';
    var hasPrice = !!(sourcePrice && (sourcePrice.input > 0 || sourcePrice.output > 0 || sourcePrice.inputCNY > 0 || sourcePrice.outputCNY > 0));
    var pin = sourcePrice ? (isCNY ? sourcePrice.inputCNY : sourcePrice.input) : 0;
    var pout = sourcePrice ? (isCNY ? sourcePrice.outputCNY : sourcePrice.output) : 0;
    var sym = isCNY ? '¥' : '$';
    var isVisual = !!VISUAL_CATS[primaryCatId];
    var priceSource = (sourcePrice && sourcePrice.source) || '';

    var altPrice = null;
    if (price && cm && cm.price && (cm.price.input > 0 || cm.price.output > 0)) {
      if (Math.abs((cm.price.input || 0) - (price.input || 0)) > 0.01 ||
          Math.abs((cm.price.output || 0) - (price.output || 0)) > 0.01) {
        altPrice = {
          inputText: '$' + fmtPrice(cm.price.input),
          outputText: '$' + fmtPrice(cm.price.output),
          asOf: cm.price.asOf || '',
        };
      }
    }
    var priceView = {
      has: hasPrice,
      inputText: hasPrice ? sym + fmtPrice(pin) : '',
      outputText: hasPrice ? sym + fmtPrice(pout) : '',
      currency: currency,
      unitLabel: isVisual ? '计价单位见来源' : '每百万 tokens',
      unitSuffix: isVisual ? '' : '/M',
      source: priceSource,
      isProxy: /openrouter/i.test(priceSource),
      asOf: price ? (r.priceUpdated || r.lastUpdated || '') : ((cm && cm.price && cm.price.asOf) || r.lastUpdated || ''),
      alt: altPrice,
    };

    // 规格
    var contextTokens = (cm && cm.contextTokens) || catalogUtil.parseContext(context);
    var contextText = catalogUtil.formatTokens(contextTokens) || context || '—';
    var maxOutputText = cm && cm.maxOutputTokens ? catalogUtil.formatTokens(cm.maxOutputTokens) : '—';
    var inputModsText = cm && cm.modalities && cm.modalities.input && cm.modalities.input.length
      ? catalogUtil.modalityText(cm.modalities.input) : '—';
    var outputModsText = cm && cm.modalities && cm.modalities.output && cm.modalities.output.length
      ? catalogUtil.modalityText(cm.modalities.output) : '—';
    var hasSpecs = !!(
      (contextText && contextText !== '—') ||
      (maxOutputText && maxOutputText !== '—') ||
      (inputModsText && inputModsText !== '—') ||
      (outputModsText && outputModsText !== '—') ||
      (cm && cm.releaseDate) ||
      (cm && cm.knowledgeCutoff) ||
      (cm && cm.apiModelIds && cm.apiModelIds[0])
    );

    // 定位 / 优势
    var summary = (cm && cm.summary) || '';
    if (!summary) {
      summary = providerName + '的 ' + (cm ? cm.displayName : catalogUtil.baseName(name));
      if (primaryRank) summary += '，当前在' + primaryCatName + '榜第 ' + primaryRank + ' / ' + primaryTotal;
      summary += '。';
    }
    var strengths = (cm && cm.strengths) || [];
    var bestFor = (cm && cm.bestFor) || [];
    var limitations = (cm && cm.limitations) || [];

    // 分维度（主类目）
    var dimensions = [];
    var dimScores = catScores[primaryCatId] || {};
    function dimWidth(elo) {
      return primaryIsAgent
        ? Math.min(100, Math.max(2, elo / 35 * 100))
        : Math.min(100, Math.max(2, (elo - 1200) / 400 * 100));
    }
    if (dimScores.overall) {
      dimensions.push({
        id: 'overall', name: primaryIsAgent ? '整体' : '综合',
        valueText: primaryIsAgent ? (round1(dimScores.overall.elo) + '%') : String(round1(dimScores.overall.elo)),
        width: dimWidth(dimScores.overall.elo),
      });
    }
    Object.keys(DIM_NAMES).forEach(function (dimId) {
      if (dimId === 'overall' || !dimScores[dimId]) return;
      var row = dimScores[dimId];
      dimensions.push({
        id: dimId, name: DIM_NAMES[dimId],
        valueText: primaryIsAgent ? (round1(row.elo) + '%') : String(round1(row.elo)),
        width: dimWidth(row.elo),
      });
    });
    dimensions.sort(function (a, b) {
      if (a.id === 'overall') return -1;
      if (b.id === 'overall') return 1;
      return parseFloat(b.valueText) - parseFloat(a.valueText);
    });

    var rankLookup = {};
    Object.keys(data).forEach(function (catId) {
      var rows = ((data[catId] || {}).overall) || [];
      rows.forEach(function (m, i) {
        if (m && m.name && !rankLookup[m.name]) {
          rankLookup[m.name] = { rank: m.rank || (i + 1), total: rows.length };
        }
      });
    });

    // 同系列其他版本
    var familyVariants = [];
    if (family) {
      catalogUtil.familyModels(family.id).forEach(function (m) {
        if (m.id === cm.id) return;
        var live = rankLookup[m.rankingName || m.displayName];
        familyVariants.push({
          id: m.id,
          name: m.rankingName || m.displayName,
          displayName: m.displayName,
          releaseDate: m.releaseDate || '',
          rankText: live ? ('#' + live.rank + ' / ' + live.total) : '',
        });
      });
      familyVariants.sort(function (a, b) { return a.releaseDate < b.releaseDate ? 1 : -1; });
      familyVariants = familyVariants.slice(0, 6);
    }

    // 同价位竞品（同类目 overall）
    var peers = [];
    try {
      if (primary && price && price.input > 0) {
        var arr = ((data[primary.id] || {}).overall) || [];
        var own = price.input;
        var cand = [];
        arr.forEach(function (m) {
          if (!m || m.name === name || !m.price || m.price.input <= 0) return;
          if (m.price.input < own * 0.5 || m.price.input > own * 2) return;
          cand.push({ m: m, d: Math.abs(m.price.input - own) });
        });
        cand.sort(function (a, b) { return a.d - b.d || (a.m.rank - b.m.rank); });
        peers = cand.slice(0, 3).map(function (x) {
          var cny = x.m.price.currency === 'CNY';
          return {
            name: x.m.name,
            displayName: meta.getDisplayName(x.m.name),
            provider: meta.getProviderDisplay(x.m.provider, x.m.name),
            rank: x.m.rank || 0,
            priceText: cny ? ('¥' + fmtPrice(x.m.price.inputCNY) + '/M') : ('$' + fmtPrice(x.m.price.input) + '/M'),
          };
        });
      }
    } catch (e) {}

    // 公开上线时间线
    var timeline = catalogUtil.eventsForModel(cm).map(function (e) {
      return { date: e.date, title: e.title, sourceUrl: e.sourceUrl || '' };
    });

    // 兼容海报：按类目聚合的维度
    var catList = [];
    Object.keys(catScores).forEach(function (catId) {
      var dims = [];
      Object.keys(DIM_NAMES).forEach(function (dimId) {
        if (catScores[catId][dimId]) {
          dims.push({ id: dimId, name: DIM_NAMES[dimId], elo: catScores[catId][dimId].elo, margin: catScores[catId][dimId].margin || 0, votes: catScores[catId][dimId].votes || 0 });
        }
      });
      if (dims.length) {
        var info = catInfoById[catId];
        catList.push({ id: catId, name: info ? (info.icon + ' ' + info.name) : catId, dims: dims });
      }
    });

    var inCompare = false;
    try {
      var cl = wx.getStorageSync('compareList');
      inCompare = Array.isArray(cl) && cl.indexOf(name) >= 0;
    } catch (e) {}

    var primaryCatLabel = primaryRank
      ? (primaryCatId === 'text' ? '综合' : primaryCatName) + '第' + primaryRank + '名'
      : '';

    that.setData({
      modelName: name,
      displayName: displayName,
      variantLabel: variantLabel,
      provider: providerName,
      votes: votes,
      confidence: meta.getConfidence(votes),
      review: summary,
      summary: summary,
      strengths: strengths,
      bestFor: bestFor,
      limitations: limitations,
      price: price,
      priceView: priceView,
      context: context,
      contextText: contextText,
      maxOutputText: maxOutputText,
      inputModsText: inputModsText,
      outputModsText: outputModsText,
      releaseDateText: (cm && cm.releaseDate) || '—',
      statusText: cm ? ({ ga: '正式', preview: '预览', deprecated: '已下线' }[cm.status] || '') : '',
      licenseText: cm && cm.license ? cm.license.replace(/\s*license$/i, ' 许可') : '未公开',
      openWeightsText: cm ? (cm.openWeights ? '开源权重' : '闭源') : '',
      knowledgeCutoff: (cm && cm.knowledgeCutoff) || '—',
      apiModelId: (cm && cm.apiModelIds && cm.apiModelIds[0]) || '',
      docsUrl: (cm && cm.docsUrl) || '',
      companyName: company ? (company.nameZh || company.name) : '',
      companySummary: company ? company.summary : '',
      companyMeta: company ? [company.country, company.founded ? ('成立 ' + company.founded) : '', company.hq].filter(Boolean).join(' · ') : '',
      companyWebsite: company ? company.website : '',
      familyName: family ? (family.nameZh || family.name) : '',
      familyDescription: family ? family.description : '',
      categoryRanks: categoryRanks,
      dimensions: dimensions,
      familyVariants: familyVariants,
      peers: peers,
      timeline: timeline,
      archivePending: !cm || !hasSpecs,
      hasSpecs: hasSpecs,
      specNote: (cm && cm.specNote) || '',
      catalogSources: (cm && cm.sources) || [],
      verifiedAt: (cm && cm.verifiedAt) || '',
      categoryList: catList,
      rankInOverall: rankInOverall,
      overallElo: overallElo,
      primaryRank: primaryRank,
      primaryCatId: primaryCatId,
      primaryElo: round1(primaryElo),
      primaryIsAgent: primaryIsAgent,
      scoreLabel: scoreLabel,
      primaryCatLabel: primaryCatLabel,
      updatedDate: r.lastUpdated || '',
      inCompare: inCompare,
      isFav: store.isFavorite(name),
      loading: false,
    });

    var shareTitle = displayName + (primaryRank ? ' ' + (primaryCatId === 'text' ? '综合' : primaryCatName) + '第' + primaryRank + '名' : '') + '｜AI模型排行';
    that.setData({ shareTitle: shareTitle });
    try {
      wx.setNavigationBarTitle({ title: displayName + (primaryRank ? ' · 第' + primaryRank + '名' : '') });
    } catch (e) {}
  },

  // 云端数据晚到时重新加载（否则从分享卡片进来的用户看到的是旧快照）
  onCloudDataReady: function () {
    if (this.data.modelName) this.loadModel(this.data.modelName);
  },

  // 转发给好友
  onShareAppMessage: function () {
    var name = this.data.modelName;
    var title = this.data.shareTitle || (this.data.displayName + '｜AI模型排行');
    if (this.data.price && this.data.price.input > 0) {
      title += '，$' + this.data.price.input + '/百万token';
    }
    return {
      title: title,
      path: '/pages/detail/detail?name=' + encodeURIComponent(name || '') + '&from=share',
    };
  },

  // 分享到朋友圈
  onShareTimeline: function () {
    return {
      title: this.data.shareTitle || (this.data.displayName + '｜AI模型排行'),
      query: 'name=' + encodeURIComponent(this.data.modelName || '') + '&from=timeline',
    };
  },

  // 加入/移出对比（与 compareList 本地存储同步）
  toggleCompare: function () {
    var that = this;
    var name = this.data.modelName;
    if (!name) return;

    var compareList = [];
    try {
      // 只接受数组，防止存储被污染为字符串/对象时调用数组方法崩溃
      var stored = wx.getStorageSync('compareList');
      compareList = Array.isArray(stored) ? stored : [];
    } catch (e) {}

    // 已在对比 → 直接移出
    if (this.data.inCompare) {
      var newList = compareList.filter(function (n) { return n !== name; });
      try { wx.setStorageSync('compareList', newList); } catch (e) {}
      try { getApp().globalData.compareList = newList; } catch (e) {}
      this.setData({ inCompare: false });
      wx.showToast({ title: '已移出对比', icon: 'none' });
      return;
    }

    // 存储里有但页面状态没同步（异常情况），补状态
    if (compareList.indexOf(name) >= 0) {
      this.setData({ inCompare: true });
      wx.showToast({ title: '已在对比', icon: 'none' });
      return;
    }

    // 满 3 个，引导去对比页管理
    if (compareList.length >= 3) {
      wx.showModal({
        title: '最多对比3个模型',
        content: '对比列表已满（3个），请先移除一个模型再添加。',
        confirmText: '去对比页',
        cancelText: '取消',
        success: function (res) {
          if (res.confirm) wx.switchTab({ url: '/pages/compare/compare' });
        },
      });
      return;
    }

    compareList.push(name);
    try { wx.setStorageSync('compareList', compareList); } catch (e) {}
    try { getApp().globalData.compareList = compareList; } catch (e) {}
    this.setData({ inCompare: true });
    wx.showToast({ title: '已加入对比', icon: 'success' });
  },

  // 收藏：同时记下当前排名与价格，下次在「我的」里能看到变化。
  // 价格存原始币种，避免汇率波动被当成官方涨跌。
  toggleFavorite: function () {
    var name = this.data.modelName;
    if (!name) return;
    var price = this.data.price || {};
    var currency = price.currency || 'USD';
    var priceNative = currency === 'CNY' ? (price.inputCNY || 0) : (price.input || 0);
    var snap = {
      rank: this.data.primaryRank || this.data.rankInOverall || 0,
      catId: this.data.primaryCatId || 'text',
      priceInput: priceNative,
      currency: currency,
      source: price.source || '',
      dataDate: this.data.updatedDate || '',
      savedAt: Date.now(),
    };
    var on = store.toggleFavorite(name, snap);
    this.setData({ isFav: on });
    wx.showToast({ title: on ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  // 生成单模型分享图
  onGeneratePoster: function () {
    if (this.data.generatingPoster || !this.data.modelName) return;
    var that = this;
    var poster = this.selectComponent('#poster');
    if (!poster) {
      wx.showToast({ title: '生成组件未就绪', icon: 'none' });
      return;
    }

    var pv = this.data.priceView || {};
    var catList = this.data.categoryList || [];
    var primary = null;
    for (var i = 0; i < catList.length; i++) {
      if (catList[i].id === this.data.primaryCatId) primary = catList[i];
    }
    primary = primary || catList[0];
    var dims = ((primary && primary.dims) || [])
      .filter(function (d) { return d.id !== 'overall'; })
      .sort(function (a, b) { return b.elo - a.elo; })
      .slice(0, 3)
      .map(function (d) { return { name: d.name, elo: Math.round(d.elo) }; });

    // 码里带模型名（仅限 scene 允许的字符且 <=30），否则回首页
    var rawName = this.data.modelName || '';
    var qrPage = 'pages/index/index';
    var qrScene = '';
    if (rawName.length <= 30 && /^[A-Za-z0-9 .()_+-]+$/.test(rawName)) {
      qrPage = 'pages/detail/detail';
      qrScene = 'm=' + rawName.replace(/ /g, '+');
    }

    var eloText = this.data.primaryIsAgent
      ? (this.data.primaryElo + '%')
      : this.data.primaryElo;

    this.setData({ generatingPoster: true });
    poster.generate({
      layout: 'detail',
      title: this.data.displayName || this.data.modelName,
      subtitle: this.data.provider || '',
      rankText: this.data.primaryCatLabel || '',
      scoreLabel: this.data.scoreLabel || '综合 Elo',
      elo: eloText || '—',
      votesText: this.data.votes ? this.data.votes + ' 票' : '',
      contextText: this.data.contextText ? ('上下文 ' + this.data.contextText) : '',
      confidenceText: (this.data.confidence && this.data.confidence.label) || '',
      hasPrice: !!pv.has,
      priceIn: pv.has ? (pv.inputText + (pv.unitSuffix || '')) : '',
      priceOut: pv.has ? (pv.outputText + (pv.unitSuffix || '')) : '',
      priceProxy: !!pv.isProxy,
      review: this.data.summary || this.data.review || '',
      dimensions: dims,
      updated: this.data.updatedDate || '',
      qrPage: qrPage,
      qrScene: qrScene,
    }, function (err, path) {
      that.setData({ generatingPoster: false });
      if (err) {
        console.error('[Detail] poster error:', err);
        wx.showToast({ title: '生成失败，请重试', icon: 'none' });
        return;
      }
      presentImage(path);
    });
  },

  onFamilyVariantTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  onPeerTap: function (e) {
    var name = e.currentTarget.dataset.name;
    if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
  },

  copyDocs: function () {
    if (!this.data.docsUrl) return;
    wx.setClipboardData({ data: this.data.docsUrl });
  },

  copySources: function () {
    var list = (this.data.catalogSources || []).slice();
    if (!list.length && this.data.docsUrl) list.push(this.data.docsUrl);
    if (!list.length) {
      wx.showToast({ title: '暂无来源链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: list.join('\n') });
  },

  goCompare: function () {
    wx.switchTab({ url: '/pages/compare/compare' });
  },

  // 从分享卡片冷启动时页面栈只有 1 页，navigateBack 会失败 → 兜底回首页
  goBack: function () {
    wx.navigateBack({
      delta: 1,
      fail: function () { wx.switchTab({ url: '/pages/index/index' }); },
    });
  },

  // 查看完整排行（分享落地页的关键出口）
  goHome: function () {
    wx.switchTab({ url: '/pages/index/index' });
  },
  showSourceInfo: function (e) {
    var cat = e.currentTarget.dataset.cat;
    var dim = e.currentTarget.dataset.dim;
    var catData = this.data.categoryList.find(function (c) { return c.id === cat; });
    if (!catData) return;
    var dimData = catData.dims.find(function (d) { return d.id === dim; });
    if (dimData) {
      this.setData({ showSourcePopup: true, sourceInfo: { cat: catData.name, dim: dimData.name, elo: dimData.elo, margin: dimData.margin, votes: dimData.votes } });
    }
  },
  closeSourcePopup: function () { this.setData({ showSourcePopup: false, sourceInfo: null }); },
  noop: function () {},
});
