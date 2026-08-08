#!/usr/bin/env node
/**
 * ⚠️ 已废弃：请改用 admin 页「一键上传」（云存储方案）
 *
 * 旧方案把数据导入云数据库，但：
 *   1. 文档结构（data）与 getRankings 读取的字段（rankings）不匹配，云端数据永远取不到
 *   2. 单文档/返回体积贴着微信 512KB / 1MB 上限，容易失败
 *
 * 新方案：admin 页把数据文件上传到云存储（上限 50MB），
 * 数据库只存 fileID 指针，小程序启动时 downloadFile 拉取解析。
 *
 * 用法: node upload_to_cloud.js   （仅供生成 rankings_cloud.json 参考）
 */

const fs = require('fs');
const path = require('path');

// 读取最新数据
const rankingsFile = path.join(__dirname, 'rankings.json');
const rankings = JSON.parse(fs.readFileSync(rankingsFile, 'utf8'));

// 生成上传数据
const uploadData = {
  data: rankings.data,
  categories: rankings.categories || [],
  dimensions: rankings.dimensions || [],
  lastUpdated: rankings.lastUpdated || new Date().toISOString().split('T')[0],
  source: rankings.source || 'arena.ai',
  updateTime: new Date().toISOString(),
};

console.log('=== 数据上传准备 ===');
console.log('数据量:', Object.keys(uploadData.data).length, '个大类');
console.log('更新时间:', uploadData.updateTime);
console.log('');
console.log('⚠️ 本脚本已废弃，仅生成参考文件。');
console.log('请改用新流程：');
console.log('  1. 开发者工具编译，临时加 pages/admin/admin');
console.log('  2. admin 页点「一键上传」→ 数据文件传到云存储');
console.log('  3. 小程序启动时自动 downloadFile 拉取最新数据，无需重新发布');
console.log('');

// 生成精简版数据用于上传（去掉不需要的字段）
const slimData = {
  updateTime: uploadData.updateTime,
  lastUpdated: uploadData.lastUpdated,
  source: uploadData.source,
  data: {},
};

Object.keys(uploadData.data).forEach(function (catId) {
  slimData.data[catId] = {};
  Object.keys(uploadData.data[catId]).forEach(function (dimId) {
    slimData.data[catId][dimId] = uploadData.data[catId][dimId].map(function (m) {
      return {
        rank: m.rank,
        name: m.name,
        elo: m.elo,
        margin: m.margin,
        votes: m.votes,
        price: m.price,
        context: m.context,
      };
    });
  });
});

// 保存精简版用于上传
const slimFile = path.join(__dirname, 'rankings_cloud.json');
fs.writeFileSync(slimFile, JSON.stringify([slimData], null, 2));
console.log('精简版数据已保存到:', slimFile);
console.log('文件大小:', (fs.statSync(slimFile).size / 1024).toFixed(0), 'KB');
console.log('');
console.log('请用此文件在云开发数据库中导入');
