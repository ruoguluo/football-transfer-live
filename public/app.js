'use strict';

const state = {
  records: [],
  payload: null,
  status: null,
  kind: 'all',
  window: '7d',
  query: '',
  loading: false
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const normalize = value => String(value ?? '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

function relativeTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '时间未知';
  const diff = Date.now() - time;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
}

function absoluteTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

function clubCode(name) {
  const text = String(name || '').trim();
  if (!text) return '--';
  if (/^[A-Za-z]/.test(text)) {
    return text.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase();
  }
  return text.slice(0, 2);
}

const probabilityMeta = {
  IMMINENT: { label: '接近完成', className: 'imminent' },
  HIGH: { label: '可能性较高', className: 'high' },
  MEDIUM: { label: '可能性中等', className: 'medium' },
  LOW: { label: '可能性较低', className: '' }
};

function probabilityBadge(record) {
  if (record.kind !== 'rumour' || !record.probability) return '';
  const key = String(record.probability).toUpperCase();
  const meta = probabilityMeta[key] || { label: record.probability, className: '' };
  return `<span class="probability ${meta.className}">${escapeHtml(meta.label)}</span>`;
}

function sourceMarkup(record) {
  const url = safeUrl(record.sourceUrl);
  if (url) {
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.sourceName)}</a>`;
  }
  return escapeHtml(record.sourceName || '来源未标注');
}

function cardMarkup(record) {
  const isRumour = record.kind === 'rumour';
  return `<article class="feed-card ${isRumour ? 'rumour' : 'confirmed'}" data-id="${escapeHtml(record.id)}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(record.player)} 的记录详情">
    <div class="feed-card-top">
      <div class="badge-group">
        <span class="kind-badge ${isRumour ? 'rumour' : 'confirmed'}">${isRumour ? '转会传闻' : '已确认转会'}</span>
        <span class="status-badge">${escapeHtml(record.status || '')}</span>
        ${probabilityBadge(record)}
      </div>
      <time class="feed-time" datetime="${escapeHtml(record.announcedAt)}">${relativeTime(record.announcedAt)}</time>
    </div>
    <h3>${escapeHtml(record.player)} <span class="status-badge">· ${escapeHtml(record.type || '')}</span></h3>
    <div class="feed-route">
      <span class="club"><span class="club-code">${escapeHtml(clubCode(record.from))}</span>${escapeHtml(record.from)}</span>
      <span class="route-arrow" aria-hidden="true">→</span>
      <span class="club"><span class="club-code">${escapeHtml(clubCode(record.to))}</span>${escapeHtml(record.to)}</span>
    </div>
    <div class="feed-meta">
      <span class="fee">${escapeHtml(record.feeText || '金额未披露')}</span>
      <span class="source-line">来源：${sourceMarkup(record)}</span>
    </div>
    <p class="feed-note">${escapeHtml(record.note || '')}</p>
  </article>`;
}

function filteredRecords() {
  const query = normalize(state.query.trim());
  const windowDays = { '24h': 1, '7d': 7, '30d': 30, all: Infinity }[state.window] ?? 7;
  const cutoff = windowDays === Infinity ? -Infinity : Date.now() - windowDays * 86400000;
  return state.records.filter(record => {
    const timestamp = new Date(record.announcedAt).getTime();
    const haystack = normalize(`${record.player} ${record.from} ${record.to} ${record.sourceName} ${record.type} ${record.status}`);
    return (state.kind === 'all' || record.kind === state.kind) &&
      (!query || haystack.includes(query)) &&
      (Number.isNaN(timestamp) || timestamp >= cutoff);
  }).sort((a, b) => new Date(b.announcedAt) - new Date(a.announcedAt) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderFeed() {
  const records = filteredRecords();
  const visible = records.slice(0, 100);
  $('#feed-list').innerHTML = visible.map(cardMarkup).join('');
  $('#feed-empty').hidden = records.length > 0;
  $('#result-count').textContent = `显示 ${visible.length} / ${records.length} 条`;
  const mode = state.payload?.mode === 'live' ? '实时接口' : '本地演示数据';
  $('#feed-footnote').textContent = `当前来源：${mode}。点击任一记录可查看规范化字段与接口原始值。最多渲染前 100 条结果。`;
}

function renderOverview() {
  const payload = state.payload;
  const isLive = payload?.mode === 'live';
  const pill = $('#connection-status');
  pill.className = `status-pill ${isLive ? 'live' : 'demo'}`;
  pill.innerHTML = `<span class="status-dot"></span><strong>${isLive ? '实时连接' : '演示模式'}</strong>`;

  $('#stat-confirmed').textContent = payload?.counts?.confirmed ?? '--';
  $('#stat-rumour').textContent = payload?.counts?.rumour ?? '--';
  $('#stat-updated').textContent = payload?.fetchedAt ? relativeTime(payload.fetchedAt) : '--';
  $('#stat-mode').textContent = isLive ? 'Sportmonks' : 'Demo';

  const notice = $('#notice');
  if (!isLive) {
    notice.hidden = false;
    notice.innerHTML = `<strong>演示模式：</strong>${escapeHtml(payload?.warnings?.[0] || '当前展示本地示例数据。')} 将 <code>SPORTMONKS_TOKEN</code> 写入项目根目录的 <code>.env</code> 并重启服务即可切换为实时数据；密钥不会进入浏览器。`;
  } else if (payload?.warnings?.length) {
    notice.hidden = false;
    notice.innerHTML = `<strong>部分数据降级：</strong>${escapeHtml(payload.warnings.join(' '))}`;
  } else {
    notice.hidden = true;
  }

  const cacheMinutes = Math.round((state.status?.cacheTtlMs || payload?.cacheTtlMs || 900000) / 60000);
  const feeScaleText = { eur: 'EUR 绝对值', million: '百万 EUR', raw: '接口原值' }[state.status?.feeScale] || 'EUR 绝对值';
  const rumoursClass = payload?.status?.rumoursStatus === 'ok' ? 'ok' : payload?.status?.rumoursStatus === 'disabled' ? '' : 'warn';
  const rumoursText = { ok: '正常', unavailable: '不可用', disabled: '已关闭', pending: '待同步' }[payload?.status?.rumoursStatus] || '未知';
  $('#source-list').innerHTML = [
    ['运行模式', isLive ? '实时接口' : '演示数据', isLive ? 'ok' : 'warn'],
    ['数据服务商', escapeHtml(payload?.provider || '--'), ''],
    ['API 密钥', state.status?.tokenConfigured ? '服务端已配置' : '未配置', state.status?.tokenConfigured ? 'ok' : 'warn'],
    ['缓存时长', `${cacheMinutes} 分钟`, ''],
    ['传闻接口', rumoursText, rumoursClass],
    ['费用单位', feeScaleText, ''],
    ['最近同步', payload?.fetchedAt ? escapeHtml(absoluteTime(payload.fetchedAt)) : '--', '']
  ].map(([label, value, className]) => `<div class="source-row"><dt>${label}</dt><dd class="${className}">${value}</dd></div>`).join('');

  const warnings = payload?.warnings || [];
  $('#warning-list').innerHTML = warnings.map(warning => `<div class="warning-item">${escapeHtml(warning)}</div>`).join('');
}

function renderAll() {
  renderOverview();
  renderFeed();
}

let toastTimer;
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

async function loadData(force = false) {
  if (state.loading) return;
  state.loading = true;
  const button = $('#refresh-button');
  button.disabled = true;
  button.querySelector('span').textContent = '同步中';
  try {
    const suffix = force ? '?refresh=1' : '';
    const [payload, status] = await Promise.all([
      fetchJson(`/api/movements${suffix}`),
      fetchJson('/api/status')
    ]);
    state.records = Array.isArray(payload.records) ? payload.records : [];
    state.payload = payload;
    state.status = status;
    renderAll();
    if (force) showToast(payload.mode === 'live' ? '已完成一次手动同步' : '演示数据已重新载入');
  } catch (error) {
    const pill = $('#connection-status');
    pill.className = 'status-pill error';
    pill.innerHTML = '<span class="status-dot"></span><strong>连接失败</strong>';
    $('#notice').hidden = false;
    $('#notice').innerHTML = `<strong>无法读取本地接口：</strong>${escapeHtml(error.message)}。请确认 Node 服务仍在运行。`;
    showToast('数据同步失败');
  } finally {
    state.loading = false;
    button.disabled = false;
    button.querySelector('span').textContent = '刷新';
  }
}

function openDetails(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  const fields = [
    ['类型', record.kind === 'rumour' ? '转会传闻' : '已确认转会'],
    ['状态', record.status],
    ['球员 ID', record.playerId || '未提供'],
    ['转会类型', record.type],
    ['费用', record.feeText],
    ['概率', record.probability || '不适用'],
    ['首次记录', absoluteTime(record.announcedAt)],
    ['最近更新', absoluteTime(record.updatedAt)],
    ['来源', record.sourceName],
    ['来源链接', record.sourceUrl || '无']
  ];
  $('#details-content').innerHTML = `<div class="details-header"><p>RECORD DETAIL</p><h2>${escapeHtml(record.player)}</h2><span>${escapeHtml(record.from)} → ${escapeHtml(record.to)}</span></div><div class="details-body"><div class="detail-grid">${fields.map(([label, value]) => `<div class="detail-item"><span>${label}</span><strong>${escapeHtml(value || '--')}</strong></div>`).join('')}</div><div class="raw-title">接口原始字段<span>用于核对字段映射</span></div><pre id="raw-record"></pre></div>`;
  $('#raw-record').textContent = JSON.stringify(record.raw || {}, null, 2);
  $('#details-dialog').showModal();
}

function clearFilters() {
  state.kind = 'all';
  state.window = '7d';
  state.query = '';
  $('#search-input').value = '';
  $('#window-filter').value = '7d';
  $$('#kind-filters button').forEach(button => button.classList.toggle('active', button.dataset.kind === 'all'));
  renderFeed();
}

function bindEvents() {
  $('#search-input').addEventListener('input', event => {
    state.query = event.target.value;
    renderFeed();
  });
  $('#kind-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-kind]');
    if (!button) return;
    state.kind = button.dataset.kind;
    $$('#kind-filters button').forEach(item => item.classList.toggle('active', item === button));
    renderFeed();
  });
  $('#window-filter').addEventListener('change', event => {
    state.window = event.target.value;
    renderFeed();
  });
  $('#clear-filters').addEventListener('click', clearFilters);
  $('#refresh-button').addEventListener('click', () => loadData(true));

  $('#feed-list').addEventListener('click', event => {
    if (event.target.closest('a')) return;
    const card = event.target.closest('[data-id]');
    if (card) openDetails(card.dataset.id);
  });
  $('#feed-list').addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('feed-card')) {
      event.preventDefault();
      openDetails(event.target.dataset.id);
    }
  });
  $('#details-close').addEventListener('click', () => $('#details-dialog').close());
  $('#details-dialog').addEventListener('click', event => {
    const dialog = $('#details-dialog');
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      $('#search-input').focus();
    }
  });
  setInterval(() => {
    if (!document.hidden && !state.loading) loadData(false);
  }, 300000);
}

bindEvents();
loadData(false);
