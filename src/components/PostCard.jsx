export default function PostCard({ post, onCardClick, onStockClick }) {
  return (
    <article className="card card-clickable" onClick={() => onCardClick(post)}>
      <div className="card-top">
        <div className="card-meta">
          <span className="blog-name">{post.blog_name}</span>
          <span className="card-date">{post.date}</span>
        </div>
        <span className="sector-badge">{post.sector}</span>
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
    </article>
  );
}
