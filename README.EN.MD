# Transfer Radar

[中文](README.MD)

A football transfer dashboard built with native Node.js and vanilla JavaScript. The server retrieves confirmed transfers and transfer rumours from the Sportmonks Football API, normalizes fields, fees, and timestamps, and presents them in a unified timeline. When no API token is configured or the upstream service fails, the application can use local demo data according to its configuration.

## Features

- **Confirmed transfers and rumours kept distinct**: Clearly separates confirmed transactions from media rumours to avoid conflating different kinds of data.
- **Unified movement timeline**: Displays the player, source and destination clubs, transaction type, status, fee, source, and update time.
- **Flexible filtering**: Supports keyword search, confirmed/rumour filters, and 24-hour, 7-day, 30-day, and all-time windows.
- **Record details**: Inspect rumour probability, source links, normalized fields, and the original upstream payload.
- **Server-side credential isolation**: The Sportmonks token is used only by the server and is never sent to the browser.
- **Caching and graceful degradation**: Includes in-memory caching, request timeouts, a manual-refresh cooldown, and independent degradation for the rumours endpoint.
- **Ready-to-use demo mode**: Without a token, the application displays 10 local sample records that do not represent real transfers.
- **Responsive and accessible UI**: Supports desktop and mobile layouts, keyboard interaction, reduced-motion preferences, and semantic status announcements.

## Technology Stack

- Node.js 18 or later, using the built-in `fetch` API
- Native `node:http` server for static files and JSON APIs
- HTML, CSS, and JavaScript without a frontend framework or build step
- Sportmonks Football API v3

The project has no third-party npm runtime dependencies, so `npm install` is not required.

## Quick Start

### 1. Prerequisites

Verify that Node.js 18 or later is installed:

```bash
node --version
```

### 2. Start in Demo Mode

```bash
npm start
```

Open <http://127.0.0.1:4173> by default.

When `SPORTMONKS_TOKEN` is not configured, the dashboard automatically uses local demo data.

### 3. Connect to Live Sportmonks Data

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
```

### Fee Units

`SPORTMONKS_FEE_SCALE` must match the actual units returned by the upstream API:

- `eur`: Treats the value as an absolute EUR amount. For example, `42000000` is displayed as `€42M`.
- `million`: Treats the value as millions of EUR. For example, `42` is displayed as `€42M`.
- `raw`: Displays the original value without conversion and does not generate a normalized amount in millions of EUR.

A fee of `0` is displayed as a free transfer/no fee. A missing fee is displayed as “Undisclosed” and represented internally as `null`, not `0`.

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
├── public/
│   ├── index.html      # Page structure and details dialog
│   ├── styles.css      # Responsive styling and accessibility support
│   └── app.js          # Data loading, filtering, rendering, and interactions
├── server.js           # Static server, API proxy, normalization, cache, and fallback
├── smoke-test.js       # End-to-end smoke tests using a local mock upstream
├── package.json        # Start, syntax-check, and test scripts
├── README.MD           # Chinese documentation
└── README.EN.MD        # English documentation
```

## Checks and Tests

Run JavaScript syntax checks:

```bash
npm run check
```

Run the smoke tests:

```bash
npm test
```

The tests start a local mock Sportmonks server and several temporary application instances. They cover:

- Demo mode and record counts
- Live-data field and fee normalization
- Partial degradation when the rumours endpoint is unavailable
- HTTP `502` responses after upstream failures with fallback disabled
- Static asset delivery and path-traversal protection

Tests use random available ports. They require neither a real Sportmonks token nor external network access.

## Security and Deployment Considerations

- Do not commit `.env`, API tokens, or other credentials to version control, and never place tokens in `public/`.
- The server listens on `127.0.0.1` by default. Before exposing it to a LAN or the public internet, evaluate access control, HTTPS, reverse proxying, rate limiting, and logging.
- The current cache and runtime state exist only in the memory of a single Node.js process. They are not suitable for shared caching across multiple instances or persistence requirements.
- This project does not include user authentication or a database and should not be treated as a complete production deployment by itself.
- Confirmed transfers and media rumours have different levels of reliability. Rumours are not official confirmations, and their sources and probabilities should be preserved.
- Before commercially reselling or extensively displaying upstream content, review the Sportmonks contract for licensing, caching, and attribution requirements.
