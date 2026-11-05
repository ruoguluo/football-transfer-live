# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project overview

Football transfer dashboard ("Transfer Radar"): a zero-dependency Node.js server that proxies the Sportmonks Football API, normalizes confirmed transfers and rumours, and serves a vanilla HTML/CSS/JS frontend. When no API token is configured, or when the upstream fails and fallback is enabled, the app serves clearly labeled demo data.

- **Runtime:** Node.js >= 18 (uses the built-in `fetch`)
- **Dependencies:** none — do not run `npm install`, and do not add npm packages without explicit approval
- **Build step:** none
- **Language:** CommonJS (`require`) on the server; plain browser JavaScript on the client
- **UI language:** Simplified Chinese (`zh-CN`); code identifiers and comments are English

## Commands

```bash
npm start       # start on http://127.0.0.1:4173 (demo mode without a token)
npm run check   # syntax-check server.js, public/app.js, smoke-test.js
npm test        # end-to-end smoke tests (starts mock upstream + app instances)
```

Run both `npm run check` and `npm test` after any change. Tests use random free ports, a local mock Sportmonks server, and no real token or network access.

## Repository layout

```text
server.js          # config, Sportmonks proxy, normalization, cache, fallback, static server
public/
  index.html       # page structure and detail dialog
  styles.css       # responsive styles and accessibility support
  app.js           # fetch, filter, render, and UI interactions
smoke-test.js      # end-to-end tests with a mocked upstream
.env.example       # environment variable template (never put real secrets here)
README.MD          # Chinese documentation (primary)
README.EN.MD       # English documentation
```

## Architecture notes

- `server.js` is intentionally a single file: env loading → config → demo data → normalization → upstream fetch → cache/fallback → HTTP server. Follow that ordering when adding code.
- Frontend state, rendering, and event wiring all live in `public/app.js`; there is no framework, bundler, or module system.
- The server exposes only `GET`/`HEAD` on `/api/status`, `/api/movements`, and static files under `public/`. Other methods return `405`.
- Data is cached in process memory only. Do not introduce external state (databases, Redis, filesystem caches) unless explicitly requested.
- `demo` and `live` modes are distinct; keep demo records clearly labeled as fictional and never present them as real transfers.
- Rumours are not confirmed transfers. Preserve the `confirmed`/`rumour` distinction, source, and probability in any new code or UI.

## Data contract

Normalized records use: `kind`, `player`, `from`, `to`, `type`, `status`, `announcedAt`, `updatedAt`, `feeText`, `feeMillions`, `feeDisclosed`, `probability`, `sourceName`, `sourceUrl`, `raw`.

- Keep `feeMillions` as `null` when the fee is undisclosed. Never coerce a missing fee to `0`; `0` specifically means a free transfer.
- Respect `SPORTMONKS_FEE_SCALE` (`eur`, `million`, `raw`) when formatting amounts.
- Upstream field mapping is intentionally tolerant (alternative field names via `relation()`); preserve that tolerance when editing normalization.
- The raw upstream record stays in `raw` for traceability.

## Configuration

All configuration is environment-based and documented in `.env.example` and both READMEs. When adding or changing a variable:

1. Add it to `.env.example`.
2. Add validation/clamping in the `config` object in `server.js` (use `truthy()` for booleans and `numeric()` with min/max for numbers).
3. Document it in `README.MD` and `README.EN.MD`.
4. Expose it via `/api/status` only if it is non-secret and useful to the frontend.

Shell environment variables take precedence over `.env`. Never expose `SPORTMONKS_TOKEN` to the browser or include it in API responses.

## Coding conventions

- 2-space indentation, single quotes, semicolons, trailing commas where already used.
- Prefix Node built-ins with `node:` (`node:http`, `node:fs/promises`).
- Prefer small named functions and arrow helpers, matching the existing terse style.
- Escape all interpolated values with `escapeHtml()` before inserting into HTML, and validate external URLs with `safeUrl()` (HTTP/HTTPS only).
- Keep the frontend dependency-free and compatible with modern evergreen browsers.
- Preserve accessibility behavior (keyboard activation, focus handling, `aria-*`, reduced-motion support) when touching markup or interactions.
- Keep both READMEs in sync when user-facing behavior, configuration, or the API changes.

## Security and repository hygiene

- Never commit `.env`, API tokens, credentials, or the local `.workbuddy-ai/` workspace memory; `.gitignore` already covers them.
- Do not weaken the static-file path-traversal check in `serveStatic()`, the `safeUrl()` protocol allowlist, HTML escaping, or the API security headers.
- Do not log the API token or include it in error messages.
- Do not commit generated artifacts or new dependencies unless explicitly requested.
- Commit messages use imperative English (e.g., `Add ...`, `Fix ...`), matching existing history.

## Verification checklist

- [ ] `npm run check` passes
- [ ] `npm test` passes
- [ ] App still works in demo mode without `SPORTMONKS_TOKEN`
- [ ] Live-mode changes preserve timeout, cache, cooldown, and fallback behavior
- [ ] API remains `GET`/`HEAD`-only and `/api/status` leaks no secrets
- [ ] Demo records remain labeled as fictional
- [ ] Docs updated if config, API, or behavior changed
