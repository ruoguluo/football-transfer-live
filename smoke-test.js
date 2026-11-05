'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const SERVER_PATH = path.join(ROOT, 'server.js');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  response.end(payload);
}

function createMockServer(port) {
  const confirmed = {
    data: [{
      id: 901,
      player_id: 12,
      from_team_id: 1,
      to_team_id: 2,
      type_id: 219,
      date: '2026-11-05',
      completed: true,
      completed_at: '2026-11-05T08:00:00Z',
      updated_at: '2026-11-05T09:00:00Z',
      amount: 42000000,
      currency: 'EUR',
      player: { display_name: '测试球员' },
      fromTeam: { name: '测试转出队' },
      toTeam: { name: '测试转入队' },
      type: { name: '付费转会' }
    }],
    pagination: { has_more: false }
  };
  const rumours = {
    data: [{
      id: 455,
      player_id: 34,
      from_team_id: 3,
      to_team_id: 4,
      status_id: 90323,
      date: '2026-11-05',
      updated_at: '2026-11-05T10:00:00Z',
      amount: 41000000,
      currency: 'EUR',
      probability: 'IMMINENT',
      source_name: '测试媒体',
      source_url: 'https://example.com/report',
      player: { display_name: '测试传闻球员' },
      fromTeam: { name: '传闻转出队' },
      toTeam: { name: '潜在下家' },
      type: { name: 'Loan' },
      status: { name: 'Recent Rumour' }
    }]
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.searchParams.get('api_token') !== 'test-token') {
      return sendJson(response, 401, { message: 'missing test token' });
    }
    if (url.pathname.startsWith('/down/')) {
      return sendJson(response, 500, { message: 'simulated upstream outage' });
    }
    if (url.pathname.endsWith('/transfers/latest')) {
      return sendJson(response, 200, confirmed);
    }
    if (url.pathname.endsWith('/transfer-rumours')) {
      if (url.pathname.startsWith('/fail/')) {
        return sendJson(response, 403, { message: 'rumours add-on unavailable' });
      }
      return sendJson(response, 200, rumours);
    }
    return sendJson(response, 404, { message: 'unknown mock endpoint' });
  });

  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function startApp(port, overrides) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      SPORTMONKS_TOKEN: '',
      SPORTMONKS_RUMOURS: 'true',
      SPORTMONKS_MAX_PAGES: '1',
      SPORTMONKS_FEE_SCALE: 'eur',
      CACHE_TTL_MS: '60000',
      REQUEST_TIMEOUT_MS: '3000',
      ENABLE_DEMO_FALLBACK: 'true',
      ...overrides
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics += chunk.toString(); });
  child.stderr.on('data', chunk => { diagnostics += chunk.toString(); });
  child.diagnostics = () => diagnostics;
  return child;
}

async function fetchJson(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForApp(port, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`App exited early: ${child.diagnostics()}`);
    }
    try {
      const result = await fetchJson(port, '/api/status');
      if (result.status === 200) return;
    } catch (_) {
      /* The server is still starting. */
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`App did not become ready: ${child.diagnostics()}`);
}

function rawGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: requestPath, method: 'GET' }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function main() {
  const mockPort = await freePort();
  const mockServer = await createMockServer(mockPort);
  const children = [];

  try {
    const demoPort = await freePort();
    const demoApp = startApp(demoPort, { SPORTMONKS_TOKEN: '' });
    children.push(demoApp);
    await waitForApp(demoPort, demoApp);

    const demoStatus = await fetchJson(demoPort, '/api/status');
    assert.equal(demoStatus.status, 200);
    assert.equal(demoStatus.body.mode, 'demo');
    assert.equal(demoStatus.body.tokenConfigured, false);

    const demoFeed = await fetchJson(demoPort, '/api/movements');
    assert.equal(demoFeed.status, 200);
    assert.equal(demoFeed.body.mode, 'demo');
    assert.equal(demoFeed.body.records.length, 10);
    assert.equal(demoFeed.body.counts.confirmed, 6);
    assert.equal(demoFeed.body.counts.rumour, 4);
    assert.equal(JSON.stringify(demoFeed).includes('test-token'), false);

    const page = await fetch(`http://127.0.0.1:${demoPort}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /转会动态雷达/);
    const css = await fetch(`http://127.0.0.1:${demoPort}/styles.css`);
    assert.equal(css.status, 200);
    const traversal = await rawGet(demoPort, '/%2e%2e%2fserver.js');
    assert.equal(traversal.status, 403);

    const livePort = await freePort();
    const liveApp = startApp(livePort, {
      SPORTMONKS_TOKEN: 'test-token',
      SPORTMONKS_API_BASE: `http://127.0.0.1:${mockPort}/v3/football`
    });
    children.push(liveApp);
    await waitForApp(livePort, liveApp);

    const liveFeed = await fetchJson(livePort, '/api/movements');
    assert.equal(liveFeed.status, 200);
    assert.equal(liveFeed.body.mode, 'live');
    assert.equal(liveFeed.body.counts.confirmed, 1);
    assert.equal(liveFeed.body.counts.rumour, 1);
    const confirmedRecord = liveFeed.body.records.find(record => record.kind === 'confirmed');
    assert.equal(confirmedRecord.player, '测试球员');
    assert.equal(confirmedRecord.from, '测试转出队');
    assert.equal(confirmedRecord.to, '测试转入队');
    assert.equal(confirmedRecord.feeText, '€42M');
    assert.equal(confirmedRecord.status, '已完成');
    const rumourRecord = liveFeed.body.records.find(record => record.kind === 'rumour');
    assert.equal(rumourRecord.player, '测试传闻球员');
    assert.equal(rumourRecord.feeText, '报道金额 €41M');
    assert.equal(rumourRecord.probability, 'IMMINENT');
    assert.equal(rumourRecord.sourceUrl, 'https://example.com/report');
    const liveStatus = await fetchJson(livePort, '/api/status');
    assert.equal(liveStatus.body.rumoursStatus, 'ok');

    const partialPort = await freePort();
    const partialApp = startApp(partialPort, {
      SPORTMONKS_TOKEN: 'test-token',
      SPORTMONKS_API_BASE: `http://127.0.0.1:${mockPort}/fail/v3/football`
    });
    children.push(partialApp);
    await waitForApp(partialPort, partialApp);
    const partialFeed = await fetchJson(partialPort, '/api/movements');
    assert.equal(partialFeed.body.mode, 'live');
    assert.equal(partialFeed.body.counts.confirmed, 1);
    assert.equal(partialFeed.body.counts.rumour, 0);
    assert.equal(partialFeed.body.status.rumoursStatus, 'unavailable');
    assert.ok(partialFeed.body.warnings.length > 0);

    const downPort = await freePort();
    const downApp = startApp(downPort, {
      SPORTMONKS_TOKEN: 'test-token',
      SPORTMONKS_API_BASE: `http://127.0.0.1:${mockPort}/down/v3/football`,
      ENABLE_DEMO_FALLBACK: 'false'
    });
    children.push(downApp);
    await waitForApp(downPort, downApp);
    const downFeed = await fetchJson(downPort, '/api/movements');
    assert.equal(downFeed.status, 502);

    console.log('Smoke tests passed: demo mode, live normalization, rumour degradation, outage handling, static assets and path traversal protection.');
  } finally {
    for (const child of children) child.kill('SIGTERM');
    await Promise.all(children.map(child => new Promise(resolve => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 1500).unref();
    })));
    mockServer.closeAllConnections();
    mockServer.close();
  }
}

main().catch(error => {
  console.error(`Smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
