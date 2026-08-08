"""
校验模块
对合并后的 models.json 进行数据完整性检查（CI-style gate）
"""

import json
from typing import Tuple


REQUIRED_FIELDS = [
    "id", "name", "provider", "status",
    "pricing.inputPrice", "pricing.outputPrice", "pricing.currency",
    "specs.contextWindow", "specs.maxOutputTokens", "specs.modalities",
    "rankings.overall.score", "rankings.coding.score",
    "rankings.reasoning.score", "rankings.writing.score",
    "rankings.chinese.score", "rankings.multimodal.score",
    "rankings.costEffectiveness.score",
]

REQUIRED_RANKING_FIELDS = [
    "score", "source", "updated", "methodology",
]


class Validator:
    """数据校验器"""

    def validate(self, models: list[dict]) -> Tuple[bool, list[str]]:
        """
        校验模型数据
        返回 (通过, 错误列表)
        """
        errors = []
        seen_ids = set()

        if not models:
            errors.append("模型列表为空")
            return False, errors

        for i, model in enumerate(models):
            prefix = f"[{model.get('id', f'index-{i}')}]"

            # 1. 检查ID唯一性
            mid = model.get("id", "")
            if not mid:
                errors.append(f"{prefix} 缺少 id 字段")
            elif mid in seen_ids:
                errors.append(f"{prefix} id '{mid}' 重复")
            seen_ids.add(mid)

            # 2. 检查必填字段
            for field_path in REQUIRED_FIELDS:
                val = self._get_nested(model, field_path)
                if val is None or (isinstance(val, str) and not val and field_path != "specs.trainingCutoff"):
                    errors.append(f"{prefix} 缺少必填字段: {field_path}")

            # 3. 检查排名字段完整性
            rankings = model.get("rankings", {})
            for dim in ["overall", "coding", "reasoning", "writing", "chinese", "multimodal", "costEffectiveness"]:
                rank = rankings.get(dim, {})
                if not isinstance(rank, dict):
                    errors.append(f"{prefix} rankings.{dim} 格式错误")
                    continue
                for field in REQUIRED_RANKING_FIELDS:
                    if field not in rank or (isinstance(rank[field], str) and not rank[field]):
                        errors.append(f"{prefix} rankings.{dim}.{field} 缺失")

                # 4. 检查分数范围
                score = rank.get("score", -1)
                if not (0 <= score <= 100):
                    errors.append(f"{prefix} rankings.{dim}.score={score} 超出 0-100 范围")

            # 5. 检查价格合理性
            pricing = model.get("pricing", {})
            input_price = pricing.get("inputPrice", 0)
            output_price = pricing.get("outputPrice", 0)
            if input_price < 0 or output_price < 0:
                errors.append(f"{prefix} 价格为负数")
            if input_price > 1000 or output_price > 1000:
                errors.append(f"{prefix} 价格异常偏高: input={input_price}, output={output_price}")

            # 6. 检查 specs 合理性
            specs = model.get("specs", {})
            ctx = specs.get("contextWindow", 0)
            if ctx < 0:
                errors.append(f"{prefix} contextWindow 为负数")
            if ctx > 100_000_000:  # 1亿
                errors.append(f"{prefix} contextWindow 异常偏大")

        return len(errors) == 0, errors

    def _get_nested(self, obj: dict, path: str):
        """获取嵌套字段值，如 'pricing.inputPrice'"""
        keys = path.split(".")
        current = obj
        for key in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def print_report(self, models: list[dict], errors: list[str]):
        """打印校验报告"""
        print(f"\n{'='*60}")
        print(f"数据校验报告")
        print(f"{'='*60}")
        print(f"模型总数: {len(models)}")
        print(f"供应商数: {len(set(m.get('provider', '') for m in models))}")
        print(f"活跃模型: {sum(1 for m in models if m.get('status') == 'active')}")
        print(f"归档模型: {sum(1 for m in models if m.get('status') == 'archived')}")
        print(f"有summary的: {sum(1 for m in models if m.get('summary'))}")
        print(f"有bestFor的: {sum(1 for m in models if m.get('bestFor'))}")
        print(f"-" * 60)

        if errors:
            print(f"❌ 校验失败: {len(errors)} 个错误")
            for e in errors:
                print(f"  - {e}")
        else:
            print(f"✅ 校验通过")

        print(f"{'='*60}\n")
