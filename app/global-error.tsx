"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#18221e" }}>
        <main style={{ maxWidth: "40rem", margin: "0 auto", padding: "clamp(3rem, 12vh, 7rem) 1.25rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(1.75rem, 1.2rem + 2.5vw, 2.75rem)", letterSpacing: "-.02em" }}>Something went wrong</h1>
          <p style={{ marginTop: "0.75rem", color: "#5a6962" }}>
            The app failed to start. Reload the page to try again.
          </p>
          <div style={{ display: "flex", gap: "0.625rem", justifyContent: "center", flexWrap: "wrap", marginTop: "1.5rem" }}>
            <button type="button" onClick={() => window.location.reload()} style={{ minHeight: "2.75rem", padding: "0.25rem 1.25rem", border: "1px solid #2a3fd4", background: "#2a3fd4", color: "#fff", borderRadius: "0.5rem", fontWeight: 600, cursor: "pointer" }}>Reload</button>
            <button type="button" onClick={reset} style={{ minHeight: "2.75rem", padding: "0.25rem 1.25rem", border: "1px solid #b3beb7", background: "#fff", color: "#18221e", borderRadius: "0.5rem", fontWeight: 600, cursor: "pointer" }}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}