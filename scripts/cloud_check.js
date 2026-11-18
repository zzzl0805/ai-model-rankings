#!/usr/bin/env node
/**
 * 读取云端指针状态（需要微信开发者工具已登录）
 * 用法: node scripts/cloud_check.js
 * 输出: JSON { ok, lastUpdated, lastCheckedAt, updateTime, fileID, ... }
 */
const path = require('path');

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const PROJECT = path.resolve(__dirname, '..');

(async () => {
  let automator;
  try {
    automator = require('miniprogram-automator');
  } catch (e) {
    console.log(JSON.stringify({ ok: false, err: 'miniprogram-automator 未安装（cd scripts && npm install）' }));
    process.exit(0);
  }

  let mp;
  try {
    mp = await automator.launch({ cliPath: CLI, projectPath: PROJECT, trustProject: true, timeout: 60000 });
    const page = await mp.reLaunch('/pages/index/index');
    await page.waitFor(1500);
    await mp.evaluate(() => {
      wx.removeStorageSync('__health');
      wx.cloud.callFunction({
        name: 'getRankings',
        success: (r) => wx.setStorageSync('__health', r.result),
        fail: (e) => wx.setStorageSync('__health', { __err: e.errMsg }),
      });
      return true;
    });
    await page.waitFor(6000);
    const r = await mp.evaluate(() => wx.getStorageSync('__health') || {});
    console.log(JSON.stringify({
      ok: !!(r && r.code === 0),
      lastUpdated: r.lastUpdated,
      lastCheckedAt: r.lastCheckedAt,
      updateTime: r.updateTime,
      fileID: String(r.fileID || '').split('/').pop(),
      err: r.__err || r.msg,
    }));
    try { await mp.close(); } catch (e) {}
    process.exit(0);
  } catch (e) {
    console.log(JSON.stringify({ ok: false, err: (e && e.message) || String(e) }));
    if (mp) { try { await mp.close(); } catch (e2) {} }
    process.exit(0);
  }
})();
