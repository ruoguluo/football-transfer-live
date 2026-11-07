import { relativeTime } from '../utils.js';
import { ClockIcon, ModeIcon, RumourIcon, TransferIcon } from './Icons.jsx';

export default function StatsGrid({ payload }) {
  const isLive = payload?.mode === 'live';

  return (
    <section className="stats-grid" aria-label="数据概览">
      <article className="stat-card">
        <span className="stat-icon green"><TransferIcon /></span>
        <div><strong id="stat-confirmed">{payload?.counts?.confirmed ?? '--'}</strong><span>已确认转会</span></div>
      </article>
      <article className="stat-card">
        <span className="stat-icon amber"><RumourIcon /></span>
        <div><strong id="stat-rumour">{payload?.counts?.rumour ?? '--'}</strong><span>转会传闻</span></div>
      </article>
      <article className="stat-card">
        <span className="stat-icon blue"><ClockIcon /></span>
        <div><strong id="stat-updated">{payload?.fetchedAt ? relativeTime(payload.fetchedAt) : '--'}</strong><span>最近同步</span></div>
      </article>
      <article className="stat-card">
        <span className="stat-icon purple"><ModeIcon /></span>
        <div><strong id="stat-mode">{payload ? (isLive ? 'Sportmonks' : 'Demo') : '--'}</strong><span>当前数据模式</span></div>
      </article>
    </section>
  );
}
