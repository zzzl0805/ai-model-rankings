# AI模型排行小程序 — 项目文档

## 一、产品概述

帮开发者选择最合适的AI大模型的微信小程序。聚合 LMArena 权威评测数据 + 各厂商官方定价，提供排行、对比、成本计算和场景推荐。

---

## 二、技术架构

```
ai-model-rankings/
├── app.js                    # 入口，初始化云开发 + 后台加载云端数据
├── app.json                  # 页面配置 + TabBar
├── app.wxss                  # 全局样式 + CSS变量
├── data/
│   └── rankings.js           # 本地兜底数据（730KB，100+模型）
├── pages/
│   ├── index/                # 排行页（TabBar）
│   ├── compare/              # 对比页（TabBar）
│   ├── calculator/           # 计算器页（TabBar）
│   ├── recommend/            # 推荐页（TabBar）
│   ├── detail/               # 模型详情页
│   ├── methodology/          # 排行规则说明
│   └── admin/                # 数据管理页（发布时从app.json移除）
├── utils/
│   ├── model-meta.js         # 模型名映射、厂商识别、置信度、点评
│   ├── calculator.js         # 成本计算（ES5）
│   ├── util.js               # 防抖、数字格式化（ES5）
│   └── ad-manager.js         # 广告管理（流量主开通后用）
├── cloudfunctions/
│   ├── getRankings/          # 云函数：读取排行数据
│   └── uploadRankings/       # 云函数：上传排行数据（超时60秒）
├── assets/tabbar/            # TabBar图标（已用emoji替代）
├── package-about/            # 子包：关于、隐私政策
└── package-export/           # 子包：导出功能（占位）

data-pipeline/                # 数据抓取工具（Python + Node.js）
├── scrape_lmarena.js         # LMArena爬虫（Puppeteer）
├── scrape_agent.js           # Agent排行爬虫
├── build_rankings.py         # 合并数据 + 定价 → rankings.js
├── official_prices.py        # 国产模型官方定价表
└── rankings.json             # 爬虫原始数据
```

### 数据流

```
LMArena网站 → scrape_lmarena.js → rankings.json
                                      ↓
各厂商官网 → official_prices.py → build_rankings.py → rankings.js（本地兜底）
OpenRouter API →  ─────────────────────────↑
                                              ↓
                                      admin页面一键上传
                                              ↓
                                      云数据库（用户读取）
```

### 云开发配置

- **云环境ID**：`cloud1-d7g5tmh916383e8b5`
- **数据库集合**：`rankings`（权限：仅创建者可读写）
- **getRankings**：读取最新一条记录，返回 `rankings` 字段
- **uploadRankings**：删除旧记录 + 写入新记录（config.json 设置 timeout: 60秒）

---

## 三、数据说明

### 数据来源

| 数据 | 来源 | 可靠性 |
|------|------|--------|
| Elo排行 | LMArena (arena.ai) | 人类偏好投票，权威但主观 |
| API定价（国产） | 各厂商官网（智谱/Kimi/阿里等） | 官方权威 |
| API定价（海外） | OpenRouter API | 代理价，可能与官网不同 |
| 汇率 | open.er-api.com 实时 | 每次构建时获取 |

### 大类（12个）

文本、WebDev、视觉、Agent、文档、搜索、图转码、文生图、图片编辑、文生视频、图生视频、视频编辑

### 维度（8个，仅文本大类全部有）

综合、编程、数学、写作、难题、指令、专家、长对话

### 置信度

- 样本充足（绿色）：≥5000票
- 样本一般（橙色）：≥1000票
- 样本偏少（红色）：<1000票

### 定价策略

- 国产模型：优先用官网人民币价格
- 海外模型：用官方美元价格
- 兜底：OpenRouter 代理价格
- 每条定价标注 `source` 字段

---

## 四、数据更新流程（免审核）

### 完整步骤

```bash
# 1. 抓取最新排行（5分钟）
cd data-pipeline
node scrape_lmarena.js        # LMArena 12大类
node scrape_agent.js           # Agent排行（修rank）

# 2. 抓取国产模型定价（2分钟）
node scrape_cn_prices.js       # 智谱/Kimi/阿里等官网定价

# 3. 合并定价 + 生成 rankings.js（1分钟）
python3 build_rankings.py

# 4. 压缩
cd ../ai-model-rankings
node -e "var fs=require('fs');var d=require('./data/rankings.js');fs.writeFileSync('./data/rankings.js','module.exports='+JSON.stringify(d)+';');"
```

### 上传到云端

```
1. app.json 临时加回 "pages/admin/admin"
2. 开发者工具编译
3. 编译模式选 pages/admin/admin
4. 点「一键上传到云端」
5. 等待10-20秒，显示「✅ 上传成功」
6. app.json 删掉 admin 页面
7. 重新编译
```

**注意**：上传必须在**电脑端开发者工具**操作，手机端会超时。

### 用户端

用户下次打开小程序 → 自动从云端拉取最新数据 → 无需更新小程序。

---

## 五、发布流程

### 首次发布

1. 确认 app.json **不含** admin 页面
2. 确认无 DEBUG 调试信息
3. 开发者工具 → 上传 → 版本号 1.0.0
4. mp.weixin.qq.com → 版本管理 → 提交审核
5. 审核通过 → 发布

### 代码更新（需要审核）

改了页面/功能代码 → 上传 → 提交审核 → 发布

### 数据更新（不需要审核）

见上方「数据更新流程」

---

## 六、已解决的报错记录

### 1. `require('../../data/models.json')` 报错

**原因**：微信小程序 require 不能加载 .json 文件
**解决**：改为 .js 文件，用 `module.exports = {...}` 导出

### 2. WXML 编译错误 `unexpected character`

**原因**：WXML 中 `<1000票` 的 `<` 被解析为标签
**解决**：改为 `少于1000票`

### 3. `79:151:unexpected character 1`

**原因**：数字分隔符 `1_000_000`（ES2021），微信编译器不支持
**解决**：全部改为 `1000000`

### 4. ES6 语法报错（const/let/=>/??/Map）

**原因**：微信 ES6→ES5 转译器对部分语法支持不全
**解决**：utils/ 下所有文件改为纯 ES5

### 5. 云函数上传超时

**原因**：默认超时3秒，写入730KB数据需要10-20秒
**解决**：uploadRankings 的 config.json 设置 `timeout: 60`

### 6. 模型名包含厂商后缀

**原因**：LMArena 原始名如 `Anthropicclaude-fable-5Anthropic`
**解决**：clean_names.js 清理 + scrape_lmarena.js 的 cleanModelName 函数

### 7. Agent rank 值错误（114/218 而非 1/2/3）

**原因**：scrape_agent.js 解析了错误的列
**解决**：重新按数组索引赋值 `rank = i + 1`

### 8. 定价被汇率错误除（$10 变 $1.47）

**原因**：build_rankings.py 硬编码 `currency = "CNY"`，导致美元价格被除以汇率
**解决**：改为 `currency = official.get("currency", "CNY")`

### 9. 模型详情页卡在加载中

**原因**：调用了已删除的 `meta.getReleaseDate()`
**解决**：删除调用 + 加 try-catch

### 10. 对比页添加不了模型

**原因**：WXML 用 `data-id` 但 JS 读 `dataset.name`
**解决**：统一用 `data-name`

---

## 七、关键约束

| 约束 | 说明 |
|------|------|
| 微信主包限制 | 2MB（rankings.js 压缩后730KB） |
| require 只支持 .js | 不能 require .json |
| 云函数默认超时 | 3秒（大操作需改 config.json） |
| callFunction 建议上限 | 256KB（超过用云存储） |
| TabBar 图标 | 81×81 PNG，或不用图标用 emoji |
| 云函数部署 | 必须在开发者工具右键部署 |

---

## 八、后续优化方向

1. **排行榜数据自动化**：GitHub Actions 定时跑爬虫
2. **广告接入**：流量主开通后，填入 ad-manager.js 的广告单元ID
3. **用户收藏功能**：已有 Storage 基础，需加 UI
4. **分享功能**：模型详情页已预留 onShareAppMessage
5. **更多模型**：定期更新 TRACKED_MODELS 配置
6. **定价补全**：ERNIE/豆包/混元等国产模型补官网价
