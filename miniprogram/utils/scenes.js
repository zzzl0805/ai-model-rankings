// utils/scenes.js — 计算器/预算选型共用的场景与用量（单位：万 token/月）
module.exports = [
  { id: 'chat', name: '日常聊天', input: 50, output: 50, rankCat: 'text', rankDim: 'overall' },
  { id: 'coding', name: '编程', input: 200, output: 200, rankCat: 'text', rankDim: 'coding' },
  { id: 'writing', name: '写作', input: 100, output: 300, rankCat: 'text', rankDim: 'overall' },
  { id: 'agent', name: 'Agent', input: 500, output: 500, rankCat: 'agent', rankDim: 'overall' },
  { id: 'data', name: '数据处理', input: 1000, output: 100, rankCat: 'text', rankDim: 'overall' },
];
