import SourcePanel from './SourcePanel.jsx';

export default function SideColumn({ payload, status }) {
  return (
    <aside className="side-column">
      <SourcePanel payload={payload} status={status} />

      <section className="panel">
        <p className="eyebrow">HOW IT WORKS</p><h2>接入链路</h2>
        <ol className="steps">
          <li><span>01</span><div><strong>服务商接口</strong><small>拉取确认转会与传闻</small></div></li>
          <li><span>02</span><div><strong>服务端代理</strong><small>保管密钥、限流、缓存</small></div></li>
          <li><span>03</span><div><strong>字段规范化</strong><small>统一状态、费用、来源</small></div></li>
          <li><span>04</span><div><strong>动态流</strong><small>按时间分区展示</small></div></li>
        </ol>
      </section>

      <section className="panel compliance">
        <p className="eyebrow">IMPORTANT</p><h2>数据口径</h2>
        <p>已确认转会与媒体传闻是不同性质的数据。传闻必须保留来源、概率和「非官方确认」提示，费用未披露时显示为 null，而非 0。</p>
        <p>商业转售或大规模展示来源内容前，应确认服务商合同的转授权与署名要求。</p>
      </section>
    </aside>
  );
}
