import { useEffect, useRef } from 'react';
import { SearchIcon } from './Icons.jsx';
import RecordCard from './RecordCard.jsx';

const KIND_OPTIONS = [
  ['all', '全部'],
  ['confirmed', '已确认'],
  ['rumour', '传闻']
];

export default function FeedPanel({ payload, records, total, filters, loading, connectionError, onFilterChange, onClear, onSelect }) {
  const searchRef = useRef(null);

  useEffect(() => {
    function handleShortcut(event) {
      if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  const mode = payload?.mode === 'live' ? '实时接口' : '本地演示数据';
  const showEmpty = Boolean(payload) && records.length === 0;

  return (
    <section className="feed-panel" aria-labelledby="feed-title">
      <div className="feed-heading">
        <div><p className="eyebrow">MOVEMENT FEED</p><h2 id="feed-title">最新动态</h2></div>
        <span className="result-count" id="result-count">
          {connectionError && !payload ? '载入失败' : !payload ? '正在载入…' : `显示 ${records.length} / ${total} 条`}
        </span>
      </div>

      <div className="filters">
        <div className="search-field">
          <SearchIcon />
          <input
            id="search-input"
            ref={searchRef}
            type="search"
            placeholder="搜索球员、俱乐部或来源…"
            autoComplete="off"
            aria-label="搜索转会动态"
            value={filters.query}
            onChange={event => onFilterChange({ query: event.target.value })}
          />
        </div>
        <div className="segmented" id="kind-filters" role="group" aria-label="动态类型">
          {KIND_OPTIONS.map(([kind, label]) => (
            <button
              key={kind}
              className={filters.kind === kind ? 'active' : ''}
              type="button"
              data-kind={kind}
              onClick={() => onFilterChange({ kind })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="window-field">时间范围
          <select id="window-filter" value={filters.window} onChange={event => onFilterChange({ window: event.target.value })}>
            <option value="24h">近 24 小时</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
            <option value="all">全部时间</option>
          </select>
        </label>
      </div>

      <div className="feed-list" id="feed-list" aria-live="polite">
        {records.map(record => <RecordCard key={record.id} record={record} onSelect={onSelect} />)}
      </div>

      <div className="empty-state" id="feed-empty" hidden={!showEmpty}>
        <div className="empty-icon"><SearchIcon /></div>
        <h3>没有符合条件的动态</h3><p>尝试扩大时间范围、切换类型或清除搜索关键词。</p>
        <button className="button secondary" id="clear-filters" type="button" onClick={onClear}>清除筛选</button>
      </div>

      {payload && (
        <p className="feed-footnote" id="feed-footnote">
          当前来源：{mode}。点击任一记录可查看规范化字段与接口原始值。最多渲染前 100 条结果。
        </p>
      )}
    </section>
  );
}
