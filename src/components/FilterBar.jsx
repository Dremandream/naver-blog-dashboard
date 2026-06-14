export default function FilterBar({ sectors, signals, selectedSector, selectedSignal, onSectorChange, onSignalChange }) {
  return (
    <div className="filter-bar">
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
        <span className="filter-label">시그널</span>
        <div className="filter-chips">
          {signals.map((s) => (
            <button
              key={s}
              className={`chip ${selectedSignal === s ? "chip-active" : ""} ${
                s === "매수" ? "chip-buy" : s === "매도" ? "chip-sell" : s === "중립" ? "chip-neutral" : ""
              }`}
              onClick={() => onSignalChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
