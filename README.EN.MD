# Transfer Radar

[中文](README.MD)

A football transfer dashboard with a native Node.js server and a React frontend. The server retrieves confirmed transfers and transfer rumours from the Sportmonks Football API, normalizes fields, fees, and timestamps, and presents them in a unified timeline. The frontend is built with React 19 and Vite, and the production bundle is served by the same Node process. When no API token is configured or the upstream service fails, the application can use local demo data according to its configuration.

## Features

- **Confirmed transfers and rumours kept distinct**: Clearly separates confirmed transactions from media rumours to avoid conflating different kinds of data.
- **Unified movement timeline**: Displays the player, source and destination clubs, transaction type, status, fee, source, and update time.
- **Flexible filtering**: Supports keyword search, confirmed/rumour filters, and 24-hour, 7-day, 30-day, and all-time windows.
- **Record details**: Inspect rumour probability, source links, normalized fields, and the original upstream payload.
- **Server-side credential isolation**: The Sportmonks token is used only by the server and is never sent to the browser.
- **Caching and graceful degradation**: Includes in-memory caching, request timeouts, a manual-refresh cooldown, and independent degradation for the rumours endpoint.
- **Ready-to-use demo mode**: Without a token, the application displays 10 local sample records that do not represent real transfers.
- **Component-based frontend**: React 19 manages page state and interactions, Vite provides the development server and production build, and the Node server serves the `dist/` bundle.
- **Responsive and accessible UI**: Supports desktop and mobile layouts, keyboard interaction, reduced-motion preferences, and semantic status announcements.

## Technology Stack

- Node.js 18 or later, using the built-in `fetch` API
- Native `node:http` server for static files and JSON APIs
- React 19 + Vite 6 for component-based UI, hot module replacement, and production builds
- Sportmonks Football API v3

The server runtime still has no third-party npm dependencies, but the frontend build requires React, Vite, and related development dependencies. Run `npm install` once; `npm start` builds the frontend before starting the server.

## Quick Start

### 1. Prerequisites

Verify that Node.js 18 or later is installed:

```bash
node --version
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start in Demo Mode

```bash
npm start
```

Open <http://127.0.0.1:4173> by default.

`npm start` runs the Vite production build first, generates `dist/`, and then starts the Node server. When `SPORTMONKS_TOKEN` is not configured, the dashboard automatically uses local demo data.

### 4. Connect to Live Sportmonks Data

Create a `.env` file in the project root:

```dotenv
SPORTMONKS_TOKEN=your_sportmonks_api_token
```

Restart the server:

```bash
npm start
```

Configuration can also be supplied through shell environment variables. Existing shell environment variables take precedence over entries with the same name in `.env`.

> Confirmed transfers use the `transfers/latest` endpoint, while transfer rumours use `transfer-rumours`. Rumour availability depends on the Sportmonks plan and the Transfer Rumours add-on. If the rumours endpoint is unavailable, confirmed transfers remain visible and the dashboard displays a degradation warning.

## Frontend Development and Build

Production build:

```bash
npm run build
```

The build output goes to `dist/` and is served directly by `server.js`. Files under `dist/assets/` have content-hashed names and receive a long-lived immutable cache header; `index.html` uses `no-cache` so a new release is picked up immediately.

During local development, Vite provides hot module replacement and proxies `/api` requests to `127.0.0.1:4173`. Use two terminals:

```bash
# Terminal 1: Node API (builds dist once before starting)
npm start

# Terminal 2: Vite development server
npm run dev
```

Open <http://127.0.0.1:5173> for development. If you only change the frontend, you can start the API with `npm run dev:api`, but run `npm run build` once first because `server.js` checks that `dist/index.html` exists.

Preview the production build:

```bash
npm run preview
```

The preview server runs at <http://127.0.0.1:4174> and proxies `/api` to `127.0.0.1:4173`; keep the Node API server running.

## Configuration

All settings can be defined in a `.env` file in the project root or supplied as process environment variables.

| Environment variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Server bind address; by default, only local connections are accepted |
| `PORT` | `4173` | Server port, from `1` to `65535` |
| `SPORTMONKS_TOKEN` | Empty | Sportmonks API token; demo mode is used when empty |
| `SPORTMONKS_API_BASE` | `https://api.sportmonks.com/v3/football` | Sportmonks API base URL; trailing slashes are removed |
| `SPORTMONKS_RUMOURS` | `true` | Whether to request the transfer rumours endpoint |
| `SPORTMONKS_MAX_PAGES` | `2` | Maximum confirmed-transfer pages to retrieve, from `1` to `5`, with 50 records per page |
| `SPORTMONKS_FEE_SCALE` | `eur` | Fee unit: `eur` (absolute EUR), `million` (millions of EUR), or `raw` (preserve the upstream value) |
| `CACHE_TTL_MS` | `900000` | In-memory live-data cache TTL, from `60000` to `86400000` milliseconds |
| `REQUEST_TIMEOUT_MS` | `12000` | Timeout for each upstream request, from `3000` to `60000` milliseconds |
| `ENABLE_DEMO_FALLBACK` | `true` | Whether to fall back to demo data when the confirmed-transfers endpoint fails |
| `DATABASE_URL` | Empty | Supabase PostgreSQL URL used only by the offline player sync script; the HTTP server neither reads nor exposes it |
| `PLAYER_SYNC_LEAGUES` | `epl,la_liga,serie_a,bundesliga,ligue_1` | Comma-separated league codes for the offline sync script |

Boolean values accept `1`, `true`, `yes`, and `on` (case-insensitive) as true. Any other explicitly set non-empty value is treated as false.

Full live-mode configuration example:

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

### Fee Units

`SPORTMONKS_FEE_SCALE` must match the actual units returned by the upstream API:

- `eur`: Treats the value as an absolute EUR amount. For example, `42000000` is displayed as `€42M`.
- `million`: Treats the value as millions of EUR. For example, `42` is displayed as `€42M`.
- `raw`: Displays the original value without conversion and does not generate a normalized amount in millions of EUR.

A fee of `0` is displayed as a free transfer/no fee. A missing fee is displayed as “Undisclosed” and represented internally as `null`, not `0`.

## Top-Five-League Player Sync (MVP)

An offline script, separate from the HTTP server, imports current-season teams, squads, and basic player profiles for the Premier League, La Liga, Serie A, Bundesliga, and Ligue 1 into Supabase. It uses Node's built-in `fetch` and the local `psql` client, adds no npm dependency, and never exposes `DATABASE_URL` through `/api/status` or the frontend.

Prerequisites:

- `psql` is available locally, or `PSQL_PATH` points to a PostgreSQL client.
- `.env` contains a valid `DATABASE_URL` and `SPORTMONKS_TOKEN`.
- The Sportmonks subscription covers all five target leagues; the free plan covers only the Danish Superliga and Scottish Premiership and cannot complete a top-five sync.
- The database migration has been applied.

```bash
npm run migrate:players     # Create tables, indexes, and the current_top5_players view
npm run sync:players:dry    # Fetch and import inside a transaction, then roll back
npm run sync:players        # Persist current-season teams and player data
npm run verify:players      # Report league counts, missing fields, and the latest sync
```

`--dry-run` still validates the API, normalization, foreign keys, upserts, and SQL transaction, but ends with `ROLLBACK` and leaves no business rows. A narrow smoke test against one league visible to the current subscription can be run with:

```bash
node scripts/sync-top5-players.js --league-id=501 --code=smoke --team-limit=1 --dry-run
```

Data is written to `leagues`, `seasons`, `teams`, `team_seasons`, `players`, `squad_memberships`, `sync_runs`, and `sync_checkpoints`. The common query view is `current_top5_players`. The full design and acceptance criteria are in `doc/top-five-leagues-player-sync-plan.md`.

### Scottish Premiership Demo Data

The Football Free Plan can access the Scottish Premiership, so it can be used to validate the complete ingestion, storage, and presentation path. These are real upstream records, but they are explicitly labeled as a demo dataset through `leagues.is_demo=true` and the `demo_scottish_premiership` code. They are excluded from `current_top5_players` and are never treated as top-five-league target data.

```bash
npm run sync:demo                  # Persist all current-season Scottish Premiership teams and players
npm run sync:demo:transfers        # Batch-import confirmed transfer histories for those players
npm run sync:demo:transfers:dry    # Transactional dry-run, then roll back
npm run sync:socials               # Import public social links from data/player-socials.json
npm run sync:socials:dry           # Validate and roll back
npm run demo:report                # Generate the player list, detail page, and shared static data
npm run verify:players             # Report top-five, demo, transfer, and social statistics
```

Transfer histories are fetched in batches with `filters=transferPlayers:<IDs>` plus `include=fromTeam;toTeam;type`, with team and type reference data as a fallback, and stored in `player_transfers`. `populate` is not used because it strips includes and would degrade team names to `Team #ID`. The `player_transfer_history` view provides a query with player names. Only confirmed transfers are included; rumours are excluded.

### Public Social Media

The current Sportmonks Football API v3 `Player` entity has no social-media field or include. `metadata` types and team `socials` in the Free Plan samples do not provide player public social links either. The “公开社媒” column therefore defaults to “暂未收录” and never fabricates links from player names.

To add verified public links, edit `data/player-socials.json`. Array elements use this shape:

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

`url` and `source_url` accept HTTP/HTTPS only. `verified=true` means the link was manually verified locally. After editing, run `npm run sync:socials` to write `public.player_socials`, then `npm run demo:report` to refresh the static pages.

The static pages are:

- `doc/scottish-premiership-demo.html`: search, team filtering, player table, and public-social-media column; click a player name to open the detail page.
- `doc/player-detail.html?playerId=<ID>`: player profile, current teams, public social media, and transfer history.
- `doc/demo-data.js`: shared static snapshot for both pages.

The pages display Sportmonks HTTPS avatars. Upstream placeholder images, failed loads, or unsafe URLs fall back to player initials without using a third-party placeholder service. None of these pages connects to the database or contains an API token or database URL. The `current_demo_players` view is available for direct queries.

## Usage

- On page load, the dashboard automatically requests the local `/api/movements` and `/api/status` endpoints.
- Click **Refresh** to trigger manual synchronization. When a live cache already exists, manual refreshes are subject to a 60-second cooldown.
- While the page is visible, it automatically requests fresh data every 5 minutes. The server still returns cached data until the cache TTL expires.
- Search covers players, clubs, sources, transaction types, and statuses. Press `/` to focus the search field.
- Click a record card, or focus it and press Enter or Space, to open its details.
- The frontend renders at most the first 100 filtered records.

## API

The server accepts only `GET` and `HEAD` requests. Other methods return `405`.

### `GET /api/status`

Returns a configuration summary and runtime status without exposing the API token.

Key fields:

| Field | Description |
| --- | --- |
| `mode` | `demo` or `live-ready` |
| `tokenConfigured` | Whether a token has been configured |
| `rumoursEnabled` | Whether the rumours endpoint is enabled |
| `rumoursStatus` | `pending`, `ok`, `unavailable`, or `disabled` |
| `cacheTtlMs` | Cache TTL |
| `cachedAt` | Fetch time of the current live-data cache |
| `lastError` | Summary of the most recent upstream error |

Example:

```bash
curl http://127.0.0.1:4173/api/status
```

### `GET /api/movements`

Returns normalized transfer records, counts, the data mode, warnings, and status information.

Query parameters:

| Parameter | Default | Description |
| --- | --- | --- |
| `limit` | `120` | Maximum number of records to return, from `1` to `200` |
| `refresh` | None | Set to `1` to request a forced refresh, subject to the manual-refresh cooldown |

Examples:

```bash
curl "http://127.0.0.1:4173/api/movements?limit=20"
curl "http://127.0.0.1:4173/api/movements?refresh=1"
```

Core fields in each record include:

- `kind`: `confirmed` or `rumour`
- `player`, `from`, `to`, `type`, and `status`
- `announcedAt` and `updatedAt`
- `feeText`, `feeMillions`, and `feeDisclosed`
- `probability`, `sourceName`, and `sourceUrl`
- `raw`: The original upstream record for verifying field mappings

## Data Flow and Fallback Behavior

```text
Sportmonks API
  ├─ transfers/latest
  └─ transfer-rumours
          ↓
Node.js server-side proxy
  ├─ Token isolation, timeouts, and pagination
  ├─ Field and fee normalization
  └─ In-memory caching and error fallback
          ↓
Browser dashboard
```

The application behaves as follows:

1. **No token configured**: Returns local demo data directly.
2. **Rumours endpoint fails**: Keeps confirmed transfers available, retains `mode` as `live`, and adds a warning.
3. **Confirmed-transfers endpoint fails with demo fallback enabled**: Returns demo data together with the failure reason.
4. **Confirmed-transfers endpoint fails with demo fallback disabled**: Returns HTTP `502`.
5. **Cache remains valid**: Normal requests return the in-memory cache. The cache is cleared when the server restarts.

## Project Structure

```text
football-transfer-live/
├── db/migrations/      # Supabase schema migrations
├── doc/                # Player sync design, acceptance notes, and static demo page
├── public/             # Static files copied as-is, including deployment-only /demo/ pages
├── src/
│   ├── components/     # Header, stats, feed, details dialog, and other React components
│   ├── App.jsx         # Page state, data loading, and filtering
│   ├── api.js          # Local API requests
│   ├── main.jsx        # React entry point
│   ├── styles.css      # Responsive styling and accessibility support
│   └── utils.js        # Time, fee, and URL helpers
├── scripts/            # Offline player sync, transactional import, and verification
├── test/               # Normalization and import logic unit tests
├── dist/               # Vite build output (Git-ignored, generated before deployment)
├── index.html          # Vite HTML entry
├── vite.config.js      # Vite configuration and development proxy
├── .env.example        # Environment variable template
├── .gitignore          # Version-control ignore rules
├── LICENSE             # MIT license
├── README.EN.MD        # English documentation
├── README.MD           # Chinese documentation
├── package.json        # Project metadata, build, start, sync, check, and test scripts
├── server.js           # Static server, API proxy, normalization, cache, and fallback
└── smoke-test.js       # End-to-end smoke tests using a local mock upstream
```

## Checks and Tests

Run the frontend build and JavaScript syntax checks:

```bash
npm run check
```

Run end-to-end smoke tests plus player normalization and transactional import unit tests:

```bash
npm test
```

`npm test` runs the production build first, then the tests. The tests start a local mock Sportmonks server and several temporary application instances. They cover:

- Demo mode and record counts
- Live-data field and fee normalization
- Partial degradation when the rumours endpoint is unavailable
- HTTP `502` responses after upstream failures with fallback disabled
- Built HTML plus hashed JS/CSS asset delivery and cache headers
- Static asset path-traversal protection
- Player fields, league matching, connection-string parsing, and transaction rollback logic

Tests use random available ports. They require neither a real Sportmonks token nor external network access.

## Security and Deployment Considerations

- Do not commit `.env`, API tokens, or other credentials to version control, and never place tokens in `public/`, `src/`, or any file that Vite bundles into the frontend.
- Only variables prefixed with `VITE_` are exposed to the browser. This project needs no frontend secrets; do not add any.
- The server listens on `127.0.0.1` by default. Before exposing it to a LAN or the public internet, evaluate access control, HTTPS, reverse proxying, rate limiting, and logging.
- The current cache and runtime state exist only in the memory of a single Node.js process. They are not suitable for shared caching across multiple instances or persistence requirements.
- This project does not include user authentication. The HTTP server itself does not read the database; the offline sync script writes to Supabase using `DATABASE_URL` from `.env`, which is never returned by `/api/status` or sent to the frontend.
- Deploy by running `npm ci` and `npm run build`, then starting `node server.js`; `dist/` is a required runtime artifact and should not be committed to Git. On shared hosts such as `bwg`, the systemd unit can still run `node server.js` directly as long as the release process includes the build step.
- If `public/demo/` is used for static demo pages, place the files there before building; Vite copies them to `dist/demo/`.
- This project should not be treated as a complete production deployment by itself.
- Confirmed transfers and media rumours have different levels of reliability. Rumours are not official confirmations, and their sources and probabilities should be preserved.
- Before commercially reselling or extensively displaying upstream content, review the Sportmonks contract for licensing, caching, and attribution requirements.

## License

The source code and documentation in this repository are released under the [MIT License](LICENSE). Copyright (c) 2026 Russell Luo.

The MIT License covers only the code and documentation in this repository. It does not grant rights to Sportmonks API data, whose use, caching, and display remain subject to the provider's terms.
