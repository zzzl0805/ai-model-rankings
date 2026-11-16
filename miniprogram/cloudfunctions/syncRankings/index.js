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

// GitHub Pages 数据地址（由 .github/workflows/update-data.yml 每日发布）
const DATA_URL = 'https://zzzl0805.github.io/ai-model-rankings/rankings.json';

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

exports.main = async (event, context) => {
  try {
    // 1. 从 Pages 拉取最新数据
    const text = await fetchUrl(DATA_URL);
    if (!text) return { code: -1, msg: '拉取为空' };

    // 2. 校验 JSON 结构（必须含 data 字段）
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { code: -1, msg: '数据解析失败: ' + e.message };
    }
    if (!parsed || !parsed.data || Object.keys(parsed.data).length === 0) {
      return { code: -1, msg: '数据缺少 data 字段或为空' };
    }

    // 3. 上传云存储（服务端有管理员权限）
    //    用「日期 + 时间戳」的唯一路径，彻底绕开 CDN 对同名文件的缓存
    const lastUpdated = parsed.lastUpdated || '';
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
