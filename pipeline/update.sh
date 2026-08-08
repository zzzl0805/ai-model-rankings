#!/bin/bash
# 一键更新 AI 模型排行数据
# 用法: cd pipeline && bash update.sh
set -e

echo "=========================================="
echo "  AI模型排行 - 数据更新"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. 抓取 LMArena 全量排行（Puppeteer，约5分钟）
echo ""
echo "[1/3] 抓取 LMArena 排行榜..."
node scrape_lmarena.js

# 2. 抓取 Agent 排行（修复 rank）
echo ""
echo "[2/3] 抓取 Agent 排行..."
node scrape_agent.js

# 3. 抓取国产模型定价
echo ""
echo "[3/3] 抓取国产模型定价..."
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
