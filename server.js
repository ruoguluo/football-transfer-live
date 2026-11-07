'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const STATIC_DIR = path.join(ROOT, 'dist');
const ENV_PATH = path.join(ROOT, '.env');

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const truthy = (value, fallback) => value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
const numeric = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: numeric(process.env.PORT, 4173, 1, 65535),
  token: (process.env.SPORTMONKS_TOKEN || '').trim(),
  apiBase: (process.env.SPORTMONKS_API_BASE || 'https://api.sportmonks.com/v3/football').replace(/\/+$/, ''),
  rumoursEnabled: truthy(process.env.SPORTMONKS_RUMOURS, true),
  maxPages: numeric(process.env.SPORTMONKS_MAX_PAGES, 2, 1, 5),
  feeScale: ['eur', 'million', 'raw'].includes((process.env.SPORTMONKS_FEE_SCALE || '').toLowerCase())
    ? (process.env.SPORTMONKS_FEE_SCALE || '').toLowerCase()
    : 'eur',
  cacheTtlMs: numeric(process.env.CACHE_TTL_MS, 900000, 60000, 86400000),
  requestTimeoutMs: numeric(process.env.REQUEST_TIMEOUT_MS, 12000, 3000, 60000),
  demoFallback: truthy(process.env.ENABLE_DEMO_FALLBACK, true),
  manualRefreshCooldownMs: 60000
};

const DEMO_START = Date.now();
const hoursAgo = hours => new Date(DEMO_START - hours * 3600000).toISOString();
const DEMO_RECORDS = [
  { id: 'demo-c-1', kind: 'confirmed', player: '示例前锋 01', playerId: 'demo-p-01', from: '本菲卡', to: '切尔西', date: hoursAgo(3).slice(0, 10), announcedAt: hoursAgo(3), updatedAt: hoursAgo(2), type: '永久转会', status: '已完成', feeText: '€42M', feeMillions: 42, feeDisclosed: true, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-c-2', kind: 'confirmed', player: '示例中场 02', playerId: 'demo-p-02', from: '多特蒙德', to: '皇家马德里', date: hoursAgo(9).slice(0, 10), announcedAt: hoursAgo(9), updatedAt: hoursAgo(8), type: '永久转会', status: '已完成', feeText: '€28M', feeMillions: 28, feeDisclosed: true, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-c-3', kind: 'confirmed', player: '示例后卫 03', playerId: 'demo-p-03', from: '阿贾克斯', to: '巴塞罗那', date: hoursAgo(20).slice(0, 10), announcedAt: hoursAgo(20), updatedAt: hoursAgo(18), type: '自由转会', status: '已公布', feeText: '自由转会', feeMillions: 0, feeDisclosed: true, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-r-1', kind: 'rumour', player: '示例边锋 04', playerId: 'demo-p-04', from: 'AC 米兰', to: '阿森纳', date: hoursAgo(5).slice(0, 10), announcedAt: hoursAgo(5), updatedAt: hoursAgo(4), type: '转会传闻', status: '近期传闻', feeText: '报道金额 €55M', feeMillions: 55, feeDisclosed: true, probability: 'IMMINENT', sourceName: '演示媒体 A', sourceUrl: null, sourceKind: 'demo', note: '演示传闻，不代表真实报道。' },
  { id: 'demo-c-4', kind: 'confirmed', player: '示例门将 05', playerId: 'demo-p-05', from: '波尔图', to: '曼城', date: hoursAgo(30).slice(0, 10), announcedAt: hoursAgo(30), updatedAt: hoursAgo(29), type: '租借', status: '已完成', feeText: '未披露', feeMillions: null, feeDisclosed: false, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-r-2', kind: 'rumour', player: '示例前锋 06', playerId: 'demo-p-06', from: '巴黎圣日耳曼', to: '拜仁慕尼黑', date: hoursAgo(41).slice(0, 10), announcedAt: hoursAgo(41), updatedAt: hoursAgo(40), type: '转会传闻', status: '近期传闻', feeText: '报道金额 €70M', feeMillions: 70, feeDisclosed: true, probability: 'HIGH', sourceName: '演示媒体 B', sourceUrl: null, sourceKind: 'demo', note: '演示传闻，不代表真实报道。' },
  { id: 'demo-c-5', kind: 'confirmed', player: '示例中场 07', playerId: 'demo-p-07', from: '皇家社会', to: '利物浦', date: hoursAgo(72).slice(0, 10), announcedAt: hoursAgo(72), updatedAt: hoursAgo(71), type: '永久转会', status: '已完成', feeText: '€36M', feeMillions: 36, feeDisclosed: true, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-r-3', kind: 'rumour', player: '示例后卫 08', playerId: 'demo-p-08', from: '尤文图斯', to: '托特纳姆热刺', date: hoursAgo(96).slice(0, 10), announcedAt: hoursAgo(96), updatedAt: hoursAgo(95), type: '租借传闻', status: '近期传闻', feeText: '金额未披露', feeMillions: null, feeDisclosed: false, probability: 'MEDIUM', sourceName: '演示媒体 C', sourceUrl: null, sourceKind: 'demo', note: '演示传闻，不代表真实报道。' },
  { id: 'demo-c-6', kind: 'confirmed', player: '示例边锋 09', playerId: 'demo-p-09', from: '布莱顿', to: '马德里竞技', date: hoursAgo(140).slice(0, 10), announcedAt: hoursAgo(140), updatedAt: hoursAgo(139), type: '永久转会', status: '已完成', feeText: '€24M', feeMillions: 24, feeDisclosed: true, probability: null, sourceName: '本地演示数据', sourceUrl: null, sourceKind: 'demo', note: '演示记录，不代表真实转会。' },
  { id: 'demo-r-4', kind: 'rumour', player: '示例中场 10', playerId: 'demo-p-10', from: '勒沃库森', to: '曼联', date: hoursAgo(190).slice(0, 10), announcedAt: hoursAgo(190), updatedAt: hoursAgo(189), type: '续约传闻', status: '已过时', feeText: '不适用', feeMillions: null, feeDisclosed: false, probability: 'LOW', sourceName: '演示媒体 D', sourceUrl: null, sourceKind: 'demo', note: '演示传闻，不代表真实报道。' }
].map(record => ({ ...record, raw: { demo: true, id: record.id } }));

const runtime = {
  payload: null,
  fetchedAt: 0,
  lastAttemptAt: 0,
  lastError: null,
  confirmedCount: 0,
  rumourCount: 0,
  rumoursStatus: config.rumoursEnabled ? 'pending' : 'disabled'
};

const TYPE_IDS = {
  218: '租借',
  219: '付费转会',
  220: '自由转会',
  9688: '租借结束'
};
const STATUS_IDS = {
  90319: '已确认传闻',
  90320: '已否定传闻',
  90321: '过时传闻',
  90322: '状态不明',
  90323: '近期传闻'
};

function relation(item, ...names) {
  for (const name of names) {
    if (item[name] && typeof item[name] === 'object') return item[name];
  }
  return null;
}

function pickName(value, fallback = '未知') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return fallback;
  return value.display_name || value.name || value.fullname || value.common_name || value.short_code || fallback;
}

function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch (_) {
    return null;
  }
}

function compactNumber(value) {
  const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

function formatFee(amount, currency) {
  if (amount === null || amount === undefined || amount === '') {
    return { feeText: '未披露', feeMillions: null, feeDisclosed: false, feeRaw: null };
  }
  const symbol = !currency || currency === 'EUR' ? '€' : `${currency} `;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    if (amount === 0) {
      return { feeText: '自由转会 / 无费用', feeMillions: 0, feeDisclosed: true, feeRaw: amount };
    }
    if (config.feeScale === 'raw') {
      return { feeText: `${symbol}${amount.toLocaleString('en-US')}（接口原值）`, feeMillions: null, feeDisclosed: true, feeRaw: amount };
    }
    const millions = config.feeScale === 'million' ? amount : amount / 1000000;
    return { feeText: `${symbol}${compactNumber(millions)}M`, feeMillions: millions, feeDisclosed: true, feeRaw: amount };
  }
  const text = String(amount).trim();
  const numericText = Number(text.replace(/[^0-9.-]/g, ''));
  return {
    feeText: text,
    feeMillions: Number.isFinite(numericText) ? numericText : null,
    feeDisclosed: true,
    feeRaw: amount
  };
}

function normalizeDate(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizeConfirmed(item, nowIso) {
  const player = relation(item, 'player');
  const fromTeam = relation(item, 'fromTeam', 'fromteam', 'from_team');
  const toTeam = relation(item, 'toTeam', 'toteam', 'to_team');
  const type = relation(item, 'type');
  const fee = formatFee(item.amount, item.currency);
  const announcedAt = normalizeDate(item.date || item.completed_at || item.updated_at, nowIso);
  return {
    id: `sm-confirmed-${item.id}`,
    kind: 'confirmed',
    player: pickName(player, '未命名球员'),
    playerId: item.player_id != null ? String(item.player_id) : null,
    from: pickName(fromTeam, '未披露'),
    to: pickName(toTeam, '未披露'),
    fromTeamId: item.from_team_id != null ? String(item.from_team_id) : null,
    toTeamId: item.to_team_id != null ? String(item.to_team_id) : null,
    date: announcedAt.slice(0, 10),
    announcedAt,
    updatedAt: normalizeDate(item.updated_at || item.completed_at || item.date, announcedAt),
    type: pickName(type, TYPE_IDS[item.type_id] || '转会'),
    status: item.completed ? '已完成' : '已公布',
    completed: Boolean(item.completed),
    feeText: fee.feeText,
    feeMillions: fee.feeMillions,
    feeDisclosed: fee.feeDisclosed,
    probability: null,
    sourceName: 'Sportmonks',
    sourceUrl: null,
    sourceKind: 'confirmed-api',
    note: '来自 Sportmonks 已确认转会接口。费用口径以服务商返回值为准。',
    raw: item
  };
}

function normalizeRumour(item, nowIso) {
  const player = relation(item, 'player');
  const fromTeam = relation(item, 'fromTeam', 'fromteam', 'from_team');
  const toTeam = relation(item, 'toTeam', 'toteam', 'to_team');
  const type = relation(item, 'type');
  const status = relation(item, 'status');
  const fee = formatFee(item.amount ?? item.reported_fee, item.currency);
  const announcedAt = normalizeDate(item.date || item.updated_at, nowIso);
  return {
    id: `sm-rumour-${item.id}`,
    kind: 'rumour',
    player: pickName(player, '未命名球员'),
    playerId: item.player_id != null ? String(item.player_id) : null,
    from: pickName(fromTeam, '未披露'),
    to: pickName(toTeam, '潜在下家未披露'),
    fromTeamId: item.from_team_id != null ? String(item.from_team_id) : null,
    toTeamId: item.to_team_id != null ? String(item.to_team_id) : null,
    date: announcedAt.slice(0, 10),
    announcedAt,
    updatedAt: normalizeDate(item.updated_at || item.date, announcedAt),
    type: pickName(type, '转会传闻'),
    status: pickName(status, STATUS_IDS[item.status_id] || '近期传闻'),
    completed: false,
    feeText: fee.feeDisclosed ? `报道金额 ${fee.feeText}` : fee.feeText,
    feeMillions: fee.feeMillions,
    feeDisclosed: fee.feeDisclosed,
    probability: item.probability || item.probability_rating || null,
    sourceName: item.source_name || '未署名来源',
    sourceUrl: safeUrl(item.source_url || item.source_link),
    sourceKind: 'rumour-api',
    note: '转会传闻，不是官方确认交易。应结合来源与概率判断。',
    raw: item
  };
}

function buildUrl(endpoint, params) {
  const url = new URL(`${config.apiBase}/${endpoint.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    let body = null;
    try {
      body = await response.json();
    } catch (_) {
      body = null;
    }
    if (!response.ok) {
      const error = new Error(body?.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchConfirmed() {
  const items = [];
  for (let page = 1; page <= config.maxPages; page += 1) {
    const url = buildUrl('transfers/latest', {
      api_token: config.token,
      include: 'player;fromTeam;toTeam;type;position',
      per_page: 50,
      page,
      order: 'desc'
    });
    const body = await fetchJson(url);
    const data = Array.isArray(body?.data) ? body.data : [];
    items.push(...data);
    const hasMore = body?.pagination?.has_more === true ||
      (body?.pagination?.has_more === undefined && data.length === 50 && page < config.maxPages);
    if (!hasMore) break;
  }
  const nowIso = new Date().toISOString();
  return items.map(item => normalizeConfirmed(item, nowIso));
}

async function fetchRumours() {
  const url = buildUrl('transfer-rumours', {
    api_token: config.token,
    include: 'player;fromTeam;toTeam;type;status'
  });
  const body = await fetchJson(url);
  const data = Array.isArray(body?.data) ? body.data : [];
  const nowIso = new Date().toISOString();
  return data.map(item => normalizeRumour(item, nowIso));
}

function demoPayload(reason, warnings = []) {
  return {
    mode: 'demo',
    provider: '本地演示数据集',
    fetchedAt: new Date().toISOString(),
    cacheTtlMs: config.cacheTtlMs,
    records: DEMO_RECORDS,
    warnings: [reason, ...warnings].filter(Boolean),
    counts: {
      confirmed: DEMO_RECORDS.filter(record => record.kind === 'confirmed').length,
      rumour: DEMO_RECORDS.filter(record => record.kind === 'rumour').length
    },
    status: {
      tokenConfigured: Boolean(config.token),
      rumoursEnabled: config.rumoursEnabled,
      rumoursStatus: config.rumoursEnabled ? 'unavailable' : 'disabled',
      lastError: runtime.lastError
    }
  };
}

function summarizeError(error) {
  const status = Number.isInteger(error?.status) ? `HTTP ${error.status}` : '网络或超时错误';
  return `上游请求失败（${status}）`;
}

async function getPayload(force = false) {
  const now = Date.now();
  if (!config.token) return demoPayload('当前未配置 SPORTMONKS_TOKEN，展示本地演示数据。');

  if (runtime.payload && !force && now - runtime.fetchedAt < config.cacheTtlMs) return runtime.payload;
  if (force && runtime.payload && now - runtime.lastAttemptAt < config.manualRefreshCooldownMs) {
    return {
      ...runtime.payload,
      warnings: [...runtime.payload.warnings, '手动刷新过于频繁，已返回缓存结果。']
    };
  }

  runtime.lastAttemptAt = now;
  const warnings = [];
  const [confirmedResult, rumourResult] = await Promise.allSettled([
    fetchConfirmed(),
    config.rumoursEnabled ? fetchRumours() : Promise.resolve([])
  ]);

  if (confirmedResult.status === 'rejected') {
    runtime.lastError = summarizeError(confirmedResult.reason);
    if (config.demoFallback) return demoPayload(`${runtime.lastError}，已自动切换演示模式。`);
    const error = new Error(runtime.lastError);
    error.status = 502;
    throw error;
  }

  let rumours = [];
  if (rumourResult.status === 'rejected') {
    runtime.rumoursStatus = 'unavailable';
    warnings.push(`转会传闻接口不可用（${Number.isInteger(rumourResult.reason?.status) ? `HTTP ${rumourResult.reason.status}` : '网络错误'}）；已确认转会仍正常展示。请确认 Growth/Pro 套餐及 Transfer Rumours add-on。`);
  } else {
    rumours = rumourResult.value;
    runtime.rumoursStatus = config.rumoursEnabled ? 'ok' : 'disabled';
  }

  const records = [...confirmedResult.value, ...rumours].sort((a, b) =>
    new Date(b.announcedAt) - new Date(a.announcedAt) || new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  const fetchedAt = new Date().toISOString();
  runtime.payload = {
    mode: 'live',
    provider: 'Sportmonks',
    fetchedAt,
    cacheTtlMs: config.cacheTtlMs,
    records,
    warnings,
    counts: {
      confirmed: confirmedResult.value.length,
      rumour: rumours.length
    },
    status: {
      tokenConfigured: true,
      rumoursEnabled: config.rumoursEnabled,
      rumoursStatus: runtime.rumoursStatus,
      lastError: null
    }
  };
  runtime.fetchedAt = Date.now();
  runtime.confirmedCount = confirmedResult.value.length;
  runtime.rumourCount = rumours.length;
  runtime.lastError = null;
  return runtime.payload;
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(payload);
}

function jsonError(response, statusCode, message) {
  sendJson(response, statusCode, { error: { message, status: statusCode } });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

async function serveStatic(response, pathname, method) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (_) {
    return jsonError(response, 400, '请求路径无效');
  }
  let relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  if (decoded !== '/' && (decoded.endsWith('/') || !path.extname(relative))) {
    relative = `${relative.replace(/\/+$/, '')}/index.html`;
  }
  const filePath = path.resolve(STATIC_DIR, relative);
  if (!filePath.startsWith(`${STATIC_DIR}${path.sep}`)) {
    return jsonError(response, 403, '禁止访问该路径');
  }
  try {
    const content = await fsp.readFile(filePath);
    const isImmutableAsset = relative.startsWith('assets/');
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return jsonError(response, 404, '页面不存在');
    return jsonError(response, 500, '读取静态资源失败');
  }
}

if (!fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  console.error('未找到前端构建产物 dist/index.html，请先运行 npm run build。');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  let pathname = '/';
  let searchParams = new URLSearchParams();
  try {
    const parsed = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    pathname = parsed.pathname;
    searchParams = parsed.searchParams;
  } catch (_) {
    return jsonError(response, 400, '请求地址无效');
  }

  if (pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method)) return jsonError(response, 405, '仅支持 GET 请求');
    try {
      if (pathname === '/api/status') {
        return sendJson(response, 200, {
          mode: config.token ? 'live-ready' : 'demo',
          provider: 'Sportmonks',
          tokenConfigured: Boolean(config.token),
          rumoursEnabled: config.rumoursEnabled,
          feeScale: config.feeScale,
          cacheTtlMs: config.cacheTtlMs,
          manualRefreshCooldownMs: config.manualRefreshCooldownMs,
          demoFallback: config.demoFallback,
          cachedAt: runtime.payload?.fetchedAt || null,
          lastError: runtime.lastError,
          confirmedCount: runtime.confirmedCount,
          rumourCount: runtime.rumourCount,
          rumoursStatus: runtime.rumoursStatus
        });
      }
      if (pathname === '/api/movements') {
        const force = searchParams.get('refresh') === '1';
        const limit = clamp(Number.parseInt(searchParams.get('limit') || '120', 10) || 120, 1, 200);
        const payload = await getPayload(force);
        return sendJson(response, 200, {
          ...payload,
          records: payload.records.slice(0, limit)
        });
      }
      return jsonError(response, 404, '接口不存在');
    } catch (error) {
      const statusCode = error.status || 500;
      const message = error.status ? error.message : '服务暂时不可用';
      return jsonError(response, statusCode, message);
    }
  }

  if (!['GET', 'HEAD'].includes(request.method)) return jsonError(response, 405, '仅支持 GET 请求');
  return serveStatic(response, pathname, request.method);
});

server.listen(config.port, config.host, () => {
  const mode = config.token ? '实时模式（已配置 API Token）' : '演示模式（未配置 API Token）';
  console.log(`转会动态雷达已启动：http://${config.host}:${config.port}`);
  console.log(`运行模式：${mode}`);
});
