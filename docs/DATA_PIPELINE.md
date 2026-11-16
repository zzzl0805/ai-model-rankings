# 数据管道

## 一键更新

```bash
cd pipeline && bash update.sh
```

流程：

```
[1] node scrape_lmarena.js       爬 arena.ai（约 5-8 分钟）
    └─ 抓到 <100 条 → 自动回退 python3 fetch_lmarena_hf.py
[2] node scrape_agent.js         Agent 榜（HF 源已含则跳过）
[3] node scrape_cn_prices.js     国产模型官网定价
[4] python3 build_rankings.py    合并 → miniprogram/data/rankings.js
```

## 数据源

### 主源：arena.ai（网页抓取）

- 12 个大类 × 8 个维度
- **经常被 Cloudflare 拦截**（HTTP 403「正在进行安全验证」）
- 拦截时连首页和 API 都 403，属 IP 级封锁，换 UA / 无头/有头 / 代理都试过无效
- **结论：拦了就用 HF 源，不要在这上面耗时间**

### 备源：HuggingFace 官方数据集（推荐）

数据集 `lmarena-ai/leaderboard-dataset`（CC BY 4.0，每日更新）

- 取数：`https://datasets-server.huggingface.co/parquet?dataset=...` 拿各 config 的 latest parquet
- **需要代理**（本机 `127.0.0.1:7897`，脚本自动读 macOS 系统代理）
- 按 `leaderboard_publish_date` 取最新日期

**映射表**（`fetch_lmarena_hf.py: CATEGORY_MAP`）：

| 我们的类目 | HF config | 备注 |
|-----------|-----------|------|
| text | `text_style_control` | category 含 overall/coding/math/creative_writing/hard_prompts/instruction_following/expert/multi_turn |
| webdev / vision / document / search | 同名 config | vision 的 `creative_writing_vision` → writing |
| agent | `agent` | **字段不同**：用 `score`(0~1，×100 = 净提升%) 和 `session_count`，不是 `rating`/`vote_count` |
| agent 子指标 | `agent_*` 5 个 config | 按 model_name join |
| text-to-image / image-edit / text-to-video / image-to-video / video-edit | 同名 config | |
| **image-to-webdev** | ❌ 无 | 用上次本地数据兜底 |

## 模型名清洗（`pipeline/clean_name.js`）

规则（两个抓取脚本共用）：

1. 去掉 `· License` 段
2. 去掉开头/结尾厂商名 —— **但去掉后若以数字或分隔符开头则保留**
   - `Qwen3.8-Max` → 保留（Qwen 是模型名的一部分）
   - `DeepSeek-V4.1-Flash` → 保留
   - `AnthropicClaude Opus 4.6` → 剥掉 Anthropic
3. **保留括号变体** `(High)` / `(Max)` —— 删掉会与基础版撞名

## 国产定价抓取

三个站点，**一律按表头名定位列**，不写死列序号：

| 站点 | URL | 备注 |
|------|-----|------|
| 智谱 | `open.bigmodel.cn/pricing` | 卡片布局（`.model-card`），官网只公开 2 个模型 |
| Kimi | `platform.moonshot.cn/docs/pricing/chat` | 价格用 `¥` 不是「元」；取「缓存未命中」列 |
| 阿里 | `help.aliyun.com/zh/model-studio/model-pricing` | 285 个表格，价格为「元」|

合并规则：**先到先得**（`if (allPrices[m.name]) return;`），避免阿里页的第三方托管模型覆盖官方价。

## 已知坑（都会复现，务必留意）

| # | 坑 | 对策 |
|---|-----|------|
| 1 | **维度数据累积重复**：arena.ai 切维度时保留旧 table（隐藏），`querySelectorAll` 会抓到累积行 | 只抓**可见 table**：`getBoundingClientRect().height > 0` |
| 2 | **Agent 会话数变 0**：arena.ai 新增 3 列，Sessions 不再是最后一列 | 按表头 `thead th` 定位 Sessions 列 |
| 3 | **模型名格式突变**：从 slug 改为展示名，导致撞名 + 定价失配 | 保留变体 + 归一化匹配（`_norm_key`）|
| 4 | **厂商前缀误剥**：`DeepSeek-V4.1` 变成 `-V4.1` | 剩余部分以字母开头才剥 |
| 5 | **空数据覆盖线上** | `build_rankings.py` 安全阀：<500 条拒绝写入 |

## 验证口径（改完必须跑）

```bash
node -e "const d=require('./miniprogram/data/rankings.js');
let t=0,bad=[];
for(const c in d.data)for(const k in d.data[c]){const a=d.data[c][k];t+=a.length;
  const dup=a.length-new Set(a.map(m=>m.name)).size; if(dup>2)bad.push(c+'/'+k+':'+dup);}
console.log('条目',t,'| 异常重复',bad.length?bad:'无');
console.log('agent votes为0',(d.data.agent.overall||[]).filter(m=>!m.votes).length);
"
```

合格标准：
- 总条目 > 4000
- 各维度撞名 ≤ 2（同名但不同变体的正常情况）
- agent votes 无 0
- 无空类目
