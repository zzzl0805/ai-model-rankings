"""
归一化模块
将来自不同评测集的原始分数统一归一化到 0-100 分制
"""

import math
from typing import Optional
from config import NormalizationConfig, RANKING_WEIGHTS


class Normalizer:
    """分数归一化器"""

    def __init__(self):
        self.config = NormalizationConfig()

    def normalize(self, raw_score: float, source: str) -> float:
        """
        将原始分数归一化到 0-100
        source: 数据源名称 (lmarena_elo, swebench, mmlu_pro, ceval, 等)
        """
        if source == "lmarena_elo":
            return self._minmax(raw_score, self.config.lmarena_elo_min, self.config.lmarena_elo_max)
        elif source == "swebench":
            return self._minmax(raw_score, self.config.swebench_min, self.config.swebench_max)
        elif source == "mmlu_pro":
            return self._minmax(raw_score, self.config.mmlu_min, self.config.mmlu_max)
        elif source == "ceval":
            return self._minmax(raw_score, self.config.ceval_min, self.config.ceval_max)
        elif source == "cmmlu":
            return self._minmax(raw_score, self.config.mmlu_min, self.config.mmlu_max)
        elif source == "mmmu":
            return self._minmax(raw_score, self.config.mmlu_min, self.config.mmlu_max)
        elif source == "human_eval_plus":
            return self._minmax(raw_score, 0.0, 1.0)
        elif source == "gpqa":
            return self._minmax(raw_score, 0.0, 1.0)
        else:
            # 未知数据源：假设已经是百分比
            print(f"[Normalize] Unknown source '{source}', treating as percentage")
            return max(0.0, min(100.0, float(raw_score)))

    def _minmax(self, value: float, min_val: float, max_val: float) -> float:
        """Min-max 归一化"""
        if max_val <= min_val:
            return 50.0  # fallback
        normalized = (value - min_val) / (max_val - min_val) * 100.0
        return max(0.0, min(100.0, normalized))

    def compute_weighted_score(
        self,
        dimension: str,
        normalized_scores: dict,
    ) -> Optional[float]:
        """
        根据配置的权重计算加权综合分数
        dimension: 排行维度 (coding, reasoning, writing, chinese, multimodal)
        normalized_scores: {source_name: normalized_score_0_100}

        返回 None 表示数据不足无法计算
        """
        weights = RANKING_WEIGHTS.get(dimension, {})
        if not weights:
            return None

        total_weight = 0.0
        weighted_sum = 0.0

        for source, weight in weights.items():
            score = normalized_scores.get(source)
            if score is not None:
                weighted_sum += score * weight
                total_weight += weight

        if total_weight == 0:
            return None

        # 按照实际可用的权重重新归一化
        return round(weighted_sum / total_weight, 1)

    def compute_cost_effectiveness(
        self,
        overall_score: float,
        input_price: float,
        output_price: float,
    ) -> float:
        """
        计算性价比分数
        公式: overall_score / log(weighted_price + 1) * 10

        weighted_price = input_price * 3 + output_price * 1
        （假设输入:输出 = 3:1 的典型比例）
        """
        if overall_score <= 0:
            return 0.0

        weighted_price = input_price * 3.0 + output_price * 1.0
        if weighted_price <= 0:
            # 免费模型：性价比满分
            return 100.0

        # 对数变换：价格差距在低端影响大，高端影响小
        raw = overall_score / (math.log(weighted_price + 1) + 1) * 10
        return round(max(0.0, min(100.0, raw)), 1)
