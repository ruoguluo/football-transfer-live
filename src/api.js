async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return body;
}

export async function fetchDashboard(force = false) {
  const suffix = force ? '?refresh=1' : '';
  const [payload, status] = await Promise.all([
    fetchJson(`/api/movements${suffix}`),
    fetchJson('/api/status')
  ]);
  return { payload, status };
}
