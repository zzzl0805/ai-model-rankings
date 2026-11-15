#!/usr/bin/env python3
"""
从 LMArena 官方 HuggingFace 数据集抓取排行榜数据，输出 pipeline/rankings.json

背景（2026-11-15）：
  arena.ai 网站被 Cloudflare 全面拦截（HTTP 403，HTML 抓取完全失效）。
  改用官方数据集 lmarena-ai/leaderboard-dataset（CC BY 4.0，每日更新），
  通过 HuggingFace datasets-server 的 parquet 接口获取，数据结构更规范：
  含 Elo、置信区间、票数、发布日期，且不需要解析 DOM。

用法:
  python3 fetch_lmarena_hf.py
输出:
  pipeline/rankings.json（结构与原爬虫一致，build_rankings.py 可直接消费）

代理：若环境变量 HTTP_PROXY/HTTPS_PROXY 或 sys 代理已设置会自动使用。
"""

import io
import json
import os
import sys
import urllib.request
from collections import defaultdict

DATASET = "lmarena-ai/leaderboard-dataset"
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache_hf")
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rankings.json")

# HF 数据集 config → 我们 app 的 大类/维度 映射
# 格式: app大类id -> (hf config, {hf category: app dimension})
CATEGORY_MAP = {
    "text": ("text_style_control", {
        "overall": "overall",
        "coding": "coding",
        "math": "math",
        "creative_writing": "writing",
        "hard_prompts": "hardprompts",
        "instruction_following": "instruction",
        "expert": "expert",
        "multi_turn": "multiturn",
    }),
    "webdev": ("webdev", {"overall": "overall"}),
    "vision": ("vision", {"overall": "overall", "creative_writing_vision": "writing"}),
    "document": ("document", {"overall": "overall"}),
    "search": ("search", {"overall": "overall"}),
    "agent": ("agent", {"overall": "overall"}),
    "text-to-image": ("text_to_image", {"overall": "overall"}),
    "image-edit": ("image_edit", {"overall": "overall"}),
    "text-to-video": ("text_to_video", {"overall": "overall"}),
    "image-to-video": ("image_to_video", {"overall": "overall"}),
    "video-edit": ("video_edit", {"overall": "overall"}),
    # image-to-webdev 在 HF 数据集中没有对应 config，保持空
    "image-to-webdev": (None, {}),
}

# Agent 子指标 config（用于 agentMetrics）
AGENT_METRICS = {
    "agent_task_outcome_explicit": "confirmedSuccess",
    "agent_praise_complaint": "praiseVsComplaint",
    "agent_steerability": "steerability",
    "agent_bash_recovery_steps": "bashRecovery",
    "agent_tool_hallucination": "toolHallucination",
}

_proxy_opener = None


def opener():
    """构造带代理的 urllib opener（读取 HTTP(S)_PROXY / ALL_PROXY）"""
    global _proxy_opener
    if _proxy_opener is None:
        proxies = {}
        for key in ("HTTP_PROXY", "http_proxy"):
            if os.environ.get(key):
                proxies["http"] = os.environ[key]
        for key in ("HTTPS_PROXY", "https_proxy"):
            if os.environ.get(key):
                proxies["https"] = os.environ[key]
        # 若没配环境变量，尝试读 macOS 系统代理
        if not proxies and sys.platform == "darwin":
            try:
                import subprocess
                out = subprocess.run(["scutil", "--proxy"], capture_output=True, text=True, timeout=5).stdout
                host = port = None
                for line in out.splitlines():
                    line = line.strip()
                    if line.startswith("HTTPSProxy :"):
                        host = line.split(":", 1)[1].strip()
                    elif line.startswith("HTTPSPort :"):
                        port = line.split(":", 1)[1].strip()
                if host and port:
                    proxies["https"] = f"http://{host}:{port}"
                    proxies["http"] = f"http://{host}:{port}"
            except Exception:
                pass
        handler = urllib.request.ProxyHandler(proxies) if proxies else urllib.request.ProxyHandler({})
        _proxy_opener = urllib.request.build_opener(handler)
        if proxies:
            print(f"  使用代理: {proxies.get('https') or proxies.get('http')}")
        else:
            print("  未配置代理，直连")
    return _proxy_opener


def http_get(url, timeout=120, retries=4):
    """带重试的 GET（代理偶尔会 EOF / 超时）"""
    import time
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with opener().open(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:
            last = e
            if i < retries - 1:
                wait = 2 ** i
                print(f"  ⟳ 重试 {i + 1}/{retries - 1}（{e}），{wait}s 后继续")
                time.sleep(wait)
    raise last


def get_parquet_urls():
    """获取各 config 的 latest 分片 parquet 地址"""
    raw = http_get(f"https://datasets-server.huggingface.co/parquet?dataset={DATASET}")
    data = json.loads(raw)
    urls = {}
    for f in data.get("parquet_files", []):
        if f.get("split") != "latest":
            continue
        urls[f["config"]] = f["url"]
    return urls


def load_config(parquet_url, config):
    """下载并读取某个 config 的 latest 分片，返回 pandas DataFrame"""
    import pandas as pd

    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{config}.parquet")
    # 每次都重新下载，保证数据新鲜（文件很小，几十 KB）
    with open(path, "wb") as f:
        f.write(http_get(parquet_url))
    df = pd.read_parquet(path)

    # 只保留最新发布日期的数据
    if "leaderboard_publish_date" in df.columns:
        dates = [d for d in df["leaderboard_publish_date"].dropna().unique()]
        if dates:
            latest = max(dates)
            df = df[df["leaderboard_publish_date"] == latest].copy()
            return df, latest
    return df, None


def make_raw_name(row):
    """模拟原爬虫的 rawName 格式，保证 build_rankings 的 provider 提取仍可用"""
    org = str(row.get("organization") or "")
    lic = str(row.get("license") or "")
    if org:
        cap = org[:1].upper() + org[1:]
        return f"{cap}{row['model_name']}{cap} · {lic}" if lic else f"{cap}{row['model_name']}{cap}"
    return str(row["model_name"])


def build_rows(df, elo_col="rating", votes_col="vote_count"):
    """把 DataFrame 转成原爬虫的行格式（按 rank 排序）"""
    rows = []
    for _, r in df.sort_values("rank").iterrows():
        rating = r.get(elo_col)
        if rating is None or (isinstance(rating, float) and rating != rating):  # NaN
            continue
        lower = r.get("rating_lower", r.get("score_ci_lower"))
        upper = r.get("rating_upper", r.get("score_ci_upper"))
        margin = 0
        try:
            if lower is not None and upper is not None:
                margin = int(round((float(upper) - float(lower)) / 2))
        except Exception:
            margin = 0
        votes = r.get(votes_col)
        try:
            votes = int(votes) if votes is not None and votes == votes else 0
        except Exception:
            votes = 0
        rows.append({
            "rank": int(r["rank"]),
            "name": str(r["model_name"]),
            "rawName": make_raw_name(r),
            "elo": round(float(rating), 2),
            "margin": margin,
            "votes": votes,
            "price": None,
            "context": "",
        })
    return rows


def main():
    print("=" * 60)
    print("从 HuggingFace 官方数据集抓取 LMArena 排行")
    print("=" * 60)

    try:
        urls = get_parquet_urls()
    except Exception as e:
        print(f"❌ 获取 parquet 地址失败: {e}")
        return 1
    print(f"  找到 {len(urls)} 个 config")

    # 按需加载（去重，text_style_control 等只下一次）
    loaded = {}
    dates = []

    def get(config):
        if config not in loaded:
            if config not in urls:
                loaded[config] = (None, None)
            else:
                df, dt = load_config(urls[config], config)
                if dt:
                    dates.append(dt)
                loaded[config] = (df, dt)
                print(f"  已加载 {config}: {len(df)} 行" + (f"（{dt}）" if dt else ""))
        return loaded[config]

    data = {}
    for cat_id, (config, dim_map) in CATEGORY_MAP.items():
        data[cat_id] = {}
        if not config:
            print(f"  ⚠️ {cat_id}: 数据源无对应 config，留空")
            continue
        df, _ = get(config)
        if df is None:
            print(f"  ⚠️ {cat_id}: config {config} 不可用")
            continue
        for hf_cat, dim_id in dim_map.items():
            sub = df[df["category"] == hf_cat]
            if sub.empty:
                print(f"  ⚠️ {cat_id}/{dim_id}: 无数据（category={hf_cat}）")
                continue
            if cat_id == "agent":
                # agent 用 score(0~1) 而非 rating(Elo)，票数用 session_count
                data[cat_id][dim_id] = build_rows(sub, elo_col="score", votes_col="session_count")
            else:
                data[cat_id][dim_id] = build_rows(sub)

    # Agent：补充子指标 + 用 score*100 作为 net improvement
    agent_df, _ = get("agent")
    if agent_df is not None and data["agent"].get("overall"):
        rows = data["agent"]["overall"]
        by_name = {str(r["model_name"]): r for _, r in agent_df.iterrows()}
        for row in rows:
            r = by_name.get(row["name"])
            if r is None:
                continue
            # HF 的 score 是 0~1 的小数，网站显示为百分比
            row["elo"] = round(float(r["score"]) * 100, 2)
            row["votes"] = int(r["session_count"]) if r["session_count"] == r["session_count"] else 0
            row["isAgent"] = True
            metrics = {
                "netImprovement": f"{row['elo']}%",
                "sessions": str(row["votes"]),
            }
            # 拉取各子指标 config
            for cfg, key in AGENT_METRICS.items():
                sub_df, _ = get(cfg)
                if sub_df is None:
                    metrics[key] = ""
                    continue
                hit = sub_df[sub_df["model_name"] == row["name"]]
                metrics[key] = f"{float(hit.iloc[0]['score']) * 100:.2f}%" if not hit.empty and hit.iloc[0]["score"] == hit.iloc[0]["score"] else ""
            row["agentMetrics"] = metrics

    # image-to-webdev 在 HF 数据集中没有对应 config：
    # 用上一次构建的本地数据兜底，避免小程序里该分类空白
    if not data.get("image-to-webdev"):
        prev_js = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                "..", "miniprogram", "data", "rankings.js"))
        try:
            with open(prev_js, "r", encoding="utf-8") as f:
                txt = f.read()
            txt = txt.replace("module.exports =", "", 1).strip().rstrip(";")
            prev = json.loads(txt)
            old = (prev.get("data") or {}).get("image-to-webdev")
            if old:
                data["image-to-webdev"] = old
                print(f"  ↺ image-to-webdev 用上次数据兜底（{sum(len(v) for v in old.values())} 条，可能偏旧）")
        except Exception as e:
            print(f"  ⚠️ image-to-webdev 兜底失败: {e}")

    last_updated = max(dates) if dates else ""
    output = {
        "lastUpdated": last_updated,
        "source": "arena.ai (HuggingFace 官方数据集)",
        "data": data,
    }

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for cat in data.values() for v in cat.values())
    print(f"\n✅ 已写入 {OUTPUT}")
    print(f"   最新发布日期: {last_updated} | 总条目: {total}")
    for cat_id, dims in data.items():
        if dims:
            print(f"   {cat_id}: " + ", ".join(f"{k}({len(v)})" for k, v in dims.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
