// 云函数 getRankings：返回云端数据文件的指针（云存储 fileID + 更新时间）
// 实际数据文件由小程序端 wx.cloud.downloadFile 拉取，绕开 1MB 返回限制
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    const res = await db.collection('rankings').doc('current').get();
    const doc = res.data || {};
    if (!doc.fileID) {
      return { code: 1, msg: '云端未上传数据' };
    }
    // 云函数（服务端）拥有存储完整权限，可为任意文件生成临时下载链接。
    // 签名链接本身可被 wx.downloadFile 直接下载，不受存储「仅创建者可读写」限制，
    // 否则其他用户 downloadFile 会被权限拒绝，回退到发布版本地旧数据。
    const urlRes = await cloud.getTempFileURL({ fileList: [doc.fileID] });
    const file = (urlRes.fileList || [])[0];
    if (!file || !file.tempFileURL) {
      return { code: -1, msg: '生成下载链接失败: ' + (file && file.status ? file.status : '') };
    }
    return {
      code: 0,
      url: file.tempFileURL,
      fileID: doc.fileID, // 兼容旧客户端
      updateTime: doc.updateTime,
      lastUpdated: doc.lastUpdated || '',
    };
  } catch (err) {
    return { code: -1, msg: err.message };
  }
};
