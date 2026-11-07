export default function Notice({ payload, connectionError }) {
  if (connectionError) {
    return (
      <div className="notice" id="notice" role="status">
        <strong>无法读取本地接口：</strong>{connectionError}。请确认 Node 服务仍在运行。
      </div>
    );
  }

  if (!payload) return <div className="notice" id="notice" role="status" hidden></div>;

  if (payload.mode !== 'live') {
    return (
      <div className="notice" id="notice" role="status">
        <strong>演示模式：</strong>{payload.warnings?.[0] || '当前展示本地示例数据。'} 将 <code>SPORTMONKS_TOKEN</code> 写入项目根目录的 <code>.env</code> 并重启服务即可切换为实时数据；密钥不会进入浏览器。
      </div>
    );
  }

  if (payload.warnings?.length) {
    return (
      <div className="notice" id="notice" role="status">
        <strong>部分数据降级：</strong>{payload.warnings.join(' ')}
      </div>
    );
  }

  return <div className="notice" id="notice" role="status" hidden></div>;
}
