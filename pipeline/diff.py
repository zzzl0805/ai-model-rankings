"""
变更摘要模块
对比本次pipeline产出与上次的差异，生成人工review用的变更报告
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional


class Differ:
    """数据变更对比器"""

    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        self.previous_path = os.path.join(output_dir, "models.json")
        self.version_path = os.path.join(output_dir, "data-version.json")
        self.update_log_path = os.path.join(output_dir, "update-log.md")

    def diff(self, new_models: list[dict]) -> dict:
        """
        对比新旧数据
        返回变更摘要
        """
        old_models = self._load_previous()
        if not old_models:
            return {
                "is_first_run": True,
                "new_models": len(new_models),
                "changes": [],
            }

        old_map = {m["id"]: m for m in old_models}
        new_map = {m["id"]: m for m in new_models}

        changes = []

        # 新增模型
        added = set(new_map.keys()) - set(old_map.keys())
        for mid in added:
            m = new_map[mid]
            changes.append({
                "type": "new_model",
                "model": mid,
                "name": m.get("name", mid),
                "provider": m.get("provider", ""),
                "overall_score": m.get("rankings", {}).get("overall", {}).get("score", "N/A"),
            })

        # 移除模型
        removed = set(old_map.keys()) - set(new_map.keys())
        for mid in removed:
            m = old_map[mid]
            changes.append({
                "type": "removed_model",
                "model": mid,
                "name": m.get("name", mid),
            })

        # 价格变化
        for mid in set(new_map.keys()) & set(old_map.keys()):
            old_p = old_map[mid].get("pricing", {})
            new_p = new_map[mid].get("pricing", {})
            if old_p.get("inputPrice") != new_p.get("inputPrice") or \
               old_p.get("outputPrice") != new_p.get("outputPrice"):
                changes.append({
                    "type": "price_change",
                    "model": mid,
                    "name": new_map[mid].get("name", mid),
                    "old_input": old_p.get("inputPrice"),
                    "new_input": new_p.get("inputPrice"),
                    "old_output": old_p.get("outputPrice"),
                    "new_output": new_p.get("outputPrice"),
                })

        # 排名变化（超过1分的变化才报告）
        for mid in set(new_map.keys()) & set(old_map.keys()):
            old_r = old_map[mid].get("rankings", {})
            new_r = new_map[mid].get("rankings", {})

            for dim in ["overall", "coding", "reasoning", "writing", "chinese", "multimodal"]:
                old_score = old_r.get(dim, {}).get("score", 0)
                new_score = new_r.get(dim, {}).get("score", 0)
                diff = new_score - old_score
                if abs(diff) >= 1.0:
                    direction = "↑" if diff > 0 else "↓"
                    changes.append({
                        "type": "ranking_change",
                        "model": mid,
                        "name": new_map[mid].get("name", mid),
                        "dimension": dim,
                        "old_score": old_score,
                        "new_score": new_score,
                        "diff": diff,
                        "direction": direction,
                    })

        return {
            "is_first_run": False,
            "new_models": len(new_models),
            "old_models": len(old_models),
            "total_changes": len(changes),
            "changes": changes,
        }

    def _load_previous(self) -> Optional[list[dict]]:
        """加载上次的 models.json"""
        if not os.path.exists(self.previous_path):
            return None
        with open(self.previous_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def generate_report(self, diff_result: dict) -> str:
        """生成 Markdown 格式的变更报告"""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines = [
            f"# 数据更新报告",
            f"生成时间: {now}",
            f"",
        ]

        if diff_result.get("is_first_run"):
            lines.append(f"## 🎉 首次运行")
            lines.append(f"共生成 **{diff_result['new_models']}** 个模型的数据。")
            lines.append(f"请进行人工 review：补充 summary、bestFor、pros、cons 等观点层字段。")
        else:
            lines.append(f"## 📊 变更摘要")
            lines.append(f"- 模型总数: {diff_result['old_models']} → **{diff_result['new_models']}**")
            lines.append(f"- 变更数: **{diff_result['total_changes']}**")
            lines.append(f"")

            changes = diff_result.get("changes", [])
            if not changes:
                lines.append("✅ 无重大变更。")
            else:
                # 按类型分组
                by_type = {}
                for c in changes:
                    t = c["type"]
                    by_type.setdefault(t, []).append(c)

                for t, items in by_type.items():
                    emoji = {
                        "new_model": "🆕",
                        "removed_model": "🗑️",
                        "price_change": "💰",
                        "ranking_change": "📈",
                    }.get(t, "•")
                    lines.append(f"### {emoji} {t} ({len(items)}项)")
                    for item in items:
                        if t == "new_model":
                            lines.append(f"- **{item['name']}** ({item['provider']}) — 综合评分: {item['overall_score']}")
                        elif t == "removed_model":
                            lines.append(f"- ~~{item['name']}~~")
                        elif t == "price_change":
                            lines.append(
                                f"- **{item['name']}**: "
                                f"输入 ${item['old_input']}→${item['new_input']}, "
                                f"输出 ${item['old_output']}→${item['new_output']}"
                            )
                        elif t == "ranking_change":
                            lines.append(
                                f"- **{item['name']}** {item['dimension']}: "
                                f"{item['old_score']}→{item['new_score']} ({item['direction']}{abs(item['diff']):.1f})"
                            )
                    lines.append("")

        lines.append("---")
        lines.append("> 🤖 此报告由 data-pipeline 自动生成。请进行人工 review 后发布。")

        return "\n".join(lines)

    def save_report(self, diff_result: dict) -> str:
        """保存报告到文件"""
        report = self.generate_report(diff_result)
        os.makedirs(self.output_dir, exist_ok=True)
        with open(self.update_log_path, "w", encoding="utf-8") as f:
            f.write(report)
        return report
