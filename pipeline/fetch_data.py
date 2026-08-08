#!/usr/bin/env python3
"""
AI模型排行 — 数据抓取 v3
自动从 LMArena 取 Top 50 模型（含变体），从 OpenRouter 取定价

用法:
  1. node scrape_lmarena.js   (抓取排行榜)
  2. python3 fetch_data.py    (合并数据 → models.js)
"""

import json
import os
import re
import sys
import urllib.request
from datetime import datetime

# ============================================================
# 模型识别和配置
# ============================================================

# OpenRouter ID 映射 (LMArena 名称 → OpenRouter ID)
OPENROUTER_MAP = {
    # Claude 系列
    "claude-fable": "anthropic/claude-fable-5",
    "claude-opus-4-8": "anthropic/claude-opus-4.8",
    "claude-opus-4-7": "anthropic/claude-opus-4.8",
    "claude-opus-4-6": "anthropic/claude-opus-4.8",
    "claude-opus-4-5": "anthropic/claude-opus-4.8",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-5",
    "claude-sonnet-5": "anthropic/claude-sonnet-5",
    "claude-sonnet-4": "anthropic/claude-sonnet-5",
    "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    "claude-haiku-4": "anthropic/claude-haiku-4.5",
    # GPT 系列
    "gpt-5.6-sol": "openai/gpt-5",
    "gpt-5.6-terra": "openai/gpt-5",
    "gpt-5.6-luna": "openai/gpt-5-mini",
    "gpt-5.5": "openai/gpt-5",
    "gpt-5.4": "openai/gpt-5",
    "gpt-5.2": "openai/gpt-5",
    "gpt-5-mini": "openai/gpt-5-mini",
    "gpt-5": "openai/gpt-5",
    # Gemini 系列
    "gemini-3.6-flash": "google/gemini-2.5-flash",
    "gemini-3.5-flash": "google/gemini-2.5-flash",
    "gemini-3-flash": "google/gemini-2.5-flash",
    "gemini-3.1-pro": "google/gemini-2.5-pro",
    "gemini-3-pro": "google/gemini-2.5-pro",
    "gemini-2.5-pro": "google/gemini-2.5-pro",
    "gemini-2.5-flash": "google/gemini-2.5-flash",
    # DeepSeek 系列
    "deepseek-v4": "deepseek/deepseek-v4-pro",
    "deepseek-v3": "deepseek/deepseek-chat",
    "deepseek-r1": "deepseek/deepseek-r1",
    "-v4-pro": "deepseek/deepseek-v4-pro",
    "-v4-flash": "deepseek/deepseek-v4-flash",
    "-r1": "deepseek/deepseek-r1",
    "-v3": "deepseek/deepseek-chat",
    # Qwen 系列
    "qwen3.7-max": "qwen/qwen3-max",
    "qwen3.5-max": "qwen/qwen3-max",
    "qwen3-max": "qwen/qwen3-max",
    "qwen2.5-max": "qwen/qwen3-max",
    # GLM 系列
    "glm-5": None,
    "glm-4": None,
    # Kimi 系列
    "kimi-k3": None,
    "kimi-k2": None,
    # Grok 系列
    "grok-4": None,
    "grok-3": None,
    # Llama 系列
    "llama-4-maverick": "meta-llama/llama-4-maverick",
    "llama-4-scout": "meta-llama/llama-4-maverick",
    "muse-spark": None,
    # Mistral 系列
    "mistral-large": "mistralai/mistral-large",
    "mistral-medium": "mistralai/mistral-large",
    # ERNIE
    "ernie-5": None,
    # 豆包
    "doubao": None,
    # 混元
    "hunyuan": None,
}

# 模型名 → 显示名称 + 厂商 + 标签
MODEL_META = {
    "claude-fable": {"name": "Claude Fable 5", "provider": "Anthropic", "tags": ["chat", "coding", "writing", "reasoning"]},
    "claude-opus": {"name": "Claude Opus", "provider": "Anthropic", "tags": ["chat", "coding", "writing", "reasoning", "tools"]},
    "claude-sonnet": {"name": "Claude Sonnet", "provider": "Anthropic", "tags": ["chat", "coding", "fast"]},
    "claude-haiku": {"name": "Claude Haiku", "provider": "Anthropic", "tags": ["chat", "fast", "cheap"]},
    "gpt-5.6": {"name": "GPT-5.6", "provider": "OpenAI", "tags": ["chat", "coding", "reasoning", "multimodal"]},
    "gpt-5.5": {"name": "GPT-5.5", "provider": "OpenAI", "tags": ["chat", "coding", "reasoning"]},
    "gpt-5.4": {"name": "GPT-5.4", "provider": "OpenAI", "tags": ["chat", "coding", "reasoning"]},
    "gpt-5.2": {"name": "GPT-5.2", "provider": "OpenAI", "tags": ["chat", "coding"]},
    "gpt-5-mini": {"name": "GPT-5 Mini", "provider": "OpenAI", "tags": ["chat", "fast", "cheap"]},
    "gpt-5": {"name": "GPT-5", "provider": "OpenAI", "tags": ["chat", "coding", "reasoning", "multimodal"]},
    "gemini-3-pro": {"name": "Gemini 3 Pro", "provider": "Google", "tags": ["chat", "multimodal", "long-context"]},
    "gemini-3-flash": {"name": "Gemini 3 Flash", "provider": "Google", "tags": ["chat", "multimodal", "fast", "cheap"]},
    "gemini-3.5-flash": {"name": "Gemini 3.5 Flash", "provider": "Google", "tags": ["chat", "multimodal", "fast"]},
    "gemini-3.6-flash": {"name": "Gemini 3.6 Flash", "provider": "Google", "tags": ["chat", "multimodal", "fast"]},
    "deepseek-v4": {"name": "DeepSeek-V4", "provider": "DeepSeek", "tags": ["chat", "coding", "chinese", "open-source"]},
    "deepseek-v3": {"name": "DeepSeek-V3", "provider": "DeepSeek", "tags": ["chat", "coding", "chinese", "open-source"]},
    "deepseek-r1": {"name": "DeepSeek-R1", "provider": "DeepSeek", "tags": ["reasoning", "chinese", "open-source", "math"]},
    "qwen3.7-max": {"name": "Qwen 3.7 Max", "provider": "Alibaba", "tags": ["chat", "chinese", "coding"]},
    "qwen3.5-max": {"name": "Qwen 3.5 Max", "provider": "Alibaba", "tags": ["chat", "chinese", "coding"]},
    "qwen3-max": {"name": "Qwen 3 Max", "provider": "Alibaba", "tags": ["chat", "chinese", "coding"]},
    "qwen2.5-max": {"name": "Qwen 2.5 Max", "provider": "Alibaba", "tags": ["chat", "chinese"]},
    "glm-5": {"name": "GLM-5", "provider": "Zhipu", "tags": ["chat", "chinese", "multimodal", "open-source"]},
    "glm-4": {"name": "GLM-4", "provider": "Zhipu", "tags": ["chat", "chinese", "open-source"]},
    "kimi-k3": {"name": "Kimi K3", "provider": "Moonshot", "tags": ["chat", "chinese", "long-context", "coding"]},
    "kimi-k2": {"name": "Kimi K2", "provider": "Moonshot", "tags": ["chat", "chinese", "long-context"]},
    "grok-4": {"name": "Grok-4", "provider": "xAI", "tags": ["chat", "reasoning", "vision"]},
    "grok-3": {"name": "Grok-3", "provider": "xAI", "tags": ["chat", "reasoning"]},
    "llama-4-maverick": {"name": "Llama 4 Maverick", "provider": "Meta", "tags": ["open-source", "chat", "coding"]},
    "llama-4-scout": {"name": "Llama 4 Scout", "provider": "Meta", "tags": ["open-source", "cheap"]},
    "muse-spark": {"name": "Muse Spark", "provider": "Meta", "tags": ["chat", "coding", "multimodal"]},
    "mistral-large": {"name": "Mistral Large", "provider": "Mistral", "tags": ["chat", "coding", "multimodal", "open-source"]},
    "mistral-medium": {"name": "Mistral Medium", "provider": "Mistral", "tags": ["chat", "coding", "open-source"]},
    "ernie-5": {"name": "ERNIE 5", "provider": "Baidu", "tags": ["chat", "chinese", "multimodal"]},
    "doubao": {"name": "豆包", "provider": "ByteDance", "tags": ["chat", "chinese", "cheap"]},
    "hunyuan": {"name": "混元", "provider": "Tencent", "tags": ["chat", "chinese"]},
}


def clean_model_name(raw_name):
    """清理 LMArena 模型名"""
    name = raw_name
    for provider in ["Google", "OpenAI", "Anthropic", "Meta", "DeepSeek", "xAI",
                     "SpaceXAI", "Mistral", "Alibaba", "Qwen", "Moonshot", "Zhipu",
                     "Z.ai", "ByteDance", "Baidu", "Nvidia", "Ai2", "Microsoft",
                     "Apache", "MIT", "Proprietary", "Open Source", "Modified"]:
        name = name.replace(provider, "")
    name = re.sub(r'\s*·\s*.*$', '', name)
    name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
    name = name.lstrip('-').strip()
    return name


def match_model_key(clean_name, raw_name=""):
    """匹配模型 key"""
    lower = clean_name.lower()
    raw_lower = raw_name.lower()

    # 从 raw_name 匹配 (包含 provider 信息)
    raw_checks = [
        ("claude-fable", "claude-fable"),
        ("claude-opus", "claude-opus"),
        ("claude-sonnet", "claude-sonnet"),
        ("claude-haiku", "claude-haiku"),
        ("gpt-5-mini", "gpt-5-mini"),
        ("gpt-5.6", "gpt-5.6"),
        ("gpt-5.5", "gpt-5.5"),
        ("gpt-5.4", "gpt-5.4"),
        ("gpt-5.2", "gpt-5.2"),
        ("gpt-5", "gpt-5"),
        ("gemini-3.6-flash", "gemini-3.6-flash"),
        ("gemini-3.5-flash", "gemini-3.5-flash"),
        ("gemini-3-flash", "gemini-3-flash"),
        ("gemini-3.1-pro", "gemini-3-pro"),
        ("gemini-3-pro", "gemini-3-pro"),
        ("gemini-2.5-pro", "gemini-3-pro"),
        ("gemini-2.5-flash", "gemini-3-flash"),
        ("deepseek-v4", "deepseek-v4"),
        ("deepseek-v3", "deepseek-v3"),
        ("deepseek-r1", "deepseek-r1"),
        ("qwen3.7-max", "qwen3.7-max"),
        ("qwen3.5-max", "qwen3.5-max"),
        ("qwen3-max", "qwen3-max"),
        ("qwen2.5-max", "qwen2.5-max"),
        ("3.7-max", "qwen3.7-max"),
        ("3.5-max", "qwen3.5-max"),
        ("3-max", "qwen3-max"),
        ("glm-5", "glm-5"),
        ("glm-4", "glm-4"),
        ("kimi-k3", "kimi-k3"),
        ("kimi-k2", "kimi-k2"),
        ("grok-4", "grok-4"),
        ("grok-3", "grok-3"),
        ("muse-spark", "muse-spark"),
        ("llama-4-maverick", "llama-4-maverick"),
        ("llama-4-scout", "llama-4-scout"),
        ("mistral-large", "mistral-large"),
        ("mistral-medium", "mistral-medium"),
        ("ernie-5", "ernie-5"),
        ("doubao", "doubao"),
        ("hunyuan", "hunyuan"),
    ]

    # 先从 clean_name 匹配
    for pattern, key in raw_checks:
        if pattern in lower:
            return key

    # 从 raw_name 匹配
    for pattern, key in raw_checks:
        if pattern in raw_lower:
            return key

    # 特殊: DeepSeek 被剥离后只剩 "-v4-pro" → "v4-pro"
    if lower.startswith("v4") or lower.startswith("v3"):
        return "deepseek-v4" if "v4" in lower else "deepseek-v3"
    if lower.startswith("r1"):
        return "deepseek-r1"

    return None


def fetch_openrouter():
    """从 OpenRouter API 获取模型数据"""
    url = "https://openrouter.ai/api/v1/models"
    print(f"  请求 {url}...")
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


def fetch_exchange_rate():
    """获取 USD→CNY 汇率"""
    try:
        url = "https://open.er-api.com/v6/latest/USD"
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "AI-Model-Rankings/1.0")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("rates", {}).get("CNY", 7.2)
    except:
        return 7.2


def load_lmarena_rankings():
    """加载 LMArena 爬虫数据"""
    rankings_file = os.path.join(os.path.dirname(__file__), "rankings.json")
    if not os.path.exists(rankings_file):
        print("  ⚠️ rankings.json 不存在，请先运行 node scrape_lmarena.js")
        return []

    with open(rankings_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    models = []
    for m in data:
        raw_name = m.get("name", "")
        clean = clean_model_name(raw_name)
        key = match_model_key(clean, raw_name)

        if not key:
            continue

        meta = MODEL_META.get(key, {})
        models.append({
            "key": key,
            "clean_name": clean,
            "raw_name": raw_name,
            "name": meta.get("name", clean),
            "provider": meta.get("provider", ""),
            "tags": meta.get("tags", ["chat"]),
            "textElo": m.get("overallElo", m.get("textElo", 0)),
            "textEloMargin": m.get("textEloMargin", 0),
            "codingElo": m.get("codingElo", 0),
            "mathElo": m.get("mathElo", 0),
            "writingElo": m.get("writingElo", 0),
            "hardpromptsElo": m.get("hardpromptsElo", 0),
            "expertElo": m.get("expertElo", 0),
            "instructionElo": m.get("instructionElo", 0),
            "multiturnElo": m.get("multiturnElo", 0),
            "votes": m.get("votes", 0),
        })

    return models


def deduplicate_models(models, max_per_key=2):
    """去重：每个 key 最多保留 max_per_key 个（取 Elo 最高的）"""
    groups = {}
    for m in models:
        key = m["key"]
        if key not in groups:
            groups[key] = []
        groups[key].append(m)

    result = []
    for key, group in groups.items():
        group.sort(key=lambda x: x["textElo"], reverse=True)
        result.extend(group[:max_per_key])

    result.sort(key=lambda x: x["textElo"], reverse=True)
    return result


def elo_to_score(elo, min_elo=1150, max_elo=1510):
    """Elo → 0-100 分"""
    if elo <= 0:
        return 0
    score = ((elo - min_elo) / (max_elo - min_elo)) * 100
    return round(max(0, min(100, score)), 1)


def find_openrouter(or_models, key):
    """在 OpenRouter 中查找模型"""
    or_id = OPENROUTER_MAP.get(key)
    if or_id:
        for m in or_models:
            if m.get("id") == or_id:
                return m
    return None


def build_models(top_models, or_models, exchange_rate):
    """生成最终模型数据"""
    import math
    today = datetime.now().strftime("%Y-%m-%d")
    results = []
    seen_ids = set()

    for rank, lm in enumerate(top_models, 1):
        key = lm["key"]
        meta = MODEL_META.get(key, {})
        or_model = find_openrouter(or_models, key)

        # 生成内部ID
        internal_id = key.replace(".", "-")
        if internal_id in seen_ids:
            internal_id = f"{internal_id}-{lm['textElo']}"
        seen_ids.add(internal_id)

        # 定价
        if or_model:
            p = or_model.get("pricing", {})
            input_price = float(p.get("prompt", 0)) * 1_000_000
            output_price = float(p.get("completion", 0)) * 1_000_000
            ctx = or_model.get("context_length", 0)
            max_out = or_model.get("top_provider", {}).get("max_completion_tokens", 8192)
            arch = or_model.get("architecture", {})
            modality = arch.get("modality", "text->text")
            modalities = modality.split("->")[0].split("+") if "->" in modality else ["text"]
        else:
            input_price = 0
            output_price = 0
            ctx = 128000
            max_out = 8192
            modalities = ["text"]

        # 所有维度分数 - 直接使用 LMArena 原始 Elo 分数
        overall = lm.get("textElo", 0)
        coding = lm.get("codingElo", 0)
        reasoning = lm.get("mathElo", 0)
        writing = lm.get("writingElo", 0)
        chinese = 0  # LMArena 无中文维度
        multimodal = 0  # LMArena 无多模态维度

        # 性价比 - 月费估算(美元)
        if input_price > 0 and output_price > 0:
            monthly_cost = round((200 * input_price + 200 * output_price) / 1_000_000, 2)
        else:
            monthly_cost = 0

        model = {
            "id": internal_id,
            "name": lm["name"],
            "provider": lm["provider"],
            "status": "active",
            "tags": lm["tags"],
            "addedDate": today,
            "lastUpdated": today,
            "pricing": {
                "inputPrice": round(input_price, 2),
                "outputPrice": round(output_price, 2),
                "currency": "USD",
                "freeTier": False,
                "freeTierDescription": "",
                "priceSource": f"openrouter.ai @ {today}" if or_model else "待更新",
                "priceVerified": bool(or_model),
                "inputPriceCNY": round(input_price * exchange_rate, 2),
                "outputPriceCNY": round(output_price * exchange_rate, 2),
            },
            "specs": {
                "contextWindow": ctx,
                "maxOutputTokens": max_out,
                "modalities": modalities,
                "openSource": "open-source" in lm["tags"],
                "licenseType": "",
                "trainingCutoff": "",
                "specSource": f"openrouter.ai @ {today}" if or_model else "",
            },
            "rankings": {
                "overall": {"score": overall, "source": f"LMArena Elo {overall}±{lm.get('textEloMargin', 0)}", "sourceUrl": "https://arena.ai/leaderboard/text", "updated": today, "methodology": ""},
                "coding": {"score": coding, "source": f"LMArena Coding Elo {coding}", "sourceUrl": "https://arena.ai/leaderboard/text", "updated": today, "methodology": ""},
                "reasoning": {"score": reasoning, "source": f"LMArena Math Elo {reasoning}", "sourceUrl": "https://arena.ai/leaderboard/text", "updated": today, "methodology": ""},
                "writing": {"score": writing, "source": f"LMArena Writing Elo {writing}", "sourceUrl": "https://arena.ai/leaderboard/text", "updated": today, "methodology": ""},
                "chinese": {"score": chinese, "source": "LMArena无中文维度", "sourceUrl": "", "updated": today, "methodology": ""},
                "multimodal": {"score": multimodal, "source": "LMArena无多模态维度", "sourceUrl": "", "updated": today, "methodology": ""},
                "costEffectiveness": {"score": monthly_cost, "source": f"月费估算(编程助手场景)", "sourceUrl": "", "updated": today, "methodology": ""},
            },
            "summary": f"{meta.get('name', '')}，{lm['provider']}出品。",
            "detailDescription": "",
            "bestFor": [],
            "pros": [],
            "cons": [],
            "competitors": [],
        }

        results.append(model)
        print(f"  {rank}. {model['name']} ({model['provider']}) | Elo:{lm['textElo']}→{overall}分 | ${input_price:.2f}/${output_price:.2f}/M")

    return results


def main():
    print("=" * 60)
    print("AI模型排行 — 数据抓取 v3 (Top 50)")
    print("=" * 60)

    print("\n📊 加载 LMArena 排行榜...")
    all_rankings = load_lmarena_rankings()
    print(f"  识别到 {len(all_rankings)} 个模型")

    print("\n🏆 去重取 Top 50...")
    top_models = deduplicate_models(all_rankings, max_per_key=1)
    top_models = top_models[:50]
    print(f"  选取 {len(top_models)} 个模型")

    print("\n📡 获取 OpenRouter 定价...")
    or_models = fetch_openrouter()

    print("\n💱 获取汇率...")
    exchange_rate = fetch_exchange_rate()
    print(f"  1 USD = {exchange_rate} CNY")

    print("\n🔧 合并数据...")
    models = build_models(top_models, or_models, exchange_rate)

    output_path = os.path.join(os.path.dirname(__file__), "..", "ai-model-rankings", "data", "models.js")
    output_path = os.path.normpath(output_path)

    print(f"\n💾 保存到 {output_path}...")
    js_content = "module.exports = " + json.dumps(models, ensure_ascii=False, indent=2) + ";\n"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n{'='*60}")
    print(f"✅ 完成! {len(models)} 个模型")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
