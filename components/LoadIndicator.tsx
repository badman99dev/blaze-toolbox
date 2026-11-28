"use client";
import { useSyncExternalStore } from "react";
import { subscribe, getTasks, type LoadTask } from "@/lib/loadlog";

const EMPTY: LoadTask[] = [];
const fmt = (n: number) =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";

// Site-wide toast that appears whenever a library is being downloaded from the
// web, with a live progress bar and the package name — so it is obvious the
// app is fetching a published package, not running injected code.
export function LoadIndicator() {
  const tasks = useSyncExternalStore(subscribe, getTasks, () => EMPTY);
  if (!tasks.length) return null;
  return (
    <div className="dl" role="status" aria-live="polite">
      {tasks.map((t) => {
        const pct = t.total ? Math.min(100, Math.round((t.loaded / t.total) * 100)) : null;
        return (
          <div className="dl-row" key={t.id}>
            <div className="dl-head">
              <span className="dl-spin" aria-hidden="true" />
              <span className="dl-name" title={t.label}>{t.label}</span>
              {pct !== null && <span className="dl-pct">{pct}%</span>}
            </div>
            <div className={"dl-bar" + (pct === null ? " indet" : "")}>
              <i style={pct !== null ? { width: pct + "%" } : undefined} />
            </div>
            <div className="dl-note">
              {pct !== null ? `${fmt(t.loaded)} of ${fmt(t.total)} — ` : ""}
              downloading a package from the web. Nothing from your device is sent.
            </div>
          </div>
        );
      })}
    </div>
  );
}
