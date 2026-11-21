#!/usr/bin/env python3
# 构建模型档案数据（model-catalog.js）
#
# 数据来源：
#   - 现有 rankings.js（榜单事实、许可证尾巴、价格）
#   - OpenRouter /api/v1/models（上下文/模态/发布/描述等富字段）
#   - pipeline/catalog/*.json（公司、系列、人工审校的中文档案）
#
# 用法：
#   python3 pipeline/build_catalog.py                 # 在线拉 OpenRouter
#   python3 pipeline/build_catalog.py --openrouter /tmp/openrouter_models.json
#
# 产物：
#   miniprogram/data/model-catalog.js
#   pipeline/output/model-catalog.json

import json
import re
import sys
import datetime
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RANKINGS_JS = ROOT / 'miniprogram' / 'data' / 'rankings.js'
RAW_RANKINGS = ROOT / 'pipeline' / 'rankings.json'
CATALOG_DIR = ROOT / 'pipeline' / 'catalog'
OUT_JS = ROOT / 'miniprogram' / 'data' / 'model-catalog.js'
OUT_JSON = ROOT / 'pipeline' / 'output' / 'model-catalog.json'

# 与小程序端保持一致：这些类目只展示「价格」，不强行标 /M token
VISUAL_CATS = {'text-to-image', 'image-edit', 'text-to-video', 'image-to-video', 'video-edit'}

# 选取范围：头部榜单 + 国产关键模型
TEXT_TOP = 60
CAT_LIMITS = [('webdev', 8), ('vision', 8), ('text-to-image', 10), ('image-edit', 6), ('text-to-video', 6), ('image-to-video', 3)]
CN_KEYWORDS = ['deepseek', 'qwen', 'kimi', 'glm', 'minimax', 'step', 'hunyuan', 'ernie', 'doubao', 'mimo']


def load_rankings(path=None):
    p = Path(path) if path else RANKINGS_JS
    if p.suffix == '.json':
        return json.loads(p.read_text(encoding='utf-8'))
    text = p.read_text(encoding='utf-8').strip()
    if text.endswith(';'):
        text = text[:-1]
    return json.loads(text[text.index('{'):])


def base_name(name):
    return re.sub(r'\s*\([^)]*\)\s*$', '', name).strip()


def norm(s):
    s = (s or '').lower()
    s = re.sub(r'\([^)]*\)', '', s)
    s = re.sub(r'[^a-z0-9.]+', '-', s).strip('-')
    return s


def load_openrouter(path=None):
    if path:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    with urllib.request.urlopen('https://openrouter.ai/api/v1/models', timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))['data']


def pick_candidates(rankings):
    picked = []
    seen_names, seen_base = set(), set()

    def add(name, cat):
        if not name or name in seen_names:
            return
        b = base_name(name)
        if b in seen_base:
            return
        seen_names.add(name)
        seen_base.add(b)
        picked.append((name, b, cat))

    for m in (rankings['data'].get('text', {}).get('overall') or [])[:TEXT_TOP]:
        add(m['name'], 'text')
    for cat, limit in CAT_LIMITS:
        for m in (rankings['data'].get(cat, {}).get('overall') or [])[:limit]:
            add(m['name'], cat)
    for m in (rankings['data'].get('text', {}).get('overall') or [])[:90]:
        if any(k in m['name'].lower() for k in CN_KEYWORDS):
            add(m['name'], 'text')
    return picked


PROVIDER_TO_COMPANY = {
    'google': 'google', 'anthropic': 'anthropic', 'openai': 'openai', 'openai ': 'openai',
    'openai': 'openai', 'meta': 'meta', 'deepseek': 'deepseek', 'alibaba': 'alibaba',
    'moonshot': 'moonshot', 'zai': 'zai', 'z.ai': 'zai', 'xiaomi': 'xiaomi', 'xai': 'xai',
    'baidu': 'baidu', 'microsoft-ai': 'microsoft', 'microsoft': 'microsoft', 'bfl': 'bfl',
    'bytedance': 'bytedance', 'stepfun': 'stepfun', 'minimax': 'minimax', 'tencent': 'tencent',
}

# 榜单名与 OpenRouter id 不能自动匹配、但确认是同一模型的情况
DISPLAY_OVERRIDES = {
    'gemini-omni-flash': 'Gemini Omni Flash',
}

MANUAL_OR = {
    'gpt-6.1-terra': 'openai/gpt-6.1-terra',
    'claude-opus-4.5': 'anthropic/claude-opus-4.5',
    'gemini-3-flash': 'google/gemini-3-flash-preview',
    'grok-4.20-beta': 'x-ai/grok-4.20',
    'claude-sonnet-4.6': 'anthropic/claude-sonnet-4.6',
    'grok-4.20-multi-agent-beta': 'x-ai/grok-4.20-multi-agent',
    'gpt-6.2-astra': 'openai/gpt-6.2-astra',
    'gpt-5.6-terra': 'openai/gpt-5.6-terra',
    'grok-4.5': 'x-ai/grok-4.5',
    'gpt-6.2-sol': 'openai/gpt-6.2-sol',
    'grok-4.20-beta-1': 'x-ai/grok-4.20',
    'qwen3.7-max-preview': 'qwen/qwen3.7-max',
    'deepseek-v4.1-flash-20260910': 'deepseek/deepseek-v4.1-flash',
}

FAMILY_RULES = [
    (r'^gemini 4 ', 'gemini-4'), (r'^gemini 3', 'gemini-3'),
    (r'^gemini nano banana', 'nano-banana'), (r'^gemini[ -]?omni', 'omni'),
    (r'^claude opus', 'claude-opus'), (r'^claude fable', 'claude-fable'), (r'^claude sonnet', 'claude-sonnet'),
    (r'^gpt-6', 'gpt-6'), (r'^gpt-5', 'gpt-5'), (r'^gpt-image', 'gpt-image'),
    (r'^muse', 'muse'), (r'^kimi', 'kimi'), (r'^qwen', 'qwen'), (r'^glm', 'glm'),
    (r'^deepseek', 'deepseek'), (r'^mimo', 'mimo'), (r'^step ', 'step'), (r'^flux', 'flux'),
    (r'^grok', 'grok'), (r'^llama', 'llama'), (r'^(ernie|文心)', 'ernie'),
    (r'seedance', 'seedance'), (r'mai-image', 'mai-image'),
]


def family_for(base):
    low = base.lower()
    for pattern, fid in FAMILY_RULES:
        if re.search(pattern, low):
            return fid
    return ''


def parse_license(raw_name):
    m = re.search(r'·\s*([^·]+)$', raw_name or '')
    return m.group(1).strip() if m else ''


def fmt_date(ts):
    try:
        return (datetime.datetime.utcfromtimestamp(int(ts)) + datetime.timedelta(hours=8)).strftime('%Y-%m-%d')
    except Exception:
        return ''


def main():
    or_path = None
    if '--openrouter' in sys.argv:
        or_path = sys.argv[sys.argv.index('--openrouter') + 1]
    rankings_path = None
    if '--rankings' in sys.argv:
        rankings_path = sys.argv[sys.argv.index('--rankings') + 1]

    rankings = load_rankings(rankings_path)
    or_models = load_openrouter(or_path)
    companies = {c['id']: c for c in json.loads((CATALOG_DIR / 'companies.json').read_text(encoding='utf-8'))}
    families = {f['id']: f for f in json.loads((CATALOG_DIR / 'families.json').read_text(encoding='utf-8'))}
    content_path = CATALOG_DIR / 'model_content.json'
    content = []
    if content_path.exists():
        content = json.loads(content_path.read_text(encoding='utf-8'))
    content_by_name = {}
    content_by_base = {}
    for e in content:
        if e.get('rankingName'):
            content_by_name[e['rankingName']] = e
            content_by_base.setdefault(base_name(e['rankingName']), e)

    # 原始数据里的许可证
    raw_lic = {}
    if RAW_RANKINGS.exists():
        raw = json.loads(RAW_RANKINGS.read_text(encoding='utf-8'))
        for dims in (raw.get('data') or {}).values():
            for arr in dims.values():
                if not isinstance(arr, list):
                    continue
                for row in arr:
                    n = row.get('name')
                    if n and n not in raw_lic:
                        lic = parse_license(row.get('rawName', ''))
                        if lic:
                            raw_lic[n] = lic

    # OpenRouter 索引
    or_idx = {}
    for m in or_models:
        mid = m['id'].split('/')[-1]
        if mid.endswith(':batch'):
            continue
        or_idx.setdefault(norm(mid), m)
        or_idx.setdefault(norm((m.get('name') or '').split(':')[-1]), m)

    # 榜单结构
    cat_info = {c['id']: c for c in rankings.get('categories', [])}
    cat_arrays = {cid: (dims.get('overall') or []) for cid, dims in rankings['data'].items()}
    cat_stats = {}
    for cid, arr in cat_arrays.items():
        cat_stats[cid] = {
            'total': len(arr),
            'rank': {m['name']: (m.get('rank') or i + 1) for i, m in enumerate(arr)},
            'row': {m['name']: m for m in arr},
        }

    today = datetime.datetime.now().strftime('%Y-%m-%d')
    models = {}
    aliases = {}
    events = []
    base_to_model = {}

    or_by_id = {m['id']: m for m in or_models}

    def match_openrouter(ranking_name, base):
        """日期快照优先匹配精确 id；否则回退基础模型。返回 (model, snapshot_unverified)。"""
        dm = re.search(r'(20\d{6})', ranking_name)
        if dm:
            date = dm.group(1)
            slug = norm(base)
            for mid in or_by_id:
                nm = norm(mid)
                if slug and slug in nm and (date in mid or date[4:] in mid):
                    return or_by_id[mid], False
            # 名字带日期但找不到精确快照：借用基础模型规格，但标记未核对
            base_m = or_idx.get(norm(base))
            if not base_m and norm(base) in MANUAL_OR:
                base_m = or_by_id.get(MANUAL_OR[norm(base)])
            return base_m, bool(base_m)
        m = or_idx.get(norm(base))
        if not m and norm(base) in MANUAL_OR:
            m = or_by_id.get(MANUAL_OR[norm(base)])
        return m, False

    for ranking_name, base, picked_cat in pick_candidates(rankings):
        or_m, snapshot_unverified = match_openrouter(ranking_name, base)
        provider = ''
        for cid, st in cat_stats.items():
            if ranking_name in st['row']:
                provider = st['row'][ranking_name].get('provider') or provider
                if provider:
                    break
        provider_key = provider.lower()
        company_id = PROVIDER_TO_COMPANY.get(provider_key, '')
        family_id = family_for(base)
        model_id = or_m['id'] if or_m else (company_id or 'model') + '-' + norm(base)

        # 各类目名次
        cats = {}
        for cid, st in cat_stats.items():
            if ranking_name in st['rank']:
                rank = st['rank'][ranking_name]
                total = st['total']
                cats[cid] = {
                    'rank': rank,
                    'total': total,
                    'pct': round((1 - (rank - 1) / total) * 100) if total else 0,
                }
        primary = None
        for cid in ['text'] + list(cats.keys()):
            if cid in cats:
                primary = (cid, cats[cid])
                break

        lic = (content_by_name.get(ranking_name) or {}).get('license') or raw_lic.get(ranking_name, '')
        if not lic and or_m:
            lic = ''
        open_weights = bool(lic) and 'proprietary' not in lic.lower()

        price = None
        if or_m and or_m.get('pricing') and not snapshot_unverified:
            p = or_m['pricing']
            pin = float(p.get('prompt') or 0) * 1_000_000
            pout = float(p.get('completion') or 0) * 1_000_000
            if pin > 0 or pout > 0:
                price = {
                    'input': round(pin, 4), 'output': round(pout, 4),
                    'currency': 'USD', 'unit': 'token',
                    'source': 'OpenRouter', 'isProxy': True, 'asOf': today,
                }

        c = content_by_name.get(ranking_name) or content_by_base.get(base) or {}
        summary = c.get('summaryZh') or ''
        if not summary:
            if primary:
                cat_name = cat_info.get(primary[0], {}).get('name', primary[0])
                summary = '%s 的 %s，当前在%s榜第 %d / %d。' % (
                    companies.get(company_id, {}).get('nameZh', provider or '未知厂商'),
                    base, cat_name, primary[1]['rank'], primary[1]['total'])
            else:
                summary = '%s 的 %s。' % (companies.get(company_id, {}).get('nameZh', provider or '未知厂商'), base)

        release = fmt_date(or_m.get('created')) if (or_m and not snapshot_unverified) else ''
        status = 'ga'
        if 'preview' in base.lower() or (or_m and 'preview' in (or_m.get('name') or '').lower()):
            status = 'preview'
        if or_m and or_m.get('expiration_date'):
            status = 'deprecated'

        display_base = DISPLAY_OVERRIDES.get(base, base)
        model = {
            'id': model_id,
            'familyId': family_id,
            'companyId': company_id,
            'displayName': display_base,
            'rankingName': ranking_name,
            'releaseDate': release,
            'status': status,
            'openWeights': open_weights,
            'license': lic or '未公开',
            'contextTokens': (or_m or {}).get('context_length') or 0,
            'maxOutputTokens': ((or_m or {}).get('top_provider') or {}).get('max_completion_tokens') or 0,
            'modalities': {
                'input': ((or_m or {}).get('architecture') or {}).get('input_modalities') or [],
                'output': ((or_m or {}).get('architecture') or {}).get('output_modalities') or [],
            },
            'knowledgeCutoff': (or_m or {}).get('knowledge_cutoff') or '',
            'apiModelIds': [or_m['id']] if (or_m and not snapshot_unverified) else [],
            'docsUrl': ('https://openrouter.ai/' + or_m['id']) if (or_m and not snapshot_unverified) else '',
            'specNote': '规格来自同系列基础模型，快照日期未核对' if snapshot_unverified else '',
            'summary': summary,
            'strengths': c.get('strengths') or [],
            'bestFor': c.get('bestFor') or [],
            'limitations': c.get('limitations') or [],
            'categories': cats,
            'primaryCategory': primary[0] if primary else '',
            'primaryRank': primary[1]['rank'] if primary else 0,
            'primaryTotal': primary[1]['total'] if primary else 0,
            'price': price,
            'sources': ([('https://openrouter.ai/' + or_m['id'])] if or_m else
                        ([c.get('sourceUrl')] if c.get('sourceUrl') else
                         ([companies.get(company_id, {}).get('website')] if companies.get(company_id, {}).get('website') else []))),
            'verifiedAt': today,
        }
        models[model_id] = model
        base_to_model[base] = model_id
        if ranking_name not in aliases:
            aliases[ranking_name] = model_id
        if or_m and release and not snapshot_unverified:
            events.append({
                'date': release,
                'scope': 'model',
                'refId': model_id,
                'type': 'listing',
                'title': display_base + ' 上线 OpenRouter',
                'summary': (or_m.get('description') or '')[:80],
                'importance': 'major' if (primary and primary[1]['rank'] <= 10) else 'minor',
                'sourceUrl': 'https://openrouter.ai/' + or_m['id'],
            })

    # 所有榜单名 → 基础模型（变体也映射）
    for cid, arr in cat_arrays.items():
        for m in arr:
            n = m.get('name')
            b = base_name(n)
            if b in base_to_model:
                aliases.setdefault(n, base_to_model[b])

    # 系列成员
    for fid, fam in families.items():
        fam['modelIds'] = [mid for mid, m in models.items() if m['familyId'] == fid]
    for cid, comp in companies.items():
        comp['familyIds'] = [fid for fid, fam in families.items() if fam['companyId'] == cid]

    events.sort(key=lambda e: e['date'], reverse=True)
    catalog = {
        'generatedAt': today,
        'rankingUpdated': rankings.get('lastUpdated', ''),
        'companies': companies,
        'families': families,
        'models': models,
        'aliases': aliases,
        'events': events,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding='utf-8')
    js = '// 自动生成：python3 pipeline/build_catalog.py\nmodule.exports = ' + json.dumps(catalog, ensure_ascii=False) + ';\n'
    OUT_JS.write_text(js, encoding='utf-8')

    print('models=%d aliases=%d events=%d size=%.1fKB' % (
        len(models), len(aliases), len(events), OUT_JS.stat().st_size / 1024))
    print('with OpenRouter=%d, with summary=%d' % (
        sum(1 for m in models.values() if m['apiModelIds']),
        sum(1 for m in models.values() if m['summary'] and not m['summary'].startswith('未'))))
    missing = [m['displayName'] for m in models.values() if not m['apiModelIds']]
    print('no OpenRouter:', ', '.join(missing[:20]))


if __name__ == '__main__':
    main()
