// utils/landing-page.js — 固定路径模型/系列页的 Page 工厂
var landingData = require('./landing-data.js');

function create(cfg) {
  var path = cfg.kind === 'family'
    ? 'pages/family-' + cfg.slug + '/family-' + cfg.slug
    : 'pages/model-' + cfg.slug + '/model-' + cfg.slug;

  return {
    data: {
      landing: {},
      loading: true,
    },

    onLoad: function () { this.refresh(); },
    onShow: function () { this.refresh(); },
    onCloudDataReady: function () { this.refresh(); },

    refresh: function () {
      var landing = cfg.kind === 'family'
        ? landingData.familyData(cfg.familyId)
        : landingData.modelData(cfg.name);
      this.setData({ landing: landing, loading: false });
      try { wx.setNavigationBarTitle({ title: landing.title }); } catch (e) {}
    },

    onShareAppMessage: function () {
      var l = this.data.landing || {};
      return {
        title: l.shareTitle || l.title || 'AI模型排行',
        path: '/' + path + '?from=share',
      };
    },

    onShareTimeline: function () {
      var l = this.data.landing || {};
      return {
        title: l.shareTitle || l.title || 'AI模型排行',
        query: 'from=timeline',
      };
    },

    goDetail: function () {
      var l = this.data.landing || {};
      if (l.detailName) {
        wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(l.detailName) });
      } else {
        wx.switchTab({ url: '/pages/index/index' });
      }
    },

    goFamily: function () {
      var l = this.data.landing || {};
      if (l.familyPath) wx.navigateTo({ url: '/' + l.familyPath });
    },

    goPath: function (e) {
      var p = e.currentTarget.dataset.path;
      if (!p) return;
      if (p.charAt(0) === '/') wx.navigateTo({ url: p });
      else wx.navigateTo({ url: '/' + p });
    },

    goHome: function () {
      wx.switchTab({ url: '/pages/index/index' });
    },
  };
}

module.exports = create;
