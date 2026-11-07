import { memo } from 'react';
import { clubCode, probabilityMeta, relativeTime, safeUrl } from '../utils.js';

function ProbabilityBadge({ record }) {
  if (record.kind !== 'rumour' || !record.probability) return null;
  const key = String(record.probability).toUpperCase();
  const meta = probabilityMeta[key] || { label: record.probability, className: '' };
  return <span className={`probability ${meta.className}`.trim()}>{meta.label}</span>;
}

function SourceLink({ record }) {
  const url = safeUrl(record.sourceUrl);
  if (url) {
    return <a href={url} target="_blank" rel="noopener noreferrer">{record.sourceName}</a>;
  }
  return <>{record.sourceName || '来源未标注'}</>;
}

function RecordCard({ record, onSelect }) {
  const isRumour = record.kind === 'rumour';

  function handleClick(event) {
    if (event.target.closest?.('a')) return;
    onSelect(record.id);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(record.id);
    }
  }

  return (
    <article
      className={`feed-card ${isRumour ? 'rumour' : 'confirmed'}`}
      data-id={record.id}
      tabIndex={0}
      role="button"
      aria-label={`查看 ${record.player} 的记录详情`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="feed-card-top">
        <div className="badge-group">
          <span className={`kind-badge ${isRumour ? 'rumour' : 'confirmed'}`}>{isRumour ? '转会传闻' : '已确认转会'}</span>
          <span className="status-badge">{record.status || ''}</span>
          <ProbabilityBadge record={record} />
        </div>
        <time className="feed-time" dateTime={record.announcedAt}>{relativeTime(record.announcedAt)}</time>
      </div>
      <h3>{record.player} <span className="status-badge">· {record.type || ''}</span></h3>
      <div className="feed-route">
        <span className="club"><span className="club-code">{clubCode(record.from)}</span>{record.from}</span>
        <span className="route-arrow" aria-hidden="true">→</span>
        <span className="club"><span className="club-code">{clubCode(record.to)}</span>{record.to}</span>
      </div>
      <div className="feed-meta">
        <span className="fee">{record.feeText || '金额未披露'}</span>
        <span className="source-line">来源：<SourceLink record={record} /></span>
      </div>
      <p className="feed-note">{record.note || ''}</p>
    </article>
  );
}

export default memo(RecordCard);
