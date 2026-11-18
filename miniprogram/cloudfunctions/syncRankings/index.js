// 云函数 syncRankings：每日定时从 GitHub Pages 拉取最新排行数据，
// 上传到云存储 rankings/rankings.json，并更新数据库指针（_id='current'）。
//
// 依赖链路：GitHub Actions 每天抓取构建 → 发布到 GitHub Pages →
// 本函数（定时触发器）拉取 → 上传云存储 → 小程序端自动拉到最新数据。
// 与 admin 页「一键上传」最终写入的云存储文件和指针完全一致。
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 数据地址：用 jsDelivr 镜像 GitHub 仓库里的 dist/rankings.json
// （腾讯云函数在境内，访问 GitHub Pages 会超时/被墙；jsDelivr 国内可达）
// 多个镜像 + 重试：实测同一地址有时 3 秒、有时会挂起，必须做容错
// 用「日期 tag」而不是分支：tag 是不可变 URL，
// 每天一个新 tag 就是新地址，永远不会命中 CDN 的旧缓存
// （分支 URL 会被 jsDelivr 缓存 12 小时，导致数据看起来没更新）
function buildDataUrls() {
  const urls = [];
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now - i * 86400000);
    const tag = 'v' + d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
    urls.push('https://cdn.jsdelivr.net/gh/zzzl0805/ai-model-rankings@' + tag + '/rankings.json');
    urls.push('https://fastly.jsdelivr.net/gh/zzzl0805/ai-model-rankings@' + tag + '/rankings.json');
  }
  // 兜底：分支地址（可能被 CDN 缓存，但总比拿不到强）
  urls.push('https://cdn.jsdelivr.net/gh/zzzl0805/ai-model-rankings@data/rankings.json');
  urls.push('https://gcore.jsdelivr.net/gh/zzzl0805/ai-model-rankings@data/rankings.json');
  return urls;
}
const DATA_URLS = buildDataUrls();
const DATA_URL = DATA_URLS[0];

// 轮流尝试各镜像，直到拿到【完整且可解析】的数据或超出时间预算
// 实测镜像会间歇性返回截断文件（HTTP 200 但只有一半），所以必须校验 JSON
async function downloadWithRetry(budgetMs) {
  const start = Date.now();
  let lastErr = null;
  let i = 0;
  while (Date.now() - start < budgetMs) {
    const url = DATA_URLS[i % DATA_URLS.length];
    try {
      const text = await withTimeout(fetchUrl(url), 12000, '下载');
      if (!text || text.length < 200000) throw new Error('内容过短: ' + (text ? text.length : 0) + ' 字节');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error('JSON 不完整: ' + text.length + ' 字节');
      }
      if (!parsed.data || Object.keys(parsed.data).length === 0) throw new Error('数据为空');
      return { text: text, parsed: parsed, url: url, attempts: i + 1 };
    } catch (e) {
      lastErr = e;
    }
    i++;
  }
  throw (lastErr || new Error('下载超时'));
}

// 兼容 Node16：无全局 fetch，用 https 拉取（支持一次 3xx 重定向）
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('HTTP ' + res.statusCode));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('请求超时')));
  });
}

async function updatePointer(fileID, lastUpdated) {
  const meta = {
    fileID: fileID,
    lastUpdated: lastUpdated || '',
    updateTime: new Date(),
    lastCheckedAt: new Date(),
  };
  try {
    await db.collection('rankings').doc('current').set({ data: meta });
  } catch (err) {
    if (err.errCode === -502003 || (err.message && err.message.indexOf('not exist') >= 0)) {
      await db.createCollection('rankings');
      await db.collection('rankings').doc('current').set({ data: meta });
    } else {
      throw err;
    }
  }
}

// 给 Promise 加硬超时，避免网络挂起时把整个函数拖到超时
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error((label || '操作') + '超时 ' + ms + 'ms')), ms)),
  ]);
}

exports.main = async (event, context) => {
  // 诊断模式：分步计时，定位卡在哪一步
  if (event && event.diag) {
    // 支持自测任意 URL 的可达性：{diag:'url', url:'https://...'}
    if (event.diag === 'url' && event.url) {
      const t0u = Date.now();
      try {
        const t = await withTimeout(fetchUrl(event.url), 15000, '请求');
        return { diag: 'url', ok: true, ms: Date.now() - t0u, bytes: t.length, head: t.slice(0, 400), url: event.url };
      } catch (e) {
        return { diag: 'url', ok: false, ms: Date.now() - t0u, err: (e && e.message) || String(e), url: event.url };
      }
    }
    const t = {};
    let t0 = Date.now();
    let text;
    try {
      const r = await downloadWithRetry(40000);
      text = r.text;
      t.download = Date.now() - t0;
      t.url = r.url;
      t.attempts = r.attempts;
    } catch (e) {
      return { diag: true, step: 'download', ok: false, ms: Date.now() - t0, err: (e && e.message) || String(e), url: DATA_URL };
    }
    if (event.diag === 'upload' || event.diag === 'all') {
      t0 = Date.now();
      try {
        const up = await withTimeout(cloud.uploadFile({
          cloudPath: 'rankings/diag-' + Date.now() + '.json',
          fileContent: Buffer.from(text, 'utf-8'),
        }), 30000, '上传云存储');
        t.upload = Date.now() - t0;
        t.fileID = up && up.fileID ? up.fileID.split('/').pop() : null;
      } catch (e) {
        return { diag: true, step: 'upload', ok: false, timings: t, ms: Date.now() - t0, err: (e && e.message) || String(e) };
      }
    }
    return { diag: true, ok: true, timings: t, bytes: text.length, url: DATA_URL };
  }

  try {
    // 1. 拉取最新数据（多镜像 + 重试；已内含 JSON 完整性校验）
    const downloaded = await downloadWithRetry(40000);
    const text = downloaded.text;
    const parsed = downloaded.parsed;
    if (!text || !parsed) return { code: -1, msg: '拉取为空' };

    // 幂等检查：GitHub Actions 定时任务可能延迟数小时，
    // 云函数改为每天多次触发，数据没变时直接跳过，避免重复上传
    const lastUpdated = parsed.lastUpdated || '';
    try {
      const cur = await db.collection('rankings').doc('current').get();
      if (cur && cur.data && cur.data.lastUpdated === lastUpdated) {
        // 记录检查时间，便于确认定时器是否按时运行（数据不变也有痕迹）
        try {
          await db.collection('rankings').doc('current').update({ data: { lastCheckedAt: new Date() } });
        } catch (e2) {}
        return { code: 0, msg: '已是最新，跳过上传', lastUpdated: lastUpdated };
      }
    } catch (e) { /* 指针不存在时继续正常流程 */ }

    // 3. 上传云存储（服务端有管理员权限）
    //    用「日期 + 时间戳」的唯一路径，彻底绕开 CDN 对同名文件的缓存
    const cloudPath = 'rankings/rankings-' + (lastUpdated || 'latest') + '-' + Date.now() + '.json';
    const up = await cloud.uploadFile({
      cloudPath: cloudPath,
      fileContent: Buffer.from(text, 'utf-8'),
    });
    if (!up.fileID) return { code: -1, msg: '上传云存储失败' };

    // 4. 更新数据库指针（小程序端 getRankings 据此拉取）
    await updatePointer(up.fileID, lastUpdated);

    return { code: 0, msg: '同步成功', lastUpdated: lastUpdated, fileID: up.fileID };
  } catch (err) {
    return { code: -1, msg: (err && err.message) || String(err) };
  }
};
