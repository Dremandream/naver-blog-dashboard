export default function FilterBar({
  sectors, blogs, dates, sources, sortOptions,
  selectedSector, selectedBlog, selectedSource, selectedDate, sortBy,
  onSectorChange, onBlogChange, onSourceChange, onDateChange, onSortChange,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">날짜</span>
        <div className="filter-chips">
          {dates.map((d) => (
            <button
              key={d}
              className={`chip ${selectedDate === d ? "chip-active" : ""}`}
              onClick={() => onDateChange(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">소스</span>
        <div className="filter-chips">
          {(sources ?? []).map((s) => (
            <button
              key={s}
              className={`chip ${selectedSource === s ? "chip-active" : ""}`}
              onClick={() => onSourceChange(s)}
            >
              {s === "텔레그램" ? "📱 텔레그램" : s === "블로그" ? "📝 블로그" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">섹터</span>
        <div className="filter-chips">
          {sectors.map((s) => (
            <button
              key={s}
              className={`chip ${selectedSector === s ? "chip-active" : ""}`}
              onClick={() => onSectorChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">블로그</span>
        <div className="filter-chips">
          {blogs.map((b) => (
            <button
              key={b}
              className={`chip ${selectedBlog === b ? "chip-active" : ""}`}
              onClick={() => onBlogChange(b)}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">정렬</span>
        <div className="filter-chips">
          {sortOptions.map((s) => (
            <button
              key={s}
              className={`chip ${sortBy === s ? "chip-active" : ""}`}
              onClick={() => onSortChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
