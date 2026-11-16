# 项目文档

> 这是本项目的**唯一权威文档源**。根目录和 `miniprogram/` 下的旧文档已过时，仅作历史参考。

## 怎么用这套文档

**给人看**：按下面的目录找你要的内容。
**给 AI 看**：从 `CLAUDE.md` 进入 → 按任务读本文档索引里对应的一篇 → 再读功能文档。

## 目录

| 文档 | 内容 | 什么时候读 |
|------|------|-----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、数据流、云资源 | 了解全局 / 改架构前 |
| [DATA_PIPELINE.md](./DATA_PIPELINE.md) | 数据源、映射、已知坑 | 改抓取 / 数据出问题时 |
| [DECISIONS.md](./DECISIONS.md) | 关键技术决策与理由（ADR）| 想推翻某个设计前 |
| [ROADMAP.md](./ROADMAP.md) | 路线图、当前进度 | 规划下一步 / 接上下文 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 常见故障排查 | 线上出问题时 |
| [ops/release.md](./ops/release.md) | 发布流程、检查清单 | 要发版时 |
| [features/](./features/) | 每个需求/功能的详细文档 | 做具体功能时 |
| [templates/feature.md](./templates/feature.md) | 功能文档模板 | 写新需求文档时 |

## 功能文档列表

| 文档 | 状态 | 说明 |
|------|------|------|
| [v1.1-growth.md](./features/v1.1-growth.md) | 📝 规划中 | 增长版：国产视角、结论卡、收藏、场景化 |

## 写作规则

1. **一个功能一份文档**，文件名 `v<版本>-<主题>.md`
2. 用 `templates/feature.md` 的固定结构
3. 文档里引用代码用 `路径:行号` 格式，方便跳转
4. 状态只有四种：`📝 规划中` / `🚧 开发中` / `✅ 已上线` / `⏸ 搁置`
5. 需求变更时**在原文档追加"变更记录"**，不要另开新文档

## 旧文档说明

以下文档已过时，内容已并入 `docs/`：

- `PROJECT_DOC.md`（根目录）→ 并入 ARCHITECTURE + DATA_PIPELINE
- `miniprogram/PROJECT_DOC.md`、`PRD.md`、`TECH_PLAN.md`、`OPTIMIZATION_PLAN.md`、`PRICING_STRATEGY.md` → 历史参考

⚠️ 已知错误：旧文档称"详情页已预留 onShareAppMessage"，实际当时完全没有分享功能（2026-11 才补上）。
