# CLAUDE.md — AI 入口

> 每次会话先读这个文件，再按需读取 `docs/` 下的对应文档。**不要凭记忆猜项目状态**。

## 一句话

微信小程序「AI模型排行」：聚合 LMArena 人类投票排行（Elo）+ 各厂商官方定价，帮开发者/从业者选模型。

## 关键事实

| 项 | 值 |
|---|---|
| 小程序 AppID | `wxa4d26fd9da38777a` |
| 云环境 | `cloud1-d7g5tmh916383e8b5` |
| GitHub 仓库 | `github.com/zzzl0805/ai-model-rankings` |
| 数据规模 | 12 大类 × 8 维度，约 4200 条 |
| 当前阶段 | 早期（累计 UV 33），目标 30 天到 500 |
| 主体类型 | 个人（已认证、已备案，2027-07 需年审）|

## 目录

```
miniprogram/          小程序代码（页面、组件、云函数）
pipeline/             数据管道（抓取、清洗、构建）
docs/                 项目文档（先读 docs/README.md）
.github/workflows/    每日自动更新流水线
```

## 常用命令

```bash
# 本地更新数据（爬虫优先，失败自动回退 HuggingFace）
cd pipeline && bash update.sh

# 只重建 rankings.js（不重新抓取）
cd pipeline && python3 build_rankings.py

# 上传数据到云端（需开发者工具已登录）
# 1) 临时在 miniprogram/app.json 加 "pages/admin/admin"
# 2) 用 automator 调用 admin 页的 doUpload()（见 docs/ops/upload.md）
# 3) 移除 admin 页
```

## 数据链路（已全自动，勿手动干预）

```
每天 02:00  GitHub Actions
  ├─ 爬 arena.ai（被 Cloudflare 拦则回退 HuggingFace 官方数据集）
  ├─ 构建 → 强推 data 分支 + 打日期 tag vYYYY-MM-DD
  └─ 刷新 jsDelivr 缓存
        ↓
每天 03:00  syncRankings 云函数
  └─ 按日期 tag 从 jsDelivr 取数 → 上传云存储 → 更新数据库指针
        ↓
用户打开小程序 → getRankings 拿到签名链接 → 下载数据
```

## 铁律（踩过的坑，勿回归）

1. **数据不足 500 条时绝不覆盖 rankings.js**（`build_rankings.py` 已有安全阀，别拆）
2. **上传云存储必须用唯一路径**（`rankings-<日期>-<时间戳>.json`），同名覆盖会命中 CDN 旧缓存
3. **云函数超时不在 `config.json` 里生效**，必须在云开发控制台改（现在是 60 秒）
4. **腾讯云函数访问不了 GitHub Pages**，数据源用 jsDelivr + 日期 tag（分支 URL 会被缓存 12 小时）
5. **模型名保留括号变体**（`(High)`/`(Max)`），删掉会导致变体撞名
6. **厂商前缀剥离要看剩余部分**：`DeepSeek-V4.1`、`Qwen3.8` 里的厂商名属于模型名，不能剥
7. **arena.ai 切换维度会保留隐藏 table**，抓取必须只取可见 table

## 文档索引

| 你要做什么 | 先读 |
|-----------|------|
| 了解系统结构 | `docs/ARCHITECTURE.md` |
| 改数据管道/抓取 | `docs/DATA_PIPELINE.md` |
| 做新功能/优化 | `docs/ROADMAP.md` + `docs/features/` 对应文档 |
| 发布小程序 | `docs/ops/release.md` |
| 排查线上问题 | `docs/TROUBLESHOOTING.md` |
| 知道为什么这么做 | `docs/DECISIONS.md` |

## 工作约定

- **新需求/优化必须先写文档**（用 `docs/templates/feature.md`），再改代码
- 改动涉及数据管道时，同步更新 `docs/DATA_PIPELINE.md`
- 做出重大技术选择时，在 `docs/DECISIONS.md` 追加一条 ADR
- 功能上线后，更新 `docs/ROADMAP.md` 的状态
