const STANCE_STYLE = {
  '강세': 'stance-bull',
  '약세': 'stance-bear',
};

export default function PostCard({ post, onCardClick, onStockClick }) {
  const stanceClass = STANCE_STYLE[post.stance];

  return (
    <article className="card card-clickable" onClick={() => onCardClick(post)}>
      <div className="card-top">
        <div className="card-meta">
          {post.source === 'telegram' && (
            <span className="source-badge source-telegram">📱 텔레그램</span>
          )}
          <span className="blog-name">{post.blog_name}</span>
          <span className="card-date">{post.date}</span>
        </div>
        <div className="card-badges">
          {stanceClass && <span className={`stance-badge ${stanceClass}`}>{post.stance}</span>}
          <span className="sector-badge">{post.sector}</span>
        </div>
      </div>

      <a
        className="card-title"
        href={post.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {post.title}
      </a>

      <p className="card-summary">{post.summary}</p>

      {post.numbers?.length > 0 && (
        <div className="card-numbers">
          {post.numbers.map((n, i) => (
            <span key={i} className="number-chip">{n}</span>
          ))}
        </div>
      )}

      <div className="card-stocks">
        {(post.stocks || []).map((s) => (
          <span
            key={s}
            className="stock-tag stock-tag-clickable"
            onClick={(e) => { e.stopPropagation(); onStockClick(s); }}
            title={`${s} 종목 필터`}
          >
            {s}
          </span>
        ))}
      </div>

      {post.key_points?.length > 0 && (
        <ul className="key-points">
          {post.key_points.map((pt, i) => (
            <li key={i}>• {pt}</li>
          ))}
        </ul>
      )}

      {post.risks?.length > 0 && (
        <p className="card-risk">⚠️ 리스크: {post.risks[0]}</p>
      )}
    </article>
  );
}
