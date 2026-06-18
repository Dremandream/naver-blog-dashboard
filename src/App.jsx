import { useState, useEffect } from "react";
import PostCard from "./components/PostCard";
import PostModal from "./components/PostModal";
import FilterBar from "./components/FilterBar";
import StatsBar from "./components/StatsBar";
import "./App.css";

// KST 기준 날짜 문자열 (YYYY-MM-DD)
function getKSTDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * -86400000).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/\. /g, "-").replace(".", "");
}

const DATES    = ["전체", "오늘", "어제", "최근 7일"];
const SIGNALS  = ["전체", "매수", "중립", "매도"];
const SORT_OPT = ["최신순", "매수 우선", "블로그별"];

export default function App() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);

  // 필터 state
  const [selectedSector, setSelectedSector] = useState("전체");
  const [selectedSignal, setSelectedSignal] = useState("전체");
  const [selectedBlog,   setSelectedBlog]   = useState("전체");
  const [selectedDate,   setSelectedDate]   = useState("전체");
  const [sortBy,         setSortBy]         = useState("최신순");
  const [searchQuery,    setSearchQuery]    = useState("");

  useEffect(() => {
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
  if (error)   return <div className="center-screen error"><p>⚠️ {error}</p></div>;

  const posts   = data?.posts ?? [];
  const sectors = ["전체", ...new Set(posts.map((p) => p.sector))];
  const blogs   = ["전체", ...new Set(posts.map((p) => p.blog_name))];

  // ── 날짜 필터 범위 계산 ───────────────────────────────────────────────────────
  const todayKST     = getKSTDate(0);
  const yesterdayKST = getKSTDate(1);
  const weekAgoKST   = getKSTDate(7);

  // ── 필터 + 정렬 ──────────────────────────────────────────────────────────────
  const filtered = posts
    .filter((p) => {
      if (selectedDate === "오늘")      return p.date === todayKST;
      if (selectedDate === "어제")      return p.date === yesterdayKST;
      if (selectedDate === "최근 7일")  return p.date >= weekAgoKST;
      return true;
    })
    .filter((p) => selectedSector === "전체" || p.sector === selectedSector)
    .filter((p) => selectedSignal === "전체" || p.signal === selectedSignal)
    .filter((p) => selectedBlog   === "전체" || p.blog_name === selectedBlog)
    .filter((p) => {
      const q = searchQuery.toLowerCase();
      return (
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.blog_name.toLowerCase().includes(q) ||
        (p.stocks || []).some((s) => s.toLowerCase().includes(q))
      );
    });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "매수 우선") {
      const order = { 매수: 0, 중립: 1, 매도: 2 };
      return (order[a.signal] ?? 1) - (order[b.signal] ?? 1);
    }
    if (sortBy === "블로그별") return a.blog_name.localeCompare(b.blog_name, "ko");
    return b.date.localeCompare(a.date); // 최신순 (기본)
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
          signals={SIGNALS}
          blogs={blogs}
          dates={DATES}
          sortOptions={SORT_OPT}
          selectedSector={selectedSector}
          selectedSignal={selectedSignal}
          selectedBlog={selectedBlog}
          selectedDate={selectedDate}
          sortBy={sortBy}
          onSectorChange={setSelectedSector}
          onSignalChange={setSelectedSignal}
          onBlogChange={setSelectedBlog}
          onDateChange={setSelectedDate}
          onSortChange={setSortBy}
        />
        {sorted.length === 0 ? (
          <div className="empty">해당 조건의 글이 없습니다.</div>
        ) : (
          <div className="card-grid">
            {sorted.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onCardClick={setSelectedPost}
                onStockClick={(stock) => setSearchQuery(stock)}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer">
        자동 수집 · Claude AI 요약 · 투자 참고용 (매매 권유 아님)
      </footer>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </div>
  );
}
