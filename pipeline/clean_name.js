/**
 * LMArena 模型名清洗（scrape_lmarena.js / scrape_agent.js 共用）
 *
 * arena.ai 的原始名格式不固定，常见几种：
 *   "AnthropicClaude Opus 4.6 (High)Anthropic · Proprietary"  厂商前缀+展示名+厂商后缀
 *   "Qwen3.8-MaxAlibaba · Proprietary"                        模型名本身以厂商名开头
 *   "OpenAIgpt-5.5-highOpenAI · Proprietary"                  已经是 slug
 *
 * 清洗规则：
 *   1. 去掉 "· License" 段
 *   2. 去掉开头/结尾的厂商名
 *   3. **保留括号变体**（(High)/(Max)），否则变体会与基础版同名撞车
 */

const PROVIDERS = [
  'Anthropic', 'Google', 'OpenAI', 'Meta', 'DeepSeek', 'xAI', 'SpaceXAI',
  'Mistral', 'Alibaba', 'Qwen', 'Moonshot', 'MoonshotAI', 'Zhipu', 'Z.ai',
  'ByteDance', 'Bytedance', 'Baidu', 'Nvidia', 'Ai2', 'Microsoft',
  'Xiaomi', 'MiniMax', 'Tencent', 'StepFun', 'Stepfun',
  'Thinking Machines', 'Thinky', 'Reve', 'Dola', 'Perplexity', 'Cohere', '01.AI',
];

function cleanModelName(rawName) {
  if (!rawName) return '';

  let name = String(rawName)
    .replace(/·.*/, '')
    .replace(/Proprietary|Open Source|Free|MIT|Apache|Modified/g, '')
    .trim();

  // 开头厂商名：若去掉后以数字开头（如 "Qwen3.8-Max"），
  // 说明厂商名本身就是模型名的一部分，不能剥
  for (const p of PROVIDERS) {
    if (name.startsWith(p)) {
      const rest = name.substring(p.length);
      if (!/^\d/.test(rest)) name = rest;
      break;
    }
  }

  // 结尾厂商名（如 "Qwen3.8-MaxAlibaba" 末尾的 Alibaba）
  for (const p of PROVIDERS) {
    if (name.endsWith(p) && name.length > p.length) {
      name = name.substring(0, name.length - p.length);
      break;
    }
  }

  // 保留括号里的变体（(High)/(Max)/(Thinking)…），只压缩空白
  return name.replace(/\s+/g, ' ').trim();
}

module.exports = { cleanModelName };
