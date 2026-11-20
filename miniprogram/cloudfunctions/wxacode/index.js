// 云函数 wxacode：生成小程序码（榜单海报用）
// 同时用于验证个人主体是否拥有 wxacode.getUnlimited 权限。
// 用法：wx.cloud.callFunction({ name: 'wxacode', data: { scene, page } })
// scene 最多 32 字符，进入小程序后可在 onLoad(options).scene 中取到（需 decodeURIComponent）。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const page = event.page || 'pages/index/index';
  const scene = String(event.scene || 'from=poster').slice(0, 32);
  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene,
      // 未发布过的页面 checkPath 会失败；默认不校验
      page,
      checkPath: false,
      width: Number(event.width) || 280,
      autoColor: false,
      lineColor: { r: 15, g: 94, b: 240 },
      isHyaline: false,
    });

    // 存到云存储，小程序端用临时链接显示/下载（<=1MB 不能直接走云函数返回）。
    // 路径按 page+scene 固定，重复生成时覆盖同一文件，避免无限堆积。
    const safe = (page + '-' + scene).replace(/[^a-zA-Z0-9-]/g, '-');
    const upload = await cloud.uploadFile({
      cloudPath: 'wxacode/' + safe + '.jpg',
      fileContent: res.buffer,
    });
    const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] });
    const file = (urlRes.fileList || [])[0] || {};
    return { code: 0, fileID: upload.fileID, url: file.tempFileURL || '' };
  } catch (err) {
    return {
      code: -1,
      errCode: err.errCode || 0,
      errMsg: err.errMsg || err.message || String(err),
    };
  }
};
