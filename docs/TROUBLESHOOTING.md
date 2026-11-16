# 故障排查

## 小程序显示旧日期 / 数据没更新

**按顺序排查：**

1. **看云端指针**：调 `getRankings` 云函数，看返回的 `lastUpdated`
2. **看云端文件内容**：拿返回的 `url` 直接下载，解析后看 `lastUpdated`
   - ⚠️ 不要只看模拟器显示，开发者工具有本地 HTTP 缓存
3. **看 data 分支**：`https://raw.githubusercontent.com/zzzl0805/ai-model-rankings/data/rankings.json`
4. **看 CI**：GitHub Actions 最近一次运行是否绿色
5. **看 jsDelivr**：
   ```
   https://cdn.jsdelivr.net/gh/zzzl0805/ai-model-rankings@v<今天日期>/rankings.json
   ```

**常见原因**：
- jsDelivr 命中了旧缓存 → 确认用的是**日期 tag** 而不是分支
- CI 抓取失败 → 看 workflow 里的 `update.log`（已随数据推到 data 分支）
- 云函数没跑 → 检查定时触发器是否还在

---

## CI 失败（Actions 红色）

1. 先看是哪个 step 失败
2. 抓取相关失败：看 data 分支上的 `update.log`
3. 常见：arena.ai 被拦 → 应自动回退 HF；若 HF 也失败，检查 requirements.txt 里 pandas/pyarrow 是否装好

---

## 云函数调用超时

**症状**：`errCode: -504003 | Invoking task timed out after 3 seconds`

**原因**：超时时间没设置（`config.json` 里写的不生效）

**处理**：微信开发者工具 → 云开发控制台 → 云函数 → `syncRankings` → 配置 → 超时时间改 **60 秒**

---

## 云函数返回「下载超时」

**原因**：jsDelivr 镜像间歇性挂起或被截断

**处理**：函数已内置三镜像轮询 + JSON 完整性校验 + 重试。若持续失败：
1. 检查当天的 tag 是否存在：`https://api.github.com/repos/zzzl0805/ai-model-rankings/branches/data`
2. 手动调一次：`callFunction({name:'syncRankings', data:{diag:true}})` 看分步耗时

---

## 开发者工具「需要重新登录」

**症状**：CLI 报 `code 10: 需要重新登录`，automator 报 `Failed to launch wechat web devTools`

**处理**：打开开发者工具扫码登录。**登录态约 2 周会过期**。
→ 这也是为什么全自动链路不依赖开发者工具。

---

## 上传后用户看到的还是本地旧数据

1. 检查云存储权限是否仍为「仅创建者可读写」（应该是）
2. 检查 `getRankings` 是否返回了 `url`（签名链接）
3. 若返回的是 `fileID` 而不是 `url`，说明云函数版本旧了 → 重新部署

---

## 数据源过滤（发布前）

```bash
cd pipeline && node -e "
const d=require('../miniprogram/data/rankings.js');
console.log('日期:', d.lastUpdated);
console.log('条目:', Object.values(d.data).reduce((s,c)=>s+Object.values(c).reduce((a,v)=>a+v.length,0),0));
console.log('agent votes为0:', (d.data.agent.overall||[]).filter(m=>!m.votes).length);
"
```
