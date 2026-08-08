const fs = require('fs');
const path = require('path');

const rankingsFile = path.join(__dirname, 'rankings.json');
const rankings = JSON.parse(fs.readFileSync(rankingsFile, 'utf8'));

const providers = [
  'Anthropic', 'Google', 'OpenAI', 'Meta', 'DeepSeek', 'xAI', 'SpaceXAI',
  'Mistral', 'Alibaba', 'Qwen', 'Moonshot', 'MoonshotAI', 'Zhipu', 'Z.ai',
  'ByteDance', 'Bytedance', 'Baidu', 'Nvidia', 'Ai2', 'Microsoft',
  'Xiaomi', 'MiniMax', 'Tencent', 'StepFun', 'Stepfun', 'Thinking Machines',
  'Thinky', 'Reve', 'Dola', 'Perplexity', 'Cohere', '01.AI'
];

function cleanName(rawName) {
  let name = rawName;
  name = name.replace(/·.*/, '').replace(/Proprietary|Open Source|Free|MIT|Apache|Modified/g, '').trim();
  // 移除开头的 provider
  for (const p of providers) {
    if (name.startsWith(p)) { name = name.substring(p.length); break; }
  }
  // 移除结尾的 provider（可能有空格）
  for (const p of providers) {
    if (name.endsWith(p)) { name = name.substring(0, name.length - p.length); break; }
  }
  name = name.replace(/\([^)]*\)/g, '').trim();
  return name;
}

let fixed = 0;
Object.keys(rankings.data).forEach(catId => {
  Object.keys(rankings.data[catId]).forEach(dimId => {
    rankings.data[catId][dimId].forEach(m => {
      const oldName = m.name;
      m.name = cleanName(m.rawName || m.name);
      if (oldName !== m.name) fixed++;
    });
  });
});

fs.writeFileSync(rankingsFile, JSON.stringify(rankings, null, 2));
console.log(`已清理 ${fixed} 个模型名称`);

// 验证之前的问题模型
const text = rankings.data.text.overall;
const check = ['mimo-v2.5-pro', 'mimo-v2-pro', 'minimax-m3', 'hunyuan'];
console.log('\n验证:');
text.filter(m => check.some(c => m.name.indexOf(c.replace('-pro','')) >= 0 || m.name.indexOf(c) >= 0)).slice(0, 8).forEach(m => {
  console.log(`  ${m.name}`);
});
