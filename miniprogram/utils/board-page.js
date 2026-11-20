// utils/board-page.js — 三个榜单落地页共用的页面逻辑
// 页面只需要传标题、路径和跳回首页的深链。

function createBoardPage(config) {
  return {
    // 云端数据晚于页面到达时刷新组件
    onCloudDataReady: function () {
      var board = this.selectComponent('#board');
      if (board) board.refresh();
    },

    // 从详情返回时也刷新：云端数据可能在别的页面停留期间才到达
    onShow: function () {
      var board = this.selectComponent('#board');
      if (board) board.refresh();
    },

    onShareAppMessage: function () {
      var board = this.selectComponent('#board');
      var top = board && board.data.rows && board.data.rows[0];
      var title = top ? (config.shareTitle + '：第 1 是 ' + top.displayName) : config.shareTitle;
      return { title: title + '｜AI模型排行', path: config.path + '?from=share' };
    },

    onShareTimeline: function () {
      var board = this.selectComponent('#board');
      var top = board && board.data.rows && board.data.rows[0];
      return {
        title: top ? (config.shareTitle + '：第 1 是 ' + top.displayName) : config.shareTitle,
        query: 'from=timeline',
      };
    },

    // 落地页是固定视角，完整榜单回首页。
    // tabBar 页的 switchTab 不能带参数，参数经 globalData 传给 index.onShow。
    goAll: function () {
      var url = config.deepLink || '/pages/index/index';
      var idx = url.indexOf('?');
      var page = idx >= 0 ? url.slice(0, idx) : url;
      var q = {};
      if (idx >= 0) {
        url.slice(idx + 1).split('&').forEach(function (pair) {
          var kv = pair.split('=');
          if (kv[0]) q[kv[0]] = kv[1] || '';
        });
      }
      var app = getApp();
      if (app && app.globalData) app.globalData.pendingBoard = q;
      wx.switchTab({ url: page });
    },
  };
}

module.exports = createBoardPage;
