// 模型元数据辅助 - 友好名、厂商、点评、优缺点
// 供各页面统一调用

// 模型名 → 友好显示名
var NAME_MAP = {
  'claude-fable-5': 'Claude Fable 5', 'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-opus-4-7': 'Claude Opus 4.7', 'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-sonnet-5': 'Claude Sonnet 5', 'claude-haiku-4': 'Claude Haiku 4.5',
  'gpt-5.6-sol-xhigh': 'GPT-5.6 Sol', 'gpt-5.6': 'GPT-5.6', 'gpt-5.5': 'GPT-5.5',
  'gpt-5.4': 'GPT-5.4', 'gpt-5.2': 'GPT-5.2', 'gpt-5-mini': 'GPT-5 Mini', 'gpt-5': 'GPT-5',
  'gemini-3.6-flash': 'Gemini 3.6 Flash', 'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3-flash': 'Gemini 3 Flash', 'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
  'gemini-3-pro': 'Gemini 3 Pro', 'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'deepseek-v4': 'DeepSeek-V4', 'deepseek-v3': 'DeepSeek-V3', 'deepseek-r1': 'DeepSeek-R1',
  'glm-5.2': 'GLM-5.2', 'glm-5.1': 'GLM-5.1', 'glm-5': 'GLM-5', 'glm-4.7': 'GLM-4.7',
  'kimi-k3': 'Kimi K3', 'kimi-k2.7': 'Kimi K2.7', 'kimi-k2.6': 'Kimi K2.6',
  'qwen3-max': 'Qwen3 Max', 'qwen-plus': 'Qwen Plus', 'qwen-flash': 'Qwen Flash',
  'grok-4': 'Grok-4', 'grok-3': 'Grok-3', 'muse-spark': 'Muse Spark',
  'llama-4-maverick': 'Llama 4 Maverick', 'llama-4-scout': 'Llama 4 Scout',
  'ernie-5': '文心 ERNIE 5', 'hunyuan': '混元', 'mimo-v2': 'MiMo v2', 'minimax': 'MiniMax',
};

function getDisplayName(name) {
  if (!name) return '';
  // 精确匹配
  for (var key in NAME_MAP) {
    if (name === key || name.indexOf(key) === 0) {
      var rest = name.substring(key.length);
      // 处理变体后缀
      if (rest.indexOf('-thinking') === 0) return NAME_MAP[key] + ' (思考)';
      if (rest.indexOf('-high') === 0) return NAME_MAP[key] + ' (高配)';
      if (rest.indexOf('-preview') === 0) return NAME_MAP[key] + ' (预览)';
      if (rest === '') return NAME_MAP[key];
    }
  }
  // 清理残留 provider
  return name.replace(/Anthropic|Google|OpenAI|Meta|Moonshot|Z\.ai|Xiaomi|MiniMax|Tencent|Baidu|Bytedance/g, '').trim() || name;
}

function getProviderCN(name) {
  var n = (name || '').toLowerCase();
  // 必须先匹配 kling（避免 kling-o1 被下面的 o\d 误判，且不能匹配 inkling）
  if (/^kling|kling-/.test(n)) return '快手';
  if (/seedance|dreamina|dola-seed|seed-\d/.test(n)) return '字节跳动';
  if (/wan|wanx/.test(n)) return '阿里万相';
  if (/happyhorse/.test(n)) return '阿里';
  if (/veo/.test(n)) return 'Google';
  if (/sora/.test(n)) return 'OpenAI';
  if (/claude|opus|sonnet|haiku|fable/.test(n)) return 'Anthropic';
  if (/gpt|chatgpt|^o[1-9]-|^o[1-9]$|o4-mini/.test(n)) return 'OpenAI';
  if (/gemini/.test(n)) return 'Google';
  if (/deepseek/.test(n)) return '深度求索';
  if (/glm/.test(n)) return '智谱AI';
  if (/kimi/.test(n)) return '月之暗面';
  if (/qwen|qwq/.test(n)) return '阿里通义';
  if (/grok/.test(n)) return 'xAI';
  if (/muse|llama/.test(n)) return 'Meta';
  if (/ernie|wenxin/.test(n)) return '百度';
  if (/hunyuan/.test(n)) return '腾讯';
  if (/mimo/.test(n)) return '小米';
  if (/minimax|abab/.test(n)) return 'MiniMax';
  if (/mistral|magistral|mixtral/.test(n)) return 'Mistral';
  if (/doubao/.test(n)) return '字节豆包';
  if (/inkling/.test(n)) return 'Thinking Machines';
  if (/cogvideo|cogview/.test(n)) return '智谱AI';
  if (/stepfun|step-/.test(n)) return '阶跃星辰';
  if (/command-/.test(n)) return 'Cohere';
  if (/phi-/.test(n)) return '微软';
  if (/gemma/.test(n)) return 'Google';
  if (/nemotron/.test(n)) return 'NVIDIA';
  if (/reka/.test(n)) return 'Reka';
  if (/olmo/.test(n)) return 'AI2';
  if (/granite/.test(n)) return 'IBM';
  if (/nova/.test(n)) return 'Amazon';
  if (/mercury/.test(n)) return 'Inception';
  if (/amazon-nova/.test(n)) return 'Amazon';
  return '其他';
}

// 数据可靠性：根据投票数/会话数
function getConfidence(votes) {
  if (votes >= 5000) return { level: 'high', label: '样本充足', color: '#10B981' };
  if (votes >= 1000) return { level: 'medium', label: '样本一般', color: '#F59E0B' };
  if (votes > 0) return { level: 'low', label: '样本偏少', color: '#EF4444' };
  return { level: 'none', label: '无数据', color: '#94A3B8' };
}

// 简单点评（基于 Elo 和定价）
function getReview(name, elo, price) {
  var parts = [];
  if (elo >= 1490) parts.push('顶尖水平');
  else if (elo >= 1470) parts.push('第一梯队');
  else if (elo >= 1440) parts.push('主流水平');
  else parts.push('一般水平');

  if (price && price.input > 0) {
    var total = price.input + price.output;
    if (total > 50) parts.push('价格昂贵');
    else if (total < 5) parts.push('极具性价比');
    else if (total < 15) parts.push('价格适中');
  } else {
    parts.push('需查官网定价');
  }
  return parts.join('，');
}

module.exports = {
  getDisplayName: getDisplayName,
  getProviderCN: getProviderCN,
  getConfidence: getConfidence,
  getReview: getReview,
};
