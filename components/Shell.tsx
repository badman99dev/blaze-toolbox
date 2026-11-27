import Link from "next/link";

export function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#18221e" />
      <rect x="6" y="5" width="9" height="11.5" fill="#fff" /><rect x="17" y="5" width="9" height="11.5" fill="#fff" />
      <rect x="6" y="18.5" width="9" height="8.5" fill="#2a3fd4" /><rect x="17" y="18.5" width="9" height="8.5" fill="#fff" />
    </svg>
  );
}

export function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const wrap = wide ? "wrap wide" : "wrap";
  return (
    <div className="site">
      <header className="top">
        <div className={wrap}>
          <Link href="/" className="brand"><Mark />Blaze Toolbox</Link>
          <nav aria-label="Main"><a href="/#tools">Tools</a><a href="/#privacy">Privacy</a></nav>
        </div>
      </header>
      <main className={wrap}>{children}</main>
      <footer className="foot">
        <div className={wrap}>Blaze Toolbox. Your files are processed on your device and never uploaded.</div>
      </footer>
    </div>
  );
}
