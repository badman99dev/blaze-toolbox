import Link from "next/link";
import { LinkPending } from "@/components/LinkPending";

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
          <Link href="/" prefetch={false} className="brand"><Mark />Blaze Toolbox<LinkPending /></Link>
          <nav aria-label="Main"><Link href="/#tools" prefetch={false}>Tools<LinkPending /></Link><Link href="/privacy" prefetch={false}>Privacy<LinkPending /></Link></nav>
        </div>
      </header>
      <main className={wrap}>{children}</main>
      <footer className="foot">
        <div className={wrap}>
          <span>Blaze Toolbox. Your files are processed on your device and never uploaded.</span>
          <Link className="footlink" href="/privacy" prefetch={false}>Privacy<LinkPending variant="inline" /></Link>
        </div>
      </footer>
    </div>
  );
}
