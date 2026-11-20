// pages/board-cn — 国产AI模型排行（搜一搜落地页）
var createBoardPage = require('../../utils/board-page.js');

Page(createBoardPage({
  shareTitle: '国产AI模型排行',
  path: '/pages/board-cn/board-cn',
  deepLink: '/pages/index/index?category=text&dim=overall&region=cn',
}));
