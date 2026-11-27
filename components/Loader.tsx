/* Loading indicator: a top progress bar plus a small document sheet where photos
   pop in one by one while a scan line sweeps over it. Pure CSS, no JS. */
const PHOTOS = [
    { x: 29, y: 20, d: 0, c: "#2a3fd4" },
    { x: 53, y: 20, d: 1, c: "#d7e6f5" },
    { x: 29, y: 52, d: 2, c: "#d7e6f5" },
    { x: 53, y: 52, d: 3, c: "#d7e6f5" },
  ];

export function LoaderArt() {
  return (
    <svg viewBox="0 0 104 104" aria-hidden="true">
        <rect x="22" y="8" width="60" height="88" rx="4" fill="#fff" stroke="#b3beb7" strokeWidth="1.5" />
        {PHOTOS.map((p) => (
          <g key={p.d} className="ld-photo" style={{ ["--d" as string]: p.d }}>
            <rect x={p.x} y={p.y} width="22" height="28" rx="2" fill={p.c} stroke="#8aa0b4" strokeWidth=".8" />
            <circle cx={p.x + 11} cy={p.y + 11} r="4.5" fill={p.c === "#2a3fd4" ? "#fff" : "#8ea3b8"} />
            <path d={`M${p.x + 3} ${p.y + 27}C${p.x + 3} ${p.y + 20} ${p.x + 7} ${p.y + 17} ${p.x + 11} ${p.y + 17}C${p.x + 15} ${p.y + 17} ${p.x + 19} ${p.y + 20} ${p.x + 19} ${p.y + 27}Z`} fill={p.c === "#2a3fd4" ? "#fff" : "#8ea3b8"} />
          </g>
        ))}
        <rect className="ld-scan" x="22" y="14" width="60" height="6" fill="#2a3fd4" opacity=".28" />
    </svg>
  );
}

export function Loader({ label = "Loading", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={"loader" + (compact ? " compact" : "")} role="status" aria-live="polite">
      <div className="topbar" aria-hidden="true" />
      <LoaderArt />
      <p>{label}</p>
    </div>
  );
}
