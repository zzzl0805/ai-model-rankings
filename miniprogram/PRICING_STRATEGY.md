# AI模型定价数据策略方案

## 一、问题本质

### 价格为什么不一致？

每个模型实际上有 **3 层价格**：

```
模型官方价（权威）           ← 厂商自己定的价
  ↓
聚合代理价（OpenRouter 等）   ← 第三方转售，可能便宜/贵
  ↓
云厂商价（AWS/Azure/火山等）  ← 云平台转售，加价赚差价
```

### 差异来源

| 来源 | 说明 | 例子 |
|------|------|------|
| 供应商不同 | OpenRouter 用 together.ai/fireworks 等多家 | Claude Opus 官方$15，代理$5 |
| 批量折扣 | 长期合约/大客户有折扣 | 转嫁给用户 |
| 缓存价 | prompt cache 命中更便宜 | OpenRouter 有 input_cache_read |
| 区域定价 | 中国区/海外区价格不同 | GLM 国内¥8，海外$0.75 |
| 时效性 | 官方调价，代理未及时跟进 | 数据滞后 |

### 全球性问题（不是只有国内）

- **海外**：Claude Opus 代理比官方便宜 67%；GPT-5-mini 代理贵 67%
- **国内**：GLM 国内¥8，OpenRouter $0.75（≈¥5.4），差 33%
- **唯一一致**：Google Gemini（官方严控定价）

---

## 二、策略方案

### 核心原则

**优先用模型官方价**（权威），OpenRouter 仅作补充。

### 数据源优先级

```
1. 厂商官方价（最高优先级）
   - 海外：anthropic.com / openai.com / ai.google.dev / deepseek.com
   - 国内：open.bigmodel.cn / platform.moonshot.cn / volcengine.com 等

2. OpenRouter API（兜底）
   - 当官方价抓不到时使用
   - 明确标注「代理价」

3. 标注来源
   - 每个价格必须带 source 字段
   - 让用户知道价格来源
```

### 价格字段设计

```javascript
"price": {
  "official": {           // 官方价（权威）
    "input": 15,
    "output": 75,
    "currency": "USD",
    "source": "anthropic.com"
  },
  "openrouter": {         // 代理价（参考）
    "input": 5,
    "output": 25,
    "currency": "USD",
    "source": "openrouter.ai"
  },
  "display": "official"   // 默认显示哪个
}
```

### 显示策略

小程序里**默认显示官方价**，但提供切换：

```
Claude Opus 4.8
官方价: $15/$75/百万token  [官方]
代理价: $5/$25/百万token   [OpenRouter]
```

---

## 三、实施计划

### Phase 1：海外模型官方价（本次）

建立官方价数据库，覆盖主流模型：

| 厂商 | 官网 | 货币 | 抓取方式 |
|------|------|------|---------|
| Anthropic | anthrop.com/pricing | USD | web reader |
| OpenAI | openai.com/api/pricing | USD | web reader |
| Google | ai.google.dev/pricing | USD | web reader |
| DeepSeek | deepseek.com | USD/CNY | web reader |
| xAI | x.ai | USD | web reader |
| Mistral | mistral.ai | USD | web reader |

### Phase 2：国内模型官方价（部分已做）

| 厂商 | 官网 | 货币 | 状态 |
|------|------|------|------|
| 智谱 GLM | open.bigmodel.cn | CNY | ✅ 已做 |
| 月之暗面 Kimi | platform.moonshot.cn | CNY | 待做 |
| 阿里 Qwen | dashscope.aliyun.com | CNY | 待做 |
| 字节豆包 | volcengine.com | CNY | 待做 |
| 百度 ERNIE | yiyan.baidu.com | CNY | 待做 |
| 腾讯混元 | cloud.tencent.com | CNY | 待做 |
| DeepSeek | deepseek.com | CNY | 待做 |

### Phase 3：价格抓取自动化

- 海外：写爬虫抓各厂商定价页（类似 LMArena 爬虫）
- 国内：web reader 抓取（智谱已验证可行）
- 统一存入 `official_prices.py`

### Phase 4：UI 改造

- 详情页显示「官方价」和「代理价」双价格
- 计算器可切换价格来源
- 对比页标注价格来源

---

## 四、为什么选这个策略

### 方案对比

| 策略 | 优点 | 缺点 | 评分 |
|------|------|------|------|
| A. 只用 OpenRouter | 简单 | 价格不准，最多差 67% | ❌ |
| B. 只用官方价 | 准确权威 | 抓取成本高 | ✅ |
| C. 双价格显示 | 最透明 | UI 复杂 | ✅ |
| D. 只用官方，标注代理 | 准确+可追溯 | 中等工作量 | ⭐推荐 |

**推荐方案 D**：
- 主显示用官方价（用户真正会付的钱）
- 数据里保留代理价作为参考
- 明确标注来源

---

## 五、风险与对策

### 风险1：官方价难抓取
- **问题**：很多官网是 JS 渲染
- **对策**：用 web reader MCP（已验证智谱可行）/ Puppeteer 爬虫

### 风险2：价格频繁变动
- **问题**：厂商调价后数据过期
- **对策**：每周/每月定时重新抓取 + 标注 `lastUpdated`

### 风险3：分段计价
- **问题**：GLM 按 token 长度分段，不同段不同价
- **对策**：取标准档（输入<32K）作为基准，详情页显示分段规则

### 风险4：免费模型
- **问题**：GLM-4.7-Flash 等免费
- **对策**：价格设为 0，标注「免费」

---

## 六、当前进展

- ✅ 智谱 GLM：已用官网价
- ✅ 数据结构：已支持 `source` 字段
- ⏳ 海外模型：待补官方价
- ⏳ 其他国内模型：待补官网价
