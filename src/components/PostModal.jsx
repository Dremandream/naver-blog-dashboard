import { useEffect } from "react";

const SIGNAL_CONFIG = {
  매수: { cls: "badge-buy",     label: "🟢 매수" },
  중립: { cls: "badge-neutral", label: "🟡 중립" },
  매도: { cls: "badge-sell",    label: "🔴 매도" },
};

export default function PostModal({ post, onClose }) {
  const sig = SIGNAL_CONFIG[post.signal] ?? { cls: "badge-neutral", label: post.signal };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-meta">
            <span className="blog-name">{post.blog_name}</span>
            <span className="card-date">{post.date}</span>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-signal-row">
          <span className={`badge ${sig.cls}`}>{sig.label}</span>
          {post.signal_reason && (
            <span className="modal-signal-reason">{post.signal_reason}</span>
          )}
        </div>

        <a className="modal-title" href={post.url} target="_blank" rel="noreferrer">
          {post.title} <span className="modal-link-icon">↗</span>
        </a>

        <p className="modal-summary">{post.summary}</p>

        {post.key_points?.length > 0 && (
          <div className="modal-section">
            <p className="modal-section-label">핵심 포인트</p>
            <ul className="key-points">
              {post.key_points.map((pt, i) => (
                <li key={i}>• {pt}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="card-stocks modal-stocks">
          {(post.stocks || []).map((s) => (
            <span key={s} className="stock-tag">{s}</span>
          ))}
          <span className="sector-tag">{post.sector}</span>
        </div>

        <a className="modal-read-more" href={post.url} target="_blank" rel="noreferrer">
          네이버 블로그 원문 보기 →
        </a>
      </div>
    </div>
  );
}
