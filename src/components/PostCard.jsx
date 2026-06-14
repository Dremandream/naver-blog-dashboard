const SIGNAL_CONFIG = {
  매수: { cls: "badge-buy",     label: "🟢 매수" },
  중립: { cls: "badge-neutral", label: "🟡 중립" },
  매도: { cls: "badge-sell",    label: "🔴 매도" },
};

export default function PostCard({ post }) {
  const sig = SIGNAL_CONFIG[post.signal] ?? { cls: "badge-neutral", label: post.signal };

  return (
    <article className="card">
      <div className="card-top">
        <div className="card-meta">
          <span className="blog-name">{post.blog_name}</span>
          <span className="card-date">{post.date}</span>
        </div>
        <span className={`badge ${sig.cls}`}>{sig.label}</span>
      </div>

      <a className="card-title" href={post.url} target="_blank" rel="noreferrer">
        {post.title}
      </a>

      <p className="card-summary">{post.summary}</p>

      <div className="card-stocks">
        {(post.stocks || []).map((s) => (
          <span key={s} className="stock-tag">{s}</span>
        ))}
        <span className="sector-tag">{post.sector}</span>
      </div>

      {post.key_points?.length > 0 && (
        <ul className="key-points">
          {post.key_points.map((pt, i) => (
            <li key={i}>• {pt}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
