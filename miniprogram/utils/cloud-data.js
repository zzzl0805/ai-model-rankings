// 数据管理器：云端优先，本地兜底
// 用法：
//   var cloudData = require('../../utils/cloud-data.js');
//   cloudData.getData(function(data) { ... });

var LOCAL_DATA = null; // 本地数据缓存

// 初始化本地数据（首次调用时加载）
function getLocalData() {
  if (!LOCAL_DATA) {
    try {
      LOCAL_DATA = require('../data/rankings.js');
    } catch (e) {
      LOCAL_DATA = { categories: [], dimensions: [], data: {} };
    }
  }
  return LOCAL_DATA;
}

// 从云端获取数据（云存储文件，绕开 1MB 返回限制）
function fetchCloudData(callback) {
  if (!wx.cloud) {
    callback(null);
    return;
  }
  wx.cloud.callFunction({
    name: 'getRankings',
    success: function (res) {
      if (res.result && res.result.code === 0 && res.result.fileID) {
        wx.cloud.downloadFile({
          fileID: res.result.fileID,
          success: function (dl) {
            try {
              var fs = wx.getFileSystemManager();
              var content = fs.readFileSync(dl.tempFilePath, 'utf-8');
              var data = JSON.parse(content);
              console.log('[CloudData] 云端数据获取成功, 更新时间:', data.lastUpdated);
              callback(data);
            } catch (e) {
              console.log('[CloudData] 云端数据解析失败，使用本地:', e);
              callback(null);
            }
          },
          fail: function (err) {
            console.log('[CloudData] 云端文件下载失败，使用本地:', err);
            callback(null);
          },
        });
      } else {
        console.log('[CloudData] 云端无数据，使用本地');
        callback(null);
      }
    },
    fail: function (err) {
      console.log('[CloudData] 云端请求失败，使用本地:', err);
      callback(null);
    },
  });
}

// 主入口：先试云端，失败用本地
function getData(callback) {
  fetchCloudData(function (cloudData) {
    if (cloudData) {
      var normalized = cloudData;
      // 标准化结构：确保有 data/categories/dimensions
      if (!normalized.data && normalized.text) {
        normalized = {
          data: cloudData,
          categories: [],
          dimensions: [],
        };
      }
      // categories/dimensions 始终用本地（配置数据，不需要每次上传）
      var local = getLocalData();
      if (!normalized.categories || !normalized.categories.length) {
        normalized.categories = local.categories;
      }
      if (!normalized.dimensions || !normalized.dimensions.length) {
        normalized.dimensions = local.dimensions;
      }
      callback(normalized);
    } else {
      callback(getLocalData());
    }
  });
}

module.exports = {
  getData: getData,
  getLocalData: getLocalData,
};
