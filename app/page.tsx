import Link from "next/link";
import { Shell } from "@/components/Shell";
import { LinkPending } from "@/components/LinkPending";
import { ToolSearch } from "@/components/ToolSearch";

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

      <ToolSearch />

      <section id="privacy" className="facts">
        <p><strong>Runs in your browser.</strong> Every tool works with the files already on your device.</p>
        <p><strong>No account.</strong> Open a tool, drop a file, download the result.</p>
        <p><strong>No watermarks.</strong> Results are clean files you can print, send or upload anywhere.</p>
        <p><strong>How we handle your data.</strong> No uploads, no trackers, no cookies. <Link href="/privacy" prefetch={false}>Read the full privacy note<LinkPending variant="inline" /></Link>.</p>
      </section>
    </Shell>
  );
}