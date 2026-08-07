import { useEffect } from "react";
import { uniqueStrings } from "../utils/post-list";

export default function PostModal({ post, onClose }) {
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

        <a className="modal-title" href={post.url} target="_blank" rel="noreferrer">
          {post.title} <span className="modal-link-icon">↗</span>
        </a>

        <p className="modal-summary">{post.summary}</p>

        {post.numbers?.length > 0 && (
          <div className="modal-section">
            <p className="modal-section-label">핵심 수치</p>
            <div className="card-numbers">
              {post.numbers.map((n, i) => (
                <span key={i} className="number-chip">{n}</span>
              ))}
            </div>
          </div>
        )}

        {post.reasoning && (
          <div className="modal-section">
            <p className="modal-section-label">핵심 근거</p>
            <p className="modal-reasoning">{post.reasoning}</p>
          </div>
        )}

        {post.risks?.length > 0 && (
          <div className="modal-section">
            <p className="modal-section-label">글쓴이가 언급한 리스크</p>
            <ul className="key-points modal-risks">
              {post.risks.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
        )}

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
          {uniqueStrings(post.stocks).map((s) => (
            <span key={s} className="stock-tag">{s}</span>
          ))}
          <span className="sector-badge">{post.sector}</span>
          {(post.stance === '강세' || post.stance === '약세') && (
            <span className={`stance-badge ${post.stance === '강세' ? 'stance-bull' : 'stance-bear'}`}>
              {post.stance}
            </span>
          )}
        </div>

        <a className="modal-read-more" href={post.url} target="_blank" rel="noreferrer">
          네이버 블로그 원문 보기 →
        </a>
      </div>
    </div>
  );
}
