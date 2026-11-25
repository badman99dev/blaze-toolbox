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

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mat">
      <div className="sheetwrap">
        <div className="rx" aria-hidden="true" />
        <div className="ry" aria-hidden="true" />
        <div className="sheet">
          <header className="top">
            <Link href="/" className="brand"><Mark />Blaze Toolbox</Link>
            <nav aria-label="Main"><a href="/#tools">Tools</a><a href="/#privacy">Privacy</a></nav>
          </header>
          {children}
          <footer className="foot">Blaze Toolbox. Your files are processed on your device and never uploaded.</footer>
        </div>
      </div>
    </div>
  );
}
