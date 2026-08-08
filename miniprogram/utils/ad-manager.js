/**
 * AdManager - 广告管理器 (ES5)
 * 流量主未开通时广告静默不展示，不影响主流程。
 */

var AD_UNITS = {
  banner: { home: '', category: '', detail: '', calculator: '', recommend: '' },
  interstitial: '',
  rewardedVideo: '',
};

var INTERSTITIAL_COOLDOWN = 20000;
var bannerAds = {};
var lastInterstitialTime = 0;

var AdManager = {
  showBanner: function (adUnitId, page) {
    if (!adUnitId) return;
    var pageKey = (page && (page.route || page.__route__)) || 'default';
    var existing = bannerAds[pageKey];
    if (existing) {
      try { existing.show(); } catch (e) {}
      return;
    }
    try {
      var systemInfo = wx.getSystemInfoSync();
      var bannerWidth = systemInfo.windowWidth || 375;
      var bannerAd = wx.createBannerAd({
        adUnitId: adUnitId,
        style: { left: 0, top: systemInfo.windowHeight, width: bannerWidth },
      });
      bannerAd.onError(function (err) {
        console.warn('[AdManager] Banner ad error:', err.errMsg || err);
      });
      bannerAd.onResize(function (res) {
        bannerAd.style.top = systemInfo.windowHeight - res.height;
      });
      bannerAds[pageKey] = bannerAd;
    } catch (e) {
      console.warn('[AdManager] Banner ad not available:', e);
    }
  },

  hideBanner: function (page) {
    var pageKey = (page && (page.route || page.__route__)) || 'default';
    var bannerAd = bannerAds[pageKey];
    if (bannerAd) {
      try { bannerAd.hide(); } catch (e) {}
    }
  },

  showInterstitial: function (pageName) {
    var adUnitId = AD_UNITS.interstitial;
    if (!adUnitId) return;
    var now = Date.now();
    if (now - lastInterstitialTime < INTERSTITIAL_COOLDOWN) return;
    try {
      var interstitialAd = wx.createInterstitialAd({ adUnitId: adUnitId });
      interstitialAd.onError(function (err) {
        console.warn('[AdManager] Interstitial ad error:', err.errMsg || err);
      });
      lastInterstitialTime = now;
      interstitialAd.show().catch(function (err) {
        console.warn('[AdManager] Interstitial ad show failed:', err.errMsg || err);
      });
    } catch (e) {
      console.warn('[AdManager] Interstitial ad not available:', e);
    }
  },

  showRewardedVideo: function () {
    var adUnitId = AD_UNITS.rewardedVideo;
    if (!adUnitId) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        var rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: adUnitId });
        rewardedVideoAd.onError(function (err) {
          console.warn('[AdManager] Rewarded video ad error:', err.errMsg || err);
          resolve(false);
        });
        rewardedVideoAd.onClose(function (res) {
          resolve(res && res.isEnded ? true : false);
        });
        rewardedVideoAd.show().catch(function (err) {
          console.warn('[AdManager] Rewarded video ad show failed:', err.errMsg || err);
          resolve(false);
        });
      } catch (e) {
        console.warn('[AdManager] Rewarded video ad not available:', e);
        resolve(false);
      }
    });
  },
};

module.exports = { AdManager: AdManager, AD_UNITS: AD_UNITS };
