# 欧洲五大联赛球员基础信息采集方案

- 状态：MVP 已实现；五大联赛首次全量同步待有效订阅
- 编写日期：2026-11-05
- MVP 实现日期：2026-11-06
- 数据源：Sportmonks Football API v3
- 目标数据库：Supabase PostgreSQL
- 项目约束：Node.js >= 18、CommonJS、前端无框架；新增 npm 依赖需单独批准

> 实施说明：MVP 选用方案 B，使用 Node 内置 `fetch` + 本机 `psql`，未新增 npm 依赖。数据库表、事务导入、dry-run、幂等 upsert 和只读验收均已实现并验证。当前提供的 token 属于 Football Free Plan，只能访问 Scottish Premiership 与 Danish Superliga，因此真实五大联赛数据尚未写入。已使用 Scottish Premiership 当赛季数据建立明确标记的演示数据集（`is_demo=true`），生成球员列表、个人页面与转会历史静态快照；演示数据不会进入 `current_top5_players` 视图。获得 Starter 或同等权限的 token 后，执行 `npm run sync:players` 即可完成首次全量同步。

## 1. 目标与范围

### 1.1 目标

建立一套可重复执行、可断点恢复、可追溯的数据同步流程，将以下五个欧洲顶级国内联赛的当赛季球员基础信息写入 Supabase：

| 本地代码 | 联赛 | 国家/地区 |
| --- | --- | --- |
| `epl` | Premier League | England |
| `la_liga` | La Liga | Spain |
| `serie_a` | Serie A | Italy |
| `bundesliga` | Bundesliga | Germany |
| `ligue_1` | Ligue 1 | France |

第一阶段保存球员、球队、联赛、赛季及阵容归属关系，为后续转会、传闻和球员详情功能提供统一基础数据。

### 1.2 默认范围

- 仅采集五个联赛的 `currentSeason`，不回填历史赛季。
- 仅采集团队阵容中出现的球员，不导入 Sportmonks 全量球员库。
- 仅采集基础资料和阵容字段，不采集比赛事件、技术统计、赔率或转会费。
- 保存球员头像 URL，第一阶段不下载图片到 Supabase Storage。
- 保留上游原始 JSON，便于排查字段变化；同步时间不能冒充上游更新时间。

### 1.3 非目标

- 不保证球员基础字段在上游都有值；缺失值应保留为 `NULL`，不能编造或强制填为 `0`。
- 不将合同结束日期直接等同于实际离队日期。
- 不在第一阶段提供前端直接访问数据库的能力，也不在 `/api/status` 暴露数据库配置。

## 2. 当前状态与关键约束

1. 项目已有 `SPORTMONKS_API_BASE`、超时、分页等 Sportmonks 服务端配置基础。
2. 本地 `.env` 已配置并验证 `DATABASE_URL`，使用 Supabase Session Pooler 和 SSL；该文件已被 Git 忽略。
3. Supabase 的 `public` schema 当前没有业务表，可按全新 schema 设计实施。
4. 项目目前没有 npm 依赖。Node.js 自带 `fetch`，但不自带 PostgreSQL 驱动。
5. 本机已有 `psql`，可执行 migration 和只读验收查询，但不能假设所有部署环境都安装了 `psql`。
6. Sportmonks 的可用联赛、include 和调用额度取决于订阅，正式全量运行前必须用小范围请求验证覆盖范围。
7. Sportmonks 文档处于分页迁移期：新集成优先使用 `cursor/next_cursor`，部分端点文档仍展示 `page`。客户端必须根据响应兼容两种方式，不能只写死旧分页。

## 3. 推荐总体方案

采用“联赛发现 → 当前赛季 → 赛季球队 → 球队阵容 → 球员资料 → 事务入库”的链路：

```text
Sportmonks API
      |
      v
联赛与赛季发现（每次运行重新解析 currentSeason）
      |
      v
赛季球队列表（记录 team_seasons）
      |
      v
逐球队获取当赛季阵容（最小的失败/重试/提交单元）
      |
      +----> 规范化球员基础资料 ----> players upsert
      |
      +----> 规范化阵容关系 -------> squad_memberships upsert
      |
      v
单球队事务提交 + checkpoint
      |
      v
完整性检查、重复检查、缺失字段报告、sync_runs 汇总
```

### 为什么不直接调用全量 Players 接口

`GET /players` 返回订阅可访问的所有球员，并不代表五大联赛当赛季球员。直接全量导入会带来以下问题：

- 数据范围明显过大，浪费分页请求和存储。
- 无法仅凭球员基础记录可靠确定其当赛季联赛和球队。
- 后续仍需阵容接口补齐归属关系。

因此，`players` 只作为按 ID 补全资料和增量更新的辅助接口，不作为初始数据源。

## 4. Sportmonks 接口设计

| 步骤 | 接口 | 用途 | 分页 |
| --- | --- | --- | --- |
| 联赛发现 | `GET /v3/football/leagues?include=currentSeason;country` | 找到五个联赛及当前赛季 | 按响应处理 |
| 赛季球队 | `GET /v3/football/teams/seasons/{seasonId}` | 获取参加该赛季的球队 | 是 |
| 当赛季阵容 | `GET /v3/football/squads/seasons/{seasonId}/teams/{teamId}?include=player;position` | 获取球员 ID、球队、赛季、位置和号码 | 否 |
| 球员补全 | `GET /v3/football/players/{playerId}?include=nationality;position;detailedPosition` | 阵容响应缺少基础字段时按 ID 补全 | 否 |
| 当前阵容交叉检查（可选） | `GET /v3/football/squads/teams/{teamId}?include=player;position;detailedPosition` | 排查赛季阵容与当前国内阵容差异 | 否 |
| 基础字段增量更新（可选） | `GET /v3/football/players/latest/` | 获取最近两小时基础字段发生变化的球员 | 否 |

### 4.1 联赛识别

- 不把文档示例中的数值 ID 当作永久配置。
- 每次运行先解析订阅实际可见的联赛，使用“规范化名称 + 国家 + `type=league` + `sub_type=domestic`”匹配。
- 首次 dry-run 输出五个联赛的 `league_id`、`season_id`、名称和赛季日期，人工确认后保存映射。
- 如果出现多个同名候选、缺少 `currentSeason` 或订阅不可访问，停止该联赛同步并明确报错，不能自动猜测。

### 4.2 球员字段与 include

优先从阵容的 `player` include 获取以下基础字段：

- `id`
- `common_name`、`firstname`、`lastname`、`name`、`display_name`
- `country_id`、`nationality_id`、`city_id`
- `position_id`、`detailed_position_id`
- `height`、`weight`、`date_of_birth`、`gender`
- `image_path`

`nationality` 和位置名称通过 include 或 Core 参考数据缓存补全。先用一支球队验证嵌套 include 是否受当前订阅支持；不支持时拆分为球员按 ID 查询和国家/位置缓存，不能因名称补全失败而丢弃球员 ID 和阵容关系。

注意：`country_id` 与 `nationality_id` 含义不同，后者表示球员选择代表的国家队，不能统一命名为“出生国家”。

### 4.3 请求规范

- API token 优先放在 `Authorization` 请求头，避免出现在 URL、日志和错误消息中。
- 每页请求 `per_page=50`，但不得假设所有端点都支持该参数。
- 初始采集使用低并发，默认 `1`，稳定后最多调整为 `2`。
- 每次请求设置超时，并记录不含秘密的 endpoint、entity ID、HTTP 状态和请求耗时。
- 不请求 `statistics`、`details`、`transfers` 等与本阶段无关的 include。

## 5. 数据库设计

所有 Sportmonks ID 使用 `BIGINT`，时间使用 `TIMESTAMPTZ`，上游原始记录使用 `JSONB`。表名和字段统一使用英文 snake_case。

### 5.1 `leagues`

保存五个联赛的稳定映射和当前赛季指针。

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT PRIMARY KEY` | Sportmonks league ID |
| `code` | `TEXT UNIQUE NOT NULL` | 五个本地代码之一 |
| `name` | `TEXT NOT NULL` | 上游联赛名称 |
| `country_id` | `BIGINT NULL` | 上游国家 ID |
| `country_name` | `TEXT NULL` | 国家名称快照 |
| `current_season_id` | `BIGINT NULL` | 当前赛季 ID |
| `active` | `BOOLEAN NOT NULL` | 上游 active |
| `raw` | `JSONB NOT NULL` | 原始联赛记录 |
| `synced_at` | `TIMESTAMPTZ NOT NULL` | 最近成功同步时间 |

### 5.2 `seasons`

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT PRIMARY KEY` | Sportmonks season ID |
| `league_id` | `BIGINT NOT NULL REFERENCES leagues(id)` | 所属联赛 |
| `name` | `TEXT NOT NULL` | 赛季名称 |
| `starting_at`、`ending_at` | `DATE NULL` | 赛季起止日期 |
| `is_current` | `BOOLEAN NOT NULL` | 是否当前赛季 |
| `raw` | `JSONB NOT NULL` | 原始赛季记录 |
| `synced_at` | `TIMESTAMPTZ NOT NULL` | 最近同步时间 |

`leagues.current_season_id` 的外键可在 `seasons` 创建后通过 `ALTER TABLE` 添加，避免循环建表问题。

### 5.3 `teams`

只保存球队基础资料，不在球队表中永久绑定一个联赛，因为球队会升降级。

| 字段 | 类型/约束 |
| --- | --- |
| `id` | `BIGINT PRIMARY KEY` |
| `name` | `TEXT NOT NULL` |
| `short_code` | `TEXT NULL` |
| `country_id` | `BIGINT NULL` |
| `image_path` | `TEXT NULL` |
| `founded` | `INTEGER NULL` |
| `placeholder` | `BOOLEAN NOT NULL DEFAULT false` |
| `raw` | `JSONB NOT NULL` |
| `synced_at` | `TIMESTAMPTZ NOT NULL` |

### 5.4 `team_seasons`

表示球队参加某赛季，主键为 `(season_id, team_id)`：

- `season_id`：引用 `seasons(id)`。
- `team_id`：引用 `teams(id)`。
- `first_seen_at`、`last_seen_at`：本地同步观察时间。
- `raw`：该赛季球队关系的原始记录（如需要）。

索引：`(team_id, season_id)`。

### 5.5 `players`

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT PRIMARY KEY` | Sportmonks player ID |
| `common_name` | `TEXT NULL` | 常用名 |
| `firstname`、`lastname` | `TEXT NULL` | 姓名组成部分 |
| `name` | `TEXT NULL` | 完整姓名 |
| `display_name` | `TEXT NULL` | 展示名 |
| `country_id` | `BIGINT NULL` | 国家字段，不与国籍混用 |
| `nationality_id` | `BIGINT NULL` | 代表队国籍 ID |
| `nationality_name` | `TEXT NULL` | 国籍名称快照 |
| `city_id` | `BIGINT NULL` | 城市 ID |
| `position_id`、`detailed_position_id` | `BIGINT NULL` | 位置 ID |
| `position_name`、`detailed_position_name` | `TEXT NULL` | 位置名称快照 |
| `height_cm` | `INTEGER NULL CHECK (height_cm > 0)` | 厘米 |
| `weight_kg` | `INTEGER NULL CHECK (weight_kg > 0)` | 千克 |
| `date_of_birth` | `DATE NULL` | 出生日期 |
| `gender` | `TEXT NULL` | 上游原始值 |
| `image_path` | `TEXT NULL` | 头像 URL |
| `raw` | `JSONB NOT NULL` | 原始球员记录 |
| `first_seen_at`、`last_seen_at` | `TIMESTAMPTZ NOT NULL` | 本地观察时间 |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | 本地记录更新时间 |

约束与规则：

- 至少保证 ID 有效；`display_name` 可按 `display_name → common_name → name` 顺序派生，但保留原始字段。
- 缺失身高、体重、出生日期必须为 `NULL`，不能写成 `0` 或空字符串日期。
- 球员可以出现在多个球队/赛季关系中，不能在 `players` 上增加唯一“当前球队”约束。
- 索引：`players(nationality_id)`、`players(position_id)`；名称搜索索引在明确查询需求后再添加。

### 5.6 `squad_memberships`

保存赛季阵容关系，而不是把球队 ID 直接覆盖到球员主表。

| 字段 | 类型/约束 | 说明 |
| --- | --- | --- |
| `id` | `BIGINT` | 上游阵容/球员赛季记录 ID |
| `season_id` | `BIGINT NOT NULL` | 赛季 |
| `team_id` | `BIGINT NOT NULL` | 球队 |
| `player_id` | `BIGINT NOT NULL` | 球员 |
| `position_id` | `BIGINT NULL` | 阵容位置 |
| `jersey_number` | `INTEGER NULL` | 号码，未知时为 NULL |
| `is_current` | `BOOLEAN NOT NULL DEFAULT true` | 最近一次完整球队同步是否仍出现 |
| `last_seen_run_id` | `UUID NULL` | 最近观察到该关系的运行 |
| `raw` | `JSONB NOT NULL` | 原始阵容记录 |
| `first_seen_at`、`last_seen_at` | `TIMESTAMPTZ NOT NULL` | 本地观察时间 |

- 主键建议为 `(season_id, id)`，并增加 `UNIQUE (season_id, team_id, player_id, id)` 防止重复写入。
- 外键分别引用 `seasons`、`teams`、`players`。
- 索引：`(season_id, team_id) WHERE is_current = true`、`(player_id, season_id)`。
- 如果实际响应证明上游 `id` 并非稳定阵容 ID，应在 migration 前改用独立代理键和内容哈希；不能盲目依赖示例。

### 5.7 `sync_runs` 与 `sync_checkpoints`

`sync_runs`：

- `id UUID PRIMARY KEY`
- `mode`：`full`、`team`、`profile_latest` 等
- `status`：`running`、`succeeded`、`partial`、`failed`
- `requested_leagues TEXT[]`
- `stats JSONB`：发现、插入、更新、跳过、失败数量
- `error TEXT`
- `started_at`、`finished_at`

`sync_checkpoints`：

- `scope TEXT PRIMARY KEY`，例如 `season:25598:team:62`
- `last_run_id UUID`
- `status TEXT`
- `cursor TEXT`
- `attempts INTEGER`
- `last_error TEXT`
- `updated_at TIMESTAMPTZ`

checkpoint 只保存恢复所需信息，不保存 token、数据库连接串或完整认证请求。

### 5.8 查询视图

创建 `current_top5_players` 视图，连接：

```text
leagues.current_season_id
  -> seasons
  -> team_seasons
  -> squad_memberships (is_current = true)
  -> teams
  -> players
```

视图输出联赛、赛季、球队、球员、位置、国籍、出生日期、身高、体重和头像等常用字段。若球员在同一赛季存在多条有效关系，视图原样保留关系并以来源记录区分，不能任意选一条。

## 6. 同步流程

### 6.1 首次全量同步

1. 校验 `DATABASE_URL`、`SPORTMONKS_TOKEN` 和数据库 migration 版本。
2. 创建 `sync_runs(status=running)`。
3. 请求联赛列表，匹配五个联赛并人工/配置确认映射。
4. upsert `leagues` 和 `seasons`，更新 `current_season_id`。
5. 分页读取每个赛季的球队，upsert `teams` 和 `team_seasons`。
6. 逐球队请求当赛季阵容，每支球队作为一个独立事务：
   - 校验响应结构和必填 ID。
   - 规范化并批量 upsert `players`。
   - 批量 upsert `squad_memberships`，写入 `last_seen_run_id`。
   - 仅当该球队响应完整且全部写入成功后，将本次未出现的旧关系标记为 `is_current=false`。
   - 更新 checkpoint 并提交。
7. 单球队失败时回滚该球队事务，记录错误并继续其他球队；最终运行状态为 `partial`。
8. 运行验收查询，生成按联赛和球队分组的记录数、缺失字段和失败报告。
9. 所有联赛和球队成功后，将运行状态更新为 `succeeded`。

### 6.2 幂等更新

- 所有实体通过稳定上游 ID 执行 `INSERT ... ON CONFLICT DO UPDATE`。
- 球员字段仅在上游提供有效新值时更新；避免较不完整的阵容 include 将已补全字段覆盖为 `NULL`。
- 原始 JSON 与规范化字段在同一次 upsert 中更新。
- 同一输入重复运行不应产生重复行；除同步时间和运行统计外，业务数据应保持一致。
- 每支球队事务内先做写入，再做缺失关系失效处理，避免部分响应造成误删。

### 6.3 日常增量与赛季切换

推荐默认策略：每日执行一次“当前赛季阵容全量对账”。它只处理五个联赛的球队，比全量球员库小，且能覆盖新增、转会和阵容移除。

- 每次运行重新读取 `currentSeason`，因此新赛季出现时自动创建新赛季关系，不覆盖历史赛季。
- 球员基础资料随阵容 include 一起更新。
- 可选增加 `/players/latest/` 高频任务，但必须按小于两小时的可靠间隔执行，并仅更新数据库中已存在的球员；否则可能引入五大联赛之外的球员。
- 每周可执行一次完整对账作为补偿，不依赖 `latest` 保证最终一致性。

## 7. 分页、限流与失败恢复

### 7.1 分页适配

统一分页器按以下规则工作：

1. 读取 `data` 和 `pagination`。
2. `has_more=false` 时结束。
3. 优先取 `pagination.next_cursor` 并作为下一次 `cursor` 参数。
4. 仅对明确仍使用 offset 的端点回退到 `page + 1`。
5. 检测空 cursor、重复 cursor、重复页面和超过最大页数，立即中止，避免无限循环。
6. checkpoint 记录最后成功页面；cursor 失效时从该球队或该实体第一页安全重放，利用 upsert 保证幂等。

### 7.2 限流与重试

- 读取响应中的 `rate_limit.remaining`、`resets_in_seconds` 等实际元数据，不硬编码订阅额度。
- 对 `429`、网络超时和可重试的 `5xx` 使用指数退避与随机抖动，并优先遵循 `Retry-After`。
- `400`/`422` 记录请求参数问题，不盲目重试。
- `401`/`403` 中止运行，检查 token、订阅和联赛权限。
- `404` 或空阵容需记录为覆盖异常并进入验收报告，不能静默当作成功。
- 达到重试上限后保留 checkpoint；重新运行时只处理失败或未完成的球队。

## 8. 配置与文件规划

### 8.1 配置项

MVP 实际复用：

- `DATABASE_URL`
- `SPORTMONKS_TOKEN`
- `SPORTMONKS_API_BASE`
- `REQUEST_TIMEOUT_MS`（限制在 `3000–60000` 毫秒）

MVP 新增并已写入 `.env.example` 和两份 README：

```text
PLAYER_SYNC_LEAGUES=epl,la_liga,serie_a,bundesliga,ligue_1
```

为保持最小实现，`per_page=50`、串行请求、最多 3 次重试和最多 100 页等参数固定在代码中；`PLAYER_SYNC_LEAGUES` 会逐项校验。秘密只存在 `.env`，禁止写入日志、数据库、API 响应或前端。

### 8.2 已实现文件结构

```text
db/migrations/001_create_top5_player_schema.sql
scripts/
  sync-top5-players.js
  verify-top5-players.js
  lib/
    env.js
    psql.js
    player-normalizer.js
    sportmonks-client.js
    import-sql.js
test/player-sync.test.js
doc/top-five-leagues-player-sync-plan.md
```

实现复用项目现有 terse CommonJS 风格、2 空格缩进、单引号和 `node:` 内置模块前缀。采集逻辑不放入 `server.js`，避免定时任务与 HTTP 服务生命周期耦合。

## 9. PostgreSQL 访问方式：MVP 实际选择

### 方案 A：新增 `pg` 依赖（生产增强候选）

优点：

- 支持原生参数化 SQL、连接池和跨环境一致的事务处理。
- 批量 upsert 与错误恢复可进一步模块化。

代价：

- 改变项目当前零 npm 依赖的约束，必须获得明确批准。

### 方案 B：保持零 npm 依赖（MVP 已采用）

MVP 使用 Node 内置 `fetch` 采集数据，将规范化 JSON 以 Base64 传入临时 SQL 文件，再由本机 `psql` 在单个事务中解析 `jsonb`、写入 staging 表并执行幂等 upsert。该方式避免 CSV 转义和依赖注入风险，`--dry-run` 在相同导入流程末尾执行 `ROLLBACK`。

优点：不修改 npm 依赖，且已在 Supabase 上验证事务、外键和回滚。

代价：

- 部署环境需要安装 PostgreSQL 客户端。
- SQL 生成逻辑比使用数据库驱动更集中，后续扩展统计或并发写入时维护成本较高。

若未来需要连接池、高频写入或脱离 `psql` 的部署，可在获得明确批准后升级到方案 A；当前未安装任何 npm 依赖。

## 10. 实施步骤

### 阶段 0：小范围预检

- 确认 token 对五个联赛和当前赛季的订阅覆盖。
- 每个联赛选择一个球队执行 dry-run，不写数据库。
- 保存脱敏 fixture，验证字段、include、分页和阵容 ID 稳定性。
- 确认 PostgreSQL 访问方案 A 或 B。

### 阶段 1：数据库 migration

- 在事务中创建表、约束、索引和视图。
- 添加 migration 执行说明与回滚说明。
- 先执行到 Supabase，再用 `information_schema` 和外键/约束查询验证。
- 当前没有业务表，不需要迁移或改写既有数据。

### 阶段 2：API 客户端与规范化

- 实现认证、超时、限流、重试、分页和结构化错误。
- 实现球员/球队/赛季/阵容规范化函数。
- 用本地 fixture 覆盖 `null`、字段缺失、重复记录和分页异常。

### 阶段 3：幂等入库与恢复

- 实现 repository、单球队事务、upsert、失效对账、sync run 和 checkpoint。
- 提供 `--dry-run`、`--league`、`--season`、`--team`、`--resume` 参数。
- 先完成一个球队，再扩展到一个联赛，最后运行五个联赛。

### 阶段 4：验收与调度

- 增加只读验证脚本和数据质量报告。
- 运行 `npm run check`、`npm test` 及新增同步测试。
- 文档更新后，再配置每日调度；调度失败不得影响现有 dashboard 服务。

## 11. 测试与验收标准

### 11.1 自动化测试

- 球员字段映射：姓名回退、国籍与出生国家区分、身高体重单位、日期和 NULL。
- 分页：cursor、旧 page、空页、重复 cursor、`has_more` 异常。
- 重试：429、超时、5xx、不可重试 4xx，且日志不含 token。
- 数据库：重复运行无重复行，失败球队事务完整回滚。
- 对账：只有完整成功的球队响应才会将缺失关系标记为非当前。
- 赛季切换：旧赛季保留，新 `currentSeason` 正确插入和关联。
- 安全：`DATABASE_URL` 和 token 不出现在前端、`/api/status`、日志或错误响应。

### 11.2 数据验收

- 五个本地联赛代码都映射到唯一联赛和有效当前赛季。
- 每个联赛的本地球队数等于该次 API 完整响应球队数；不硬编码固定球队数量。
- 每个成功球队都有阵容 checkpoint 和同步统计。
- `players.id`、`team_seasons` 主键和阵容唯一约束均无重复。
- 同一输入连续执行两次，球员、球队和阵容关系数量不异常增长。
- 所有球员均有有效上游 ID 和可用展示名；无法规范化的记录进入失败报告。
- 缺失出生日期、国籍、位置等字段被量化报告，但不得用虚假默认值填充。
- 失败球队不会被误判为“空阵容”，其旧数据不会因部分失败而失效。

示例验收查询：

```sql
SELECT l.code, s.id AS season_id,
       COUNT(DISTINCT ts.team_id) AS teams,
       COUNT(DISTINCT sm.player_id) AS players
FROM leagues l
JOIN seasons s ON s.id = l.current_season_id
LEFT JOIN team_seasons ts ON ts.season_id = s.id
LEFT JOIN squad_memberships sm
  ON sm.season_id = s.id AND sm.team_id = ts.team_id AND sm.is_current
GROUP BY l.code, s.id
ORDER BY l.code;
```

```sql
SELECT nationality_id, position_id,
       COUNT(*) FILTER (WHERE date_of_birth IS NULL) AS missing_dob,
       COUNT(*) FILTER (WHERE height_cm IS NULL) AS missing_height,
       COUNT(*) FILTER (WHERE weight_kg IS NULL) AS missing_weight,
       COUNT(*) AS total
FROM players
GROUP BY nationality_id, position_id
ORDER BY total DESC;
```

## 12. 安全与运维

- 数据库连接仅用于服务端离线脚本；永不暴露给浏览器。
- `.env` 继续由 Git 忽略，`.env.example` 只保留空值和示例。
- migration 和全量同步前保留 Supabase 备份/恢复入口；DDL 和单球队写入使用事务。
- 日志只记录联赛、赛季、球队、球员 ID 和必要错误摘要，不输出完整认证 URL。
- 不在生产 dashboard 请求路径中触发大规模同步。
- 对上游字段变化保持 tolerant parsing，但对 ID、记录类型和主键冲突严格报错。
- 原始 JSON 用于追踪，不表示可以绕过数据供应商的授权和缓存条款；上线前检查订阅的使用限制。

## 13. 完成定义（Definition of Done）

只有同时满足以下条件，第一阶段才算完成：

- 五个联赛当赛季球队和球员基础信息已写入 Supabase。
- 重放安全、失败可恢复、球队级事务和阵容失效对账均已验证。
- 数据质量报告可追溯，无静默跳过或虚构缺失值。
- 现有 `npm run check`、`npm test` 全部通过，新增同步测试通过。
- `.env.example`、中英文 README 和运行命令文档同步更新。
- 未泄露 token 或数据库凭据，未将同步依赖暴露到前端。

## 14. 官方资料

以下资料用于方案设计，访问日期均为 2026-11-05：

1. Sportmonks Players：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/players>
2. GET All Players：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/players/get-all-players>
3. GET Last Updated Players：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/players/get-last-updated-players>
4. Sportmonks Leagues：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/leagues>
5. GET Teams by Season ID：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/teams/get-teams-by-season-id>
6. Team Squads：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/squads>
7. GET Team Squad by Team and Season ID：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/team-squads/get-team-squads-by-team-and-season-id>
8. GET Team Squad by Team ID：<https://docs.sportmonks.com/football/endpoints-and-entities/endpoints/team-squads/get-team-squads-by-team-id>
9. Sportmonks 集成与当前分页说明（2026-09-18 更新）：<https://www.sportmonks.com/blogs/sportmonks-football-api-integration-with-php-a-comprehensive-guide/>
