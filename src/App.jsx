import { useState, useEffect } from "react";
import PostCard from "./components/PostCard";
import PostModal from "./components/PostModal";
import FilterBar from "./components/FilterBar";
import StatsBar from "./components/StatsBar";
import DailyBrief from "./components/DailyBrief";
import MarketStrip from "./components/MarketStrip";
import AttentionTrends from "./components/AttentionTrends";
import StockReport from "./components/StockReport";
import "./App.css";

// KST 기준 날짜 문자열 (YYYY-MM-DD)
function getKSTDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * -86400000).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/\. /g, "-").replace(".", "");
}

const DATES    = ["전체", "오늘", "어제", "최근 7일"];
const SORT_OPT = ["최신순", "블로그별"];
const SOURCES  = ["전체", "블로그", "텔레그램"];

export default function App() {
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);

  // 필터 state
  const [selectedSector, setSelectedSector] = useState("전체");
  const [selectedBlog,   setSelectedBlog]   = useState("전체");
  const [selectedSource, setSelectedSource] = useState("전체");
  const [selectedDate,   setSelectedDate]   = useState("전체");
  const [sortBy,         setSortBy]         = useState("최신순");
  const [searchQuery,    setSearchQuery]    = useState("");

  useEffect(() => {
    const today = getKSTDate(0);
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

  // ── 날짜 필터 범위 계산
  const todayKST     = getKSTDate(0);
  const yesterdayKST = getKSTDate(1);
  const weekAgoKST   = getKSTDate(7);

  // ── 필터 + 정렬
  const filtered = posts
    .filter((p) => {
      if (selectedDate === "오늘")      return p.date === todayKST;
      if (selectedDate === "어제")      return p.date === yesterdayKST;
      if (selectedDate === "최근 7일")  return p.date >= weekAgoKST;
      return true;
    })
    .filter((p) => selectedSector === "전체" || p.sector === selectedSector)
    .filter((p) => selectedBlog   === "전체" || p.blog_name === selectedBlog)
    .filter((p) => {
      if (selectedSource === "전체") return true;
      const src = p.source === "telegram" ? "텔레그램" : "블로그";
      return src === selectedSource;
    })
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
    if (sortBy === "블로그별") return a.blog_name.localeCompare(b.blog_name, "ko");
    return b.date.localeCompare(a.date); // 최신순 (기본)
  });

  // 섹터별 글 수 (StatsBar용)
  const sectorCounts = posts.reduce((acc, p) => {
    acc[p.sector] = (acc[p.sector] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <div>
              <h1>데일리 투자 리포트</h1>
              <p className="date">블로그·텔레그램 여론 종합 · 수집일 {data?.date ?? "-"}</p>
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
        <MarketStrip market={data?.market} />
        <DailyBrief briefs={data?.daily_briefs ?? data?.daily_brief} onStockClick={setSelectedStock} />
        <AttentionTrends posts={posts} prices={data?.prices} onStockClick={setSelectedStock} />
        <StatsBar total={posts.length} sectors={sectorCounts} />

        <div className="section-divider">
          <h2>개별 글</h2>
          <span className="sd-count">{sorted.length}건</span>
        </div>

        <FilterBar
          sectors={sectors}
          blogs={blogs}
          dates={DATES}
          sources={SOURCES}
          sortOptions={SORT_OPT}
          selectedSector={selectedSector}
          selectedBlog={selectedBlog}
          selectedSource={selectedSource}
          selectedDate={selectedDate}
          sortBy={sortBy}
          onSectorChange={setSelectedSector}
          onBlogChange={setSelectedBlog}
          onSourceChange={setSelectedSource}
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

      {selectedStock && (
        <StockReport stock={selectedStock} posts={posts} price={data?.prices?.[selectedStock]} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
}
