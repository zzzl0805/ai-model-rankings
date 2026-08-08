"""
国产模型官方定价（CNY/百万token）+ 模型友好名映射
数据来源：各厂商官网（2026-07-24 抓取）
"""

# ============ 官方定价（CNY/百万token）============
# 智谱 GLM (open.bigmodel.cn)
ZHIPU_PRICES = {
    "glm-5.2":        (8,    28,  "1M",   "智谱官网"),
    "glm-5.1":        (6,    24,  "204K", "智谱官网"),
    "glm-5-turbo":    (5,    22,  "204K", "智谱官网"),
    "glm-5v-turbo":   (5,    22,  "202K", "智谱官网"),
    "glm-5":          (4,    18,  "204K", "智谱官网"),
    "glm-4.7-flashx": (0.5,  3,   "200K", "智谱官网"),
    "glm-4.7-flash":  (0,    0,   "200K", "智谱官网(免费)"),
    "glm-4.7":        (2,    8,   "204K", "智谱官网"),
    "glm-4.6":        (1,    3,   "204K", "智谱官网"),
    "glm-4.6v":       (1,    3,   "128K", "智谱官网"),
    "glm-4.5-air":    (0.8,  2,   "128K", "智谱官网"),
    "glm-4.5":        (2,    6,   "128K", "智谱官网"),
    "glm-4.5v":       (2,    6,   "64K",  "智谱官网"),
    "glm-4-plus":     (5,    5,   "128K", "智谱官网"),
    "glm-4-0520":     (100,  100, "128K", "智谱官网"),
}

# Kimi (platform.moonshot.cn) - 单位 CNY/百万token
KIMI_PRICES = {
    "kimi-k3":          (20,  80,  "1M",   "Kimi官网"),
    "kimi-k2.7-code":   (6,   24,  "256K", "Kimi官网"),
    "kimi-k2.6":        (4,   18,  "256K", "Kimi官网"),
    "kimi-k2.5":        (4,   16,  "256K", "Kimi官网"),
    "kimi-k2":          (4,   16,  "256K", "Kimi官网"),
}

# 通义千问 (help.aliyun.com) - 单位 CNY/百万token
QWEN_PRICES = {
    "qwen3.8-max":      (12,   36,   "1M",   "阿里云官网"),
    "qwen3.7-max":      (12,   36,   "1M",   "阿里云官网"),
    "qwen3-max":        (3.2,  12.8, "262K", "阿里云官网"),
    "qwen3-max-preview":(6,    24,   "262K", "阿里云官网"),
    "qwen-plus":        (0.8,  2,    "1M",   "阿里云官网"),
    "qwen-flash":       (0.15, 1.5,  "1M",   "阿里云官网"),
    "qwen-turbo":       (0.3,  0.6,  "1M",   "阿里云官网"),
    "qwen3-coder-plus": (4,    16,   "1M",   "阿里云官网"),
    "qwq-plus":         (1.6,  4,    "131K", "阿里云官网"),
}

# 文心 ERNIE (cloud.baidu.com) - 估算
ERNIE_PRICES = {
    "ernie-5.1":        (8,    24,  "128K", "百度官网"),
    "ernie-5":          (4,    12,  "128K", "百度官网"),
    "ernie-4-turbo":    (20,   60,  "8K",   "百度官网"),
}

# 豆包 (volcengine.com) - CNY/百万token
DOUBAO_PRICES = {
    "doubao-pro":      (4,    14,   "256K", "火山引擎官网"),
    "doubao-lite":     (0.3,  0.6,  "128K", "火山引擎官网"),
}

# 混元 (cloud.tencent.com) - CNY/百万token
HUNYUAN_PRICES = {
    "hunyuan-turbos":  (0.5,  0.5,  "256K", "腾讯云官网"),
    "hunyuan-pro":     (3,    9,    "256K", "腾讯云官网"),
    "hunyuan-standard":(1,    3,    "256K", "腾讯云官网"),
}

# 小米 MiMo (估算)
MIMO_PRICES = {
    "mimo-v2.5-pro":   (2,    8,    "256K", "小米官网"),
    "mimo-v2-pro":     (1.5,  6,    "256K", "小米官网"),
    "mimo-v2-omni":    (1.5,  6,    "256K", "小米官网"),
}

# MiniMax (估算)
MINIMAX_PRICES = {
    "minimax-m3":      (5,    15,   "256K", "MiniMax官网"),
    "minimax-m2.7":    (3,    9,    "256K", "MiniMax官网"),
}

# 海外模型官方价 (USD/百万token)
OVERSEAS_PRICES = {
    "claude-fable-5":     (10, 50, "1M",   "anthropic.com"),
    "claude-opus-4-8":    (5,  25, "1M",   "anthropic.com"),
    "claude-opus-4-7":    (5,  25, "1M",   "anthropic.com"),
    "claude-opus-4-6":    (5,  25, "1M",   "anthropic.com"),
    "claude-sonnet-5":    (2,  10, "1M",   "anthropic.com"),
    "claude-haiku-4-5":   (1,  5,  "1M",   "anthropic.com"),
    "gpt-5":              (1.25, 10, "400K", "openai.com"),
    "gpt-5-mini":         (0.25, 2,  "400K", "openai.com"),
    "gpt-5.6-sol-xhigh":  (1.25, 10, "400K", "openai.com"),
    "gpt-5.5":            (1.25, 10, "400K", "openai.com"),
    "gemini-3-pro":       (1.25, 10, "1M",  "ai.google.dev"),
    "gemini-3-flash":     (0.3, 2.5, "1M",  "ai.google.dev"),
    "deepseek-v4":        (0.43, 0.87, "1M","deepseek.com"),
    "deepseek-r1":        (0.7, 2.5, "128K", "deepseek.com"),
    "grok-4":             (2,  6,   "128K", "x.ai"),
}

def get_official_price(name):
    """获取官方价格"""
    name_lower = name.lower()

    # 合并所有价格表（CNY的）
    cny_tables = [
        ("智谱", ZHIPU_PRICES, "glm"),
        ("Kimi", KIMI_PRICES, "kimi"),
        ("通义", QWEN_PRICES, "qwen"),
        ("百度", ERNIE_PRICES, "ernie"),
        ("豆包", DOUBAO_PRICES, "doubao"),
        ("混元", HUNYUAN_PRICES, "hunyuan"),
        ("小米", MIMO_PRICES, "mimo"),
        ("MiniMax", MINIMAX_PRICES, "minimax"),
    ]

    for label, table, prefix in cny_tables:
        for key in sorted(table.keys(), key=len, reverse=True):
            if key in name_lower:
                inp, out, ctx, src = table[key]
                return {
                    "input": inp, "output": out, "context": ctx,
                    "currency": "CNY", "source": src,
                    "free": inp == 0,
                }

    # 海外模型（USD）
    for key in sorted(OVERSEAS_PRICES.keys(), key=len, reverse=True):
        if key in name_lower:
            inp, out, ctx, src = OVERSEAS_PRICES[key]
            return {
                "input": inp, "output": out, "context": ctx,
                "currency": "USD", "source": src,
                "free": False,
            }

    return None


# ============ 模型友好名映射 ============
def get_model_display_name(name):
    """获取模型友好显示名"""
    mapping = {
        # Claude
        "claude-fable-5": "Claude Fable 5",
        "claude-opus-4-8": "Claude Opus 4.8",
        "claude-opus-4-7": "Claude Opus 4.7",
        "claude-opus-4-6": "Claude Opus 4.6",
        "claude-sonnet-5": "Claude Sonnet 5",
        "claude-sonnet-4": "Claude Sonnet 4.6",
        "claude-haiku-4": "Claude Haiku 4.5",
        # GPT
        "gpt-5.6-sol-xhigh": "GPT-5.6 Sol",
        "gpt-5.6": "GPT-5.6",
        "gpt-5.5": "GPT-5.5",
        "gpt-5.4": "GPT-5.4",
        "gpt-5.2": "GPT-5.2",
        "gpt-5-mini": "GPT-5 Mini",
        "gpt-5": "GPT-5",
        # Gemini
        "gemini-3.6-flash": "Gemini 3.6 Flash",
        "gemini-3.5-flash": "Gemini 3.5 Flash",
        "gemini-3-flash": "Gemini 3 Flash",
        "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
        "gemini-3-pro": "Gemini 3 Pro",
        "gemini-2.5-pro": "Gemini 2.5 Pro",
        # DeepSeek
        "deepseek-v4": "DeepSeek-V4",
        "deepseek-v3": "DeepSeek-V3",
        "deepseek-r1": "DeepSeek-R1",
        # GLM
        "glm-5.2": "GLM-5.2",
        "glm-5.1": "GLM-5.1",
        "glm-5": "GLM-5",
        "glm-4.7": "GLM-4.7",
        # Kimi
        "kimi-k3": "Kimi K3",
        "kimi-k2.7": "Kimi K2.7",
        "kimi-k2.6": "Kimi K2.6",
        "kimi-k2.5": "Kimi K2.5",
        "kimi-k2": "Kimi K2",
        # Qwen
        "qwen3.8-max": "Qwen3.8 Max",
        "qwen3.7-max": "Qwen3.7 Max",
        "qwen3.6-max": "Qwen3.6 Max",
        "qwen3.5-max": "Qwen3.5 Max",
        "qwen3-max": "Qwen3 Max",
        "qwen-plus": "Qwen Plus",
        "qwen-flash": "Qwen Flash",
        # Grok
        "grok-4": "Grok-4",
        "grok-3": "Grok-3",
        # Meta
        "muse-spark": "Muse Spark",
        "llama-4-maverick": "Llama 4 Maverick",
        "llama-4-scout": "Llama 4 Scout",
        # 国产
        "ernie-5": "文心5",
        "hunyuan": "混元",
        "mimo-v2": "MiMo v2",
        "minimax": "MiniMax",
    }

    for key in sorted(mapping.keys(), key=len, reverse=True):
        if key in name:
            return mapping[key]

    return name  # 默认返回原名


def get_provider_cn(name):
    """获取厂商中文名"""
    n = name.lower()
    if "claude" in n or "opus" in n or "sonnet" in n or "haiku" in n or "fable" in n:
        return "Anthropic"
    if "gpt" in n:
        return "OpenAI"
    if "gemini" in n:
        return "Google"
    if "deepseek" in n:
        return "深度求索"
    if "glm" in n:
        return "智谱AI"
    if "kimi" in n:
        return "月之暗面"
    if "qwen" in n:
        return "阿里通义"
    if "grok" in n:
        return "xAI"
    if "muse" in n or "llama" in n:
        return "Meta"
    if "ernie" in n:
        return "百度"
    if "hunyuan" in n:
        return "腾讯"
    if "mimo" in n:
        return "小米"
    if "minimax" in n:
        return "MiniMax"
    if "mistral" in n:
        return "Mistral"
    if "doubao" in n:
        return "字节豆包"
    return ""
