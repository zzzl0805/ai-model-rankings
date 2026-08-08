/**
 * util - 通用工具函数 (ES5)
 */

function debounce(fn, delay) {
  var timer = null;
  return function () {
    var args = arguments;
    var self = this;
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(function () {
      fn.apply(self, args);
      timer = null;
    }, delay);
  };
}

function formatNumber(n) {
  if (isNaN(n)) return '0';
  var parts = n.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function formatLargeNumber(n) {
  if (isNaN(n)) return '0';
  if (n >= 1000000000) {
    var val = n / 1000000000;
    return val % 1 === 0 ? val + 'B' : val.toFixed(1) + 'B';
  }
  if (n >= 1000000) {
    var val = n / 1000000;
    return val % 1 === 0 ? val + 'M' : val.toFixed(1) + 'M';
  }
  if (n >= 1000) {
    var val = n / 1000;
    return val % 1 === 0 ? val + 'K' : val.toFixed(1) + 'K';
  }
  return n.toString();
}

function getPriceTier(pricing) {
  if (pricing.freeTier) return 'free';
  var total = pricing.inputPrice + pricing.outputPrice;
  if (total < 1) return 'cheap';
  if (total < 10) return 'moderate';
  return 'expensive';
}

function getPriceColor(tier) {
  switch (tier) {
    case 'free': return '#10B981';
    case 'cheap': return '#06B6D4';
    case 'moderate': return '#F59E0B';
    case 'expensive': return '#EF4444';
    default: return '#64748B';
  }
}

function getPriceLabel(tier) {
  switch (tier) {
    case 'free': return '免费';
    case 'cheap': return '低价';
    case 'moderate': return '中等';
    case 'expensive': return '高价';
    default: return '未知';
  }
}

function deepCopy(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

module.exports = {
  debounce: debounce,
  formatNumber: formatNumber,
  formatLargeNumber: formatLargeNumber,
  getPriceTier: getPriceTier,
  getPriceColor: getPriceColor,
  getPriceLabel: getPriceLabel,
  deepCopy: deepCopy
};
