"""
AI模型定价数据源适配器
从社区维护的 ai-pricing-data 仓库获取最新定价
"""

import json
import httpx
from typing import Optional
from config import DataSources


class PricingSource:
    """AI模型定价数据源"""

    def __init__(self):
        self.sources = DataSources()

    async def fetch(self) -> dict:
        """
        获取定价数据
        返回 {model_name: {input_price, output_price, ...}}
        """
        # 尝试主数据源
        data = await self._fetch_url(self.sources.pricing_data_url)
        if data is None:
            # 尝试备用数据源
            data = await self._fetch_url(self.sources.pricing_data_fallback)

        if data is None:
            print("[Pricing] All sources failed, returning empty")
            return {}

        return self._parse(data)

    async def _fetch_url(self, url: str) -> Optional[dict]:
        """抓取单个URL"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                print(f"[Pricing] Failed to fetch {url}: {e}")
                return None

    def _parse(self, raw_data: dict) -> dict:
        """
        解析定价数据为统一格式
        输入格式（ai-pricing-data 的常见格式）:
        {
          "models": [
            {
              "name": "GPT-5",
              "provider": "OpenAI",
              "input_price_per_1m": 2.50,
              "output_price_per_1m": 10.00,
              "context_window": 128000,
              ...
            }
          ]
        }
        """
        results = {}
        models = raw_data.get("models") or raw_data.get("data") or []

        if isinstance(raw_data, dict) and not models:
            # 可能是 {model_name: pricing_info} 格式
            for key, val in raw_data.items():
                if isinstance(val, dict) and ("input" in str(val).lower() or "price" in str(val).lower()):
                    models.append({"name": key, **val})

        for m in models:
            if not isinstance(m, dict):
                continue
            name = m.get("name") or m.get("model") or m.get("id", "")
            if not name:
                continue

            results[name] = {
                "input_price": self._extract_price(m, "input"),
                "output_price": self._extract_price(m, "output"),
                "cached_input_price": self._extract_price(m, "cache_write") or self._extract_price(m, "cached"),
                "cached_read_price": self._extract_price(m, "cache_read"),
                "context_window": m.get("context_window") or m.get("contextWindow") or m.get("max_tokens"),
                "max_output_tokens": m.get("max_output_tokens") or m.get("maxOutputTokens"),
                "free_tier": bool(m.get("free") or m.get("free_tier")),
            }

        return results

    def _extract_price(self, model: dict, key: str) -> Optional[float]:
        """从模型中提取价格字段（兼容多种命名）"""
        candidates = [
            f"{key}_price_per_1m",
            f"{key}_price",
            f"{key}_price_per_token",
            f"price_per_1m_{key}",
            f"{key}_cost",
        ]
        for c in candidates:
            val = model.get(c)
            if val is not None and isinstance(val, (int, float)):
                return float(val)
        # 也尝试嵌套结构
        pricing = model.get("pricing", {})
        if isinstance(pricing, dict):
            for c in [f"{key}_price", f"per_1m_{key}", key]:
                val = pricing.get(c)
                if val is not None and isinstance(val, (int, float)):
                    return float(val)
        return None


async def fetch_pricing_data() -> dict:
    source = PricingSource()
    return await source.fetch()
