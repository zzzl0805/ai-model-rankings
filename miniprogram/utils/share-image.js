// utils/share-image.js — 生成图片后的保存/分享动作（海报共用）
function presentImage(path) {
  wx.showActionSheet({
    itemList: ['保存到相册', '分享图片'],
    success: function (res) {
      if (res.tapIndex === 0) {
        wx.saveImageToPhotosAlbum({
          filePath: path,
          success: function () { wx.showToast({ title: '已保存到相册' }); },
          fail: function (e) {
            var msg = (e && e.errMsg) || '';
            // 112：后台《用户隐私保护指引》未声明「相册（仅写入）」，只能预览后长按保存
            if (e && e.errno === 112) {
              wx.previewImage({ urls: [path] });
              wx.showToast({ title: '请长按图片保存', icon: 'none' });
              return;
            }
            if (msg.indexOf('auth') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '保存图片需要访问相册，请在设置中允许。',
                confirmText: '去设置',
                success: function (r) { if (r.confirm) wx.openSetting(); },
              });
            } else {
              wx.previewImage({ urls: [path] });
            }
          },
        });
      } else if (res.tapIndex === 1) {
        if (wx.showShareImageMenu) {
          wx.showShareImageMenu({
            path: path,
            fail: function () { wx.previewImage({ urls: [path] }); },
          });
        } else {
          wx.previewImage({ urls: [path] });
        }
      }
    },
  });
}

module.exports = presentImage;
