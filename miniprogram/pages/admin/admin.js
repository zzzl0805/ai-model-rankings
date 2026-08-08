// pages/admin/admin.js
var localData = require('../../data/rankings.js');

Page({
  data: {
    uploading: false,
    result: '',
    cloudStatus: '未检测',
  },

  onLoad: function () {
    this.checkCloud();
  },

  checkCloud: function () {
    var that = this;
    if (!wx.cloud) { that.setData({ cloudStatus: '不支持' }); return; }
    wx.cloud.callFunction({
      name: 'getRankings',
      success: function (res) {
        if (res.result && res.result.code === 0 && res.result.fileID) {
          var time = (res.result.lastUpdated || '').toString().split('T')[0];
          that.setData({ cloudStatus: '已上传 (' + time + ')' });
        } else {
          that.setData({ cloudStatus: '云端未上传' });
        }
      },
      fail: function () { that.setData({ cloudStatus: '云函数未部署' }); },
    });
  },

  uploadData: function () {
    var that = this;
    wx.showModal({
      title: '确认上传',
      content: '上传到云存储（需要等待10-20秒）？',
      success: function (res) { if (res.confirm) that.doUpload(); },
    });
  },

  doUpload: function () {
    var that = this;
    that.setData({ uploading: true, result: '上传中（请耐心等待）...' });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 1. 先把本地数据写入临时文件
      var fs = wx.getFileSystemManager();
      var tempPath = wx.env.USER_DATA_PATH + '/rankings.json';
      fs.writeFileSync(tempPath, JSON.stringify(localData), 'utf-8');

      // 2. 上传到云存储（文件上限 50MB，无 512KB/1MB 限制）
      wx.cloud.uploadFile({
        cloudPath: 'rankings/rankings.json',
        filePath: tempPath,
        success: function (up) {
          if (up.fileID) {
            that.saveCloudMeta(up.fileID, localData.lastUpdated || '');
          } else {
            wx.hideLoading();
            that.setData({ result: '❌ 上传失败: ' + (up.errMsg || '未知错误'), uploading: false });
          }
        },
        fail: function (err) {
          wx.hideLoading();
          that.setData({ result: '❌ ' + (err.errMsg || '上传失败'), uploading: false });
        },
      });
    } catch (e) {
      wx.hideLoading();
      that.setData({ result: '❌ ' + (e.message || '上传失败'), uploading: false });
    }
  },

  // 3. 保存云存储 fileID 到数据库（云函数），供 getRankings 返回给小程序
  saveCloudMeta: function (fileID, lastUpdated) {
    var that = this;
    wx.cloud.callFunction({
      name: 'uploadRankings',
      data: { fileID: fileID, lastUpdated: lastUpdated },
      success: function (res) {
        wx.hideLoading();
        if (res.result && res.result.code === 0) {
          that.setData({ result: '✅ 上传成功（' + lastUpdated + '）', uploading: false });
          that.checkCloud();
        } else {
          that.setData({ result: '❌ ' + (res.result ? res.result.msg : '保存元信息失败'), uploading: false });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        that.setData({ result: '❌ ' + (err.errMsg || '保存失败'), uploading: false });
      },
    });
  },
});
