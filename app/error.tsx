"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="wrap" style={{ padding: "clamp(3rem, 12vh, 7rem) 0", textAlign: "center" }}>
      <h1 style={{ fontSize: "clamp(1.75rem, 1.2rem + 2.5vw, 2.75rem)" }}>This page didn&apos;t load</h1>
      <p style={{ marginTop: "0.75rem", color: "var(--muted)", maxWidth: "46ch", marginInline: "auto" }}>
        A file needed by this page could not be fetched. Reloading usually fixes it, especially right after an update.
      </p>
      <div className="cta" style={{ justifyContent: "center" }}>
        <button className="btn primary" type="button" onClick={() => window.location.reload()}>Reload</button>
        <button className="btn" type="button" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}