// 云函数 searchSubmit：把模型详情页/榜单页提交给微信搜一搜收录
// 官方文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/wxsearch/api_submitpages.html
// 前置：小程序后台开启「搜一搜/页面收录/爬虫」开关，否则返回 85091。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MAX_PAGES = 100;
const SITE = 'AI模型排行';

function hash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return 'm' + Math.abs(h).toString(36);
}

function clip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtPrice(p) {
  if (!p || !(p.input > 0 || p.output > 0 || p.inputCNY > 0 || p.outputCNY > 0)) return '暂无公开 API 价格';
  if (p.currency === 'CNY') return '¥' + p.inputCNY + ' / ¥' + p.outputCNY + ' 每百万 tokens';
  return '$' + p.input + ' / $' + p.output + ' 每百万 tokens';
}

function pageForModel(m, catName, rank, total, ts, dataType) {
  const name = m.name;
  const provider = m.provider || '未知厂商';
  const title = clip(name + ' 排名与价格', 20);
  const abstract = clip(provider + ' · ' + catName + '第 ' + rank + '/' + total + ' · ' + fmtPrice(m.price), 100);
  const mainbody = clip(
    name + ' 是 ' + provider + ' 的模型。当前在 LMArena ' + catName + '榜第 ' + rank + ' / ' + total +
    '，Elo ' + (m.elo || '-') + '，票数 ' + (m.votes || 0) + '。' +
    'API 价格：' + fmtPrice(m.price) + '。上下文：' + (m.context || '未公开') + '。' +
    '数据来自 LMArena 人类盲测与厂商公开定价，更新于 ' + (m.__updated || '') + '。',
    500
  );
  return {
    path: 'pages/detail/detail',
    query: 'name=' + encodeURIComponent(name),
    data_list: [{
      '@type': dataType,
      update: 1,
      content_id: hash('model:' + name),
      page_type: 2,
      title: title,
      abstract: [abstract],
      mainbody: mainbody,
      time_publish: ts,
      time_modify: ts,
    }],
  };
}

function pageForPath(path, title, abstract, mainbody, query, ts, dataType) {
  return {
    path: path,
    query: query || 'from=search',
    data_list: [{
      '@type': dataType,
      update: 1,
      content_id: hash(path + ':' + (query || '')),
      page_type: 2,
      title: clip(title, 20),
      abstract: [clip(abstract, 100)],
      mainbody: clip(mainbody, 500),
      time_publish: ts,
      time_modify: ts,
    }],
  };
}

async function loadRankings() {
  const res = await db.collection('rankings').doc('current').get();
  const doc = res.data || {};
  if (!doc.fileID) throw new Error('云端无数据指针');
  const dl = await cloud.downloadFile({ fileID: doc.fileID });
  const parsed = JSON.parse(dl.fileContent.toString('utf-8'));
  return parsed.data ? parsed : parsed[0];
}

exports.main = async (event) => {
  try {
    // 内容接入未审核通过前只能推测试数据；通过后传 {type:'formal'} 或改默认值
    const dataType = event && event.type === 'formal' ? 'wxsearch_cpdata' : 'wxsearch_testcpdata';
    const rankings = await loadRankings();
    const data = rankings.data || {};
    const updated = rankings.lastUpdated || '';
    const ts = updated
      ? Math.floor(new Date(updated + 'T00:00:00+08:00').getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const pages = [];
    const seen = {};

    // 文本综合 Top 60 + 图像/视频各 Top 20/10 + Agent Top 10
    const picks = [
      ['text', 60], ['text-to-image', 20], ['text-to-video', 10],
      ['image-edit', 10], ['image-to-video', 5], ['agent', 10],
    ];
    picks.forEach(function (p) {
      const arr = ((data[p[0]] || {}).overall) || [];
      arr.slice(0, p[1]).forEach(function (m, i) {
        if (!m || !m.name || seen[m.name]) return;
        seen[m.name] = 1;
        const catName = (rankings.categories || []).filter(function (c) { return c.id === p[0]; })[0];
        pages.push(pageForModel(m, catName ? catName.name : p[0], m.rank || i + 1, arr.length, ts, dataType));
      });
    });

    // 榜单/入口页
    pages.push(pageForPath('pages/board-coding/board-coding',
      'AI编程模型排行', '按编程能力排序的大模型榜单，含 Elo、价格与厂商。',
      'AI编程模型排行榜：收录主流大模型在编程维度上的 LMArena Elo 排名、API 价格与上下文，每日更新。', 'from=search', ts, dataType));
    pages.push(pageForPath('pages/board-cn/board-cn',
      '国产AI模型排行', 'DeepSeek、通义、智谱、Kimi、豆包等国产模型排行。',
      '国产AI模型排行榜：DeepSeek、通义千问、智谱 GLM、Kimi、豆包、文心、混元等国产大模型的 Elo 排名与价格。', 'from=search', ts, dataType));
    pages.push(pageForPath('pages/board-image/board-image',
      'AI画图模型排行', '文生图模型 Elo 排行与厂商。',
      'AI画图模型排行榜：文生图模型的 LMArena Elo 排名，覆盖 Google、OpenAI、字节、阿里、智谱等厂商。', 'from=search', ts, dataType));
    pages.push(pageForPath('pages/index/index',
      'AI模型排行', 'LMArena 人类盲测榜单与 API 定价。',
      'AI模型排行：聚合 LMArena 人类盲测 Elo 与各厂商 API 定价，覆盖文本、视觉、图像、视频等 12 个类目。', 'from=search', ts, dataType));

    const batch = pages.slice(0, MAX_PAGES);
    const res = await cloud.openapi.search.submitPages({ pages: batch });
    return {
      code: 0,
      submitted: batch.length,
      dataType: dataType,
      updated: updated,
      result: res,
    };
  } catch (err) {
    return {
      code: -1,
      errCode: err.errCode || 0,
      errMsg: err.errMsg || err.message || String(err),
    };
  }
};
