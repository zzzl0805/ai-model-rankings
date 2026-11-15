#!/usr/bin/env python3
"""
将 rankings.json 转换为小程序用的 rankings.js

用法: python3 build_rankings.py
输出: ../miniprogram/data/rankings.js
"""

import json
import os
import re
import urllib.request
from datetime import datetime

# 导入国产模型官方定价
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from official_prices import get_official_price

# 加载自动抓取的国产定价（如果存在）
CN_PRICES = {}
cn_prices_file = os.path.join(os.path.dirname(__file__), 'cn_prices.json')
if os.path.exists(cn_prices_file):
    with open(cn_prices_file, 'r', encoding='utf-8') as f:
        CN_PRICES = json.load(f)
    print(f"  已加载 {len(CN_PRICES)} 个自动抓取的国产定价")


def _norm_key(s):
    """模型名归一化（用于定价匹配）：去空格/横线/点/下划线并转小写。
    例："GLM 5.3 (Max)" 与 "glm-5.3" 归一后都能互相包含。"""
    return re.sub(r"[\s\-_.]+", "", (s or "").lower())

# OpenRouter ID 映射
OPENROUTER_MAP = {
    # Claude
    "claude-fable-5": "anthropic/claude-fable-5",
    "claude-opus-4-8": "anthropic/claude-opus-4.8",
    "claude-opus-4-7": "anthropic/claude-opus-4.8",
    "claude-opus-4-6": "anthropic/claude-opus-4.8",
    "claude-opus-4-5": "anthropic/claude-opus-4.8",
    "claude-sonnet-5": "anthropic/claude-sonnet-5",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-5",
    "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
    # GPT
    "gpt-5.6-sol": "openai/gpt-5",
    "gpt-5.6-terra": "openai/gpt-5",
    "gpt-5.6-luna": "openai/gpt-5-mini",
    "gpt-5.5": "openai/gpt-5",
    "gpt-5.4": "openai/gpt-5",
    "gpt-5.2": "openai/gpt-5",
    "gpt-5-mini": "openai/gpt-5-mini",
    "gpt-5": "openai/gpt-5",
    # Gemini
    "gemini-3.6-flash": "google/gemini-2.5-flash",
    "gemini-3.5-flash": "google/gemini-2.5-flash",
    "gemini-3-flash": "google/gemini-2.5-flash",
    "gemini-3.1-pro": "google/gemini-2.5-pro",
    "gemini-3-pro": "google/gemini-2.5-pro",
    # DeepSeek
    "deepseek-v4": "deepseek/deepseek-v4-pro",
    "deepseek-v3": "deepseek/deepseek-chat",
    "deepseek-r1": "deepseek/deepseek-r1",
    # Qwen
    "qwen3.8-max": "qwen/qwen3.8-max",
    "qwen3.7-max": "qwen/qwen3.7-max",
    "qwen3.7-plus": "qwen/qwen3.7-plus",
    "qwen3.7-max-preview": "qwen/qwen3.7-max",
    "qwen3.6-max": "qwen/qwen3.6-max",
    "qwen3.6-plus": "qwen/qwen3.6-plus",
    "qwen3-max": "qwen/qwen3-max",
    "qwen3-max-preview": "qwen/qwen3-max-preview",
    # Kimi
    "kimi-k3": "moonshotai/kimi-k3",
    "kimi-k2": "moonshotai/kimi-k2",
    # GLM
    "glm-5.2": "z-ai/glm-5.2",
    "glm-5.1": "z-ai/glm-5.1",
    "glm-5v-turbo": "z-ai/glm-5v-turbo",
    "glm-5-turbo": "z-ai/glm-5-turbo",
    "glm-5": "z-ai/glm-5",
    "glm-4.7-flash": "z-ai/glm-4.7-flash",
    "glm-4.7": "z-ai/glm-4.7",
    "glm-4.6v": "z-ai/glm-4.6v",
    "glm-4.6": "z-ai/glm-4.6",
    "glm-4.5v": "z-ai/glm-4.5v",
    "glm-4.5-air": "z-ai/glm-4.5-air",
    "glm-4.5": "z-ai/glm-4.5",
    # Grok
    "grok-4": "x-ai/grok-4.20",
    "grok-4.5": "x-ai/grok-4.5",
    "grok-3": "x-ai/grok-4.3",
    # Muse
    "muse-spark": "meta/muse-spark-1.1",
    # Llama
    "llama-4-maverick": "meta-llama/llama-4-maverick",
    # Mistral
    "mistral-large": "mistralai/mistral-large",
    # ERNIE
    "ernie-5": None,
    # 豆包
    "doubao": None,
    # 混元
    "hunyuan": None,
}

def fetch_openrouter():
    """获取 OpenRouter 定价数据，返回 (dict, list)"""
    url = "https://openrouter.ai/api/v1/models"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "AI-Model-Rankings/1.0")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = data.get("data", [])
            return {m["id"]: m for m in models}, models
    except Exception as e:
        print(f"  OpenRouter 请求失败: {e}")
        return {}, []

def fetch_exchange_rate():
    """获取汇率"""
    try:
        url = "https://open.er-api.com/v6/latest/USD"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("rates", {}).get("CNY", 7.2)
    except:
        return 7.2

def find_or_model(or_models, name, or_list=None):
    """智能匹配 OpenRouter 模型
    1. 先查精确映射 OPENROUTER_MAP
    2. 再对 OpenRouter model ID 做模糊匹配
    """
    lower = name.lower()
    name_norm = _norm_key(lower)

    # 1. 精确映射（按归一化 key 长度降序）
    sorted_keys = sorted(OPENROUTER_MAP.items(), key=lambda x: len(_norm_key(x[0])), reverse=True)
    for key, or_id in sorted_keys:
        if or_id and _norm_key(key) in name_norm:
            m = or_models.get(or_id)
            if m:
                return m

    # 2. 模糊匹配 OpenRouter ID
    # 提取核心名：去掉括号变体与 high/max/thinking 等后缀的干扰
    # （arena.ai 展示名 "GLM-5.3 (Max)" 含空格和括号，不做归一化会大量失配）
    core = re.sub(r"\([^)]*\)", " ", lower)
    core = re.sub(r"\b(thinking|high|xhigh|medium|low|preview|beta|instant|max)\b", " ", core)
    core = re.sub(r"-\d{6,}", "", core)  # 去日期 20250929
    core = re.sub(r"-\d+k$", "", core)  # 去 -32k
    core = core.strip("- ")

    if or_list:
        best_match = None
        best_score = 0
        core_clean = _norm_key(core)
        for m in or_list:
            mid = m.get("id", "").lower()
            # 提取 OpenRouter ID 的模型名部分（去掉 provider/）
            model_part = mid.split("/", 1)[-1] if "/" in mid else mid
            model_part = _norm_key(model_part)

            # 计算匹配分数
            if core_clean == model_part:
                return m  # 完全匹配
            if core_clean in model_part or model_part in core_clean:
                score = min(len(core_clean), len(model_part))
                if score > best_score and score >= 4:
                    best_score = score
                    best_match = m
        if best_match:
            return best_match

    return None

def build():
    print("=" * 60)
    print("构建小程序排行数据")
    print("=" * 60)

    # 加载爬虫数据
    rankings_file = os.path.join(os.path.dirname(__file__), "rankings.json")
    if not os.path.exists(rankings_file):
        print("❌ rankings.json 不存在，请先运行 node scrape_lmarena.js")
        return

    with open(rankings_file, "r", encoding="utf-8") as f:
        raw = json.load(f)

    print(f"\n📊 加载 rankings.json...")
    print(f"  大类: {list(raw.get('data', {}).keys())}")

    # 获取 OpenRouter 定价
    print("\n📡 获取 OpenRouter 定价...")
    or_models, or_list = fetch_openrouter()
    print(f"  获取到 {len(or_models)} 个模型")

    # 获取汇率
    print("\n💱 获取汇率...")
    rate = fetch_exchange_rate()
    print(f"  1 USD = {rate} CNY")

    # 大类配置
    categories = [
        { "id": "text", "name": "文本", "icon": "💬", "description": "纯文本对话" },
        { "id": "webdev", "name": "WebDev", "icon": "💻", "description": "Web开发编程" },
        { "id": "vision", "name": "视觉", "icon": "👁", "description": "视觉理解" },
        { "id": "document", "name": "文档", "icon": "📄", "description": "文档理解" },
        { "id": "search", "name": "搜索", "icon": "🔍", "description": "搜索增强" },
        { "id": "agent", "name": "Agent", "icon": "🤖", "description": "Agent模式（工具调用）" },
        { "id": "image-to-webdev", "name": "图转码", "icon": "🖼→💻", "description": "图片转代码" },
        { "id": "text-to-image", "name": "文生图", "icon": "✍→🖼", "description": "文本生成图片" },
        { "id": "image-edit", "name": "图片编辑", "icon": "✏🖼", "description": "图片编辑" },
        { "id": "text-to-video", "name": "文生视频", "icon": "✍→🎬", "description": "文本生成视频" },
        { "id": "image-to-video", "name": "图生视频", "icon": "🖼→🎬", "description": "图片生成视频" },
        { "id": "video-edit", "name": "视频编辑", "icon": "✏🎬", "description": "视频编辑" },
    ]

    # 维度配置
    dimensions = [
        { "id": "overall", "name": "综合", "icon": "🏆" },
        { "id": "coding", "name": "编程", "icon": "💻" },
        { "id": "math", "name": "数学", "icon": "🧮" },
        { "id": "writing", "name": "写作", "icon": "✍" },
        { "id": "hardprompts", "name": "难题", "icon": "🌶" },
        { "id": "instruction", "name": "指令", "icon": "📝" },
        { "id": "expert", "name": "专家", "icon": "🤓" },
        { "id": "multiturn", "name": "长对话", "icon": "💬" },
    ]

    # 处理数据
    print("\n🔧 处理数据...")
    data = raw.get("data", {})
    processed = {}

    for cat in categories:
        cat_id = cat["id"]
        processed[cat_id] = {}

        for dim in dimensions:
            dim_id = dim["id"]
            models = data.get(cat_id, {}).get(dim_id, [])

            enriched = []
            for m in models:
                model_name = m.get("name", "")
                context = m.get("context", "")
                price_input = 0
                price_output = 0
                price_source = ""
                currency = "USD"

                # 1. 优先查自动抓取的国产定价
                # 归一化后匹配：arena.ai 展示名（"GLM 5.3 (Max)"）与定价 key
                # （"glm-5.3"）格式不同，直接子串匹配会大量失配
                cn_matched = False
                model_norm = _norm_key(model_name)
                for cn_key in sorted(CN_PRICES.keys(), key=lambda k: len(_norm_key(k)), reverse=True):
                    if _norm_key(cn_key) in model_norm:
                        cn = CN_PRICES[cn_key]
                        price_input = cn["input"]
                        price_output = cn["output"]
                        context = cn.get("context", "")
                        currency = cn.get("currency", "CNY")
                        price_source = cn["source"]
                        cn_matched = True
                        break

                # 2. 再查手动维护的国产定价
                if not cn_matched:
                    official = get_official_price(model_name)
                    if official:
                        price_input = official["input"]
                        price_output = official["output"]
                        context = official["context"]
                        currency = official.get("currency", "CNY")
                        price_source = official["source"]
                        cn_matched = True

                # 3. 查 OpenRouter 定价
                if not cn_matched:
                    # 2. 查 OpenRouter 定价（USD）
                    or_model = find_or_model(or_models, model_name, or_list)
                    if or_model:
                        p = or_model.get("pricing", {})
                        price_input = round(float(p.get("prompt", 0)) * 1_000_000, 2)
                        price_output = round(float(p.get("completion", 0)) * 1_000_000, 2)
                        context = f"{or_model.get('context_length', 0) // 1000}K"
                        currency = "USD"
                        price_source = "openrouter.ai"

                # 统一存储：USD 为主，CNY 换算
                if currency == "CNY":
                    usd_input = round(price_input / rate, 2)
                    usd_output = round(price_output / rate, 2)
                    cny_input = price_input
                    cny_output = price_output
                else:
                    usd_input = price_input
                    usd_output = price_output
                    cny_input = round(price_input * rate, 2)
                    cny_output = round(price_output * rate, 2)

                enriched.append({
                    "rank": m.get("rank", 0),
                    "name": model_name,
                    "provider": m.get("rawName", "").split(m.get("name", ""))[0] if m.get("name") in m.get("rawName", "") else "",
                    "elo": m.get("elo", 0),
                    "margin": m.get("margin", 0),
                    "votes": m.get("votes", 0),
                    "price": {
                        "input": usd_input,
                        "output": usd_output,
                        "inputCNY": cny_input,
                        "outputCNY": cny_output,
                        "currency": currency,
                        "source": price_source,
                    },
                    "context": context,
                })

            processed[cat_id][dim_id] = enriched

    # 生成 JS 文件（紧凑格式）
    output = {
        "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
        "source": "arena.ai",
        "categories": categories,
        "dimensions": dimensions,
        "data": processed,
    }

    # 安全阀：数据过少时拒绝写入，避免把空/残缺数据覆盖到线上
    # （2026-11-15 曾因 Cloudflare 拦截抓到 0 条，误把 rankings.js 写成 3KB 空文件）
    total_entries = sum(len(v) for cat in processed.values() for v in cat.values())
    if total_entries < 500:
        print(f"\n❌ 只处理出 {total_entries} 条数据（<500），拒绝覆盖 rankings.js")
        print("   请检查爬虫 / HF 数据源是否可用")
        raise SystemExit(1)

    output_path = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "data", "rankings.js")
    output_path = os.path.normpath(output_path)

    print(f"\n💾 保存到 {output_path}...")
    # 紧凑 JSON：无缩进，去掉空格，大幅减小文件体积
    compact_json = json.dumps(output, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    js_content = "module.exports = " + compact_json + ";\n"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    js_size = os.path.getsize(output_path)
    print(f"   rankings.js: {js_size / 1024:.0f} KB")

    # 同步生成云端精简版（复用 upload_to_cloud.js 的逻辑）
    slim = {
        "updateTime": datetime.now().isoformat(),
        "lastUpdated": output["lastUpdated"],
        "source": output["source"],
        "data": output["data"],
    }
    # 云端版不需要 categories/dimensions（云端数据始终用本地配置）
    cloud_path = os.path.join(os.path.dirname(__file__), "rankings_cloud.json")
    with open(cloud_path, "w", encoding="utf-8") as f:
        json.dump([slim], f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    cloud_size = os.path.getsize(cloud_path)
    print(f"   rankings_cloud.json: {cloud_size / 1024:.0f} KB")

    # 统计
    total = 0
    for cat in categories:
        for dim in dimensions:
            total += len(processed.get(cat["id"], {}).get(dim["id"], []))

    print(f"\n{'='*60}")
    print(f"✅ 完成!")
    print(f"   大类: {len(categories)}")
    print(f"   维度: {len(dimensions)}")
    print(f"   总数据: {total} 条")
    print(f"{'='*60}")

if __name__ == "__main__":
    build()
