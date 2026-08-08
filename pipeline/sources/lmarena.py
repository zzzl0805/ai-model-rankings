"""
LMArena (Chatbot Arena) 数据源适配器
抓取 LMSys Chatbot Arena 的 Elo 排名数据
"""

import json
import httpx
from typing import Optional
from config import DataSources, NormalizationConfig

# LMArena 类别 → 我们的排名维度 映射
CATEGORY_MAPPING = {
    "Overall": "overall",
    "Coding": "coding",
    "Reasoning": "reasoning",
    "Writing": "writing",
    "Creative Writing": "writing",
    "Chinese": "chinese",
    "Vision": "multimodal",
    "Hard Prompts": "reasoning",
    "Math": "reasoning",
    "Longer Query": "overall",
}


class LMArenaSource:
    """LMArena Chatbot Arena 数据源"""

    def __init__(self):
        self.sources = DataSources()
        self.norm = NormalizationConfig()

    async def fetch(self) -> dict:
        """获取 LMArena Elo 数据，返回 {model_name: {category: elo_score}}"""
        url = self.sources.lmarena_elo_url

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                print(f"[LMArena] Failed to fetch: {e}")
                return {}

        results = {}
        # LMArena 数据格式通常是 {model_name: {"arena_elo": xxx, "categories": {...}}}
        # 实际格式可能变化，做兼容处理
        if isinstance(data, dict):
            for model_name, model_data in data.items():
                if not isinstance(model_data, dict):
                    continue
                scores = {}
                # 尝试多种可能的字段名
                elo = model_data.get("arena_elo") or model_data.get("elo") or model_data.get("rating")
                if elo is not None:
                    scores["overall"] = float(elo)

                # 分类 Elo
                cats = model_data.get("categories") or model_data.get("category") or {}
                for cat_name, cat_score in cats.items():
                    mapped = CATEGORY_MAPPING.get(cat_name)
                    if mapped:
                        existing = scores.get(mapped, 0)
                        scores[mapped] = max(existing, float(cat_score))

                if scores:
                    results[model_name] = scores

        return results

    def normalize_elo(self, elo: float) -> float:
        """将 Elo 分数归一化到 0-100"""
        if elo <= 0:
            return 0.0
        min_elo = self.norm.lmarena_elo_min
        max_elo = self.norm.lmarena_elo_max
        normalized = (elo - min_elo) / (max_elo - min_elo) * 100
        return max(0.0, min(100.0, normalized))


# 便捷函数
async def fetch_lmarena_rankings() -> dict:
    source = LMArenaSource()
    return await source.fetch()
