#!/usr/bin/env python3
"""
数据Pipeline主入口
运行: python run_pipeline.py
首次运行会自动bootstrap，后续运行进行增量更新
"""

import asyncio
import json
import os
import sys

from sources.lmarena import fetch_lmarena_rankings
from sources.pricing import fetch_pricing_data
from sources.benchmarks import fetch_benchmark_data
from sources.specs import fetch_specs_data
from merge import DataMerger
from validate import Validator
from diff import Differ


OUTPUT_DIR = "output"


async def main():
    print("=" * 60)
    print("AI模型排行 - 数据Pipeline")
    print("=" * 60)

    # 检查是否首次运行
    models_path = os.path.join(OUTPUT_DIR, "models.json")
    if not os.path.exists(models_path):
        print("\n⚠️  首次运行，先生成bootstrap数据...")
        import bootstrap
        bootstrap.main()

    # 1. 抓取外部数据源
    print("\n📡 抓取外部数据源...")

    print("  [1/4] LMArena 排行...")
    ranking_data = await fetch_lmarena_rankings()
    print(f"       获取到 {len(ranking_data)} 个模型的排行数据")

    print("  [2/4] 定价数据...")
    pricing_data = await fetch_pricing_data()
    print(f"       获取到 {len(pricing_data)} 个模型的定价数据")

    print("  [3/4] 评测集数据...")
    benchmark_data = await fetch_benchmark_data()
    print(f"       获取到 {len(benchmark_data)} 个评测集")

    print("  [4/4] 技术规格...")
    specs_data = await fetch_specs_data()
    print(f"       获取到 {len(specs_data)} 个模型的技术规格")

    # 2. 合并数据
    print("\n🔧 合并数据...")
    merger = DataMerger()
    models = merger.merge(pricing_data, ranking_data, benchmark_data, specs_data)

    # 合并人工观点数据（如果存在）
    manual_path = os.path.join(OUTPUT_DIR, "manual-opinions.json")
    if os.path.exists(manual_path):
        models = merger.merge_with_manual(models, manual_path)
        print(f"       已合并人工观点数据")

    print(f"       合并完成: {len(models)} 个模型")

    # 3. 校验
    print("\n🔍 校验数据...")
    validator = Validator()
    passed, errors = validator.validate(models)
    validator.print_report(models, errors)

    if not passed:
        print("\n⚠️  校验未通过！请修复以下问题：")
        for e in errors:
            print(f"  - {e}")
        print()
        response = input("是否仍要保存? (y/n): ")
        if response.lower() != 'y':
            print("已取消。")
            sys.exit(1)

    # 4. 生成变更摘要
    print("\n📊 生成变更摘要...")
    differ = Differ(OUTPUT_DIR)
    diff_result = differ.diff(models)
    report = differ.save_report(diff_result)
    print(report)

    # 5. 保存
    print("\n💾 保存数据...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(models_path, "w", encoding="utf-8") as f:
        json.dump(models, f, ensure_ascii=False, indent=2)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    version_data = {
        "version": f"pipeline-{now}",
        "updated": now,
        "modelCount": len(models),
        "source": "pipeline (auto + manual review)",
    }
    version_path = os.path.join(OUTPUT_DIR, "data-version.json")
    with open(version_path, "w", encoding="utf-8") as f:
        json.dump(version_data, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"✅ Pipeline完成！")
    print(f"   模型数: {len(models)}")
    print(f"   输出: {models_path}")
    print(f"   版本: {version_path}")
    print(f"   变更日志: {os.path.join(OUTPUT_DIR, 'update-log.md')}")
    print(f"\n   📋 下一步: 人工review diff → 确认 → 复制到小程序项目")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
