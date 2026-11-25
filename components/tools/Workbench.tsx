"use client";
import { useRef, useState } from "react";

type Out = { name: string; url: string; note: string };
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const base = (n: string) => n.replace(/\.[^.]+$/, "");
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("This browser could not export that format."))), type, q));

function draw(b: ImageBitmap, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  x.imageSmoothingQuality = "high";
  x.drawImage(b, 0, 0, w, h);
  return c;
}
function gray(c: HTMLCanvasElement, contrast = 1, lift = 0) {
  const x = c.getContext("2d")!;
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = Math.max(0, Math.min(255, (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] - 128) * contrast + 128 + lift));
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  x.putImageData(d, 0, 0);
}
async function openPdf(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
}
async function renderPage(doc: Awaited<ReturnType<typeof openPdf>>, n: number, scale: number) {
  const pg = await doc.getPage(n), v = pg.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.round(v.width); c.height = Math.round(v.height);
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: x, viewport: v }).promise;
  return c;
}

const CFG: Record<string, { accept: string; multi: boolean; hint: string; cta: string }> = {
  "image-resize": { accept: "image/*", multi: true, hint: "JPG, PNG or WebP. You can pick several.", cta: "Resize" },
  "image-compress": { accept: "image/*", multi: true, hint: "JPG, PNG or WebP. You can pick several.", cta: "Compress" },
  "pdf-to-image": { accept: "application/pdf", multi: false, hint: "One PDF. Every page becomes an image.", cta: "Convert pages" },
  "image-to-pdf": { accept: "image/*", multi: true, hint: "Pick photos in the order you want the pages.", cta: "Make PDF" },
  "pdf-grayscale": { accept: "application/pdf", multi: false, hint: "One color PDF.", cta: "Convert to grayscale" },
};

export function Workbench({ slug }: { slug: string }) {
  const cfg = CFG[slug];
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState<Out[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [w, setW] = useState(""); const [h, setH] = useState("");
  const [fmt, setFmt] = useState(slug === "image-compress" ? "image/jpeg" : "image/png");
  const [q, setQ] = useState(70);
  const [scale, setScale] = useState(2);
  const [scan, setScan] = useState(true);
  const urls = useRef<string[]>([]);

  const keep = (blob: Blob) => { const u = URL.createObjectURL(blob); urls.current.push(u); return u; };

  async function run() {
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    setOut([]); setErr(""); setBusy(true);
    try {
      const res: Out[] = [];
      if (slug === "image-resize" || slug === "image-compress") {
        for (const f of files) {
          setStatus(`Working on ${f.name}`);
          const b = await createImageBitmap(f);
          let tw = b.width, th = b.height;
          if (slug === "image-resize") {
            const pw = parseInt(w), ph = parseInt(h);
            if (!pw && !ph) throw new Error("Enter a width, a height, or both.");
            if (pw && ph) { tw = pw; th = ph; }
            else if (pw) { tw = pw; th = Math.round((b.height * pw) / b.width); }
            else { th = ph; tw = Math.round((b.width * ph) / b.height); }
          }
          const type = fmt === "image/png" && slug === "image-compress" ? "image/jpeg" : fmt;
          const blob = await toBlob(draw(b, tw, th), type, slug === "image-compress" ? q / 100 : 0.92);
          const note = slug === "image-compress"
            ? `${kb(f.size)} to ${kb(blob.size)} (${blob.size < f.size ? "-" : "+"}${Math.abs(Math.round((1 - blob.size / f.size) * 100))}%)`
            : `${tw} × ${th} px, ${kb(blob.size)}`;
          res.push({ name: `${base(f.name)}-${slug === "image-resize" ? `${tw}x${th}` : "compressed"}.${EXT[type]}`, url: keep(blob), note });
        }
      } else if (slug === "pdf-to-image") {
        const doc = await openPdf(files[0]);
        for (let i = 1; i <= doc.numPages; i++) {
          setStatus(`Page ${i} of ${doc.numPages}`);
          const blob = await toBlob(await renderPage(doc, i, scale), fmt, 0.92);
          res.push({ name: `${base(files[0].name)}-page-${i}.${EXT[fmt]}`, url: keep(blob), note: kb(blob.size) });
        }
      } else if (slug === "image-to-pdf") {
        const { PDFDocument } = await import("pdf-lib");
        const pdf = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          setStatus(`Image ${i + 1} of ${files.length}`);
          const b = await createImageBitmap(files[i]);
          const k = Math.min(1, 2200 / Math.max(b.width, b.height));
          const c = draw(b, Math.round(b.width * k), Math.round(b.height * k));
          if (scan) gray(c, 1.5, 12);
          const img = await pdf.embedJpg(await (await toBlob(c, "image/jpeg", 0.85)).arrayBuffer());
          const [PW, PH, M] = [595.28, 841.89, 24];
          const s = Math.min((PW - 2 * M) / img.width, (PH - 2 * M) / img.height);
          pdf.addPage([PW, PH]).drawImage(img, { x: (PW - img.width * s) / 2, y: (PH - img.height * s) / 2, width: img.width * s, height: img.height * s });
        }
        const blob = new Blob([(await pdf.save()) as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: "images.pdf", url: keep(blob), note: `${files.length} page(s), ${kb(blob.size)}` });
      } else if (slug === "pdf-grayscale") {
        const { PDFDocument } = await import("pdf-lib");
        const doc = await openPdf(files[0]), pdf = await PDFDocument.create();
        for (let i = 1; i <= doc.numPages; i++) {
          setStatus(`Page ${i} of ${doc.numPages}`);
          const c = await renderPage(doc, i, 2);
          gray(c);
          const img = await pdf.embedJpg(await (await toBlob(c, "image/jpeg", 0.85)).arrayBuffer());
          pdf.addPage([c.width / 2, c.height / 2]).drawImage(img, { x: 0, y: 0, width: c.width / 2, height: c.height / 2 });
        }
        const blob = new Blob([(await pdf.save()) as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: `${base(files[0].name)}-grayscale.pdf`, url: keep(blob), note: `${kb(files[0].size)} to ${kb(blob.size)}` });
      }
      setOut(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try a different file.");
    } finally { setBusy(false); setStatus(""); }
  }

  const imgFmt = (
    <label>Format
      <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
        {slug !== "image-compress" && <option value="image/png">PNG</option>}
        <option value="image/jpeg">JPG</option>
        <option value="image/webp">WebP</option>
      </select>
    </label>
  );

  return (
    <div className="wb">
      <label className="drop">
        <strong>{files.length ? files.map((f) => f.name).join(", ") : "Choose a file"}</strong>
        <span>{files.length ? "Choose again to replace." : `${cfg.hint} Or drop it here.`}</span>
        <input type="file" accept={cfg.accept} multiple={cfg.multi} onChange={(e) => { setFiles(Array.from(e.target.files || [])); setOut([]); setErr(""); }} />
      </label>

      <div className="opts">
        {slug === "image-resize" && <>
          <label>Width (px)<input type="number" min="1" value={w} onChange={(e) => setW(e.target.value)} /></label>
          <label>Height (px)<input type="number" min="1" value={h} onChange={(e) => setH(e.target.value)} /></label>
          {imgFmt}
          <p className="hint">Fill one side to keep the aspect ratio. Fill both for an exact size.</p>
        </>}
        {slug === "image-compress" && <>
          <label>Quality: {q}<input type="range" min="10" max="95" value={q} onChange={(e) => setQ(+e.target.value)} /></label>
          {imgFmt}
          <p className="hint">Lower quality gives a smaller file. PNG photos are saved as JPG or WebP.</p>
        </>}
        {slug === "pdf-to-image" && <>
          <label>Sharpness
            <select value={scale} onChange={(e) => setScale(+e.target.value)}>
              <option value={1.5}>Standard</option><option value={2}>High</option><option value={3}>Very high</option>
            </select>
          </label>
          {imgFmt}
        </>}
        {slug === "image-to-pdf" && (
          <label className="check"><input type="checkbox" checked={scan} onChange={(e) => setScan(e.target.checked)} />Scanned look<small>Black and white with higher contrast, like a document scanner.</small></label>
        )}
        {slug === "pdf-grayscale" && <p className="hint">Each page is redrawn as a grayscale image, so text can no longer be selected or searched in the new file.</p>}
      </div>

      <button className="btn primary" disabled={!files.length || busy} onClick={run}>{busy ? status || "Working" : cfg.cta}</button>
      {err && <p className="err" role="alert">{err}</p>}
      {out.length > 0 && (
        <ul className="res" aria-live="polite">
          {out.map((o) => (
            <li key={o.url}><div><b>{o.name}</b><span>{o.note}</span></div><a className="btn" href={o.url} download={o.name}>Download</a></li>
          ))}
        </ul>
      )}
    </div>
  );
}
