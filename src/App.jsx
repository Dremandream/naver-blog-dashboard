import { useState, useEffect } from "react";
import PostCard from "./components/PostCard";
import FilterBar from "./components/FilterBar";
import StatsBar from "./components/StatsBar";
import "./App.css";

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSector, setSelectedSector] = useState("전체");
  const [selectedSignal, setSelectedSignal] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // [수정 C] 날짜 기반 캐시 버스팅: 오늘 날짜가 바뀌면 브라우저 캐시 무시하고 새 데이터 요청
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/data/posts.json?d=${today}`)
      .then((r) => {
        if (!r.ok) throw new Error("데이터를 불러올 수 없습니다");
        return r.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="center-screen"><div className="spinner" /><p>로딩 중...</p></div>;
  if (error) return <div className="center-screen error"><p>⚠️ {error}</p></div>;

  const posts = data?.posts ?? [];
  const sectors = ["전체", ...new Set(posts.map((p) => p.sector))];
  const signals = ["전체", "매수", "중립", "매도"];

  const filtered = posts.filter((p) => {
    const sectorOk = selectedSector === "전체" || p.sector === selectedSector;
    const signalOk = selectedSignal === "전체" || p.signal === selectedSignal;
    const query = searchQuery.toLowerCase();
    const searchOk =
      !query ||
      p.title.toLowerCase().includes(query) ||
      p.blog_name.toLowerCase().includes(query) ||
      (p.stocks || []).some((s) => s.toLowerCase().includes(query));
    return sectorOk && signalOk && searchOk;
  });

  const signalCounts = {
    매수: posts.filter((p) => p.signal === "매수").length,
    중립: posts.filter((p) => p.signal === "중립").length,
    매도: posts.filter((p) => p.signal === "매도").length,
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <span className="logo">📈</span>
            <div>
              <h1>네이버 블로그 투자 대시보드</h1>
              <p className="date">수집일: {data?.date ?? "-"}</p>
            </div>
          </div>
          <input
            className="search-input"
            type="text"
            placeholder="종목·블로그·제목 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </header>

      <main className="main">
        <StatsBar total={posts.length} counts={signalCounts} />
        <FilterBar
          sectors={sectors}
          signals={signals}
          selectedSector={selectedSector}
          selectedSignal={selectedSignal}
          onSectorChange={setSelectedSector}
          onSignalChange={setSelectedSignal}
        />
        {filtered.length === 0 ? (
          <div className="empty">해당 조건의 글이 없습니다.</div>
        ) : (
          <div className="card-grid">
            {filtered.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        자동 수집 · Claude AI 요약 · 투자 참고용 (매매 권유 아님)
      </footer>
    </div>
  );
}
