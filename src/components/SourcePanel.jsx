import { absoluteTime } from '../utils.js';

const RUMOUR_STATUS_TEXT = {
  ok: '正常',
  unavailable: '不可用',
  disabled: '已关闭',
  pending: '待同步'
};

export default function SourcePanel({ payload, status }) {
  const cacheMinutes = Math.round((status?.cacheTtlMs || payload?.cacheTtlMs || 900000) / 60000);
  const feeScaleText = { eur: 'EUR 绝对值', million: '百万 EUR', raw: '接口原值' }[status?.feeScale] || 'EUR 绝对值';
  const rumoursStatus = payload?.status?.rumoursStatus;
  const rumoursClass = rumoursStatus === 'ok' ? 'ok' : rumoursStatus === 'disabled' ? '' : 'warn';
  const isLive = payload?.mode === 'live';

  const rows = payload || status ? [
    ['运行模式', isLive ? '实时接口' : '演示数据', isLive ? 'ok' : 'warn'],
    ['数据服务商', payload?.provider || '--', ''],
    ['API 密钥', status?.tokenConfigured ? '服务端已配置' : '未配置', status?.tokenConfigured ? 'ok' : 'warn'],
    ['缓存时长', `${cacheMinutes} 分钟`, ''],
    ['传闻接口', RUMOUR_STATUS_TEXT[rumoursStatus] || '未知', rumoursClass],
    ['费用单位', feeScaleText, ''],
    ['最近同步', payload?.fetchedAt ? absoluteTime(payload.fetchedAt) : '--', '']
  ] : [];

  return (
    <section className="panel">
      <p className="eyebrow">DATA SOURCE</p><h2>连接状态</h2>
      <dl className="source-list" id="source-list">
        {rows.map(([label, value, className]) => (
          <div className="source-row" key={label}>
            <dt>{label}</dt><dd className={className}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="warning-list" id="warning-list">
        {(payload?.warnings || []).map((warning, index) => (
          <div className="warning-item" key={`${index}-${warning}`}>{warning}</div>
        ))}
      </div>
    </section>
  );
}
