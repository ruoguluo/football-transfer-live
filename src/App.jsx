import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDashboard } from './api.js';
import DetailsDialog from './components/DetailsDialog.jsx';
import FeedPanel from './components/FeedPanel.jsx';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Notice from './components/Notice.jsx';
import SideColumn from './components/SideColumn.jsx';
import StatsGrid from './components/StatsGrid.jsx';
import Toast from './components/Toast.jsx';
import { normalize } from './utils.js';

const EMPTY_FILTERS = { kind: 'all', window: '7d', query: '' };
const WINDOW_DAYS = { '24h': 1, '7d': 7, '30d': 30, all: Infinity };
const MAX_VISIBLE_RECORDS = 100;

function indexRecords(records) {
  return records.map(record => {
    const announcedTime = Date.parse(record.announcedAt);
    const updatedTime = Date.parse(record.updatedAt);
    return {
      ...record,
      announcedTime: Number.isNaN(announcedTime) ? null : announcedTime,
      updatedTime: Number.isNaN(updatedTime) ? null : updatedTime,
      searchText: normalize(`${record.player} ${record.from} ${record.to} ${record.sourceName} ${record.type} ${record.status}`)
    };
  }).sort((a, b) => (b.announcedTime ?? 0) - (a.announcedTime ?? 0) || (b.updatedTime ?? 0) - (a.updatedTime ?? 0));
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const loadingRef = useRef(false);
  const toastTimerRef = useRef(null);

  const showToast = useCallback(message => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const loadData = useCallback(async (force = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const { payload: nextPayload, status: nextStatus } = await fetchDashboard(force);
      setRecords(Array.isArray(nextPayload.records) ? nextPayload.records : []);
      setPayload(nextPayload);
      setStatus(nextStatus);
      setConnectionError(null);
      if (force) showToast(nextPayload.mode === 'live' ? '已完成一次手动同步' : '演示数据已重新载入');
    } catch (error) {
      setConnectionError(error.message);
      showToast('数据同步失败');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && !loadingRef.current) loadData(false);
    }, 300000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const indexedRecords = useMemo(() => indexRecords(records), [records]);

  const filteredRecords = useMemo(() => {
    const query = normalize(deferredQuery.trim());
    const windowDays = WINDOW_DAYS[filters.window] ?? 7;
    const cutoff = windowDays === Infinity ? -Infinity : Date.now() - windowDays * 86400000;

    return indexedRecords.filter(record =>
      (filters.kind === 'all' || record.kind === filters.kind) &&
      (!query || record.searchText.includes(query)) &&
      (record.announcedTime === null || record.announcedTime >= cutoff)
    );
  }, [indexedRecords, filters.kind, filters.window, deferredQuery]);

  const visibleRecords = filteredRecords.slice(0, MAX_VISIBLE_RECORDS);
  const selectedRecord = selectedId ? records.find(record => record.id === selectedId) || null : null;

  const handleFilterChange = useCallback(patch => setFilters(current => ({ ...current, ...patch })), []);
  const handleClearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const handleCloseDetails = useCallback(() => setSelectedId(null), []);

  return (
    <>
      <a className="skip-link" href="#main-content">跳至主要内容</a>
      <div className="app-shell">
        <Header
          mode={payload?.mode}
          connectionError={connectionError}
          loading={loading}
          onRefresh={() => loadData(true)}
        />

        <main id="main-content">
          <Hero />
          <Notice payload={payload} connectionError={connectionError} />
          <StatsGrid payload={payload} />

          <div className="workspace">
            <FeedPanel
              payload={payload}
              records={visibleRecords}
              total={filteredRecords.length}
              filters={filters}
              loading={loading}
              connectionError={connectionError}
              onFilterChange={handleFilterChange}
              onClear={handleClearFilters}
              onSelect={setSelectedId}
            />
            <SideColumn payload={payload} status={status} />
          </div>
        </main>

        <footer className="footer">
          <span>TRANSFER RADAR · 本地可运行版本</span>
          <span>演示数据不代表真实转会</span>
        </footer>
      </div>

      <DetailsDialog record={selectedRecord} onClose={handleCloseDetails} />
      <Toast message={toast} />
    </>
  );
}
