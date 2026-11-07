import { RefreshIcon } from './Icons.jsx';

export default function Header({ mode, connectionError, loading, onRefresh }) {
  const statusClass = connectionError ? 'error' : mode === 'live' ? 'live' : mode === 'demo' ? 'demo' : '';
  const statusText = connectionError ? '连接失败' : mode === 'live' ? '实时连接' : mode === 'demo' ? '演示模式' : '正在连接';

  return (
    <header className="topbar">
      <a className="brand" href="./" aria-label="转会动态雷达首页">
        <span className="brand-mark" aria-hidden="true"><span></span><span></span></span>
        <span className="brand-copy"><strong>转会动态雷达</strong><small>TRANSFER RADAR</small></span>
      </a>
      <div className="topbar-right">
        <div className={`status-pill ${statusClass}`.trim()} id="connection-status">
          <span className="status-dot"></span><strong>{statusText}</strong>
        </div>
        <button className="button secondary" id="refresh-button" type="button" disabled={loading} onClick={onRefresh}>
          <RefreshIcon />
          <span>{loading ? '同步中' : '刷新'}</span>
        </button>
      </div>
    </header>
  );
}
