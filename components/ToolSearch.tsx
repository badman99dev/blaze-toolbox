"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { ModeTag } from "@/components/ModeTag";
import { TOOLS, CATEGORIES, type Tool } from "@/lib/tools";

const haystack = (t: Tool) => `${t.name} ${t.blurb} ${t.meta} ${t.slug} ${t.cat}`.toLowerCase();

export function ToolSearch() {
  const [q, setQ] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length
    ? TOOLS.filter((t) => { const h = haystack(t); return words.every((w) => h.includes(w)); })
    : TOOLS;
  const searching = words.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); box.current?.focus(); }
      else if (e.key === "Escape" && document.activeElement === box.current) { setQ(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clear = () => { setQ(""); box.current?.focus(); };

  return (
    <div id="tools" className="tools-region">
      <div className="search">
        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></svg>
          <input
            ref={box}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tools — try “pdf”, “passport”, “resize”"
            aria-label="Search tools"
            autoComplete="off"
          />
          {q && <button type="button" className="search-clear" onClick={clear} aria-label="Clear search">✕</button>}
        </div>
        <p className="search-count" role="status" aria-live="polite">
          {searching ? `${found.length} tool${found.length === 1 ? "" : "s"} match` : `${TOOLS.length} tools`}
        </p>
      </div>

      {found.length === 0 ? (
        <p className="search-none">No tools match “{q.trim()}”. <button type="button" className="linkish" onClick={clear}>Show all tools</button></p>
      ) : (
        <div className="tool-cats">
          {CATEGORIES.map((cat) => {
            const items = found.filter((t) => t.cat === cat.id);
            if (!items.length) return null;
            return (
              <section key={cat.id} id={cat.id} className="tools-section" aria-labelledby={`${cat.id}-title`}>
                <div className="tools-head">
                  <h2 id={`${cat.id}-title`}>{cat.title}</h2>
                  <p>{cat.desc}</p>
                </div>
                <div className="tools">
                  {items.map((t, i) => (
                    <Link key={t.slug} href={`/tools/${t.slug}`} prefetch={false} className={`cell t-${t.slug}`} style={{ "--i": i } as CSSProperties}>
                      <ModeTag mode={t.mode} />
                      <Icon slug={t.slug} />
                      <h2>{t.name}</h2>
                      <p>{t.blurb}</p>
                      <span className="meta"><span>{t.meta}</span></span>
                      <LinkPending variant="card" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
