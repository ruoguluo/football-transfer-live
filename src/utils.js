export const normalize = value => String(value ?? '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

export function relativeTime(value) {
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

export function absoluteTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function clubCode(name) {
  const text = String(name || '').trim();
  if (!text) return '--';
  if (/^[A-Za-z]/.test(text)) {
    return text.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase();
  }
  return text.slice(0, 2);
}

export const probabilityMeta = {
  IMMINENT: { label: '接近完成', className: 'imminent' },
  HIGH: { label: '可能性较高', className: 'high' },
  MEDIUM: { label: '可能性中等', className: 'medium' },
  LOW: { label: '可能性较低', className: '' }
};
