import { useEffect, useRef } from 'react';
import { absoluteTime } from '../utils.js';
import { CloseIcon } from './Icons.jsx';

export default function DetailsDialog({ record, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (record && !dialog.open) dialog.showModal();
    if (!record && dialog.open) dialog.close();
  }, [record]);

  function handleBackdropClick(event) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      dialog.close();
    }
  }

  const fields = record ? [
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
  ] : [];

  return (
    <dialog className="details-dialog" id="details-dialog" ref={dialogRef} onClose={onClose} onClick={handleBackdropClick}>
      <button type="button" className="dialog-close" id="details-close" aria-label="关闭记录详情" onClick={onClose}>
        <CloseIcon />
      </button>
      {record && (
        <div id="details-content">
          <div className="details-header">
            <p>RECORD DETAIL</p>
            <h2>{record.player}</h2>
            <span>{record.from} → {record.to}</span>
          </div>
          <div className="details-body">
            <div className="detail-grid">
              {fields.map(([label, value]) => (
                <div className="detail-item" key={label}>
                  <span>{label}</span><strong>{value || '--'}</strong>
                </div>
              ))}
            </div>
            <div className="raw-title">接口原始字段<span>用于核对字段映射</span></div>
            <pre id="raw-record">{JSON.stringify(record.raw || {}, null, 2)}</pre>
          </div>
        </div>
      )}
    </dialog>
  );
}
