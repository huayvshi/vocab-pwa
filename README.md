# 考研词汇 PWA（6216 词 · v1.0.0）

考研英语一的随身背词工具：**查词 + 背词 + 复习 + 词根 + 统计**。
输英文或中文都能查到词，看音标/释义/变形/例句/词根，点一下听英音或美音；按间隔重复安排每天该背哪些词，记错题、看打卡日历、按词根成组记忆；数据全存在本机，断网也能查、也能背。

- 词库：**6216 词**（ECDICT 里 `tag` 含 `ky` 的考研大纲词 ∪ `gk` 高考基础词），其中标 `核心` 的 3053 词，其余 3163 词。
- 词根：**80 个词根族**，覆盖 922 词。
- 离线：Service Worker 预缓存页面、词库、词根库和音频。

---

## 快速开始

```bash
pnpm install          # 首次
pnpm dev              # 本地开发：http://localhost:5173
pnpm build            # 类型检查 + 打包到 dist/
pnpm preview --port 4174 --strictPort --host 0.0.0.0
pnpm test             # 单元测试：搜索 35 项 + 学习引擎 50 项
```

> `pnpm preview` 默认只监听 IPv6 的 `localhost`；加 `--host 0.0.0.0` 手机才能用同一个 Wi-Fi 访问（`http://<本机 IPv4>:4174`）。
> 注意：局域网 http 不是安全上下文，Service Worker / 离线 / 安装都会被浏览器禁用（查词本身可用）。要完整体验就部署到 HTTPS。

发布：把 `dist/` 整个目录丢到任意支持 HTTPS 的静态托管（GitHub Pages / Vercel / Netlify / Cloudflare Pages / Nginx）。
`vite.config.ts` 里 `base: './'` 是相对路径，放在子目录（如 `example.com/vocab/`）也能直接用。

---

## GitHub Pages 部署（已上线）

**线上地址：https://huayvshi.github.io/vocab-pwa/**
**源码仓库：https://github.com/huayvshi/vocab-pwa**

采用「源码在 `main`、构建产物在 `gh-pages`」的双分支方案，不依赖 CI：

| 分支 | 内容 | 用途 |
| --- | --- | --- |
| `main` | 全部源码 + `tools/` 流水线（`dist`、`node_modules`、`.verify` 已 gitignore） | 开发 |
| `gh-pages` | `dist/` 的构建产物 + `.nojekyll` | Pages 发布源 |

首次部署步骤（已做过一遍，这里是复现方式）：

```bash
# 1) 建仓库并推源码（用 PAT，classic token 需勾 repo）
git remote add origin https://github.com/<user>/vocab-pwa.git
git push -u origin main

# 2) 构建并推 gh-pages
pnpm build
pwsh -ExecutionPolicy Bypass -File tools/deploy_pages.ps1
#   脚本会：复制 dist → 临时目录、加 .nojekyll、git init、强制推送到 gh-pages

# 3) 开启 Pages：仓库 Settings → Pages → Source = Deploy from a branch → gh-pages / (root)
#   （只要 gh-pages 分支出现，GitHub 有时会自动替你开启）
```

之后改代码要重新上线，只要两步：`pnpm build` 然后 `pwsh -ExecutionPolicy Bypass -File tools/deploy_pages.ps1`（脚本默认自己会先构建，加 `-SkipBuild` 可跳过）。

要点：

- PowerShell 默认执行策略会拒绝 `.ps1`，所以要么用 `-ExecutionPolicy Bypass`，要么改用 `.cmd`/`npm run deploy:pages`。
- `base: './'` 是相对路径，所以 `https://<user>.github.io/vocab-pwa/` 这种子路径部署不用改配置；Service Worker 的作用域自动落在 `/vocab-pwa/`。
- `gh-pages` 分支每次强制推送，不保留历史，仓库不会因为多版本构建产物而膨胀。
- 实测（2026-10-23）：`/`、`/sw.js`、`/manifest.webmanifest`、`/data/vocab.json`（2.0 MB）、`/data/roots.json`、`/icons/icon-192.png` 全部 200；浏览器里 `isSecureContext=true`、SW `controller=true`、scope 为 `https://huayvshi.github.io/vocab-pwa/`、缓存 12 条（含词库/词根/构建产物）。

---

## 公网 HTTPS（临时，不花钱）

本机跑着服务、想立刻用手机以 HTTPS 打开（这样 Service Worker / 离线 / 安装才可用）：


```bash
# 1) 本地服务（绑到所有网卡）
pnpm preview --port 4174 --strictPort --host 0.0.0.0

# 2) 另开一个终端，起 Cloudflare 快速隧道（免注册、免账号）
cloudflared tunnel --url http://localhost:4174 --no-autoupdate --protocol http2
# 输出里会有一行：https://xxxx-xxxx-xxxx.trycloudflare.com  ← 这就是公网 HTTPS 地址
```

`cloudflared` 下载：`https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe`（国内可用 `https://ghfast.top/` 前缀加速）。

要点与限制：

- **必须让 Vite 放行外部 Host**，否则隧道域名会收到 `403 Blocked request. This host is not allowed`。
  已在 `vite.config.ts` 里配好：`preview.allowedHosts = ['.trycloudflare.com', '.cfargotunnel.com', 'localhost', '127.0.0.1']`（`server.allowedHosts` 同样配了开发服务器）。改完要**重启**预览服务。
- 这个地址**每次重启隧道都会变**，且账号无关隧道「无可用性保证」，只适合自己用/临时测试。
- 电脑必须开着，`cloudflared` 和 `pnpm preview` 两个进程都得在跑；关掉隧道地址立刻失效。
- 想固定域名：注册 Cloudflare → 把域名托管过去 → `cloudflared tunnel login` → `cloudflared tunnel create vocab` → `cloudflared tunnel route dns vocab vocab.你的域名` → `cloudflared tunnel run --url http://localhost:4174 vocab`。
- 想彻底不依赖本机：把 `dist/` 上传到 Cloudflare Pages / Vercel / Netlify（连 `cloudflared` 都不用）。
- 本机若出站 7844 被封，`cloudflared` 会走 HTTP/2 over 443（自检里 QUIC/TCP 7844 会显示 FAIL，但连接仍能建立）。

---

## 功能范围

### 一、查词

- 英文搜索：完整单词直接命中，输入半截出候选（前缀优先）；大小写、首尾空格、全角/半角、连字符、撇号都能容错。
- 中文搜索：输「放弃」也能找到 `abandon`。
- 拼写容错：输错一两个字母（如 `abandom`）仍能猜到你想要 `abandon`。
- 详情：英/美音标、按词性分行的释义、常见变形（过去式/复数/比较级…）、**词根 chip**、例句（100 个精选词有中英对照）、来源。
- 发音：英音 `type=0` / 美音 `type=1`（有道词典接口）；多音词（record、present、object 等 8 个）按词性给不同读音；连续点不同词会先停上一段；音频取不到时回落浏览器朗读并明确标注「系统朗读」。
- 搜索历史：自动保存最近 30 条，可清空。
- 筛选行：全部 / ★重点 / 错题 / 在学 / 未学 / 已掌握，带计数；空关键词时显示浏览列表，支持把当前筛选结果**一次性全标为重点**。

### 二、背单词

- 四种组卡模式：混合（到期复习 + 错题优先 + 新词补足每日额度）、只背新词、只复习、**随机抽选**（自定义 1–200 张，超出池子按实际数量并提示）。
- 每日目标：5 / 10 / 15 / 20 / 30 或自定义，按「今天已学新词」计数。
- 卡片：先看单词回忆，再点「显示释义」自评三档（忘了 / 模糊 / 会了），按钮上直接显示**下次复习间隔**。
- 遮罩：`H` 键随时隐藏/显示中文释义（设置页可设默认值）；遮罩状态下例句中文一起隐藏。
- 星标：`S` 键或卡片右上角 ☆，星标不影响「已学」判定。
- 时间标记：卡片给一行紧凑摘要（首次 / 上次 / 复习次数 / 错几次），详情卡有完整 4 格 + 最近 5 次记录（日期 + 自评档位）。
- 快捷键：`1/2/3` 评分，`空格` 显示释义，`Esc` 退出，`H` 遮罩，`S` 星标。

### 三、词根

- 80 个词根族按「含词数」降序排，可搜索词根或含义（输 `ced`、`走`、`ject`）。
- 点卡片看该词根下的全部单词（带词性释义 + 星标），点单词直接跳查词页。
- 查词详情里也会显示这个词命中的词根。

### 四、统计与设置

- KPI：今日已学 / 连续打卡 / 今日正确率 / 已掌握（间隔 ≥21 天或连对 5 次算掌握）。
- 本周柱状图、熟悉度分布、打卡日历（可翻月）、错题本（点词跳查词，一键练错题）、重点词面板（一键练重点词）。
- 设置：每日目标、主题（跟随系统 / 浅色 / 深色）、混合学习是否错题优先、默认是否遮罩释义、随机抽选张数。
- 数据：IndexedDB 本地持久化；CSV 导入（文件或直接粘贴）、模板下载、导出错题本 / 已学清单 / CSV 备份、打印错题本、清空进度（保留星标）。

---

## 搜索排序规则

严格按优先级返回，最多 20 条候选：

1. 完全匹配 `exact`
2. 常见词形匹配 `form`（`abandoned` → `abandon`，`phenomena` → `phenomenon`）
3. 前缀匹配 `prefix`
4. 包含匹配 `contains`（查询 ≥3 字符）
5. 中文释义匹配 `zh`（释义开头权重最高）
6. 拼写相近 `fuzzy`（查询 ≥4 字符，编辑距离 ≤1，长词放宽到 2）

输入停止 150 ms 后更新，先给 20 条。

---

## 数据来源与生成流水线

```
ECDICT (skywind3000/ECDICT, MIT)  ──► tools/fetch_ecdict.py ──► tools/.cache/ecdict.csv
                                                     │
                              100 词精选（人工英/美音标、例句、主题、多音）│
                                                     ▼
                                          tools/import_ecdict.py  ──► tools/ecdict_ky.json
                                                     │
                     tools/roots_data.py（80 词根族）│
                                                     ▼
                                            tools/build_vocab.py
                                                     │
                              public/data/vocab.json（6216 词，2.0 MB）
                              public/data/roots.json（80 词根，19 KB）
```

```bash
python tools/fetch_ecdict.py --workers 3   # 分块 Range 下载 66 MB（ghfast.top 代理，并发别超 3，否则 429）
python tools/import_ecdict.py              # ky ∪ gk 过滤 + 释义解析 + 词形解析
python tools/build_vocab.py                # 合并精选词 + 生成词根 + 写 public/data/
```

`tools/roots.py` 负责词根匹配：按词根片段长度**降序**做 contains 匹配，每个词最多 3 个词根，`exclude` 里列出的假朋友（如 `necessary` 里的 `cess`）会被排除。
词根匹配是「字母片段近似」，属于联想记忆线索，不宣称词源学正确。

---

## 目录结构

```
vocab-pwa/
├─ src/
│  ├─ App.tsx                  五个 Tab 的壳 + 词库加载
│  ├─ types.ts                 WordEntry / Sense / RootInfo / StudyState …
│  ├─ lib/
│  │  ├─ search.ts             搜索与排序（纯函数，可单测）
│  │  ├─ srs.ts                间隔重复算法（SM-2 变体）
│  │  ├─ study.ts              组卡、星标、筛选、随机抽选（纯函数）
│  │  ├─ stats.ts              统计聚合
│  │  ├─ roots.ts              词根反查（词根 → 单词）
│  │  ├─ csv.ts                CSV 导入 / 导出
│  │  ├─ storeState.ts         默认 state + normalize（旧数据兼容）
│  │  ├─ audio.ts              发音（预录音频 + 系统朗读回落）
│  │  └─ storage.ts            搜索历史（localStorage）
│  ├─ hooks/useStudyStore.ts   IndexedDB 持久化 + 主题
│  └─ components/              TabBar / SearchView / StudyView / RootsView / StatsView / SettingsView / WordCard / …
├─ public/
│  ├─ data/vocab.json          6216 词
│  ├─ data/roots.json          80 词根
│  ├─ sw.js                    Service Worker（v6）
│  └─ icons/                   PWA 图标
├─ tools/                      数据流水线 + 验证脚本（详见下文）
└─ dist/                       构建产物
```

---

## 加词 / 换词库

- 只想补几个词：设置页「导入自己的词库」直接粘贴 `word,词性,释义`（支持无表头，也支持中英文表头 `单词/音标/词性/释义/例句/译文/主题/难度`）。
- 想换整套词库：改 `tools/build_vocab.py` 的输入，重跑流水线；前端只认 `public/data/vocab.json` 与 `roots.json` 两个文件的格式。

字段说明（`vocab.json` 里每条）：

| 字段 | 说明 |
| --- | --- |
| `id` / `word` | 自增编号 / 单词 |
| `phoneticUK` / `phoneticUS` | 英音 / 美音音标（可能为空串） |
| `senses` | `[{ pos, def }]`，`pos` 也可能为空 |
| `forms` | 变形，如 `{ past: 'abandoned', pp: 'abandoned' }` |
| `altPron` | 多音词的按词性读音 `[{ pos, ipa }]` |
| `roots` / `rootIds` | 命中的词根标签 / id |
| `example` | `{ en, zh }`，仅精选 100 词有 |
| `topic` / `level` | 主题标签 / `core`、`plus` |

---

## 验证记录（本机实测，2026-10-22）

- `tsc -b`：0 错误。
- `pnpm test`：搜索 **35 项**、学习引擎 **50 项** 全过（含「给未学词打星不计入今日已学」「随机抽选不消耗每日新词额度」「旧版 state 经 normalize 不报错」）。
- `vite build`：JS 288 KB（gzip 90 KB）、CSS 32 KB（gzip 6.6 KB）。
- 无头浏览器（Edge headless + CDP）逐屏验证：查词、筛选、星标、批量星标、遮罩、随机抽选、时间线、词根网格/详情/深色、统计、错题本、设置、导入、390/360 两种窄屏无横向溢出。
- 断网实测：kill 掉服务器后 `navigate` 仍 200（来自 SW 缓存），词库与词根库读缓存可用。

---

## 已知限制

- 音频要联网（有道词典接口）；只有播放过的词会被音频缓存命中。
- 词根是「字母片段近似」匹配，会有假朋友（`advanced` 会被归到 `-ced-`），定位是联想记忆线索。
- 中文释义/词形来自 ECDICT，个别词条的专业领域义项被剥离（`[计] 规程` 只保留「规程」）。
- 无登录、无云同步；换设备请用 CSV 导出/导入。
- 局域网 http 下没有 Service Worker（非安全上下文），必须 HTTPS 才能离线与安装。

### 踩过的坑（给后来者）

1. `pnpm preview` 默认只听 `::1`，`127.0.0.1` 连不上 → 用 `localhost`，或 `--host` 指定监听地址。
2. Service Worker 的 `cache.match()` 默认比较 `Vary` 头，预缓存请求没有 `Origin`、页面请求有，服务端又回了 `Vary: Origin`，导致「缓存里有却匹配不到」页面全白 → 统一用 `cache.match(request, { ignoreVary: true })`。
3. Edge headless 的 `--window-size` 最小被钳到 492 CSS px，窄屏要用 iframe 造视口；`--screenshot` 要给**绝对路径**，并用 `Start-Process -Wait` 等它写完。
4. 不要用 PowerShell 的 `-replace` 重写 UTF-8 源文件（会把注释变乱码、吞掉换行），用编辑器或 `write` 工具。
5. ECDICT 的 CSV 里换行是**字面量 `\n`**；词性正则必须**长词性优先**（否则 `vt.` 被 `v` 吃掉）。
