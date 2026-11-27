import Link from "next/link";
import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { LinkPending } from "@/components/LinkPending";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Blaze Toolbox handles your files: everything runs on your device and nothing is uploaded.",
};

const FILE_TOOLS = ["Passport photo sheet", "Image resize", "Image compress", "Image converter", "HEIC to JPG", "SVG to PNG", "Favicon and app icons", "Circle crop", "Add a watermark", "Image to Base64", "PDF to image", "Image to PDF, scanned look", "Color PDF to grayscale", "Merge PDFs", "Split PDF", "Rotate PDF", "Unlock PDF", "Lock PDF"];

export default function Privacy() {
  return (
    <Shell>
      <section className="hero">
        <h1>Your files stay on your device.</h1>
        <p className="lede">Blaze Toolbox is a set of small tools that run inside your browser. There is no upload button because there is nowhere to upload to. Here is exactly what that means.</p>
      </section>

      <div className="prose">
        <section>
          <h2>The short version</h2>
          <p>Open a tool, pick a file, get a result. The file is read and rewritten by your own browser. It is never sent to us or to anyone else, because this site has no server that accepts files.</p>
          <ul>
            <li><strong>No uploads.</strong> The site only works with files already on your device.</li>
            <li><strong>No accounts.</strong> Nothing to sign up for, and no profile to build.</li>
            <li><strong>No analytics or trackers.</strong> No advertising, no behaviour tracking, no third-party scripts.</li>
            <li><strong>No cookies.</strong> We do not set cookies or share anything with data brokers.</li>
          </ul>
        </section>

        <section>
          <h2>What happens to your file</h2>
          <p>Each tool loads the code it needs and runs it locally. For the PDF and image tools the work happens through your browser&rsquo;s own APIs, or through an open-source library that is downloaded once from this same site and then runs on your machine:</p>
          <ul>
            <li>Images are processed with the browser&rsquo;s built-in canvas and image decoding.</li>
            <li>PDFs are handled with open-source libraries (pdf-lib, pdf.js, qpdf) that run inside the page.</li>
            <li>When you close or refresh the tab, the working copy is gone. Results exist only as downloads you choose to keep.</li>
          </ul>
          <p>Because processing is local, big files may use more of your device&rsquo;s memory and can be slower on older phones. That is the trade-off for not shipping your documents over the internet.</p>
        </section>

        <section>
          <h2>Tools that work this way</h2>
          <ul className="grid-list">
            {FILE_TOOLS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p>Every tool on the site is in this category. None of them upload your file for processing.</p>
        </section>

        <section>
          <h2>What the site does collect</h2>
          <p>Almost nothing, but we want to be precise rather than smug:</p>
          <ul>
            <li><strong>Hosting.</strong> The site is served as static files by a web host. Like any website, the host may keep standard access logs (IP address, time, page requested) to run and protect the service. That is host-level, not something the tools send.</li>
            <li><strong>Local storage on your device.</strong> A couple of settings are remembered in your browser&rsquo;s own storage so the site feels right on a return visit &mdash; for example the passport sheet keeps your last layout. This stays on your device and is never transmitted anywhere.</li>
            <li><strong>No personal data.</strong> We do not ask for a name, email, or login, and we do not build advertising profiles.</li>
          </ul>
        </section>

        <section>
          <h2>Password-protected PDFs</h2>
          <p>Unlock PDF removes protection only from files you own or are allowed to change. If a PDF needs a password to open, you must type that password; the tool does not guess or crack it. The password and the file are handled entirely on your device.</p>
        </section>

        <section>
          <h2>Changes and contact</h2>
          <p>If this page changes, the update will appear here. If anything about how the site handles data is ever unclear, that is a bug worth fixing.</p>
        </section>
      </div>

      <div className="cta">
        <Link className="btn primary" href="/#tools" prefetch={false}>Browse the tools<LinkPending variant="inline" /></Link>
        <Link className="btn" href="/" prefetch={false}>Back home<LinkPending variant="inline" /></Link>
      </div>
    </Shell>
  );
}
