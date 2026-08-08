App({
  globalData: {
    favorites: [],
    compareList: [],
    cloudRankings: null, // 云端数据（有则用，无则用本地）
  },

  onLaunch: function () {
    try {
      this.globalData.favorites = wx.getStorageSync('favorites') || [];
      this.globalData.compareList = wx.getStorageSync('compareList') || [];
    } catch (e) {}

    // 后台加载云端数据（不阻塞页面）
    if (wx.cloud) {
      wx.cloud.init({ env: 'cloud1-d7g5tmh916383e8b5' });
      this.loadCloudData();
    }
  },

  loadCloudData: function () {
    var that = this;
    wx.cloud.callFunction({
      name: 'getRankings',
      success: function (res) {
        if (res.result && res.result.code === 0) {
          if (res.result.url) {
            that.downloadCloudData(res.result.url); // 新方案：签名链接
          } else if (res.result.fileID) {
            that.downloadCloudData('', res.result.fileID); // 兼容旧云函数
          }
        }
      },
      fail: function () {
        console.log('[App] 云端数据未加载，使用本地');
      },
    });
  },

  // 新方案：云函数服务端生成签名链接，客户端用 wx.downloadFile 下载，
  // 绕开存储「仅创建者可读写」权限（旧方案 downloadFile 只有上传者能读到）
  downloadCloudData: function (url, fileID) {
    var that = this;
    var onSuccess = function (tempFilePath) {
      try {
        var fs = wx.getFileSystemManager();
        var content = fs.readFileSync(tempFilePath, 'utf-8');
        var data = JSON.parse(content);
        if (data && data.data) {
          that.globalData.cloudRankings = data;
          console.log('[App] 云端数据已加载');
          that.notifyCloudDataReady();
        }
      } catch (e) {
        console.log('[App] 云端数据解析失败，使用本地:', e);
      }
    };
    var onFail = function (err) {
      console.log('[App] 云端文件下载失败，使用本地:', err);
    };

    if (url) {
      wx.downloadFile({
        url: url,
        success: function (res) {
          if (res.statusCode === 200) {
            onSuccess(res.tempFilePath);
          } else {
            console.log('[App] 云端文件下载失败 HTTP', res.statusCode);
          }
        },
        fail: onFail,
      });
    } else if (fileID) {
      // 旧方案兜底
      wx.cloud.downloadFile({
        fileID: fileID,
        success: function (res) { onSuccess(res.tempFilePath); },
        fail: onFail,
      });
    }
  },

  // 云端数据就绪后，通知当前页面刷新
  notifyCloudDataReady: function () {
    var pages = getCurrentPages();
    var current = pages[pages.length - 1];
    if (current && typeof current.onCloudDataReady === 'function') {
      current.onCloudDataReady();
    }
  },
});
