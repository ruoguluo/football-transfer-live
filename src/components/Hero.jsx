export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow light">LIVE FOOTBALL MOVEMENT</p>
        <h1>把全球转会动向，<br />收进一条时间线。</h1>
        <p className="hero-description">服务端聚合已确认转会与媒体传闻，保留来源、概率、费用及更新时间，让每条动态都可以追溯。</p>
        <div className="hero-tags">
          <span>服务端密钥隔离</span><span>缓存与降级</span><span>确认 / 传闻分区</span>
        </div>
      </div>
      <div className="hero-side" aria-hidden="true">
        <div className="orbit"></div>
        <div className="hero-record">
          <span className="hero-record-label">DATA PIPELINE</span>
          <strong>Sportmonks</strong>
          <span className="hero-record-route">Provider <b>→</b> Proxy <b>→</b> Feed</span>
        </div>
      </div>
    </section>
  );
}
