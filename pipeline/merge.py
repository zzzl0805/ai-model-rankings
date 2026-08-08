"""
合并模块
将来自多个数据源的数据合并为统一的 AIModel JSON 格式
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional
from config import TRACKED_MODELS, MODEL_NAME_ALIASES
from normalize import Normalizer


class DataMerger:
    """数据合并器 - 将所有数据源合并为 models.json"""

    def __init__(self):
        self.normalizer = Normalizer()

    def merge(
        self,
        pricing_data: dict,
        ranking_data: dict,
        benchmark_data: dict,
        specs_data: dict,
    ) -> list[dict]:
        """合并所有数据源，返回 AIModel[] 列表"""

        models = []
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        for model_id, config in TRACKED_MODELS.items():
            provider = config["provider"]

            # 1. 匹配各数据源中的模型数据
            pricing = self._find_match(model_id, pricing_data)
            ranking_raw = self._find_match(model_id, ranking_data)
            specs = self._find_match(model_id, specs_data)

            # 2. 构建事实层
            model = {
                "id": model_id,
                "name": self._get_display_name(model_id),
                "provider": provider,
                "status": "active",
                "tags": config.get("tags", []),
                "addedDate": now,
                "lastUpdated": now,

                # 定价
                "pricing": self._build_pricing(pricing, now),

                # 技术规格
                "specs": self._build_specs(specs, now),

                # 排名 - 从不同数据源计算
                "rankings": self._build_rankings(
                    model_id, ranking_raw, benchmark_data, pricing, now
                ),

                # 观点层 - 留空，人工填写
                "summary": "",
                "detailDescription": "",
                "bestFor": [],
                "pros": [],
                "cons": [],
                "competitors": [],
            }

            models.append(model)

        # 按综合评分降序排列
        models.sort(key=lambda m: m["rankings"]["overall"]["score"], reverse=True)
        return models

    def _find_match(self, model_id: str, data: dict) -> Optional[dict]:
        """在数据源中查找匹配的模型"""
        if not data:
            return None

        # 直接匹配
        if model_id in data:
            return data[model_id]

        # 别名匹配
        aliases = MODEL_NAME_ALIASES.get(model_id, [])
        for alias in aliases:
            if alias in data:
                return data[alias]
            # 不区分大小写匹配
            for key in data:
                if key.lower() == alias.lower():
                    return data[key]

        return None

    def _get_display_name(self, model_id: str) -> str:
        """获取模型的显示名称"""
        aliases = MODEL_NAME_ALIASES.get(model_id, [])
        return aliases[0] if aliases else model_id.replace("-", " ").title()

    def _build_pricing(self, raw: Optional[dict], now: str) -> dict:
        """构建定价信息"""
        if raw is None:
            return {
                "inputPrice": 0,
                "outputPrice": 0,
                "currency": "USD",
                "freeTier": False,
                "freeTierDescription": "",
                "priceSource": f"manual @ {now}",
                "priceVerified": False,
            }

        return {
            "inputPrice": raw.get("input_price") or raw.get("inputPrice") or 0,
            "outputPrice": raw.get("output_price") or raw.get("outputPrice") or 0,
            "cachedInputPrice": raw.get("cached_input_price") or raw.get("cachedInputPrice"),
            "cachedReadPrice": raw.get("cached_read_price") or raw.get("cachedReadPrice"),
            "currency": "USD",
            "freeTier": raw.get("free_tier") or raw.get("freeTier") or False,
            "freeTierDescription": "",
            "priceSource": f"ai-pricing-data @ {now}",
            "priceVerified": False,
        }

    def _build_specs(self, raw: Optional[dict], now: str) -> dict:
        """构建技术规格"""
        if raw is None:
            return {
                "contextWindow": 0,
                "maxOutputTokens": 0,
                "modalities": ["text"],
                "openSource": False,
                "licenseType": "",
                "trainingCutoff": "",
                "specSource": f"manual @ {now}",
            }

        return {
            "contextWindow": raw.get("context_window") or raw.get("contextWindow") or 0,
            "maxOutputTokens": raw.get("max_output_tokens") or raw.get("maxOutputTokens") or 0,
            "modalities": raw.get("modalities") or ["text"],
            "openSource": raw.get("open_source") or raw.get("openSource") or False,
            "licenseType": raw.get("license") or "",
            "trainingCutoff": raw.get("training_cutoff") or raw.get("trainingCutoff") or "",
            "specSource": f"ai-pricing-data @ {now}",
        }

    def _build_rankings(
        self,
        model_id: str,
        ranking_raw: Optional[dict],
        benchmark_data: dict,
        pricing: Optional[dict],
        now: str,
    ) -> dict:
        """构建排名数据（带溯源）"""

        def score_with_source(score, source, source_url="", methodology=""):
            """创建带溯源的分数对象"""
            if score is None:
                score = 0
            return {
                "score": round(float(score), 1),
                "source": source,
                "sourceUrl": source_url,
                "updated": now,
                "methodology": methodology,
            }

        # 收集各维度的归一化分数
        norm_scores = {}

        # LMArena 排行
        if ranking_raw:
            for dim, elo in ranking_raw.items():
                norm = self.normalizer.normalize(float(elo), "lmarena_elo")
                norm_scores[f"lmarena_{dim}"] = norm

        # 评测集
        for bench_name, bench_scores in benchmark_data.items():
            bench_score = self._find_match(model_id, bench_scores) if isinstance(bench_scores, dict) else None
            if bench_score is not None:
                norm_scores[bench_name] = self.normalizer.normalize(float(bench_score), bench_name)

        # 综合评分
        overall = norm_scores.get("lmarena_overall", 0)
        overall_score = score_with_source(
            overall if overall > 0 else 50.0,  # fallback
            "LMArena Chatbot Arena Elo",
            "https://lmarena.ai",
            "Elo分数归一化到0-100分制",
        )

        # 编程能力
        coding = self.normalizer.compute_weighted_score("coding", norm_scores)
        coding_score = score_with_source(
            coding or (norm_scores.get("lmarena_coding", 50)),
            "SWE-bench Verified (50%) + HumanEval+ (30%) + LMArena Coding (20%)",
            "",
            "三项加权平均后归一化到0-100",
        )

        # 推理能力
        reasoning = self.normalizer.compute_weighted_score("reasoning", norm_scores)
        reasoning_score = score_with_source(
            reasoning or (norm_scores.get("lmarena_reasoning", 50)),
            "LMArena Reasoning (50%) + MMLU-Pro (30%) + GPQA (20%)",
            "",
            "三项加权平均后归一化到0-100",
        )

        # 写作能力
        writing = norm_scores.get("lmarena_writing", 50)
        writing_score = score_with_source(
            writing,
            "LMArena Writing + Creative Writing",
            "https://lmarena.ai",
            "LMArena写作类别Elo归一化",
        )

        # 中文能力
        chinese = self.normalizer.compute_weighted_score("chinese", norm_scores)
        chinese_score = score_with_source(
            chinese or (norm_scores.get("lmarena_chinese", 50)),
            "C-Eval (40%) + CMMLU (30%) + LMArena Chinese (30%)",
            "",
            "三项加权平均后归一化到0-100",
        )

        # 多模态
        multimodal = self.normalizer.compute_weighted_score("multimodal", norm_scores)
        multimodal_score = score_with_source(
            multimodal or (norm_scores.get("lmarena_vision", 50) if norm_scores.get("lmarena_vision") else 50),
            "MMMU (50%) + LMArena Vision (50%)",
            "",
            "两项加权平均后归一化到0-100",
        )

        # 性价比（纯计算）
        input_price = pricing.get("input_price", 0) if pricing else 0
        output_price = pricing.get("output_price", 0) if pricing else 0
        cost_eff = self.normalizer.compute_cost_effectiveness(
            overall_score["score"],
            input_price,
            output_price,
        )
        cost_score = score_with_source(
            cost_eff,
            "综合评分 ÷ log(加权价格+1) × 10",
            "",
            f"加权价格 = 输入价格×3 + 输出价格×1。公式公开，纯数学计算。",
        )

        return {
            "overall": overall_score,
            "coding": coding_score,
            "reasoning": reasoning_score,
            "writing": writing_score,
            "chinese": chinese_score,
            "multimodal": multimodal_score,
            "costEffectiveness": cost_score,
        }

    def merge_with_manual(self, auto_models: list[dict], manual_path: str) -> list[dict]:
        """
        合并自动生成的数据与人工维护的观点数据
        manual.json 格式: {model_id: {summary, bestFor, pros, cons, competitors, ...}}
        人工数据覆盖自动生成的同名字段
        """
        if not os.path.exists(manual_path):
            print(f"[Merge] Manual data not found at {manual_path}, using auto-only")
            return auto_models

        with open(manual_path, "r", encoding="utf-8") as f:
            manual_data = json.load(f)

        for model in auto_models:
            mid = model["id"]
            if mid in manual_data:
                manual = manual_data[mid]
                # 只覆盖观点层字段，不动事实层
                for field in ["summary", "detailDescription", "bestFor", "pros", "cons", "competitors"]:
                    if field in manual and manual[field]:
                        model[field] = manual[field]

        return auto_models
