#!/usr/bin/env python3
"""根据 pipeline/landing-pages.json 生成固定路径的模型/系列落地页，并注册到 app.json。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONF = json.loads((ROOT / 'pipeline' / 'landing-pages.json').read_text(encoding='utf-8'))
MP = ROOT / 'miniprogram'

# runtime config
js = '// 自动生成：pipeline/generate_landing_pages.py\nmodule.exports = ' + json.dumps(CONF, ensure_ascii=False) + ';\n'
(MP / 'utils' / 'landing-config.js').write_text(js, encoding='utf-8')

WXML = '<import src="../../templates/model-landing.wxml"/>\n<template is="model-landing" data="{{...landing}}"/>\n'
WXSS = '@import "../../styles/model-landing.wxss";\n'

def write_page(path, title, js_body):
    # path = pages/model-<slug>/model-<slug>
    parts = path.split('/')
    folder = MP / parts[0] / parts[1]
    folder.mkdir(parents=True, exist_ok=True)
    base = parts[2]
    (folder / (base + '.js')).write_text(js_body, encoding='utf-8')
    (folder / (base + '.json')).write_text(json.dumps({'navigationBarTitleText': title}, ensure_ascii=False, indent=2), encoding='utf-8')
    (folder / (base + '.wxml')).write_text(WXML, encoding='utf-8')
    (folder / (base + '.wxss')).write_text(WXSS, encoding='utf-8')

for m in CONF['models']:
    slug = m['slug']
    path = f'pages/model-{slug}/model-{slug}'
    js_body = ("var create = require('../../utils/landing-page.js');\n"
               "Page(create({ kind: 'model', name: " + json.dumps(m['name'], ensure_ascii=False) + ", slug: " + json.dumps(slug) + " }));\n")
    write_page(path, m['title'], js_body)

for f in CONF['families']:
    slug = f['slug']
    path = f'pages/family-{slug}/family-{slug}'
    js_body = ("var create = require('../../utils/landing-page.js');\n"
               "Page(create({ kind: 'family', familyId: " + json.dumps(f['id']) + ", slug: " + json.dumps(slug) + " }));\n")
    write_page(path, f['title'], js_body)

app_path = MP / 'app.json'
app = json.loads(app_path.read_text(encoding='utf-8'))
paths = []
for m in CONF['models']:
    paths.append(f"pages/model-{m['slug']}/model-{m['slug']}")
for f in CONF['families']:
    paths.append(f"pages/family-{f['slug']}/family-{f['slug']}")
for p in paths:
    if p not in app['pages']:
        app['pages'].append(p)
app_path.write_text(json.dumps(app, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('generated', len(CONF['models']), 'model pages,', len(CONF['families']), 'family pages')
