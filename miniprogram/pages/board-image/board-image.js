// pages/board-image — AI画图模型排行（搜一搜落地页）
var createBoardPage = require('../../utils/board-page.js');

Page(createBoardPage({
  shareTitle: 'AI画图模型排行',
  path: '/pages/board-image/board-image',
  deepLink: '/pages/index/index?category=text-to-image&dim=overall',
}));
