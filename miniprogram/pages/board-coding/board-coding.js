// pages/board-coding — AI编程模型排行（搜一搜落地页）
var createBoardPage = require('../../utils/board-page.js');

Page(createBoardPage({
  shareTitle: 'AI编程模型排行',
  path: '/pages/board-coding/board-coding',
  deepLink: '/pages/index/index?category=text&dim=coding',
}));
