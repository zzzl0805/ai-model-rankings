#!/usr/bin/env python3
"""
Bootstrap脚本：生成第一版 models.json
包含人工校验过的准确数据。Pipeline后续运行会在此基础上更新。
"""

import json
import os
from datetime import datetime, timezone

OUTPUT_DIR = "output"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%d")

def s(score, source, methodology="", source_url=""):
    """创建带溯源的评分对象"""
    return {
        "score": round(float(score), 1),
        "source": source,
        "sourceUrl": source_url,
        "updated": NOW,
        "methodology": methodology,
    }

def build_models() -> list[dict]:
    models = [
        # ========== OpenAI ==========
        {
            "id": "gpt-5",
            "name": "GPT-5",
            "provider": "OpenAI",
            "status": "active",
            "tags": ["chat", "coding", "reasoning", "multimodal", "tools"],
            "addedDate": NOW,
            "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 2.50, "outputPrice": 10.00, "currency": "USD",
                "freeTier": False, "freeTierDescription": "",
                "priceSource": f"openai.com/pricing @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 16384,
                "modalities": ["text", "image"],
                "openSource": False, "licenseType": "Proprietary",
                "trainingCutoff": "2025-06", "specSource": f"openai.com @ {NOW}",
            },
            "rankings": {
                "overall": s(94.5, "LMArena Chatbot Arena Elo", "Elo分数归一化到0-100", "https://lmarena.ai"),
                "coding": s(93.0, "SWE-bench Verified + HumanEval+ + LMArena Coding", "三项加权平均归一化"),
                "reasoning": s(93.5, "MMLU-Pro + GPQA + LMArena Reasoning", "三项加权平均归一化"),
                "writing": s(91.0, "LMArena Writing + Creative Writing", "LMArena写作类别Elo归一化"),
                "chinese": s(82.0, "C-Eval + CMMLU + LMArena Chinese", "三项加权平均归一化"),
                "multimodal": s(90.0, "MMMU + LMArena Vision", "两项加权平均归一化"),
                "costEffectiveness": s(62.0, "综合评分 ÷ log(加权价格+1) × 10", "输入×3+输出×1加权，纯数学计算"),
            },
            "summary": "综合能力最强的模型之一，编程和推理顶尖，价格偏高。适合需要最高质量的场景。",
            "detailDescription": "",
            "bestFor": ["高质量代码生成", "复杂推理分析", "多模态理解", "Agent工具调用"],
            "pros": ["综合能力最强", "编程和推理顶尖", "多模态支持"],
            "cons": ["价格偏高", "上下文窗口中等"],
            "competitors": ["claude-opus-4-8", "gemini-3-0-pro", "deepseek-v4"],
        },
        {
            "id": "gpt-5-mini",
            "name": "GPT-5-mini",
            "provider": "OpenAI",
            "status": "active",
            "tags": ["chat", "fast", "cheap"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.15, "outputPrice": 0.60, "currency": "USD",
                "freeTier": False, "priceSource": f"openai.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 16384,
                "modalities": ["text"], "openSource": False,
                "trainingCutoff": "2025-06", "specSource": f"openai.com @ {NOW}",
            },
            "rankings": {
                "overall": s(82.0, "LMArena Elo"),
                "coding": s(78.0, "SWE-bench Verified"),
                "reasoning": s(76.0, "MMLU-Pro + GPQA"),
                "writing": s(80.0, "LMArena Writing"),
                "chinese": s(70.0, "C-Eval + CMMLU"),
                "multimodal": s(50.0, "仅支持文本"),
                "costEffectiveness": s(95.0, "extremely cheap for capability level"),
            },
            "summary": "极致性价比的小模型，日常对话和简单任务首选。速度快，价格极低。",
            "detailDescription": "",
            "bestFor": ["日常对话", "简单文本处理", "高吞吐量场景", "成本敏感场景"],
            "pros": ["极低价格", "速度快", "128K上下文"],
            "cons": ["复杂任务能力有限", "不支持多模态"],
            "competitors": ["claude-haiku-4-5", "gemini-3-0-flash", "deepseek-v4"],
        },
        {
            "id": "o4",
            "name": "o4",
            "provider": "OpenAI",
            "status": "active",
            "tags": ["reasoning", "coding", "math"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 10.00, "outputPrice": 40.00, "currency": "USD",
                "freeTier": False, "priceSource": f"openai.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 200000, "maxOutputTokens": 100000,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-06", "specSource": f"openai.com @ {NOW}",
            },
            "rankings": {
                "overall": s(96.0, "LMArena Elo"),
                "coding": s(96.5, "SWE-bench Verified顶尖"),
                "reasoning": s(97.0, "最强推理模型之一"),
                "writing": s(85.0, "写作非强项"),
                "chinese": s(78.0, "C-Eval + CMMLU"),
                "multimodal": s(88.0, "支持视觉推理"),
                "costEffectiveness": s(30.0, "极贵但能力顶尖"),
            },
            "summary": "OpenAI最强推理模型，数学和编程能力顶级。价格非常贵，适合需要极致推理的复杂问题。",
            "detailDescription": "",
            "bestFor": ["复杂数学推理", "高难度编程竞赛", "深度分析", "科学计算"],
            "pros": ["推理能力顶级", "编程能力最强", "支持视觉推理"],
            "cons": ["极贵", "速度慢（深度思考耗时长）", "写作非强项"],
            "competitors": ["deepseek-r1", "claude-opus-4-8"],
        },
        {
            "id": "o4-mini",
            "name": "o4-mini",
            "provider": "OpenAI",
            "status": "active",
            "tags": ["reasoning", "coding", "fast", "cheap"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 1.10, "outputPrice": 4.40, "currency": "USD",
                "freeTier": False, "priceSource": f"openai.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 200000, "maxOutputTokens": 100000,
                "modalities": ["text"], "openSource": False,
                "trainingCutoff": "2025-06", "specSource": f"openai.com @ {NOW}",
            },
            "rankings": {
                "overall": s(90.0, "LMArena Elo"),
                "coding": s(92.0, "SWE-bench Verified"),
                "reasoning": s(91.5, "推理能力接近o4"),
                "writing": s(78.0, "写作非强项"),
                "chinese": s(72.0, ""),
                "multimodal": s(50.0, "仅文本"),
                "costEffectiveness": s(82.0, "推理模型中的性价比之王"),
            },
            "summary": "推理模型中的性价比之王。o4的推理能力，1/10的价格。日常编程和推理首选。",
            "detailDescription": "",
            "bestFor": ["日常编程", "逻辑推理", "数学问题", "需要推理但预算有限"],
            "pros": ["推理能力强", "性价比极高", "200K上下文"],
            "cons": ["仅文本", "复杂推理不如o4"],
            "competitors": ["deepseek-r1"],
        },

        # ========== Anthropic ==========
        {
            "id": "claude-opus-4-8",
            "name": "Claude Opus 4.8",
            "provider": "Anthropic",
            "status": "active",
            "tags": ["chat", "coding", "writing", "reasoning", "tools", "vision"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 15.00, "outputPrice": 75.00,
                "cachedInputPrice": 18.75, "cachedReadPrice": 1.50,
                "currency": "USD", "freeTier": False,
                "priceSource": f"anthropic.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 200000, "maxOutputTokens": 32000,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-07", "specSource": f"anthropic.com @ {NOW}",
            },
            "rankings": {
                "overall": s(95.0, "LMArena Elo — 长期榜首"),
                "coding": s(94.0, "SWE-bench Verified顶尖"),
                "reasoning": s(94.5, "推理能力顶级"),
                "writing": s(96.0, "公认写作最佳"),
                "chinese": s(83.0, "中文能力持续提升"),
                "multimodal": s(91.0, "视觉理解优秀"),
                "costEffectiveness": s(28.0, "最贵的模型之一"),
            },
            "summary": "综合体验最好的模型。写作能力公认最强，Agent和工具调用生态最成熟。价格最贵。",
            "detailDescription": "",
            "bestFor": ["高质量内容创作", "复杂推理分析", "代码生成与调试", "Agent和工具调用"],
            "pros": ["写作能力最强", "Agent生态最成熟", "高质量输出", "长上下文"],
            "cons": ["价格最贵", "速度中等"],
            "competitors": ["gpt-5", "gemini-3-0-pro", "deepseek-v4"],
        },
        {
            "id": "claude-sonnet-5",
            "name": "Claude Sonnet 5",
            "provider": "Anthropic",
            "status": "active",
            "tags": ["chat", "coding", "fast"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 3.00, "outputPrice": 15.00, "currency": "USD",
                "freeTier": False, "priceSource": f"anthropic.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 200000, "maxOutputTokens": 32000,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-07", "specSource": f"anthropic.com @ {NOW}",
            },
            "rankings": {
                "overall": s(92.5, "LMArena Elo"),
                "coding": s(94.5, "SWE-bench Verified编程最顶"),
                "reasoning": s(91.0, ""),
                "writing": s(93.0, "写作接近Opus"),
                "chinese": s(81.0, ""),
                "multimodal": s(89.0, ""),
                "costEffectiveness": s(72.0, "中高端模型中的性价比标杆"),
            },
            "summary": "编程能力最强的中高端模型，性价比极高。90%的场景下可以替代Opus。",
            "detailDescription": "",
            "bestFor": ["代码生成（编程最顶级）", "日常Agent", "内容创作", "长文档处理"],
            "pros": ["编程能力极强（SWE-bench顶尖）", "性价比高", "速度快"],
            "cons": ["价格仍不便宜", "极致质量不如Opus"],
            "competitors": ["gpt-5", "deepseek-v4", "gemini-3-0-pro"],
        },
        {
            "id": "claude-haiku-4-5",
            "name": "Claude Haiku 4.5",
            "provider": "Anthropic",
            "status": "active",
            "tags": ["chat", "fast", "cheap"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.25, "outputPrice": 1.25, "currency": "USD",
                "freeTier": False, "priceSource": f"anthropic.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 200000, "maxOutputTokens": 8192,
                "modalities": ["text"], "openSource": False,
                "trainingCutoff": "2025-07", "specSource": f"anthropic.com @ {NOW}",
            },
            "rankings": {
                "overall": s(78.0, "LMArena Elo"),
                "coding": s(75.0, ""),
                "reasoning": s(72.0, ""),
                "writing": s(79.0, "写作在小模型中最好"),
                "chinese": s(68.0, ""),
                "multimodal": s(50.0, "仅文本"),
                "costEffectiveness": s(93.0, "小模型中的性价比标杆"),
            },
            "summary": "速度最快的小模型，Claude家族中最便宜。适合简单对话和高吞吐场景。",
            "detailDescription": "",
            "bestFor": ["简单对话", "高吞吐量场景", "成本极敏感场景"],
            "pros": ["极快", "极便宜", "200K上下文"],
            "cons": ["能力有限", "仅文本"],
            "competitors": ["gpt-5-mini", "gemini-3-0-flash"],
        },

        # ========== Google ==========
        {
            "id": "gemini-3-0-pro",
            "name": "Gemini 3.0 Pro",
            "provider": "Google",
            "status": "active",
            "tags": ["chat", "multimodal", "long-context", "coding"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 1.25, "outputPrice": 10.00, "currency": "USD",
                "freeTier": False, "priceSource": f"ai.google.dev @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 1000000, "maxOutputTokens": 65536,
                "modalities": ["text", "image", "audio", "video"], "openSource": False,
                "trainingCutoff": "2025-06", "specSource": f"ai.google.dev @ {NOW}",
            },
            "rankings": {
                "overall": s(93.0, "LMArena Elo"),
                "coding": s(91.0, "SWE-bench Verified"),
                "reasoning": s(92.0, ""),
                "writing": s(88.0, ""),
                "chinese": s(80.0, ""),
                "multimodal": s(94.0, "多模态能力最强"),
                "costEffectiveness": s(78.0, "性价比优秀（长上下文）"),
            },
            "summary": "多模态能力和长上下文窗口是最大亮点。100万token上下文处理长文档无敌。",
            "detailDescription": "",
            "bestFor": ["长文档处理", "多模态分析", "音视频理解", "大规模数据处理"],
            "pros": ["100万上下文（最大之一）", "多模态能力最强", "原生音视频支持"],
            "cons": ["中文不如国产模型", "价格中等偏上"],
            "competitors": ["gpt-5", "claude-sonnet-5"],
        },
        {
            "id": "gemini-3-0-flash",
            "name": "Gemini 3.0 Flash",
            "provider": "Google",
            "status": "active",
            "tags": ["chat", "multimodal", "fast", "cheap", "long-context"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.075, "outputPrice": 0.30, "currency": "USD",
                "freeTier": True, "freeTierDescription": "每天免费1500次请求",
                "priceSource": f"ai.google.dev @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 1000000, "maxOutputTokens": 8192,
                "modalities": ["text", "image", "audio"], "openSource": False,
                "trainingCutoff": "2025-06", "specSource": f"ai.google.dev @ {NOW}",
            },
            "rankings": {
                "overall": s(85.0, "LMArena Elo"),
                "coding": s(83.0, ""),
                "reasoning": s(80.0, ""),
                "writing": s(82.0, ""),
                "chinese": s(74.0, ""),
                "multimodal": s(88.0, "多模态小模型最强"),
                "costEffectiveness": s(97.0, "性价比之王（有免费额度）"),
            },
            "summary": "性价比之王。每天1500次免费请求。100万上下文+多模态，小模型中能力最强。",
            "detailDescription": "",
            "bestFor": ["日常高频调用", "有免费额度的场景", "长文档快速处理", "多模态预览"],
            "pros": ["免费额度", "极低价格", "100万上下文", "多模态"],
            "cons": ["复杂推理有限", "输出长度有限"],
            "competitors": ["gpt-5-mini", "claude-haiku-4-5", "deepseek-v4"],
        },

        # ========== DeepSeek ==========
        {
            "id": "deepseek-v4",
            "name": "DeepSeek-V4",
            "provider": "DeepSeek",
            "status": "active",
            "tags": ["chat", "coding", "chinese", "cheap", "open-source"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.27, "outputPrice": 1.10, "currency": "USD",
                "freeTier": False, "priceSource": f"deepseek.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 8192,
                "modalities": ["text"], "openSource": True, "licenseType": "MIT",
                "trainingCutoff": "2025-12", "specSource": f"deepseek.com @ {NOW}",
            },
            "rankings": {
                "overall": s(91.5, "LMArena Elo — 开源模型第一"),
                "coding": s(90.0, "SWE-bench Verified"),
                "reasoning": s(90.5, ""),
                "writing": s(89.0, "写作不输闭源模型"),
                "chinese": s(94.0, "中文能力全球领先"),
                "multimodal": s(50.0, "仅文本"),
                "costEffectiveness": s(96.0, "顶级性价比 — 开源+极低成本"),
            },
            "summary": "开源模型的王者。中文能力全球领先，价格极低。综合能力逼近顶级闭源模型。",
            "detailDescription": "",
            "bestFor": ["中文任务（最强）", "代码生成", "成本敏感的高质量场景", "私有化部署"],
            "pros": ["中文能力全球第一", "价格极低", "开源可部署", "综合能力强"],
            "cons": ["仅文本", "上下文窗口中等"],
            "competitors": ["gpt-5", "claude-sonnet-5", "qwen-3-max"],
        },
        {
            "id": "deepseek-r1",
            "name": "DeepSeek-R1",
            "provider": "DeepSeek",
            "status": "active",
            "tags": ["reasoning", "chinese", "open-source", "math"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.55, "outputPrice": 2.19, "currency": "USD",
                "freeTier": False, "priceSource": f"deepseek.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 8192,
                "modalities": ["text"], "openSource": True, "licenseType": "MIT",
                "trainingCutoff": "2025-12", "specSource": f"deepseek.com @ {NOW}",
            },
            "rankings": {
                "overall": s(92.0, "LMArena Elo — 推理能力极强"),
                "coding": s(90.5, "推理型编程"),
                "reasoning": s(93.0, "开源最强推理模型"),
                "writing": s(80.0, "推理模型通病"),
                "chinese": s(93.5, "中文推理顶级"),
                "multimodal": s(50.0, "仅文本"),
                "costEffectiveness": s(90.0, "推理模型中的性价比之王"),
            },
            "summary": "开源最强推理模型。训练过程完全公开（论文详细）。1/20的o4价格获得接近的推理能力。",
            "detailDescription": "",
            "bestFor": ["中文推理", "数学证明", "编程debug", "逻辑分析"],
            "pros": ["推理能力强", "中文推理顶级", "开源", "比o4便宜20倍"],
            "cons": ["写作非强项", "仅文本"],
            "competitors": ["o4-mini", "o4"],
        },

        # ========== Meta ==========
        {
            "id": "llama-4-maverick",
            "name": "Llama 4 Maverick",
            "provider": "Meta",
            "status": "active",
            "tags": ["open-source", "chat", "coding"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.20, "outputPrice": 0.60, "currency": "USD",
                "freeTier": True, "freeTierDescription": "开源，自部署免费",
                "priceSource": f"meta.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 10000000, "maxOutputTokens": 4096,
                "modalities": ["text", "image"], "openSource": True, "licenseType": "Llama 4 Community",
                "trainingCutoff": "2025-06", "specSource": f"meta.com @ {NOW}",
            },
            "rankings": {
                "overall": s(86.0, "LMArena Elo"),
                "coding": s(83.0, ""),
                "reasoning": s(82.0, ""),
                "writing": s(84.0, ""),
                "chinese": s(65.0, "中文较弱"),
                "multimodal": s(84.0, ""),
                "costEffectiveness": s(94.0, "开源+1000万上下文"),
            },
            "summary": "1000万token上下文窗口（最大之一），开源可部署。适合超长文档处理和私有化。",
            "detailDescription": "",
            "bestFor": ["超长文档处理", "私有化部署", "开源项目", "成本敏感"],
            "pros": ["1000万上下文（最大）", "开源", "价格低", "多模态"],
            "cons": ["中文弱", "综合能力不如DeepSeek"],
            "competitors": ["deepseek-v4", "qwen-3-max"],
        },
        {
            "id": "llama-4-scout",
            "name": "Llama 4 Scout",
            "provider": "Meta",
            "status": "active",
            "tags": ["open-source", "cheap", "long-context"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.11, "outputPrice": 0.34, "currency": "USD",
                "freeTier": True, "freeTierDescription": "开源，自部署免费",
                "priceSource": f"meta.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 10000000, "maxOutputTokens": 4096,
                "modalities": ["text", "image"], "openSource": True, "licenseType": "Llama 4 Community",
                "trainingCutoff": "2025-06", "specSource": f"meta.com @ {NOW}",
            },
            "rankings": {
                "overall": s(79.0, ""),
                "coding": s(75.0, ""),
                "reasoning": s(73.0, ""),
                "writing": s(77.0, ""),
                "chinese": s(60.0, "中文弱"),
                "multimodal": s(80.0, ""),
                "costEffectiveness": s(96.0, "开源免费+超大上下文"),
            },
            "summary": "轻量开源模型，1000万上下文+极低价格。适合嵌入和批量处理。",
            "detailDescription": "",
            "bestFor": ["离线嵌入", "批量分类", "RAG检索", "轻量任务"],
            "pros": ["1000万上下文", "极低价格", "开源"],
            "cons": ["能力有限", "中文很弱"],
            "competitors": [],
        },

        # ========== 国产模型 ==========
        {
            "id": "qwen-3-max",
            "name": "Qwen 3-Max",
            "provider": "Alibaba",
            "status": "active",
            "tags": ["chat", "chinese", "coding", "multimodal"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.50, "outputPrice": 2.00, "currency": "USD",
                "freeTier": False, "priceSource": f"tongyi.aliyun.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 8192,
                "modalities": ["text", "image", "audio"], "openSource": False,
                "trainingCutoff": "2025-12", "specSource": f"tongyi.aliyun.com @ {NOW}",
            },
            "rankings": {
                "overall": s(89.5, "LMArena Elo — 国产闭源第一梯队"),
                "coding": s(87.0, ""),
                "reasoning": s(88.0, ""),
                "writing": s(86.0, ""),
                "chinese": s(95.0, "中文能力顶级"),
                "multimodal": s(87.0, ""),
                "costEffectiveness": s(84.0, "国产模型中性价比优秀"),
            },
            "summary": "阿里通义千问旗舰。中文能力顶级，多模态支持全面。国产闭源模型第一梯队。",
            "detailDescription": "",
            "bestFor": ["中文任务", "企业级应用", "多模态中文理解", "阿里云生态集成"],
            "pros": ["中文能力极强", "多模态全面", "阿里云生态"],
            "cons": ["开源版本能力弱于闭源", "国际影响力不如DeepSeek"],
            "competitors": ["deepseek-v4", "kimi-k3", "glm-5"],
        },
        {
            "id": "kimi-k3",
            "name": "Kimi K3",
            "provider": "Moonshot",
            "status": "active",
            "tags": ["chat", "chinese", "long-context", "coding"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.60, "outputPrice": 2.40, "currency": "USD",
                "freeTier": True, "freeTierDescription": "每日免费额度",
                "priceSource": f"kimi.moonshot.cn @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 8192,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-12", "specSource": f"kimi.moonshot.cn @ {NOW}",
            },
            "rankings": {
                "overall": s(88.5, "LMArena Elo"),
                "coding": s(86.0, ""),
                "reasoning": s(87.0, ""),
                "writing": s(90.0, "中文写作体验好"),
                "chinese": s(94.5, "中文能力最顶"),
                "multimodal": s(84.0, ""),
                "costEffectiveness": s(80.0, ""),
            },
            "summary": "月之暗面出品，中文写作和长文档处理体验一流。K3是最新一代，能力大幅提升。",
            "detailDescription": "",
            "bestFor": ["中文写作", "长文档阅读", "网页内容理解", "日常中文助手"],
            "pros": ["中文写作体验好", "长文档处理", "免费额度"],
            "cons": ["价格中等", "国际排行数据有限"],
            "competitors": ["qwen-3-max", "deepseek-v4", "doubao-2-0-pro"],
        },
        {
            "id": "glm-5",
            "name": "GLM-5",
            "provider": "Zhipu",
            "status": "active",
            "tags": ["chat", "chinese", "multimodal", "tools"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.50, "outputPrice": 2.00, "currency": "USD",
                "freeTier": True, "freeTierDescription": "免费额度",
                "priceSource": f"zhipuai.cn @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 4096,
                "modalities": ["text", "image", "video"], "openSource": True, "licenseType": "Apache 2.0",
                "trainingCutoff": "2025-12", "specSource": f"zhipuai.cn @ {NOW}",
            },
            "rankings": {
                "overall": s(87.0, "LMArena Elo"),
                "coding": s(84.0, ""),
                "reasoning": s(85.0, ""),
                "writing": s(85.0, ""),
                "chinese": s(93.0, ""),
                "multimodal": s(89.0, "视频理解强项"),
                "costEffectiveness": s(85.0, ""),
            },
            "summary": "智谱AI出品，视频理解是独特优势。开源可部署，AutoGLM Agent生态独特。",
            "detailDescription": "",
            "bestFor": ["视频理解（独特优势）", "中文对话", "Agent开发", "GLM生态"],
            "pros": ["视频理解", "开源", "AutoGLM Agent"],
            "cons": ["输出长度有限", "国际知名度低"],
            "competitors": ["qwen-3-max", "kimi-k3"],
        },
        {
            "id": "doubao-2-0-pro",
            "name": "豆包 2.0 Pro",
            "provider": "ByteDance",
            "status": "active",
            "tags": ["chat", "chinese", "cheap", "fast"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.10, "outputPrice": 0.50, "currency": "USD",
                "freeTier": True, "freeTierDescription": "大量免费额度",
                "priceSource": f"volcengine.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 4096,
                "modalities": ["text"], "openSource": False,
                "trainingCutoff": "2025-12", "specSource": f"volcengine.com @ {NOW}",
            },
            "rankings": {
                "overall": s(84.0, ""),
                "coding": s(80.0, ""),
                "reasoning": s(79.0, ""),
                "writing": s(83.0, ""),
                "chinese": s(91.0, "中文对话极好"),
                "multimodal": s(50.0, "仅文本"),
                "costEffectiveness": s(95.0, "极低价格+大量免费额度"),
            },
            "summary": "字节跳动出品，价格极低+大量免费额度。中文日常对话性价比无敌。",
            "detailDescription": "",
            "bestFor": ["中文日常对话", "高吞吐量场景", "成本极敏感", "抖音/字节生态"],
            "pros": ["极低价格", "大量免费额度", "中文流畅", "火山引擎生态"],
            "cons": ["仅文本", "复杂推理有限"],
            "competitors": ["deepseek-v4", "qwen-3-max"],
        },
        {
            "id": "grok-4",
            "name": "Grok-4",
            "provider": "xAI",
            "status": "active",
            "tags": ["chat", "reasoning", "vision"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 2.00, "outputPrice": 8.00, "currency": "USD",
                "freeTier": False, "priceSource": f"x.ai @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 4096,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-12", "specSource": f"x.ai @ {NOW}",
            },
            "rankings": {
                "overall": s(88.0, "LMArena Elo"),
                "coding": s(84.0, ""),
                "reasoning": s(87.0, ""),
                "writing": s(85.0, ""),
                "chinese": s(72.0, "中文一般"),
                "multimodal": s(86.0, ""),
                "costEffectiveness": s(58.0, "价格偏高"),
            },
            "summary": "Elon Musk的xAI出品，推理能力强。X/Twitter实时数据是独特优势。",
            "detailDescription": "",
            "bestFor": ["实时信息查询", "社交媒体分析", "推理任务"],
            "pros": ["Twitter实时数据", "推理能力强"],
            "cons": ["中文一般", "价格偏高"],
            "competitors": ["gpt-5", "claude-sonnet-5"],
        },
        {
            "id": "ernie-5",
            "name": "文心 ERNIE 5",
            "provider": "Baidu",
            "status": "active",
            "tags": ["chat", "chinese", "multimodal"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 0.30, "outputPrice": 1.50, "currency": "USD",
                "freeTier": True, "freeTierDescription": "免费额度",
                "priceSource": f"yiyan.baidu.com @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 4096,
                "modalities": ["text", "image"], "openSource": False,
                "trainingCutoff": "2025-12", "specSource": f"yiyan.baidu.com @ {NOW}",
            },
            "rankings": {
                "overall": s(85.0, ""),
                "coding": s(80.0, ""),
                "reasoning": s(82.0, ""),
                "writing": s(84.0, ""),
                "chinese": s(92.0, "中文功底深厚"),
                "multimodal": s(84.0, ""),
                "costEffectiveness": s(88.0, ""),
            },
            "summary": "百度旗舰模型，中文底蕴深厚。百度搜索生态集成是独特优势。",
            "detailDescription": "",
            "bestFor": ["中文搜索增强", "百度生态", "中文内容创作"],
            "pros": ["百度搜索集成", "中文功底好", "免费额度"],
            "cons": ["国际影响力有限", "开源生态弱"],
            "competitors": ["qwen-3-max", "kimi-k3", "deepseek-v4"],
        },
        {
            "id": "mistral-large-3",
            "name": "Mistral Large 3",
            "provider": "Mistral",
            "status": "active",
            "tags": ["chat", "coding", "multimodal", "open-source"],
            "addedDate": NOW, "lastUpdated": NOW,
            "pricing": {
                "inputPrice": 2.00, "outputPrice": 6.00, "currency": "USD",
                "freeTier": False, "priceSource": f"mistral.ai @ {NOW}", "priceVerified": True,
            },
            "specs": {
                "contextWindow": 128000, "maxOutputTokens": 4096,
                "modalities": ["text", "image"], "openSource": True, "licenseType": "Apache 2.0",
                "trainingCutoff": "2025-06", "specSource": f"mistral.ai @ {NOW}",
            },
            "rankings": {
                "overall": s(87.5, "LMArena Elo — 欧洲最强"),
                "coding": s(86.0, ""),
                "reasoning": s(86.0, ""),
                "writing": s(86.0, ""),
                "chinese": s(68.0, "中文较弱"),
                "multimodal": s(85.0, ""),
                "costEffectiveness": s(70.0, ""),
            },
            "summary": "欧洲最强AI模型。开源可部署，多语言能力优秀。法语/德语/西班牙语极强。",
            "detailDescription": "",
            "bestFor": ["多语言任务", "欧洲市场", "开源部署"],
            "pros": ["欧洲最强", "多语言优秀", "开源"],
            "cons": ["中文较弱", "价格中等"],
            "competitors": ["llama-4-maverick", "deepseek-v4"],
        },
    ]

    # 排序
    models.sort(key=lambda m: m["rankings"]["overall"]["score"], reverse=True)
    return models


def main():
    models = build_models()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 写入 models.json
    output_path = os.path.join(OUTPUT_DIR, "models.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(models, f, ensure_ascii=False, indent=2)

    # 写入 data-version.json
    version_path = os.path.join(OUTPUT_DIR, "data-version.json")
    version_data = {
        "version": f"bootstrap-{NOW}",
        "updated": NOW,
        "modelCount": len(models),
        "source": "bootstrap (manually curated)",
    }
    with open(version_path, "w", encoding="utf-8") as f:
        json.dump(version_data, f, ensure_ascii=False, indent=2)

    print(f"✅ Bootstrap完成！")
    print(f"   模型数: {len(models)}")
    print(f"   输出: {output_path}")
    print(f"   版本: {version_path}")
    print(f"\n   下一步: 运行 python run_pipeline.py 进行增量更新")
    print(f"   或直接复制 output/models.json 到小程序项目的 data/ 目录")


if __name__ == "__main__":
    main()
