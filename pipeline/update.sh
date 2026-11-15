#!/bin/bash
# 一键更新 AI 模型排行数据
# 用法: cd pipeline && bash update.sh
#
# 数据源优先级：
#   1) 爬 arena.ai 网页（数据最全，含 image-to-webdev）
#   2) 若被 Cloudflare 拦截（403 / 抓不到数据），自动回退到 LMArena 官方
#      HuggingFace 数据集（需要代理，见 fetch_lmarena_hf.py）
set -e

echo "=========================================="
echo "  AI模型排行 - 数据更新"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. 抓取 LMArena 全量排行（Puppeteer，约5分钟）
echo ""
echo "[1/4] 抓取 LMArena 排行榜..."
node scrape_lmarena.js || true

# 统计爬到的条目数
COUNT=$(python3 -c "
import json
try:
    d=json.load(open('rankings.json'))
    print(sum(len(v) for c in d.get('data',{}).values() for v in c.values()))
except Exception:
    print(0)
" 2>/dev/null || echo 0)
echo "  本次爬取条目: $COUNT"

HF_USED=0
if [ "$COUNT" -lt 100 ]; then
  echo ""
  echo "⚠️  网页爬取失败（通常是被 Cloudflare 拦截）"
  echo "[1b/4] 改用 LMArena 官方 HuggingFace 数据集..."
  python3 fetch_lmarena_hf.py
  HF_USED=1
fi

# 2. 抓取 Agent 排行（修复 rank）——HF 源已含 agent，无需再抓
if [ "$HF_USED" -eq 0 ]; then
  echo ""
  echo "[2/4] 抓取 Agent 排行..."
  node scrape_agent.js
else
  echo ""
  echo "[2/4] Agent 排行已由 HF 数据集提供，跳过"
fi

# 3. 抓取国产模型定价
echo ""
echo "[3/4] 抓取国产模型定价..."
node scrape_cn_prices.js

# 4. 合并数据 + 压缩输出
echo ""
echo "[4/4] 构建 rankings.js..."
python3 build_rankings.py

echo ""
echo "=========================================="
echo "  ✅ 数据更新完成"
echo ""
echo "  下一步（让云端生效，用户无需重新发布小程序）:"
echo "    1. 在 app.json 临时加 pages/admin/admin"
echo "    2. 开发者工具编译 → admin 页点「一键上传」"
echo "    3. 去掉 app.json 的 admin 页面"
echo ""
echo "  说明: 数据会上传到云存储，小程序启动时自动拉取最新，无需重新发布。"
echo "=========================================="
