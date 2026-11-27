import { MODES, type Mode } from "@/lib/tools";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === "cloud") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M7 18h9a4 4 0 0 0 .5-7.97A5 5 0 0 0 7 9.5 3.5 3.5 0 0 0 7 18z" />
      </svg>
    );
  }
  if (mode === "hybrid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M7 15h6.5a3.5 3.5 0 0 0 .4-6.98A4.5 4.5 0 0 0 6 7.5 3 3 0 0 0 7 15z" />
        <rect x="13" y="12" width="7" height="9" rx="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function ModeTag({ mode }: { mode: Mode }) {
  const m = MODES[mode];
  return (
    <span className={`card-tag ${mode}`} title={m.title}>
      <ModeIcon mode={mode} />
      {m.label}
    </span>
  );
}