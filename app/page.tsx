import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { TOOLS } from "@/lib/tools";

export default function Home() {
  return (
    <Shell>
      <section className="hero">
        <h1>Everyday file jobs, done on your own device.</h1>
        <p className="lede">Resize and compress photos, build passport sheets, and convert PDFs. Nothing is uploaded, so your documents never leave your phone or laptop.</p>
        <div className="cta">
          <Link className="btn primary" href="/tools/passport-photo" prefetch={false}>Make a passport sheet</Link>
          <a className="btn" href="#tools">Browse tools</a>
        </div>
      </section>

      <section id="tools" className="tools" aria-label="Tools">
        {TOOLS.map((t, i) => (
          <Link key={t.slug} href={`/tools/${t.slug}`} prefetch={false} className={`cell t-${t.slug}`} style={{ "--i": i } as React.CSSProperties}>
            <Icon slug={t.slug} />
            <h2>{t.name}</h2>
            <p>{t.blurb}</p>
            <span className="meta"><span>{t.meta}</span></span>
          </Link>
        ))}
      </section>

      <section id="privacy" className="facts">
        <p><strong>Runs in your browser.</strong> Every tool works with the files already on your device.</p>
        <p><strong>No account.</strong> Open a tool, drop a file, download the result.</p>
        <p><strong>No watermarks.</strong> Results are clean files you can print, send or upload anywhere.</p>
      </section>
    </Shell>
  );
}
