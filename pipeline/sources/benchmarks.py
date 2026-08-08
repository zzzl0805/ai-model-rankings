"""
评测集数据源适配器
抓取 SWE-bench, MMLU-Pro, C-Eval 等权威评测集的最新结果
"""

import json
import httpx
import csv
import io
from typing import Optional
from config import DataSources, NormalizationConfig


class BenchmarkSource:
    """评测集数据源聚合器"""

    def __init__(self):
        self.sources = DataSources()
        self.norm = NormalizationConfig()

    async def fetch_all(self) -> dict:
        """获取所有评测集数据，返回 {benchmark_name: {model_name: score}}"""
        results = {}

        swebench = await self._fetch_swebench()
        if swebench:
            results["swebench"] = swebench

        mmlu = await self._fetch_mmlu_pro()
        if mmlu:
            results["mmlu_pro"] = mmlu

        ceval = await self._fetch_ceval()
        if ceval:
            results["ceval"] = ceval

        return results

    async def _fetch_swebench(self) -> Optional[dict]:
        """获取 SWE-bench Verified 结果"""
        url = self.sources.swebench_url
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"[Benchmarks] SWE-bench fetch failed: {e}")
                return None

        # SWE-bench 格式: {model_name: {resolved: float, ...}}
        results = {}
        for model_name, model_data in data.items() if isinstance(data, dict) else []:
            if isinstance(model_data, dict):
                resolved = model_data.get("resolved") or model_data.get("resolve_rate") or model_data.get("score")
                if resolved is not None:
                    results[model_name] = float(resolved)
        return results

    async def _fetch_mmlu_pro(self) -> Optional[dict]:
        """获取 MMLU-Pro 结果"""
        url = self.sources.mmlu_pro_url
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"[Benchmarks] MMLU-Pro fetch failed: {e}")
                return None

        results = {}
        if isinstance(data, dict):
            for model_name, score in data.items():
                if isinstance(score, (int, float)):
                    results[model_name] = float(score)
                elif isinstance(score, dict):
                    overall = score.get("overall") or score.get("accuracy") or score.get("score")
                    if overall is not None:
                        results[model_name] = float(overall)
        return results

    async def _fetch_ceval(self) -> Optional[dict]:
        """获取 C-Eval 排行榜"""
        url = self.sources.ceval_url
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                text = resp.text
            except Exception as e:
                print(f"[Benchmarks] C-Eval fetch failed: {e}")
                return None

        results = {}
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            model = row.get("model") or row.get("Model") or row.get("模型", "")
            score = row.get("average") or row.get("Average") or row.get("avg") or row.get("平均分", "")
            if model and score:
                try:
                    results[model] = float(score)
                except ValueError:
                    pass
        return results


async def fetch_benchmark_data() -> dict:
    source = BenchmarkSource()
    return await source.fetch_all()
