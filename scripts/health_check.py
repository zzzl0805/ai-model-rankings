#!/usr/bin/env python3
"""
AI 模型排行 —— 自动更新健康检查

用法:
  python3 scripts/health_check.py            # 查 CI / data 分支 / CDN（无需登录，约 5 秒）
  python3 scripts/health_check.py --cloud    # 额外查云端指针（需开发者工具已登录，约 30 秒）

检查四段链路：
  ① GitHub Actions 最近一次运行是否成功
  ② data 分支是否更新、当天 tag 是否已打
  ③ jsDelivr 上的数据日期是否最新
  ④ 云端指针 lastUpdated / lastCheckedAt（可选）

退出码：0 全部正常 / 1 有异常
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

REPO = "zzzl0805/ai-model-rankings"
CDN = "https://cdn.jsdelivr.net/gh/%s@data/rankings.json" % REPO
TZ_CN = timezone(timedelta(hours=8))

OK, WARN, BAD = "✅", "⚠️ ", "❌"


def get_json(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "health-check/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def parse_time(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def fmt_cn(dt):
    return dt.astimezone(TZ_CN).strftime("%m-%d %H:%M") if dt else "?"


def age_hours(dt):
    if not dt:
        return None
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cloud", action="store_true", help="额外检查云端指针（需开发者工具已登录）")
    args = ap.parse_args()

    problems = []
    today_cn = datetime.now(TZ_CN).strftime("%Y-%m-%d")

    print("=" * 58)
    print("  AI模型排行 · 自动更新健康检查")
    print("  现在：%s（北京）" % datetime.now(TZ_CN).strftime("%Y-%m-%d %H:%M"))
    print("=" * 58)

    # ① GitHub Actions
    print("\n① GitHub Actions")
    ci_date = None
    try:
        runs = get_json("https://api.github.com/repos/%s/actions/runs?per_page=3" % REPO)
        r0 = (runs.get("workflow_runs") or [None])[0]
        if not r0:
            print("   %s 没有任何运行记录" % BAD)
            problems.append("CI 无运行记录")
        else:
            created = parse_time(r0["created_at"])
            concl = r0.get("conclusion") or r0.get("status")
            age = age_hours(created)
            icon = OK if concl == "success" and age is not None and age < 36 else (BAD if concl == "failure" else WARN)
            print("   %s 最近一次：%s（%s，%.1f 小时前）" % (icon, concl, fmt_cn(created), age or 0))
            print("      触发方式：%s ｜ %s" % (r0.get("event"), r0.get("display_title", "")[:40]))
            if concl == "failure":
                problems.append("CI 最近一次失败")
            elif age is not None and age > 36:
                problems.append("CI 超过 36 小时未运行")
    except Exception as e:
        print("   %s 查询失败：%s" % (WARN, e))
        problems.append("CI 状态查询失败")

    # ② data 分支 & tag
    print("\n② data 分支 / 日期 tag")
    try:
        br = get_json("https://api.github.com/repos/%s/branches/data" % REPO)
        dt = parse_time(br["commit"]["commit"]["committer"]["date"])
        print("   %s 最新提交：%s（%.1f 小时前）" % (OK, fmt_cn(dt), age_hours(dt) or 0))
    except Exception as e:
        print("   %s 查询失败：%s" % (WARN, e))
        problems.append("data 分支查询失败")

    try:
        tags = get_json("https://api.github.com/repos/%s/tags" % REPO)
        names = [t["name"] for t in (tags or [])]
        want = "v" + today_cn
        if want in names:
            print("   %s 今天的 tag 已打：%s" % (OK, want))
        else:
            print("   %s 今天的 tag 尚未生成（%s），最新：%s" % (WARN, want, names[0] if names else "无"))
            problems.append("今日 tag 未生成（CI 可能还没跑完）")
    except Exception as e:
        print("   %s tag 查询失败：%s" % (WARN, e))

    # ③ CDN 内容
    print("\n③ jsDelivr 数据")
    cdn_date = None
    try:
        d = get_json(CDN, timeout=60)
        cdn_date = d.get("lastUpdated")
        total = sum(len(v) for c in d.get("data", {}).values() for v in c.values())
        icon = OK if cdn_date == today_cn else WARN
        print("   %s 数据日期：%s ｜ 条目：%d ｜ 汇率：%s（%s）"
              % (icon, cdn_date, total, d.get("exchangeRate"), d.get("exchangeRateDate")))
        if cdn_date != today_cn:
            problems.append("CDN 数据不是今天（%s）" % cdn_date)
    except Exception as e:
        print("   %s 拉取失败：%s" % (WARN, e))
        problems.append("CDN 拉取失败")

    # ④ 云端指针（可选）
    cloud_date = None
    if args.cloud:
        print("\n④ 云端指针（需开发者工具已登录）")
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloud_check.js")
        try:
            out = subprocess.run(["node", script], capture_output=True, text=True, timeout=120).stdout.strip()
            r = json.loads(out.splitlines()[-1]) if out else {}
            if r.get("ok"):
                cloud_date = r.get("lastUpdated")
                checked = parse_time(r.get("lastCheckedAt")) if r.get("lastCheckedAt") else None
                # lastCheckedAt 是 ISO 带毫秒的格式，单独解析
                if r.get("lastCheckedAt") and not checked:
                    try:
                        checked = datetime.fromisoformat(r["lastCheckedAt"].replace("Z", "+00:00"))
                    except Exception:
                        pass
                age = age_hours(checked)
                icon = OK if cloud_date == today_cn else WARN
                print("   %s 云端数据日期：%s" % (icon, cloud_date))
                print("      最近检查：%s（%s）" % (fmt_cn(checked), ("%.1f 小时前" % age) if age is not None else "未知"))
                if age is not None and age > 12:
                    print("      ⚠️  超过 12 小时没检查过，触发器可能没在跑")
                    problems.append("云端超过 12 小时未检查")
                if cloud_date != today_cn:
                    problems.append("云端数据不是今天（%s）" % cloud_date)
            else:
                print("   %s 读取失败：%s" % (WARN, r.get("err")))
                problems.append("云端指针读取失败")
        except Exception as e:
            print("   %s 执行失败：%s" % (WARN, e))

    # 结论
    print("\n" + "=" * 58)
    if not problems:
        print("  %s 全链路正常" % OK)
    else:
        print("  %s 发现 %d 个问题：" % (BAD, len(problems)))
        for p in problems:
            print("     · " + p)
    print("=" * 58)
    return 0 if not problems else 1


if __name__ == "__main__":
    sys.exit(main())
