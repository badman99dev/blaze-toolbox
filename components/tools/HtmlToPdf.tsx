"use client";
import { useMemo, useRef, useState } from "react";
import { loadLib } from "@/lib/loadlog";

const SIZES: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] };
const PT_MM = 72 / 25.4;
const PX_PER_PT = 96 / 72;
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

const BASE_CSS = `html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:#111;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
img,svg,table,video{max-width:100%}
a{color:#1a3fd0}
@media print{body{padding:0!important}}`;

// The HTML and CSS are placed in a sandboxed iframe. `@page` drives the paper
// size for the browser's own print engine (which is what "Save as PDF" uses —
// real vector text that stays selectable), while an on-screen body padding
// gives the preview the same margins. No library is needed for that path.
function buildDoc(html: string, css: string, size: string, orient: string, margin: number, capture: boolean) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${size} ${orient};margin:${margin}mm}
${BASE_CSS}
body{padding:${capture ? 0 : margin}mm}
${css}
</style></head><body>${html}</body></html>`;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
function captureFrame(src: string): Promise<HTMLIFrameElement> {
  return new Promise((ok, no) => {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-same-origin");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px;border:0;opacity:0;pointer-events:none;z-index:-1";
    f.onload = () => ok(f);
    f.onerror = () => { f.remove(); no(new Error("Could not render the HTML.")); };
    f.srcdoc = src;
    document.body.appendChild(f);
  });
}

type Run = { text: string; x: number; top: number; size: number; style: "normal" | "bold" | "italic" | "bolditalic" };

// Walk the rendered document and collect every line of text with its position and
// size. These lines are re-drawn into the PDF in invisible mode on top of the
// picture, so the file looks exactly the same but its words can be selected,
// searched and copied — a "searchable PDF", the same idea as an OCR'd scan. The
// built-in PDF fonts only hold Latin-1, so characters outside that range are left
// out of the text layer (the picture still shows them).
function collectRuns(root: HTMLElement, originX: number, originY: number): Run[] {
  const win = root.ownerDocument.defaultView;
  if (!win) return [];
  const runs: Run[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent || "";
    if (!text.trim()) continue;
    const el = node.parentElement;
    if (!el) continue;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse" || parseFloat(cs.opacity) === 0) continue;
    const size = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600;
    const italic = cs.fontStyle === "italic" || cs.fontStyle === "oblique";
    const style: Run["style"] = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
    const range = root.ownerDocument.createRange();
    const lines = new Map<number, { text: string; x: number; top: number }>();
    let off = 0;
    for (const part of text.split(/(\s+)/)) {
      if (part.trim()) {
        range.setStart(node, off);
        range.setEnd(node, off + part.length);
        const r = range.getBoundingClientRect();
        if (r.height > 0) {
          const key = Math.round((r.top - originY) / 2);
          const x = r.left - originX, top = r.top - originY;
          const cur = lines.get(key);
          if (cur) { cur.text += " " + part; cur.x = Math.min(cur.x, x); cur.top = Math.min(cur.top, top); }
          else lines.set(key, { text: part, x, top });
        }
      }
      off += part.length;
    }
    for (const ln of lines.values()) {
      const safe = ln.text.replace(/[\u0100-\uFFFF]/g, " ").replace(/\s+/g, " ").trim();
      if (safe) runs.push({ text: safe, x: ln.x, top: ln.top, size, style });
    }
  }
  return runs;
}

const EXAMPLE_HTML = `<h1>Invoice</h1>
<p class="muted">Blaze Toolbox — 28 November 2026</p>
<table>
  <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th></tr></thead>
  <tbody>
    <tr><td>Image resize</td><td class="r">1</td><td class="r">Free</td></tr>
    <tr><td>PDF compress</td><td class="r">3</td><td class="r">Free</td></tr>
  </tbody>
</table>
<p class="total">Total: <b>Free</b></p>
<p>Edit the boxes on the left, then save it as a PDF.</p>`;
const EXAMPLE_CSS = `h1{margin:0 0 .25rem;font-size:1.8rem}
.muted{color:#666;margin:0 0 1.5rem}
table{width:100%;border-collapse:collapse;margin-bottom:1.25rem}
th,td{padding:.5rem .25rem;border-bottom:1px solid #ddd;text-align:left}
th{border-bottom:2px solid #333}
.r{text-align:right}
.total{text-align:right;font-size:1.15rem}`;

export function HtmlToPdf() {
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [size, setSize] = useState("A4");
  const [orient, setOrient] = useState("portrait");
  const [margin, setMargin] = useState(15);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ url: string; name: string; size: number; pages: number } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const urlRef = useRef<string | null>(null);

  const doc = useMemo(() => buildDoc(html, css, size, orient, margin, false), [html, css, size, orient, margin]);
  const [pw, ph] = SIZES[size];
  const pageW = orient === "landscape" ? ph : pw;
  const pageH = orient === "landscape" ? pw : ph;

  const fileName = () => {
    const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
    return `${(t || "document").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60).trim() || "document"}.pdf`;
  };

  const doPrint = () => {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    try { w.focus(); w.print(); }
    catch { setErr("Your browser blocked the print window. Use “Download .pdf” instead."); }
  };

  async function downloadPdf() {
    setErr(""); setResult(null); setBusy(true);
    try {
      const m = Math.max(0, margin) * PT_MM;
      const usableW = pageW - 2 * m, usableH = pageH - 2 * m;
      if (usableW <= 0 || usableH <= 0) throw new Error("Those margins do not fit on this page size.");
      setStatus("Rendering the page");
      const f = await captureFrame(buildDoc(html, css, size, orient, margin, true));
      let canvas: HTMLCanvasElement;
      let runs: Run[] = [];
      let bodyW = 1;
      try {
        const html2canvas = (await loadLib("html2canvas", "PDF renderer (html2canvas)", () => import("html2canvas-pro"))).default;
        const body = f.contentDocument!.body;
        body.style.width = Math.round(usableW * PX_PER_PT) + "px";
        const h = f.contentDocument!.documentElement.scrollHeight || 200;
        f.style.width = Math.round(usableW * PX_PER_PT) + "px";
        f.style.height = Math.max(200, h) + "px";
        await nextFrame();
        const bodyRect = body.getBoundingClientRect();
        bodyW = body.scrollWidth || body.clientWidth || 1;
        runs = collectRuns(body, bodyRect.left, bodyRect.top);
        canvas = await html2canvas(body, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false, width: body.scrollWidth, height: body.scrollHeight, windowWidth: body.scrollWidth });
      } finally { f.remove(); }
      setStatus("Writing the PDF");
      const ratio = usableW / canvas.width;
      const pages = Math.max(1, Math.ceil((canvas.height * ratio) / usableH - 1e-6));
      // DOM px -> PDF pt for the text layer (the body width maps onto the usable width).
      const domToPt = usableW / bodyW;
      const baselineOf = (r: Run) => (r.top + r.size * 0.8) * domToPt;
      const runsByPage: Run[][] = Array.from({ length: pages }, () => []);
      for (const r of runs) {
        const pg = Math.min(pages - 1, Math.max(0, Math.floor(baselineOf(r) / usableH)));
        runsByPage[pg].push(r);
      }
      const { jsPDF } = await loadLib("jspdf", "PDF writer (jsPDF)", () => import("jspdf"));
      const pdf = new jsPDF({ unit: "pt", format: [pageW, pageH], orientation: orient === "landscape" ? "landscape" : "portrait", compress: true });
      const sliceHpx = usableH / ratio;
      for (let p = 0; p < pages; p++) {
        const sy = p * sliceHpx;
        const sh = Math.min(sliceHpx, canvas.height - sy);
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width; tmp.height = Math.max(1, Math.ceil(sh));
        const cx = tmp.getContext("2d")!;
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, tmp.width, tmp.height);
        cx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
        if (p > 0) pdf.addPage([pageW, pageH], orient === "landscape" ? "landscape" : "portrait");
        pdf.addImage(tmp.toDataURL("image/jpeg", 0.92), "JPEG", m, m, usableW, sh * ratio);
        // A selectable, searchable text layer on top of the picture (invisible ink).
        for (const r of runsByPage[p]) {
          const y = m + baselineOf(r) - p * usableH;
          if (y < 1 || y > pageH - 1) continue;
          pdf.setFont("helvetica", r.style);
          pdf.setFontSize(r.size * domToPt);
          pdf.text(r.text, m + r.x * domToPt, y, { renderingMode: "invisible", baseline: "alphabetic" });
        }
      }
      const blob = pdf.output("blob");
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setResult({ url: urlRef.current, name: fileName(), size: blob.size, pages });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not build the PDF.");
    } finally { setBusy(false); setStatus(""); }
  }

  return (
    <div className="wb">
      <div className="wb-in">
        <label className="drop">
          <b>Load an .html file</b>
          <span>Optional — or just paste your HTML below.</span>
          <input type="file" accept=".html,.htm,text/html" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setHtml(await f.text()); e.target.value = ""; }} />
        </label>
        <div className="opts">
          <label className="full">HTML
            <textarea className="code" value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} placeholder="<h1>Hello</h1><p>Your content here…</p>" />
          </label>
          <label className="full">CSS (optional)
            <textarea className="code" value={css} onChange={(e) => setCss(e.target.value)} spellCheck={false} placeholder="h1{ color:#1a3fd0 }" />
          </label>
          <label>Page size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>
          <label>Orientation
            <select value={orient} onChange={(e) => setOrient(e.target.value)}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label>Margin (mm)
            <input type="number" min={0} max={50} value={margin} onChange={(e) => setMargin(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
          </label>
          <label className="full">Need a starting point?
            <button type="button" className="btn" onClick={() => { setHtml(EXAMPLE_HTML); setCss(EXAMPLE_CSS); }}>Load an example</button>
          </label>
        </div>
        <button className="btn primary" disabled={busy || (!html.trim() && !css.trim())} onClick={doPrint}>Save as PDF</button>
        <button className="btn" disabled={busy || !html.trim()} onClick={downloadPdf}>{busy ? status || "Working" : "Download .pdf"}</button>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="hint"><b>Save as PDF</b> uses your browser&rsquo;s own print engine — pick <b>“Save as PDF”</b> in the dialog. The words stay sharp and vector (best quality). <b>Download .pdf</b> makes the file straight away with <b>selectable, searchable text</b> on top of the page picture. Everything happens on your device.</p>
      </div>

      <section className="wb-out" aria-label="Preview and result">
        <div className="h2p-head"><b>Preview</b><span className="fsz">{Math.round(pageW)} × {Math.round(pageH)} pt · {size} {orient}</span></div>
        {html.trim() || css.trim()
          ? <iframe ref={frameRef} className="h2p-view" srcDoc={doc} sandbox="allow-same-origin allow-modals" title="HTML preview" />
          : <p className="empty">Paste some HTML or load an .html file to see the preview.</p>}
        {result ? (
          <ul className="res">
            <li>
              <div><b>{result.name}</b><span>{result.pages} page{result.pages === 1 ? "" : "s"}, {kb(result.size)} — text is selectable and searchable</span></div>
              <a className="btn" href={result.url} download={result.name}>Download</a>
            </li>
          </ul>
        ) : <p className="empty">{busy ? status || "Working" : "Your PDF will appear here."}</p>}
      </section>
    </div>
  );
}
