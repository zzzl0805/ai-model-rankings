/**
 * Calculator - 成本计算工具 (ES5)
 */
var DEFAULT_RATIO = 0.25;
var USD_TO_CNY = 7.2;

function getQuickPresets() {
  return [
    { label: '轻度使用', inputTokens: 1000000 },
    { label: '中度', inputTokens: 10000000 },
    { label: '重度', inputTokens: 100000000 },
    { label: '企业级', inputTokens: 1000000000 },
  ];
}

function calculateCosts(modelOrModels, inputTokens, outputTokens, ratio) {
  ratio = ratio || DEFAULT_RATIO;
  var models = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels];
  var effectiveOutputTokens = outputTokens != null ? outputTokens : Math.round(inputTokens * ratio);

  return models.map(function (model) {
    var inputPrice = model.pricing.inputPrice;
    var outputPrice = model.pricing.outputPrice;

    if (model.pricing.freeTier) {
      return {
        modelId: model.id,
        modelName: model.name,
        provider: model.provider,
        monthlyCostUSD: 0,
        monthlyCostCNY: 0,
        annualCostUSD: 0,
        costTier: 'free',
      };
    }

    var inputCostUSD = (inputTokens / 1000000) * inputPrice;
    var outputCostUSD = (effectiveOutputTokens / 1000000) * outputPrice;
    var monthlyCostUSD = inputCostUSD + outputCostUSD;

    return {
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      monthlyCostUSD: round2(monthlyCostUSD),
      monthlyCostCNY: usdToCny(monthlyCostUSD),
      annualCostUSD: round2(monthlyCostUSD * 12),
      costTier: getCostTier(monthlyCostUSD),
    };
  });
}

function formatTokenCount(n) {
  if (n < 0) n = 0;
  if (n >= 1000000000) {
    return (n / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return String(n);
}

function formatPrice(usd) {
  if (usd < 0) usd = 0;
  return '$' + usd.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function usdToCny(usd, rate) {
  rate = rate || USD_TO_CNY;
  return round2(usd * rate);
}

function getCostTier(cost) {
  if (cost <= 0) return 'free';
  if (cost < 10) return 'low';
  if (cost < 100) return 'medium';
  if (cost < 1000) return 'high';
  return 'enterprise';
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { getQuickPresets: getQuickPresets, calculateCosts: calculateCosts, formatTokenCount: formatTokenCount, formatPrice: formatPrice, usdToCny: usdToCny, getCostTier: getCostTier, round2: round2 };
