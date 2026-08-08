// 云函数 uploadRankings：保存云端数据文件的指针（fileID + 更新时间）
// 实际数据文件由小程序端 wx.cloud.uploadFile 上传到云存储
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { fileID, lastUpdated } = event;
  if (!fileID) {
    return { code: -1, msg: '缺少 fileID 参数' };
  }

  const meta = {
    fileID: fileID,
    lastUpdated: lastUpdated || '',
    updateTime: new Date(),
  };

  try {
    await db.collection('rankings').doc('current').set({ data: meta });
    return { code: 0, msg: '上传成功', lastUpdated: meta.lastUpdated };
  } catch (err) {
    if (err.errCode === -502003 || (err.message && err.message.indexOf('not exist') >= 0)) {
      try {
        await db.createCollection('rankings');
        await db.collection('rankings').doc('current').set({ data: meta });
        return { code: 0, msg: '创建并上传成功', lastUpdated: meta.lastUpdated };
      } catch (e2) {
        return { code: -1, msg: '创建失败: ' + e2.message };
      }
    }
    return { code: -1, msg: err.message };
  }
};
