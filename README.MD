# 转会动态雷达（Transfer Radar）

[English](README.EN.MD)

一个基于原生 Node.js 服务端与 React 前端的足球转会动态看板。服务端通过 Sportmonks Football API 拉取已确认转会与转会传闻，统一字段、费用和时间格式后，以时间线形式展示；前端使用 React 19 + Vite 构建，构建产物由同一个 Node 服务直接托管。未配置 API Token 或上游服务异常时，可按配置使用本地演示数据。

## 功能特性

- **确认转会与传闻分区**：明确区分官方已确认交易与媒体传闻，避免混淆数据性质。
- **统一动态时间线**：展示球员、转出/转入俱乐部、交易类型、状态、费用、来源及更新时间。
- **多维筛选**：支持关键词搜索、确认/传闻切换，以及近 24 小时、7 天、30 天和全部时间筛选。
- **记录详情**：查看传闻概率、来源链接、规范化字段和上游接口原始数据。
- **服务端密钥隔离**：Sportmonks Token 仅用于服务端请求，不下发到浏览器。
- **缓存与降级**：内置内存缓存、请求超时、手动刷新冷却，以及传闻接口独立降级。
- **开箱即用的演示模式**：无 Token 时展示 10 条本地示例记录，不代表真实转会。
- **组件化前端**：使用 React 19 组织页面状态与交互，Vite 负责开发服务器和生产构建，Node 服务直接托管 `dist/` 产物。
- **响应式与可访问性**：适配桌面和移动端，支持键盘操作、减少动态效果偏好及语义化状态提示。

## 技术栈

- Node.js 18 或更高版本（使用内置 `fetch`）
- 原生 `node:http` 静态文件与 JSON API 服务
- React 19 + Vite 6：组件化界面、开发热更新与生产构建
- Sportmonks Football API v3

服务端运行时仍然没有第三方 npm 依赖，但前端构建需要 React、Vite 等开发依赖。首次运行需执行 `npm install`；`npm start` 会先构建前端再启动服务。

## 快速开始

### 1. 环境要求

确认 Node.js 版本不低于 18：

```bash
node --version
```

### 2. 安装依赖

```bash
npm install
```

### 3. 以演示模式启动

```bash
npm start
```

默认访问地址：<http://127.0.0.1:4173>

`npm start` 会先执行 Vite 生产构建，生成 `dist/`，然后启动 Node 服务。未配置 `SPORTMONKS_TOKEN` 时，页面会自动使用本地演示数据。

### 4. 接入 Sportmonks 实时数据

在项目根目录创建 `.env` 文件：

```dotenv
SPORTMONKS_TOKEN=your_sportmonks_api_token
```

然后重启服务：

```bash
npm start
```

也可以通过 shell 环境变量传入配置。已有 shell 环境变量优先于 `.env` 中的同名配置。

> 已确认转会使用 `transfers/latest`；转会传闻使用 `transfer-rumours`。传闻数据的可用性取决于 Sportmonks 套餐及 Transfer Rumours add-on。若传闻接口不可用，已确认转会仍会正常展示，页面同时显示降级提示。

## 前端开发与构建

生产构建：

```bash
npm run build
```

构建产物输出到 `dist/`，由 `server.js` 直接托管。`dist/assets/` 中的文件名带内容哈希，服务端会为其设置长期不可变缓存；`index.html` 使用 `no-cache`，确保发布后能立即获取新版本。

本地开发时，Vite 提供热更新，并把 `/api` 请求代理到 `127.0.0.1:4173`。需要两个终端：

```bash
# 终端 1：启动 Node API（会先构建一次 dist）
npm start

# 终端 2：启动 Vite 开发服务器
npm run dev
```

打开 <http://127.0.0.1:5173> 进行开发。只修改前端时也可用 `npm run dev:api` 启动 API 服务，但需先执行过一次 `npm run build`，因为 `server.js` 会检查 `dist/index.html` 是否存在。

构建产物预览：

```bash
npm run preview
```

预览服务器默认运行在 <http://127.0.0.1:4174>，并将 `/api` 代理到 `127.0.0.1:4173`；请保持 Node API 服务运行。

## 配置项

所有配置均可写入项目根目录的 `.env`，也可通过进程环境变量设置。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 服务监听地址；默认仅允许本机访问 |
| `PORT` | `4173` | 服务端口，有效范围为 `1–65535` |
| `SPORTMONKS_TOKEN` | 空 | Sportmonks API Token；为空时进入演示模式 |
| `SPORTMONKS_API_BASE` | `https://api.sportmonks.com/v3/football` | Sportmonks API 基础地址，末尾斜杠会被移除 |
| `SPORTMONKS_RUMOURS` | `true` | 是否请求转会传闻接口 |
| `SPORTMONKS_MAX_PAGES` | `2` | 已确认转会最多拉取页数，范围 `1–5`，每页 50 条 |
| `SPORTMONKS_FEE_SCALE` | `eur` | 金额单位：`eur`（欧元绝对值）、`million`（百万欧元）或 `raw`（保留接口原值） |
| `CACHE_TTL_MS` | `900000` | 实时数据内存缓存时长，范围 `60000–86400000` 毫秒 |
| `REQUEST_TIMEOUT_MS` | `12000` | 单次上游请求超时，范围 `3000–60000` 毫秒 |
| `ENABLE_DEMO_FALLBACK` | `true` | 已确认转会接口失败时是否降级到演示数据 |
| `DATABASE_URL` | 空 | 离线球员采集脚本使用的 Supabase PostgreSQL 连接串；HTTP 服务不读取或暴露该值 |
| `PLAYER_SYNC_LEAGUES` | `epl,la_liga,serie_a,bundesliga,ligue_1` | 离线采集脚本的目标联赛代码，逗号分隔 |

布尔配置接受 `1`、`true`、`yes`、`on`（不区分大小写）为真，其他已设置的非空值为假。

完整实时配置示例：

```dotenv
HOST=127.0.0.1
PORT=4173
SPORTMONKS_TOKEN=your_sportmonks_api_token
SPORTMONKS_RUMOURS=true
SPORTMONKS_MAX_PAGES=2
SPORTMONKS_FEE_SCALE=eur
CACHE_TTL_MS=900000
REQUEST_TIMEOUT_MS=12000
ENABLE_DEMO_FALLBACK=true
DATABASE_URL=
PLAYER_SYNC_LEAGUES=epl,la_liga,serie_a,bundesliga,ligue_1
```

### 金额单位说明

`SPORTMONKS_FEE_SCALE` 必须与上游接口实际返回口径一致：

- `eur`：将数值视为欧元绝对值，例如 `42000000` 显示为 `€42M`。
- `million`：将数值视为百万欧元，例如 `42` 显示为 `€42M`。
- `raw`：不换算金额，显示接口原值，且不生成用于统一排序或计算的百万欧元数值。

金额为 `0` 时显示自由转会/无费用；金额缺失时显示“未披露”，内部值为 `null`，不会被误写为 `0`。

## 五大联赛球员数据采集（MVP）

项目附带一个独立于 HTTP 服务的离线采集脚本，用于将英超、西甲、意甲、德甲和法甲的当赛季球队、阵容及球员基础资料写入 Supabase。采集器使用 Node 内置 `fetch` 与本机 `psql`，不新增 npm 依赖，也不会在 `/api/status` 或前端暴露 `DATABASE_URL`。

前置条件：

- 本机可运行 `psql`（也可通过 `PSQL_PATH` 指定客户端路径）。
- `.env` 中配置有效的 `DATABASE_URL` 与 `SPORTMONKS_TOKEN`。
- Sportmonks 订阅必须包含五个目标联赛；免费档仅覆盖 Danish Superliga 与 Scottish Premiership，无法完成五大联赛同步。
- 数据库 migration 已执行。

```bash
npm run migrate:players     # 创建业务表、索引和 current_top5_players 视图
npm run sync:players:dry    # 获取数据，在单个事务中导入后回滚
npm run sync:players        # 持久化当前赛季球队与球员数据
npm run verify:players      # 输出各联赛记录数、缺失值和最近同步状态
```

`--dry-run` 仍会验证 API、字段规范化、外键、upsert 和 SQL 事务，但以 `ROLLBACK` 结束，不会留下业务数据。可用以下命令在当前订阅可见的单个联赛上做小规模 smoke test：

```bash
node scripts/sync-top5-players.js --league-id=501 --code=smoke --team-limit=1 --dry-run
```

采集结果写入 `leagues`、`seasons`、`teams`、`team_seasons`、`players`、`squad_memberships`、`sync_runs` 和 `sync_checkpoints`；常用查询视图为 `current_top5_players`。完整设计及验收标准见 `doc/top-five-leagues-player-sync-plan.md`。

### Scottish Premiership 演示数据

当前免费订阅可访问 Scottish Premiership，可用它验证完整采集、入库和展示链路。该数据集是真实上游数据，但通过 `leagues.is_demo=true` 和 `demo_scottish_premiership` 代码明确标记为演示数据，不会进入 `current_top5_players` 视图，也不会被当作五大联赛目标数据。

```bash
npm run sync:demo                  # 持久化 Scottish Premiership 当前赛季全部球队与球员
npm run sync:demo:transfers        # 批量采集这些球员的已确认转会历史
npm run sync:demo:transfers:dry    # 事务级 dry-run，写入后回滚
npm run sync:socials               # 导入 data/player-socials.json 中的公开社媒链接
npm run sync:socials:dry           # 校验并回滚
npm run demo:report                # 生成球员列表、个人页面与共享静态数据
npm run verify:players             # 分别输出五大联赛、演示联赛、转会与社媒统计
```

转会历史通过 `filters=transferPlayers:<IDs>` 加 `include=fromTeam;toTeam;type` 批量拉取，并用球队、类型参考数据兜底；结果写入 `player_transfers`。不使用 `populate`，因为它会剥离 includes，导致队名退化为 `球队 #ID`。`player_transfer_history` 视图提供带球员姓名的查询；仅包含已确认转会，不包含传闻。

### 公开社媒

当前 Sportmonks Football API v3 的 `Player` 实体没有社媒字段或 include；`metadata` 类型与球队 `socials` 在 Free Plan 样例中也无法提供球员公开社媒。因此“公开社媒”栏默认显示“暂未收录”，不会根据姓名伪造链接。

如需补充已核验的公开链接，编辑 `data/player-socials.json`，数组元素格式如下：

```json
[
  {
    "player_id": 3385,
    "platform": "X / Twitter",
    "handle": "@example",
    "url": "https://x.com/example",
    "source_name": "Manual verification",
    "source_url": "https://example.com/source",
    "verified": true
  }
]
```

`url` 与 `source_url` 只接受 HTTP/HTTPS；`verified=true` 表示本地人工核验。编辑后执行 `npm run sync:socials` 写入 `public.player_socials`，再执行 `npm run demo:report` 刷新静态页面。

静态页面包括：

- `doc/scottish-premiership-demo.html`：搜索、球队筛选、球员基础信息表和公开社媒栏；点击球员姓名进入个人页面。
- `doc/player-detail.html?playerId=<ID>`：球员基础资料、当前球队、公开社媒和转会历史。
- `doc/demo-data.js`：两个页面共享的静态数据快照。

页面会显示 Sportmonks HTTPS 头像；上游占位图、加载失败或不安全 URL 会降级为球员姓名首字母，不依赖第三方占位图服务。页面均不连接数据库，也不包含 API Token 或数据库连接串。`current_demo_players` 视图可用于直接查询演示数据。

## 使用说明

- 页面加载后自动请求本地 `/api/movements` 与 `/api/status`。
- 点击“刷新”可发起手动同步；已有实时缓存时，手动刷新存在 60 秒冷却。
- 页面处于可见状态时，每 5 分钟自动重新请求数据；服务端仍按缓存 TTL 返回结果。
- 搜索覆盖球员、俱乐部、来源、交易类型和状态；按 `/` 可快速聚焦搜索框。
- 点击记录卡片，或聚焦卡片后按 Enter/空格，可打开详情。
- 前端最多渲染筛选结果中的前 100 条记录。

## API

服务仅接受 `GET` 和 `HEAD` 请求，其他方法返回 `405`。

### `GET /api/status`

返回服务配置摘要和运行状态，不包含 API Token。

主要字段：

| 字段 | 说明 |
| --- | --- |
| `mode` | `demo` 或 `live-ready` |
| `tokenConfigured` | 是否已配置 Token |
| `rumoursEnabled` | 是否启用传闻接口 |
| `rumoursStatus` | `pending`、`ok`、`unavailable` 或 `disabled` |
| `cacheTtlMs` | 缓存时长 |
| `cachedAt` | 当前实时缓存的抓取时间 |
| `lastError` | 最近一次上游错误摘要 |

示例：

```bash
curl http://127.0.0.1:4173/api/status
```

### `GET /api/movements`

返回规范化转会动态、统计、数据模式、警告和状态信息。

查询参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `limit` | `120` | 最多返回记录数，范围 `1–200` |
| `refresh` | 无 | 设为 `1` 时请求强制刷新，受手动刷新冷却限制 |

示例：

```bash
curl "http://127.0.0.1:4173/api/movements?limit=20"
curl "http://127.0.0.1:4173/api/movements?refresh=1"
```

每条记录的核心字段包括：

- `kind`：`confirmed`（已确认）或 `rumour`（传闻）
- `player`、`from`、`to`、`type`、`status`
- `announcedAt`、`updatedAt`
- `feeText`、`feeMillions`、`feeDisclosed`
- `probability`、`sourceName`、`sourceUrl`
- `raw`：用于核对字段映射的上游原始记录

## 数据流与降级策略

```text
Sportmonks API
  ├─ transfers/latest
  └─ transfer-rumours
          ↓
Node.js 服务端代理
  ├─ Token 隔离、超时与分页
  ├─ 字段和金额规范化
  └─ 内存缓存与错误降级
          ↓
浏览器动态看板
```

具体行为如下：

1. **未配置 Token**：直接返回本地演示数据。
2. **传闻接口失败**：保留已确认转会，`mode` 仍为 `live`，并添加警告。
3. **已确认转会接口失败且允许演示降级**：返回演示数据及失败原因。
4. **已确认转会接口失败且禁用演示降级**：返回 HTTP `502`。
5. **缓存仍有效**：普通请求直接返回内存缓存；服务重启后缓存清空。

## 项目结构

```text
football-transfer-live/
├── db/migrations/      # Supabase 表结构迁移
├── doc/                # 球员采集方案、验收说明与静态演示页面
├── public/             # 原样复制的静态资源与部署时的 /demo/ 页面
├── src/
│   ├── components/     # 头部、统计、动态流、详情弹窗等 React 组件
│   ├── App.jsx         # 页面状态、数据加载与筛选
│   ├── api.js          # 本地 API 请求
│   ├── main.jsx        # React 挂载入口
│   ├── styles.css      # 响应式样式与可访问性适配
│   └── utils.js        # 时间、金额、URL 等工具
├── scripts/            # 离线球员采集、事务导入与只读验收
├── test/               # 字段规范化与导入逻辑单元测试
├── dist/               # Vite 构建产物（Git 忽略，部署前生成）
├── index.html          # Vite HTML 入口
├── vite.config.js      # Vite 配置与开发代理
├── .env.example        # 环境变量模板
├── .gitignore          # 版本控制忽略规则
├── LICENSE             # MIT 许可证
├── README.EN.MD        # 英文文档
├── README.MD           # 中文文档
├── package.json        # 项目元数据、构建、启动、采集、检查与测试脚本
├── server.js           # 静态服务、API 代理、规范化、缓存与降级
└── smoke-test.js       # 使用本地模拟上游的端到端冒烟测试
```

## 检查与测试

运行前端构建和 JavaScript 语法检查：

```bash
npm run check
```

运行端到端冒烟测试、球员字段规范化和事务导入单元测试：

```bash
npm test
```

`npm test` 会先执行生产构建，再运行测试。测试会启动本地模拟 Sportmonks 服务和多个临时应用实例，覆盖：

- 演示模式及记录数量
- 实时数据字段与金额规范化
- 传闻接口不可用时的部分降级
- 上游故障且禁用降级时的 `502` 响应
- 构建后的 HTML、带哈希的 JS/CSS 资源访问与缓存头
- 静态资源路径穿越防护
- 球员字段、联赛匹配、连接串解析与事务回滚逻辑

测试使用随机空闲端口，不需要真实 Sportmonks Token，也不会依赖外部网络。

## 安全与部署注意事项

- 不要将 `.env`、API Token 或其他凭据提交到版本控制，也不要把 Token 写入 `public/`、`src/` 或任何会被 Vite 打包的前端文件。
- 前端构建只需要 `VITE_` 前缀变量才会暴露给浏览器；本项目不需要任何前端密钥，请勿添加。
- 默认监听 `127.0.0.1`。如需暴露到局域网或公网，应自行评估访问控制、HTTPS、反向代理、速率限制和日志策略。
- 当前缓存与运行状态仅保存在单个 Node.js 进程内存中，不适用于多实例共享缓存或持久化需求。
- 本项目不包含用户认证；HTTP 服务本身不读取数据库。离线采集脚本通过 `.env` 中的 `DATABASE_URL` 写入 Supabase，该值不会进入 `/api/status` 或前端。
- 部署时需先执行 `npm ci` 和 `npm run build`，再启动 `node server.js`；`dist/` 是运行时必需产物，不应提交到 Git。部署到 `bwg` 等共享主机时，systemd 单元仍可直接运行 `node server.js`，只需确保发布流程包含构建步骤。
- 若使用 `public/demo/` 托管静态演示页，请在构建前放入该目录，Vite 会将其复制到 `dist/demo/`。
- 不应将该项目直接视为完整的生产级部署方案。
- 已确认转会与媒体传闻具有不同可信度；传闻不构成官方确认，使用时应保留来源和概率信息。
- 商业转售或大规模展示上游内容前，应核对 Sportmonks 合同中的授权、缓存和署名要求。

## 许可证

本项目代码与文档采用 [MIT License](LICENSE)，版权归 Russell Luo 所有。

MIT 许可证仅覆盖本仓库中的代码和文档，不覆盖 Sportmonks API 提供的转会数据；数据的使用、缓存与展示仍须遵守服务商条款。
