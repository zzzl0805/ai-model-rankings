Page({
  onGoBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/compare/compare' });
      },
    });
  },
});
