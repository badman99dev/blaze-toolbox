import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { LinkPending } from "@/components/LinkPending";
import { ModeTag } from "@/components/ModeTag";
import { TOOLS, CATEGORIES } from "@/lib/tools";

export default function Home() {
  return (
    <Shell>
      <section className="hero">
        <h1>Everyday file jobs, done on your own device.</h1>
        <p className="lede">Resize and compress photos, build passport sheets, and convert PDFs. Nothing is uploaded, so your documents never leave your phone or laptop.</p>
        <div className="cta">
          <Link className="btn primary" href="/tools/passport-photo" prefetch={false}>Make a passport sheet<LinkPending variant="inline" /></Link>
          <a className="btn" href="#tools">Browse tools</a>
        </div>
      </section>

      <div id="tools" className="tool-cats">
        {CATEGORIES.map((cat) => {
          const items = TOOLS.filter((t) => t.cat === cat.id);
          if (!items.length) return null;
          return (
            <section key={cat.id} id={cat.id} className="tools-section" aria-labelledby={`${cat.id}-title`}>
              <div className="tools-head">
                <h2 id={`${cat.id}-title`}>{cat.title}</h2>
                <p>{cat.desc}</p>
              </div>
              <div className="tools">
                {items.map((t, i) => (
                  <Link key={t.slug} href={`/tools/${t.slug}`} prefetch={false} className={`cell t-${t.slug}`} style={{ "--i": i } as React.CSSProperties}>
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

      <section id="privacy" className="facts">
        <p><strong>Runs in your browser.</strong> Every tool works with the files already on your device.</p>
        <p><strong>No account.</strong> Open a tool, drop a file, download the result.</p>
        <p><strong>No watermarks.</strong> Results are clean files you can print, send or upload anywhere.</p>
        <p><strong>How we handle your data.</strong> No uploads, no trackers, no cookies. <Link href="/privacy" prefetch={false}>Read the full privacy note<LinkPending variant="inline" /></Link>.</p>
      </section>
    </Shell>
  );
}