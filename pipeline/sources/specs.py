"""
模型技术规格数据源适配器
从社区维护的数据源获取上下文窗口、最大输出、模态支持等规格
"""

import json
import httpx
from typing import Optional
from config import DataSources


class SpecsSource:
    """技术规格数据源 - 复用定价数据中的规格信息"""

    def __init__(self):
        self.sources = DataSources()

    async def fetch(self) -> dict:
        """
        获取技术规格
        返回 {model_name: {context_window, max_output, modalities, ...}}
        """
        # 目前从定价数据源中提取规格信息
        url = self.sources.pricing_data_url
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
            except Exception:
                try:
                    resp = await client.get(self.sources.pricing_data_fallback)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as e:
                    print(f"[Specs] All sources failed: {e}")
                    return {}

        results = {}
        models = data.get("models") or data.get("data") or []
        for m in models:
            if not isinstance(m, dict):
                continue
            name = m.get("name") or m.get("model") or m.get("id", "")
            if not name:
                continue

            results[name] = {
                "context_window": m.get("context_window") or m.get("contextWindow") or m.get("max_tokens"),
                "max_output_tokens": m.get("max_output_tokens") or m.get("maxOutputTokens"),
                "modalities": self._parse_modalities(m),
                "open_source": self._is_open_source(m),
                "training_cutoff": m.get("training_cutoff") or m.get("knowledge_cutoff") or m.get("cutoff_date", ""),
                "license": m.get("license") or m.get("license_type", ""),
            }

        return results

    def _parse_modalities(self, model: dict) -> list:
        """提取模态支持列表"""
        modalities = []
        mods = model.get("modalities") or model.get("modality") or []
        if isinstance(mods, str):
            mods = [x.strip() for x in mods.split(",")]

        mod_map = {
            "text": ["text", "text-only", "language"],
            "image": ["image", "vision", "multimodal", "img"],
            "audio": ["audio", "speech", "voice"],
            "video": ["video"],
        }

        for mod in mods:
            mod_lower = mod.lower()
            for canonical, aliases in mod_map.items():
                if any(a in mod_lower for a in aliases):
                    if canonical not in modalities:
                        modalities.append(canonical)

        return modalities if modalities else ["text"]

    def _is_open_source(self, model: dict) -> bool:
        """判断是否开源"""
        license_str = str(model.get("license") or model.get("license_type") or "").lower()
        open_indicators = ["open", "apache", "mit", "gpl", "bsd", "cc-by", "llama", "community"]
        closed_indicators = ["proprietary", "commercial", "closed", "api-only"]

        if any(ind in license_str for ind in open_indicators):
            return True
        if any(ind in license_str for ind in closed_indicators):
            return False

        open_source_val = model.get("open_source") or model.get("openSource") or model.get("open")
        if open_source_val is not None:
            return bool(open_source_val)

        return False


async def fetch_specs_data() -> dict:
    source = SpecsSource()
    return await source.fetch()
