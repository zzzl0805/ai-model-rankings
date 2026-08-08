"""
数据Pipeline配置文件
修改此文件来控制：追踪哪些模型、数据源URL、归一化参数
"""

from dataclasses import dataclass, field
from typing import Optional

# ============================================================
# 模型追踪清单（Pipeline会自动发现此清单外的模型）
# ============================================================

TRACKED_MODELS = {
    # OpenAI
    "gpt-5": {"provider": "OpenAI", "priority": "tier1", "tags": ["chat", "coding", "reasoning"]},
    "gpt-5-mini": {"provider": "OpenAI", "priority": "tier1", "tags": ["chat", "fast", "cheap"]},
    "o4": {"provider": "OpenAI", "priority": "tier1", "tags": ["reasoning", "coding"]},
    "o4-mini": {"provider": "OpenAI", "priority": "tier1", "tags": ["reasoning", "fast", "cheap"]},

    # Anthropic
    "claude-opus-4-8": {"provider": "Anthropic", "priority": "tier1", "tags": ["chat", "coding", "writing", "tools"]},
    "claude-sonnet-5": {"provider": "Anthropic", "priority": "tier1", "tags": ["chat", "coding", "fast"]},
    "claude-haiku-4-5": {"provider": "Anthropic", "priority": "tier1", "tags": ["chat", "fast", "cheap"]},

    # Google
    "gemini-3-0-pro": {"provider": "Google", "priority": "tier1", "tags": ["chat", "multimodal", "long-context"]},
    "gemini-3-0-flash": {"provider": "Google", "priority": "tier1", "tags": ["chat", "multimodal", "fast", "cheap"]},

    # DeepSeek
    "deepseek-v4": {"provider": "DeepSeek", "priority": "tier1", "tags": ["chat", "coding", "chinese", "cheap"]},
    "deepseek-r1": {"provider": "DeepSeek", "priority": "tier1", "tags": ["reasoning", "chinese", "open-source"]},

    # Meta
    "llama-4-scout": {"provider": "Meta", "priority": "tier2", "tags": ["open-source", "long-context"]},
    "llama-4-maverick": {"provider": "Meta", "priority": "tier2", "tags": ["open-source", "chat"]},

    # Mistral
    "mistral-large-3": {"provider": "Mistral", "priority": "tier2", "tags": ["chat", "coding", "multimodal"]},

    # 国产模型
    "qwen-3-max": {"provider": "Alibaba", "priority": "tier2", "tags": ["chat", "chinese", "cheap"]},
    "qwen-3-plus": {"provider": "Alibaba", "priority": "tier2", "tags": ["chat", "chinese", "fast"]},
    "glm-5": {"provider": "Zhipu", "priority": "tier2", "tags": ["chat", "chinese", "multimodal"]},
    "kimi-k3": {"provider": "Moonshot", "priority": "tier2", "tags": ["chat", "chinese", "long-context"]},
    "doubao-2-0-pro": {"provider": "ByteDance", "priority": "tier2", "tags": ["chat", "chinese", "cheap"]},
    "grok-4": {"provider": "xAI", "priority": "tier2", "tags": ["chat", "reasoning"]},
    "ernie-5": {"provider": "Baidu", "priority": "tier2", "tags": ["chat", "chinese"]},
    "hunyuan": {"provider": "Tencent", "priority": "tier2", "tags": ["chat", "chinese"]},
    "spark-4": {"provider": "iFlytek", "priority": "tier2", "tags": ["chat", "chinese"]},
    "minimax-abab-7": {"provider": "MiniMax", "priority": "tier2", "tags": ["chat", "chinese"]},
    "yi-lightning": {"provider": "01.AI", "priority": "tier2", "tags": ["chat", "chinese", "cheap"]},
}

# ============================================================
# 数据源URL
# ============================================================

@dataclass
class DataSources:
    # LMArena Chatbot Arena (通过 LMSys 非官方 JSON 端点)
    lmarena_elo_url: str = "https://storage.googleapis.com/lmsys-arena/arena_data/latest_elo.json"

    # 社区维护的AI定价数据 (GitHub)
    pricing_data_url: str = "https://raw.githubusercontent.com/lmromax/ai-pricing-data/main/data/pricing.json"
    pricing_data_fallback: str = "https://raw.githubusercontent.com/followtayeeb/llm-costs/main/src/data/pricing.json"

    # SWE-bench Verified (编程能力)
    swebench_url: str = "https://raw.githubusercontent.com/swe-bench/SWE-bench/main/swebench/verified/results.json"

    # MMLU-Pro
    mmlu_pro_url: str = "https://raw.githubusercontent.com/TIGER-AI-Lab/MMLU-Pro/main/results/overall_results.json"

    # C-Eval (中文能力)
    ceval_url: str = "https://raw.githubusercontent.com/hkust-nlp/ceval/main/results/leaderboard.csv"

# ============================================================
# 归一化参数
# ============================================================

@dataclass
class NormalizationConfig:
    """将原始评测集分数映射到0-100分制"""
    target_min: float = 0.0
    target_max: float = 100.0

    # LMArena Elo: 典型范围 800-1400
    lmarena_elo_min: float = 800.0
    lmarena_elo_max: float = 1400.0

    # SWE-bench: 0-1 (百分比)
    swebench_min: float = 0.0
    swebench_max: float = 1.0

    # MMLU-Pro: 0-100
    mmlu_min: float = 0.0
    mmlu_max: float = 100.0

    # C-Eval: 0-100
    ceval_min: float = 0.0
    ceval_max: float = 100.0

# ============================================================
# 评分加权公式参数
# ============================================================

RANKING_WEIGHTS = {
    "overall": {
        "lmarena_elo": 1.0,  # 100% LMArena
    },
    "coding": {
        "swebench": 0.50,
        "human_eval_plus": 0.30,
        "lmarena_coding": 0.20,
    },
    "reasoning": {
        "lmarena_reasoning": 0.50,
        "mmlu_pro": 0.30,
        "gpqa": 0.20,
    },
    "writing": {
        "lmarena_writing": 0.70,
        "lmarena_creative_writing": 0.30,
    },
    "chinese": {
        "ceval": 0.40,
        "cmmlu": 0.30,
        "lmarena_chinese": 0.30,
    },
    "multimodal": {
        "mmmu": 0.50,
        "lmarena_vision": 0.50,
    },
    "costEffectiveness": {
        # 纯计算，不依赖外部评测: overall_score / log(price + 1) * 10
    },
}

# ============================================================
# 模型ID映射（我们的ID → 各数据源的名称）
# 用于自动匹配不同数据源的模型名称
# ============================================================

MODEL_NAME_ALIASES = {
    "gpt-5": ["GPT-5", "gpt-5", "GPT 5"],
    "gpt-5-mini": ["GPT-5-mini", "gpt-5-mini", "GPT 5 Mini"],
    "o4": ["o4", "O4", "OpenAI o4"],
    "o4-mini": ["o4-mini", "O4-mini", "OpenAI o4-mini"],
    "claude-opus-4-8": ["Claude Opus 4.8", "claude-opus-4-8", "Claude 4.8 Opus"],
    "claude-sonnet-5": ["Claude Sonnet 5", "claude-sonnet-5", "Claude 5 Sonnet"],
    "claude-haiku-4-5": ["Claude Haiku 4.5", "claude-haiku-4-5", "Claude 4.5 Haiku"],
    "deepseek-v4": ["DeepSeek-V4", "deepseek-v4", "DeepSeek V4"],
    "deepseek-r1": ["DeepSeek-R1", "deepseek-r1", "DeepSeek R1"],
    "gemini-3-0-pro": ["Gemini 3.0 Pro", "gemini-3.0-pro", "Gemini 3 Pro"],
    "gemini-3-0-flash": ["Gemini 3.0 Flash", "gemini-3.0-flash", "Gemini 3 Flash"],
    "llama-4-scout": ["Llama 4 Scout", "llama-4-scout", "Llama-4-Scout"],
    "llama-4-maverick": ["Llama 4 Maverick", "llama-4-maverick", "Llama-4-Maverick"],
    "mistral-large-3": ["Mistral Large 3", "mistral-large-3", "Mistral Large"],
    "qwen-3-max": ["Qwen 3 Max", "Qwen3-Max", "qwen3-max"],
    "qwen-3-plus": ["Qwen 3 Plus", "Qwen3-Plus", "qwen3-plus"],
    "glm-5": ["GLM-5", "glm5", "GLM 5"],
    "kimi-k3": ["Kimi K3", "kimi-k3", "Kimi K3.0", "Kimi"],
    "doubao-2-0-pro": ["豆包2.0-pro", "Doubao-2.0-pro", "doubao-pro"],
    "grok-4": ["Grok-4", "grok-4", "Grok 4"],
    "ernie-5": ["ERNIE 5", "ernie-5", "文心ERNIE 5"],
    "hunyuan": ["混元", "Hunyuan", "Tencent Hunyuan"],
    "spark-4": ["讯飞星火4.0", "Spark 4", "Spark-4"],
}
