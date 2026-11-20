// components/board — 固定视角榜单（落地页用）
var boardData = require('../../utils/board-data.js');

Component({
  properties: {
    category: { type: String, value: 'text' },
    dim: { type: String, value: 'overall' },
    region: { type: String, value: 'all' }, // all | cn
    limit: { type: Number, value: 20 },
  },

  data: {
    rows: [],
    total: 0,
    updated: '',
    loading: true,
  },

  lifetimes: {
    attached: function () {
      this.refresh();
    },
  },

  methods: {
    // 云端数据晚到时由页面调用
    refresh: function () {
      var r = boardData.buildBoard(this.data.category, this.data.dim, this.data.region, this.data.limit);
      this.setData({ rows: r.rows, total: r.total, updated: r.updated, loading: false });
    },

    onModelTap: function (e) {
      var name = e.currentTarget.dataset.name;
      if (name) wx.navigateTo({ url: '/pages/detail/detail?name=' + encodeURIComponent(name) });
    },

    goCompare: function () {
      wx.switchTab({ url: '/pages/compare/compare' });
    },
  },
});
