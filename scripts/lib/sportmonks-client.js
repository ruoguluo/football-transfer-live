'use strict';

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function redact(message, token) {
  return String(message || '').split(token).join('[REDACTED]').slice(0, 300);
}

function buildUrl(apiBase, path, params = {}) {
  const url = new URL(`${apiBase}/${String(path).replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}

function extractNextUrl(next, apiBase, path, params) {
  if (!next) return null;
  try {
    return new URL(next);
  } catch {
    const url = buildUrl(apiBase, path, params);
    url.searchParams.delete('per_page');
    url.searchParams.delete('page');
    url.searchParams.set('cursor', String(next));
    return url;
  }
}

function createClient({ token, apiBase, timeoutMs = 12000, maxRetries = 3 }) {
  if (!token) throw new Error('SPORTMONKS_TOKEN is missing.');

  async function requestUrl(url, attempt = 0) {
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(250 * (2 ** attempt));
        return requestUrl(url, attempt + 1);
      }
      throw new Error(`Network error for ${url.pathname}: ${error.message}`);
    }

    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    if (!response.ok) {
      const retryAfter = Number.parseInt(response.headers.get('retry-after') || '', 10);
      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * (2 ** attempt);
        await sleep(Math.min(delay, 10000));
        return requestUrl(url, attempt + 1);
      }
      throw new Error(`HTTP ${response.status} for ${url.pathname}: ${redact(body?.message || raw, token)}`);
    }
    if (!body || !Array.isArray(body.data)) {
      throw new Error(`Invalid response for ${url.pathname}: missing data array.`);
    }
    return body;
  }

  async function request(path, params = {}) {
    return requestUrl(buildUrl(apiBase, path, params));
  }

  async function fetchAll(path, params = {}, maxPages = 100) {
    const rows = [];
    const seenUrls = new Set();
    const initialParams = { ...params };
    if (initialParams.per_page === undefined) initialParams.per_page = '50';
    let nextUrl = buildUrl(apiBase, path, initialParams);
    for (let pages = 0; pages < maxPages; pages += 1) {
      if (seenUrls.has(nextUrl.href)) throw new Error(`Repeated pagination URL for ${path}.`);
      seenUrls.add(nextUrl.href);
      const body = await requestUrl(nextUrl);
      rows.push(...body.data);
      const pagination = body.pagination || {};
      const hasMore = pagination.has_more === true || Boolean(pagination.next_page);
      if (!hasMore) return rows;
      const next = pagination.next_cursor || pagination.next_page;
      const following = extractNextUrl(next, apiBase, path, params);
      if (!following) throw new Error(`Missing pagination link for ${path}.`);
      nextUrl = following;
    }
    throw new Error(`Pagination exceeded ${maxPages} pages for ${path}.`);
  }

  return { request, fetchAll, requestUrl };
}

module.exports = { createClient, extractNextUrl };
