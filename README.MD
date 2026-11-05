# 转会动态雷达（Transfer Radar）

[English](README.EN.MD)

一个基于原生 Node.js 与 vanilla JavaScript 的足球转会动态看板。服务端通过 Sportmonks Football API 拉取已确认转会与转会传闻，统一字段、费用和时间格式后，以时间线形式展示；未配置 API Token 或上游服务异常时，可按配置使用本地演示数据。

## 功能特性

- **确认转会与传闻分区**：明确区分官方已确认交易与媒体传闻，避免混淆数据性质。
- **统一动态时间线**：展示球员、转出/转入俱乐部、交易类型、状态、费用、来源及更新时间。
- **多维筛选**：支持关键词搜索、确认/传闻切换，以及近 24 小时、7 天、30 天和全部时间筛选。
- **记录详情**：查看传闻概率、来源链接、规范化字段和上游接口原始数据。
- **服务端密钥隔离**：Sportmonks Token 仅用于服务端请求，不下发到浏览器。
- **缓存与降级**：内置内存缓存、请求超时、手动刷新冷却，以及传闻接口独立降级。
- **开箱即用的演示模式**：无 Token 时展示 10 条本地示例记录，不代表真实转会。
- **响应式与可访问性**：适配桌面和移动端，支持键盘操作、减少动态效果偏好及语义化状态提示。

## 技术栈

- Node.js 18 或更高版本（使用内置 `fetch`）
- 原生 `node:http` 静态文件与 JSON API 服务
- HTML、CSS、JavaScript，无前端框架或构建步骤
- Sportmonks Football API v3

项目没有第三方 npm 运行依赖，无需执行 `npm install`。

## 快速开始

### 1. 环境要求

确认 Node.js 版本不低于 18：

```bash
node --version
```

### 2. 以演示模式启动

```bash
npm start
```

默认访问地址：<http://127.0.0.1:4173>

未配置 `SPORTMONKS_TOKEN` 时，页面会自动使用本地演示数据。

### 3. 接入 Sportmonks 实时数据

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
```

### 金额单位说明

`SPORTMONKS_FEE_SCALE` 必须与上游接口实际返回口径一致：

- `eur`：将数值视为欧元绝对值，例如 `42000000` 显示为 `€42M`。
- `million`：将数值视为百万欧元，例如 `42` 显示为 `€42M`。
- `raw`：不换算金额，显示接口原值，且不生成用于统一排序或计算的百万欧元数值。

金额为 `0` 时显示自由转会/无费用；金额缺失时显示“未披露”，内部值为 `null`，不会被误写为 `0`。

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
├── public/
│   ├── index.html      # 页面结构与详情对话框
│   ├── styles.css      # 响应式样式与可访问性适配
│   └── app.js          # 数据请求、筛选、渲染和交互
├── server.js           # 静态服务、API 代理、规范化、缓存与降级
├── smoke-test.js       # 使用本地模拟上游的端到端冒烟测试
├── package.json        # 启动、语法检查与测试脚本
└── README.MD
```

## 检查与测试

运行 JavaScript 语法检查：

```bash
npm run check
```

运行冒烟测试：

```bash
npm test
```

测试会启动本地模拟 Sportmonks 服务和多个临时应用实例，覆盖：

- 演示模式及记录数量
- 实时数据字段与金额规范化
- 传闻接口不可用时的部分降级
- 上游故障且禁用降级时的 `502` 响应
- 静态资源访问与路径穿越防护

测试使用随机空闲端口，不需要真实 Sportmonks Token，也不会依赖外部网络。

## 安全与部署注意事项

- 不要将 `.env`、API Token 或其他凭据提交到版本控制，也不要把 Token 写入 `public/`。
- 默认监听 `127.0.0.1`。如需暴露到局域网或公网，应自行评估访问控制、HTTPS、反向代理、速率限制和日志策略。
- 当前缓存与运行状态仅保存在单个 Node.js 进程内存中，不适用于多实例共享缓存或持久化需求。
- 本项目不包含用户认证和数据库，不应直接视为完整的生产级部署方案。
- 已确认转会与媒体传闻具有不同可信度；传闻不构成官方确认，使用时应保留来源和概率信息。
- 商业转售或大规模展示上游内容前，应核对 Sportmonks 合同中的授权、缓存和署名要求。
