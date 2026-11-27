# 系统架构

## 全景

```
┌─────────────────────────────────────────────────────────────┐
│  数据生产（云端，全自动）                                      │
│                                                             │
│  GitHub Actions（每天 02:00 北京时间）                        │
│    ├─ 爬 arena.ai ──被拦──► HuggingFace 官方数据集            │
│    ├─ 抓国产模型官网定价                                       │
│    ├─ build_rankings.py → rankings.js                        │
│    └─ 强推 data 分支 + 打 tag vYYYY-MM-DD                     │
│                    ↓                                        │
│              jsDelivr CDN（国内可访问）                        │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  数据分发（微信云开发）                                        │
│                                                             │
│  syncRankings 云函数（每小时检查）                            │
│    ├─ 按日期 tag 从 jsDelivr 拉取                             │
│    ├─ 上传云存储 rankings/rankings-<日期>-<时间戳>.json        │
│    └─ 更新数据库 rankings/_id=current 指针                    │
│                                                             │
│  getRankings 云函数                                           │
│    └─ 读指针 → getTempFileURL 生成签名链接（返回 <1KB）        │
└─────────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  小程序端                                                     │
│                                                             │
│  app.js onLaunch                                             │
│    └─ callFunction(getRankings) → downloadFile(签名链接)      │
│       → globalData.cloudRankings                             │
│                                                             │
│  页面：index / detail / compare / calculator / recommend     │
│        methodology（+ 子包 about / privacy / export）         │
└─────────────────────────────────────────────────────────────┘
```

## 为什么是这个架构

| 设计 | 原因 |
|------|------|
| 数据走**云存储**不走数据库 | `callFunction` 返回上限 1MB，数据库单次写入 512KB，整份数据 ~900KB 顶线 |
| 云函数返回**签名链接**不返回数据 | 云存储默认权限「仅创建者可读写」，客户端直接下载会被拒；云函数有管理员权限可生成临时链接 |
| **唯一文件路径** | 同名覆盖会命中 CDN 旧缓存，用户拿到旧数据 |
| **jsDelivr + 日期 tag** | 腾讯云函数在境内访问不了 GitHub Pages；分支 URL 有 12 小时缓存，tag 不可变 |
| 本地兜底 `miniprogram/data/rankings.js` | 云端失败时仍可用，代价是 890KB 主包体积 |

## 云资源清单

| 资源 | 名称 | 说明 |
|------|------|------|
| 云环境 | `cloud1-d7g5tmh916383e8b5` | |
| 云函数 | `getRankings` | 读取指针 + 生成签名链接 |
| 云函数 | `syncRankings` | 定时拉取数据并上传（超时 60s，在控制台设置）|
| 云函数 | `uploadRankings` | 写指针（admin 页用）|
| 云存储 | `rankings/rankings-<日期>-<时间戳>.json` | 每份约 900KB |
| 数据库 | `rankings` 集合 / `_id=current` | `{fileID, lastUpdated, updateTime}` |

## 小程序页面

| 页面 | 路径 | 作用 |
|------|------|------|
| 排行 | `pages/index/index` | 主 Tab，12 大类 × 8 维度榜单 |
| 详情 | `pages/detail/detail` | 单模型多维评分 + 定价 |
| 对比 | `pages/compare/compare` | 最多 3 个模型横向对比 |
| 计算器 | `pages/calculator/calculator` | 按 token 用量估算月费 |
| 推荐 | `pages/recommend/recommend` | 按场景推荐 |
| 方法论 | `pages/methodology/methodology` | 数据来源与口径说明 |
| 管理 | `pages/admin/admin` | **发布时移除**，仅在 `app.json` 临时加入 |

## 关键约束

- 主包上限 2MB：`data/rankings.js` 约 890KB，新增功能优先放子包
- 云函数 Node 16：不能用全局 `fetch`，用 `https` 模块
- 小程序 require 不支持 `.json`，数据必须是 `.js`
- `wx.cloud.callFunction` 返回值上限 1MB
