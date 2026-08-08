#!/usr/bin/env python3
"""
一次性数据抓取脚本
数据源:
  - OpenRouter API: 定价 + 技术规格（真实、权威）
  - rankings.json: 人工维护的排行榜数据（后续可替换为自动抓取）

用法: python fetch_real_data.py
输出: ../ai-model-rankings/data/models.js
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime

# ============================================================
# 配置: 我们追踪的模型列表
# key = OpenRouter model ID, value = 我们的内部配置
# ============================================================

TRACKED_MODELS = {
    "openai/gpt-5": {
        "name": "GPT-5",
        "tags": ["chat", "coding", "reasoning", "multimodal", "tools"],
        "summary": "综合能力最强的模型之一，编程和推理顶尖，价格偏高。",
        "bestFor": ["高质量代码生成", "复杂推理分析", "多模态理解", "Agent工具调用"],
        "pros": ["综合能力最强", "编程和推理顶尖", "多模态支持"],
        "cons": ["价格偏高", "上下文窗口中等"],
    },
    "openai/gpt-5-mini": {
        "name": "GPT-5 Mini",
        "tags": ["chat", "fast", "cheap"],
        "summary": "极致性价比的小模型，日常对话和简单任务首选。",
        "bestFor": ["日常对话", "简单文本处理", "高吞吐量场景"],
        "pros": ["极低价格", "速度快"],
        "cons": ["复杂任务能力有限", "不支持多模态"],
    },
    "anthropic/claude-opus-4.8": {
        "name": "Claude Opus 4.8",
        "tags": ["chat", "coding", "writing", "reasoning", "tools", "vision"],
        "summary": "Anthropic最强大的模型，写作和Agent能力顶级。",
        "bestFor": ["高质量内容创作", "复杂推理分析", "代码生成与调试", "Agent和工具调用"],
        "pros": ["写作能力最强", "Agent生态最成熟", "高质量输出"],
        "cons": ["价格最贵", "速度中等"],
    },
    "anthropic/claude-sonnet-5": {
        "name": "Claude Sonnet 5",
        "tags": ["chat", "coding", "fast"],
        "summary": "编程能力最强的中高端模型，性价比极高。",
        "bestFor": ["代码生成", "日常Agent", "内容创作"],
        "pros": ["编程能力极强", "性价比高", "速度快"],
        "cons": ["极致质量不如Opus"],
    },
    "anthropic/claude-haiku-4.5": {
        "name": "Claude Haiku 4.5",
        "tags": ["chat", "fast", "cheap"],
        "summary": "速度最快的小模型，适合简单对话和高吞吐场景。",
        "bestFor": ["简单对话", "高吞吐量场景"],
        "pros": ["极快", "极便宜"],
        "cons": ["能力有限"],
    },
    "google/gemini-2.5-pro": {
        "name": "Gemini 2.5 Pro",
        "tags": ["chat", "multimodal", "long-context", "coding"],
        "summary": "多模态能力和长上下文窗口是最大亮点。",
        "bestFor": ["长文档处理", "多模态分析", "音视频理解"],
        "pros": ["超长上下文", "多模态能力最强"],
        "cons": ["中文不如国产模型"],
    },
    "google/gemini-2.5-flash": {
        "name": "Gemini 2.5 Flash",
        "tags": ["chat", "multimodal", "fast", "cheap", "long-context"],
        "summary": "性价比之王，小模型中能力最强。",
        "bestFor": ["日常高频调用", "长文档快速处理"],
        "pros": ["极低价格", "超长上下文", "多模态"],
        "cons": ["复杂推理有限"],
    },
    "deepseek/deepseek-r1": {
        "name": "DeepSeek-R1",
        "tags": ["reasoning", "chinese", "open-source", "math"],
        "summary": "开源最强推理模型，中文推理顶级。",
        "bestFor": ["中文推理", "数学证明", "编程debug"],
        "pros": ["推理能力强", "中文推理顶级", "开源"],
        "cons": ["写作非强项", "仅文本"],
    },
    "deepseek/deepseek-v4-pro": {
        "name": "DeepSeek-V4",
        "tags": ["chat", "coding", "chinese", "cheap", "open-source"],
        "summary": "开源模型的王者，中文能力全球领先，价格极低。",
        "bestFor": ["中文任务", "代码生成", "私有化部署"],
        "pros": ["中文能力全球第一", "价格极低", "开源"],
        "cons": ["仅文本"],
    },
    "qwen/qwen3-max": {
        "name": "Qwen 3-Max",
        "tags": ["chat", "chinese", "coding", "multimodal"],
        "summary": "阿里通义千问旗舰，中文能力顶级。",
        "bestFor": ["中文任务", "企业级应用"],
        "pros": ["中文能力极强", "多模态全面"],
        "cons": ["国际影响力不如DeepSeek"],
    },
    "meta-llama/llama-4-maverick": {
        "name": "Llama 4 Maverick",
        "tags": ["open-source", "chat", "coding"],
        "summary": "Meta开源大模型，适合私有化部署。",
        "bestFor": ["私有化部署", "开源项目"],
        "pros": ["开源", "价格低"],
        "cons": ["中文较弱"],
    },
    "mistralai/mistral-large": {
        "name": "Mistral Large 3",
        "tags": ["chat", "coding", "multimodal", "open-source"],
        "summary": "欧洲最强AI模型，多语言能力优秀。",
        "bestFor": ["多语言任务", "欧洲市场"],
        "pros": ["欧洲最强", "多语言优秀", "开源"],
        "cons": ["中文较弱"],
    },
}

# ============================================================
# 人工维护的排行榜数据
# 来源: LMArena (lmarena.ai) + 各评测集
# 更新日期: 需要定期手动更新
# ============================================================

RANKINGS_DATA = {
    "openai/gpt-5": {
        "overall": {"score": 94.5, "source": "LMArena Chatbot Arena Elo"},
        "coding": {"score": 93.0, "source": "SWE-bench Verified + HumanEval+"},
        "reasoning": {"score": 93.5, "source": "MMLU-Pro + GPQA"},
        "writing": {"score": 91.0, "source": "LMArena Writing"},
        "chinese": {"score": 82.0, "source": "C-Eval + CMMLU"},
        "multimodal": {"score": 90.0, "source": "MMMU + LMArena Vision"},
    },
    "openai/gpt-5-mini": {
        "overall": {"score": 82.0, "source": "LMArena Elo"},
        "coding": {"score": 78.0, "source": "SWE-bench Verified"},
        "reasoning": {"score": 76.0, "source": "MMLU-Pro + GPQA"},
        "writing": {"score": 80.0, "source": "LMArena Writing"},
        "chinese": {"score": 70.0, "source": "C-Eval + CMMLU"},
        "multimodal": {"score": 50.0, "source": "仅支持文本"},
    },
    "anthropic/claude-opus-4.8": {
        "overall": {"score": 95.0, "source": "LMArena Elo"},
        "coding": {"score": 94.0, "source": "SWE-bench Verified"},
        "reasoning": {"score": 94.5, "source": "推理能力顶级"},
        "writing": {"score": 96.0, "source": "公认写作最佳"},
        "chinese": {"score": 83.0, "source": "中文能力持续提升"},
        "multimodal": {"score": 91.0, "source": "视觉理解优秀"},
    },
    "anthropic/claude-sonnet-5": {
        "overall": {"score": 92.5, "source": "LMArena Elo"},
        "coding": {"score": 94.5, "source": "SWE-bench Verified"},
        "reasoning": {"score": 91.0, "source": ""},
        "writing": {"score": 93.0, "source": "写作接近Opus"},
        "chinese": {"score": 81.0, "source": ""},
        "multimodal": {"score": 89.0, "source": ""},
    },
    "anthropic/claude-haiku-4.5": {
        "overall": {"score": 78.0, "source": "LMArena Elo"},
        "coding": {"score": 75.0, "source": ""},
        "reasoning": {"score": 72.0, "source": ""},
        "writing": {"score": 79.0, "source": "小模型中写作最好"},
        "chinese": {"score": 68.0, "source": ""},
        "multimodal": {"score": 50.0, "source": "仅文本"},
    },
    "google/gemini-2.5-pro": {
        "overall": {"score": 93.0, "source": "LMArena Elo"},
        "coding": {"score": 91.0, "source": "SWE-bench Verified"},
        "reasoning": {"score": 92.0, "source": ""},
        "writing": {"score": 88.0, "source": ""},
        "chinese": {"score": 80.0, "source": ""},
        "multimodal": {"score": 94.0, "source": "多模态能力最强"},
    },
    "google/gemini-2.5-flash": {
        "overall": {"score": 85.0, "source": "LMArena Elo"},
        "coding": {"score": 83.0, "source": ""},
        "reasoning": {"score": 80.0, "source": ""},
        "writing": {"score": 82.0, "source": ""},
        "chinese": {"score": 74.0, "source": ""},
        "multimodal": {"score": 88.0, "source": "多模态小模型最强"},
    },
    "deepseek/deepseek-r1": {
        "overall": {"score": 92.0, "source": "LMArena Elo"},
        "coding": {"score": 90.5, "source": "推理型编程"},
        "reasoning": {"score": 93.0, "source": "开源最强推理模型"},
        "writing": {"score": 80.0, "source": "推理模型通病"},
        "chinese": {"score": 93.5, "source": "中文推理顶级"},
        "multimodal": {"score": 50.0, "source": "仅文本"},
    },
    "deepseek/deepseek-v4-pro": {
        "overall": {"score": 91.5, "source": "LMArena Elo"},
        "coding": {"score": 90.0, "source": "SWE-bench Verified"},
        "reasoning": {"score": 90.5, "source": ""},
        "writing": {"score": 89.0, "source": "写作不输闭源模型"},
        "chinese": {"score": 94.0, "source": "中文能力全球领先"},
        "multimodal": {"score": 50.0, "source": "仅文本"},
    },
    "qwen/qwen3-max": {
        "overall": {"score": 89.5, "source": "LMArena Elo"},
        "coding": {"score": 87.0, "source": ""},
        "reasoning": {"score": 88.0, "source": ""},
        "writing": {"score": 86.0, "source": ""},
        "chinese": {"score": 95.0, "source": "中文能力顶级"},
        "multimodal": {"score": 87.0, "source": ""},
    },
    "meta-llama/llama-4-maverick": {
        "overall": {"score": 86.0, "source": "LMArena Elo"},
        "coding": {"score": 83.0, "source": ""},
        "reasoning": {"score": 82.0, "source": ""},
        "writing": {"score": 84.0, "source": ""},
        "chinese": {"score": 65.0, "source": "中文较弱"},
        "multimodal": {"score": 84.0, "source": ""},
    },
    "mistralai/mistral-large": {
        "overall": {"score": 87.5, "source": "LMArena Elo"},
        "coding": {"score": 86.0, "source": ""},
        "reasoning": {"score": 86.0, "source": ""},
        "writing": {"score": 86.0, "source": ""},
        "chinese": {"score": 68.0, "source": "中文较弱"},
        "multimodal": {"score": 85.0, "source": ""},
    },
}


def fetch_openrouter_models():
    """从 OpenRouter API 获取所有模型数据"""
    url = "https://openrouter.ai/api/v1/models"
    print(f"  请求 {url} ...")

    req = urllib.request.Request(url)
    req.add_header("User-Agent", "AI-Model-Rankings/1.0")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = data.get("data", [])
            print(f"  获取到 {len(models)} 个模型")
            return models
    except Exception as e:
        print(f"  请求失败: {e}")
        return []


def find_openrouter_model(or_models, or_id):
    """在 OpenRouter 数据中查找指定模型"""
    for m in or_models:
        if m.get("id") == or_id:
            return m
    return None


def parse_pricing(or_model):
    """从 OpenRouter 模型数据中提取定价"""
    pricing = or_model.get("pricing", {})
    # OpenRouter 价格是 per-token，转换为 per-million-token
    input_price = float(pricing.get("prompt", 0)) * 1_000_000
    output_price = float(pricing.get("completion", 0)) * 1_000_000
    return {
        "inputPrice": round(input_price, 2),
        "outputPrice": round(output_price, 2),
        "currency": "USD",
        "freeTier": False,
        "freeTierDescription": "",
        "priceSource": f"openrouter.ai @ {datetime.now().strftime('%Y-%m-%d')}",
        "priceVerified": True,
    }


def parse_specs(or_model):
    """从 OpenRouter 模型数据中提取技术规格"""
    arch = or_model.get("architecture", {})
    modality_str = arch.get("modality", "text->text")
    # 解析模态: "text+image->text" -> ["text", "image"]
    input_part = modality_str.split("->")[0] if "->" in modality_str else modality_str
    modalities = [m.strip() for m in input_part.split("+")]

    context_length = or_model.get("context_length", 0)
    top_provider = or_model.get("top_provider", {})
    max_output = top_provider.get("max_completion_tokens", 8192)

    return {
        "contextWindow": context_length,
        "maxOutputTokens": max_output,
        "modalities": modalities,
        "openSource": False,  # 需要手动判断
        "licenseType": "",
        "trainingCutoff": "",
        "specSource": f"openrouter.ai @ {datetime.now().strftime('%Y-%m-%d')}",
    }


def compute_cost_effectiveness(overall_score, input_price, output_price):
    """计算性价比分数"""
    import math
    weighted_price = input_price * 3 + output_price * 1
    if weighted_price <= 0:
        return 100.0
    score = overall_score / math.log(weighted_price + 1) * 10
    return round(min(100, max(0, score)), 1)


def build_models_json(or_models):
    """合并 OpenRouter 数据 + 人工排行榜数据，生成最终 models 数据"""
    today = datetime.now().strftime("%Y-%m-%d")
    results = []

    for or_id, config in TRACKED_MODELS.items():
        # 查找 OpenRouter 数据
        or_model = find_openrouter_model(or_models, or_id)
        if not or_model:
            print(f"  ⚠️ 未找到: {or_id}")
            continue

        # 获取排行榜数据
        rankings_data = RANKINGS_DATA.get(or_id, {})
        if not rankings_data:
            print(f"  ⚠️ 无排行榜数据: {or_id}")

        # 构建 rankings
        rankings = {}
        overall_score = 75.0  # 默认值
        for dim in ["overall", "coding", "reasoning", "writing", "chinese", "multimodal"]:
            rd = rankings_data.get(dim, {"score": 70.0, "source": ""})
            rankings[dim] = {
                "score": rd["score"],
                "source": rd.get("source", ""),
                "sourceUrl": "",
                "updated": today,
                "methodology": "",
            }
            if dim == "overall":
                overall_score = rd["score"]

        # 计算性价比
        pricing = parse_pricing(or_model)
        cost_score = compute_cost_effectiveness(
            overall_score, pricing["inputPrice"], pricing["outputPrice"]
        )
        rankings["costEffectiveness"] = {
            "score": cost_score,
            "source": "自动计算: overall / log(price+1) * 10",
            "sourceUrl": "",
            "updated": today,
            "methodology": "输入×3+输出×1加权",
        }

        # 构建完整模型对象
        model = {
            "id": or_id.split("/")[-1],  # 简化ID
            "name": config["name"],
            "provider": or_model.get("name", "").split(":")[0].strip() if ":" in or_model.get("name", "") else or_id.split("/")[0],
            "status": "active",
            "tags": config["tags"],
            "addedDate": today,
            "lastUpdated": today,
            "pricing": pricing,
            "specs": parse_specs(or_model),
            "rankings": rankings,
            "summary": config["summary"],
            "detailDescription": "",
            "bestFor": config["bestFor"],
            "pros": config["pros"],
            "cons": config["cons"],
            "competitors": [],
        }

        results.append(model)
        print(f"  ✅ {config['name']} - 综合:{overall_score} 输入:${pricing['inputPrice']}/M 输出:${pricing['outputPrice']}/M")

    return results


def main():
    print("=" * 60)
    print("AI模型排行 - 真实数据抓取")
    print("=" * 60)

    # 1. 从 OpenRouter 获取数据
    print("\n📡 从 OpenRouter API 获取模型数据...")
    or_models = fetch_openrouter_models()
    if not or_models:
        print("❌ 无法获取 OpenRouter 数据，退出")
        sys.exit(1)

    # 2. 合并数据
    print("\n🔧 合并数据...")
    models = build_models_json(or_models)

    # 3. 输出
    output_dir = "../ai-model-rankings/data"
    output_path = f"{output_dir}/models.js"

    print(f"\n💾 保存到 {output_path} ...")

    # 生成 JS 文件
    js_content = "module.exports = " + json.dumps(models, ensure_ascii=False, indent=2) + ";\n"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n{'='*60}")
    print(f"✅ 完成!")
    print(f"   模型数: {len(models)}")
    print(f"   输出: {output_path}")
    print(f"   定价来源: OpenRouter API (实时)")
    print(f"   排行来源: 人工维护 (RANKINGS_DATA)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
