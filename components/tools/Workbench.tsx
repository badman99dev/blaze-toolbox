"use client";
import { useRef, useState } from "react";

type Out = { name: string; url: string; note: string };
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const base = (n: string) => n.replace(/\.[^.]+$/, "");
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("This browser could not export that format. Try PNG, JPG or WebP."))), type, q));

function draw(b: ImageBitmap, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  x.imageSmoothingQuality = "high";
  x.drawImage(b, 0, 0, w, h);
  return c;
}
function canvas(w: number, h: number, fill?: string) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  if (fill) { x.fillStyle = fill; x.fillRect(0, 0, w, h); }
  x.imageSmoothingQuality = "high";
  return { c, x };
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
function loadImg(src: string) {
  return new Promise<HTMLImageElement>((ok, no) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => no(new Error("Could not read that image."));
    im.src = src;
  });
}
function parsePages(input: string, total: number) {
  const set = new Set<number>();
  input.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = +m[1], b = +m[2];
      if (a > b) { const t = a; a = b; b = t; }
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) set.add(i);
    } else if (/^\d+$/.test(part)) {
      const n = +part;
      if (n >= 1 && n <= total) set.add(n);
    }
  });
  return [...set].sort((a, b) => a - b);
}
// qpdf compiled to WebAssembly handles real-world protected PDFs (xref streams,
// AES-256, owner-only restrictions) and writes a genuinely unencrypted copy.
// The 1.3 MB wasm is served from /qpdf/qpdf.wasm and only fetched on first use.
type Qpdf = { FS: { writeFile: (p: string, d: Uint8Array) => void; readFile: (p: string) => Uint8Array; unlink: (p: string) => void }; callMain: (a: string[]) => number };
let qpdfReady: Promise<Qpdf> | null = null;
async function getQpdf(): Promise<Qpdf> {
  if (!qpdfReady) {
    qpdfReady = (async () => {
      const mod: any = await import("@neslinesli93/qpdf-wasm");
      const create = mod.default ?? mod;
      return (await create({ locateFile: () => "/qpdf/qpdf.wasm" })) as Qpdf;
    })().catch((e) => { qpdfReady = null; throw e; });
  }
  return qpdfReady;
}
async function qpdfRun(bytes: Uint8Array, makeArgs: (input: string, output: string) => string[]) {
  const qpdf = await getQpdf();
  const fs = qpdf.FS;
  try { fs.unlink("in.pdf"); } catch { /* no previous file */ }
  try { fs.unlink("out.pdf"); } catch { /* no previous file */ }
  fs.writeFile("in.pdf", bytes);
  const args = makeArgs("in.pdf", "out.pdf");
  await new Promise((r) => setTimeout(r, 0));
  let code = 0;
  try { code = qpdf.callMain(args); } catch (e: any) { code = e?.status ?? 1; }
  let out: Uint8Array | null = null;
  try { out = fs.readFile("out.pdf"); } catch { /* qpdf did not write one */ }
  try { fs.unlink("in.pdf"); } catch { /* ignore */ }
  try { fs.unlink("out.pdf"); } catch { /* ignore */ }
  return { out, code };
}
async function unlockPdf(bytes: Uint8Array, password: string) {
  const { out, code } = await qpdfRun(bytes, (input, output) => {
    const args = ["--decrypt"];
    if (password) args.push(`--password=${password}`);
    args.push("--", input, output);
    return args;
  });
  if (!out || !out.length) {
    if (code === 2) {
      throw new Error(password
        ? "That password did not open this PDF. Check it and try again."
        : "This PDF needs a password to open. Type the password above, then unlock.");
    }
    throw new Error("Could not unlock this PDF. It may be damaged or use an unsupported protection.");
  }
  return out;
}
async function lockPdf(bytes: Uint8Array, password: string, allowPrint: boolean, allowCopy: boolean) {
  const { out } = await qpdfRun(bytes, (input, output) => {
    const args = ["--encrypt", password, password, "256"];
    if (!allowPrint) args.push("--print=none");
    if (!allowCopy) args.push("--extract=n");
    args.push("--", input, output);
    return args;
  });
  if (!out || !out.length) throw new Error("Could not add a password to this PDF. It may be damaged or already encrypted.");
  return out;
}
function buildIco(images: { size: number; bytes: Uint8Array }[]) {
  const header = 6 + 16 * images.length;
  const total = header + images.reduce((s, i) => s + i.bytes.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, images.length, true);
  let off = header;
  images.forEach((im, i) => {
    const p = 6 + i * 16;
    const s = im.size >= 256 ? 0 : im.size;
    out[p] = s; out[p + 1] = s; out[p + 2] = 0; out[p + 3] = 0;
    dv.setUint16(p + 4, 1, true); dv.setUint16(p + 6, 32, true);
    dv.setUint32(p + 8, im.bytes.length, true); dv.setUint32(p + 12, off, true);
    out.set(im.bytes, off); off += im.bytes.length;
  });
  return out;
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
  "image-convert": { accept: "image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp", multi: true, hint: "Pick images to convert. You can choose several.", cta: "Convert" },
  "heic-to-jpg": { accept: ".heic,.heif,image/heic,image/heif", multi: true, hint: "iPhone HEIC or HEIF photos. You can pick several.", cta: "Convert" },
  "svg-to-png": { accept: ".svg,image/svg+xml", multi: true, hint: "One or more SVG files.", cta: "Rasterize" },
  "favicon-generator": { accept: "image/*", multi: false, hint: "One square image works best.", cta: "Build icon pack" },
  "circle-crop": { accept: "image/*", multi: true, hint: "Pick photos to turn into round avatars.", cta: "Crop to circle" },
  "watermark": { accept: "image/*", multi: true, hint: "Pick photos to watermark.", cta: "Add watermark" },
  "image-to-base64": { accept: "image/*", multi: true, hint: "Pick images to encode.", cta: "Encode" },
  "pdf-to-image": { accept: "application/pdf", multi: false, hint: "One PDF. Every page becomes an image.", cta: "Convert pages" },
  "image-to-pdf": { accept: "image/*", multi: true, hint: "Pick photos in the order you want the pages.", cta: "Make PDF" },
  "pdf-grayscale": { accept: "application/pdf", multi: false, hint: "One color PDF.", cta: "Convert to grayscale" },
  "pdf-merge": { accept: "application/pdf", multi: true, hint: "Pick PDFs in the order to join. Choose again to replace and reorder.", cta: "Merge" },
  "pdf-split": { accept: "application/pdf", multi: false, hint: "One PDF. Choose the pages to keep.", cta: "Split" },
  "pdf-rotate": { accept: "application/pdf", multi: false, hint: "One PDF.", cta: "Rotate" },
  "pdf-unlock": { accept: "application/pdf", multi: false, hint: "One PDF. Enter its password if it asks for one.", cta: "Unlock" },
  "pdf-lock": { accept: "application/pdf", multi: false, hint: "One PDF. Choose a password to open it.", cta: "Lock" },
};

export function Workbench({ slug }: { slug: string }) {
  const cfg = CFG[slug];
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState<Out[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [w, setW] = useState(""); const [h, setH] = useState("");
  const [fmt, setFmt] = useState(slug === "image-compress" || slug === "heic-to-jpg" || slug === "watermark" ? "image/jpeg" : slug === "image-convert" ? "image/webp" : "image/png");
  const [q, setQ] = useState(70);
  const [scale, setScale] = useState(2);
  const [scan, setScan] = useState(true);
  const [svgW, setSvgW] = useState("512");
  const [avatarSize, setAvatarSize] = useState("512");
  const [bgc, setBgc] = useState("#ffffff");
  const [wmText, setWmText] = useState("© Your name");
  const [wmPos, setWmPos] = useState("bottom-right");
  const [wmOpacity, setWmOpacity] = useState(60);
  const [wmSize, setWmSize] = useState(5);
  const [wmColor, setWmColor] = useState("#ffffff");
  const [range, setRange] = useState("1-3");
  const [perPage, setPerPage] = useState(false);
  const [angle, setAngle] = useState("90");
  const [b64Mode, setB64Mode] = useState("data");
  const [pdfPw, setPdfPw] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
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
      } else if (slug === "image-convert") {
        for (const f of files) {
          setStatus(`Converting ${f.name}`);
          const b = await createImageBitmap(f);
          const { c, x } = canvas(b.width, b.height, fmt === "image/jpeg" ? "#fff" : undefined);
          x.drawImage(b, 0, 0, c.width, c.height);
          const blob = await toBlob(c, fmt, q / 100);
          res.push({ name: `${base(f.name)}-converted.${EXT[fmt]}`, url: keep(blob), note: `${EXT[fmt].toUpperCase()}, ${c.width} × ${c.height} px, ${kb(blob.size)}` });
        }
      } else if (slug === "heic-to-jpg") {
        const heicMod = await import("heic2any");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const heic2any: any = (heicMod as any).default ?? heicMod;
        for (const f of files) {
          setStatus(`Converting ${f.name}`);
          const conv = await heic2any({ blob: f, toType: "image/png" });
          const srcBlob = Array.isArray(conv) ? conv[0] : conv;
          const b = await createImageBitmap(srcBlob);
          const { c, x } = canvas(b.width, b.height, fmt === "image/jpeg" ? "#fff" : undefined);
          x.drawImage(b, 0, 0, c.width, c.height);
          const blob = await toBlob(c, fmt, q / 100);
          res.push({ name: `${base(f.name)}.${EXT[fmt]}`, url: keep(blob), note: `${EXT[fmt].toUpperCase()}, ${c.width} × ${c.height} px, ${kb(blob.size)}` });
        }
      } else if (slug === "svg-to-png") {
        const W = Math.max(1, Math.min(4096, parseInt(svgW) || 512));
        for (const f of files) {
          setStatus(`Rendering ${f.name}`);
          const url = URL.createObjectURL(f);
          try {
            const im = await loadImg(url);
            const ratio = im.naturalWidth && im.naturalHeight ? im.naturalHeight / im.naturalWidth : 1;
            const H = Math.max(1, Math.round(W * ratio));
            const { c, x } = canvas(W, H);
            x.drawImage(im, 0, 0, W, H);
            const blob = await toBlob(c, "image/png");
            res.push({ name: `${base(f.name)}-${W}x${H}.png`, url: keep(blob), note: `${W} × ${H} px, ${kb(blob.size)}` });
          } finally { URL.revokeObjectURL(url); }
        }
      } else if (slug === "favicon-generator") {
        const url = URL.createObjectURL(files[0]);
        try {
          const im = await loadImg(url);
          const sizes = [16, 32, 48, 64, 128, 180, 192, 512];
          const pngs: { size: number; bytes: Uint8Array }[] = [];
          for (const s of sizes) {
            setStatus(`Drawing ${s} px icon`);
            const { c, x } = canvas(s, s, bgc);
            const nw = im.naturalWidth || s, nh = im.naturalHeight || s;
            const sc = Math.max(s / nw, s / nh);
            const dw = nw * sc, dh = nh * sc;
            x.drawImage(im, (s - dw) / 2, (s - dh) / 2, dw, dh);
            const blob = await toBlob(c, "image/png");
            pngs.push({ size: s, bytes: new Uint8Array(await blob.arrayBuffer()) });
          }
          const ico = buildIco(pngs.filter((p) => p.size <= 48));
          const jsZipMod = await import("jszip");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const JSZip: any = (jsZipMod as any).default ?? jsZipMod;
          const zip = new JSZip();
          for (const p of pngs) zip.file(`icon-${p.size}x${p.size}.png`, p.bytes);
          zip.file("favicon.ico", ico);
          zip.file("README.txt", "Blaze Toolbox icon pack\n\n- favicon.ico: classic browser tab icon\n- 180x180: apple-touch-icon\n- 192x192, 512x512: Android / PWA\n- others: generic PNG sizes\n");
          const blob = await zip.generateAsync({ type: "blob" });
          res.push({ name: "icons.zip", url: keep(blob), note: `${pngs.length + 2} files, ${kb(blob.size)}` });
        } finally { URL.revokeObjectURL(url); }
      } else if (slug === "circle-crop") {
        const S = Math.max(32, Math.min(4096, parseInt(avatarSize) || 512));
        for (const f of files) {
          setStatus(`Cropping ${f.name}`);
          const b = await createImageBitmap(f);
          const { c, x } = canvas(S, S);
          x.save();
          x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.clip();
          const sc = Math.max(S / b.width, S / b.height);
          const dw = b.width * sc, dh = b.height * sc;
          x.drawImage(b, (S - dw) / 2, (S - dh) / 2, dw, dh);
          x.restore();
          const blob = await toBlob(c, "image/png");
          res.push({ name: `${base(f.name)}-round.png`, url: keep(blob), note: `${S} × ${S} px, transparent, ${kb(blob.size)}` });
        }
      } else if (slug === "watermark") {
        for (const f of files) {
          setStatus(`Watermarking ${f.name}`);
          const b = await createImageBitmap(f);
          const c = draw(b, b.width, b.height);
          const x = c.getContext("2d")!;
          const fs = Math.max(10, Math.round((Math.min(c.width, c.height) * wmSize) / 100));
          x.font = `600 ${fs}px system-ui, -apple-system, sans-serif`;
          x.globalAlpha = Math.max(0.05, Math.min(1, wmOpacity / 100));
          x.fillStyle = wmColor;
          x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = Math.max(2, fs * 0.18);
          const m = x.measureText(wmText);
          const pad = Math.round(fs * 0.7);
          let px = pad, py = pad + fs / 2;
          if (wmPos === "bottom-right") { px = c.width - pad - m.width; py = c.height - pad - fs / 2; }
          else if (wmPos === "bottom-left") { px = pad; py = c.height - pad - fs / 2; }
          else if (wmPos === "top-right") { px = c.width - pad - m.width; py = pad + fs / 2; }
          else if (wmPos === "center") { px = (c.width - m.width) / 2; py = c.height / 2; }
          x.textBaseline = "middle";
          x.fillText(wmText, px, py);
          const blob = await toBlob(c, fmt, q / 100);
          res.push({ name: `${base(f.name)}-watermark.${EXT[fmt]}`, url: keep(blob), note: `${c.width} × ${c.height} px, ${kb(blob.size)}` });
        }
      } else if (slug === "image-to-base64") {
        for (const f of files) {
          setStatus(`Encoding ${f.name}`);
          const dataUrl = await new Promise<string>((ok, no) => {
            const r = new FileReader();
            r.onload = () => ok(String(r.result));
            r.onerror = () => no(new Error("Could not read that file."));
            r.readAsDataURL(f);
          });
          const text = b64Mode === "img" ? `<img src="${dataUrl}" alt="${f.name}" />` : b64Mode === "css" ? `background-image: url("${dataUrl}");` : dataUrl;
          const blob = new Blob([text], { type: "text/plain" });
          res.push({ name: `${base(f.name)}-base64.txt`, url: keep(blob), note: `${b64Mode === "data" ? "Data URI" : b64Mode === "img" ? "HTML tag" : "CSS rule"}, ${kb(blob.size)}` });
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
      } else if (slug === "pdf-merge") {
        const { PDFDocument } = await import("pdf-lib");
        const merged = await PDFDocument.create();
        for (let i = 0; i < files.length; i++) {
          setStatus(`Adding ${files[i].name}`);
          const src = await PDFDocument.load(await files[i].arrayBuffer());
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
        }
        const blob = new Blob([(await merged.save()) as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: "merged.pdf", url: keep(blob), note: `${files.length} files, ${merged.getPageCount()} pages, ${kb(blob.size)}` });
      } else if (slug === "pdf-split") {
        const { PDFDocument } = await import("pdf-lib");
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const total = src.getPageCount();
        if (perPage) {
          for (let i = 1; i <= total; i++) {
            setStatus(`Saving page ${i} of ${total}`);
            const out = await PDFDocument.create();
            const [pg] = await out.copyPages(src, [i - 1]);
            out.addPage(pg);
            const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: "application/pdf" });
            res.push({ name: `${base(files[0].name)}-page-${i}.pdf`, url: keep(blob), note: `1 page, ${kb(blob.size)}` });
          }
        } else {
          const sel = parsePages(range, total);
          if (!sel.length) throw new Error(`Enter page numbers between 1 and ${total}, like 1-3 or 2,5,7.`);
          const out = await PDFDocument.create();
          const pages = await out.copyPages(src, sel.map((n) => n - 1));
          pages.forEach((p) => out.addPage(p));
          const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: "application/pdf" });
          res.push({ name: `${base(files[0].name)}-pages.pdf`, url: keep(blob), note: `${sel.length} of ${total} pages, ${kb(blob.size)}` });
        }
      } else if (slug === "pdf-rotate") {
        const { PDFDocument, degrees } = await import("pdf-lib");
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const total = src.getPageCount();
        const sel = range.trim() ? parsePages(range, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!sel.length) throw new Error(`Enter page numbers between 1 and ${total}, or leave it empty for all pages.`);
        const add = Number(angle);
        sel.forEach((n) => { const p = src.getPage(n - 1); p.setRotation(degrees((p.getRotation().angle + add) % 360)); });
        const blob = new Blob([(await src.save()) as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: `${base(files[0].name)}-rotated.pdf`, url: keep(blob), note: `${sel.length} page(s) turned ${add}°, ${kb(blob.size)}` });
      } else if (slug === "pdf-unlock") {
        setStatus("Removing protection");
        const bytes = new Uint8Array(await files[0].arrayBuffer());
        const out = await unlockPdf(bytes, pdfPw);
        const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: `${base(files[0].name)}-unlocked.pdf`, url: keep(blob), note: `Unlocked copy, ${kb(blob.size)}` });
      } else if (slug === "pdf-lock") {
        if (!pdfPw) throw new Error("Choose a password first.");
        setStatus("Adding password");
        const bytes = new Uint8Array(await files[0].arrayBuffer());
        const out = await lockPdf(bytes, pdfPw, allowPrint, allowCopy);
        const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: `${base(files[0].name)}-locked.pdf`, url: keep(blob), note: `Password-protected, ${kb(blob.size)}` });
      }
      setOut(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Try a different file.");
    } finally { setBusy(false); setStatus(""); }
  }

  const imgFmt = (withAvif = false) => (
    <label>Format
      <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
        {slug !== "image-compress" && !withAvif && <option value="image/png">PNG</option>}
        {withAvif && <option value="image/png">PNG</option>}
        <option value="image/jpeg">JPG</option>
        <option value="image/webp">WebP</option>
        {withAvif && <option value="image/avif">AVIF</option>}
      </select>
    </label>
  );

  return (
    <div className="wb">
      <div className="wb-in">
      <label className="drop">
        <strong>{files.length ? files.map((f) => f.name).join(", ") : "Choose a file"}</strong>
        <span>{files.length ? "Choose again to replace." : `${cfg.hint} Or drop it here.`}</span>
        <input type="file" accept={cfg.accept} multiple={cfg.multi} onChange={(e) => { setFiles(Array.from(e.target.files || [])); setOut([]); setErr(""); }} />
      </label>

      <div className="opts">
        {slug === "image-resize" && <>
          <label>Width (px)<input type="number" min="1" value={w} onChange={(e) => setW(e.target.value)} /></label>
          <label>Height (px)<input type="number" min="1" value={h} onChange={(e) => setH(e.target.value)} /></label>
          {imgFmt()}
          <p className="hint">Fill one side to keep the aspect ratio. Fill both for an exact size.</p>
        </>}
        {slug === "image-compress" && <>
          <label>Quality: {q}<input type="range" min="10" max="95" value={q} onChange={(e) => setQ(+e.target.value)} /></label>
          {imgFmt()}
          <p className="hint">Lower quality gives a smaller file. PNG photos are saved as JPG or WebP.</p>
        </>}
        {slug === "image-convert" && <>
          {imgFmt(true)}
          <label>Quality: {q}<input type="range" min="10" max="100" value={q} onChange={(e) => setQ(+e.target.value)} /></label>
          <p className="hint">WebP and AVIF give the smallest files. AVIF needs a modern browser; if it is missing, use WebP.</p>
        </>}
        {slug === "heic-to-jpg" && <>
          {imgFmt()}
          <label>Quality: {q}<input type="range" min="10" max="100" value={q} onChange={(e) => setQ(+e.target.value)} /></label>
          <p className="hint">HEIC decoding loads only when you convert, so the page stays light.</p>
        </>}
        {slug === "svg-to-png" && <>
          <label>Width (px)<input type="number" min="16" max="4096" value={svgW} onChange={(e) => setSvgW(e.target.value)} /></label>
          <p className="hint">Height follows the SVG's own ratio. Transparency is kept.</p>
        </>}
        {slug === "favicon-generator" && <>
          <label>Background<input type="color" value={bgc} onChange={(e) => setBgc(e.target.value)} /></label>
          <p className="hint">Exports 16 to 512 px PNGs plus favicon.ico in one ZIP.</p>
        </>}
        {slug === "circle-crop" && <>
          <label>Size (px)<input type="number" min="32" max="4096" value={avatarSize} onChange={(e) => setAvatarSize(e.target.value)} /></label>
          <p className="hint">Saves a square PNG with a transparent circular edge, centred on the photo.</p>
        </>}
        {slug === "watermark" && <>
          <label>Text<input type="text" value={wmText} onChange={(e) => setWmText(e.target.value)} /></label>
          <label>Position
            <select value={wmPos} onChange={(e) => setWmPos(e.target.value)}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
              <option value="top-right">Top right</option>
              <option value="top-left">Top left</option>
              <option value="center">Centre</option>
            </select>
          </label>
          <label>Size: {wmSize}%<input type="range" min="2" max="20" value={wmSize} onChange={(e) => setWmSize(+e.target.value)} /></label>
          <label>Opacity: {wmOpacity}%<input type="range" min="10" max="100" value={wmOpacity} onChange={(e) => setWmOpacity(+e.target.value)} /></label>
          <label>Colour<input type="color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} /></label>
          {imgFmt()}
        </>}
        {slug === "image-to-base64" && <>
          <label>Output
            <select value={b64Mode} onChange={(e) => setB64Mode(e.target.value)}>
              <option value="data">Data URI</option>
              <option value="img">HTML img tag</option>
              <option value="css">CSS background</option>
            </select>
          </label>
          <p className="hint">Downloads a .txt with the encoded text. Handy for small icons and CSS.</p>
        </>}
        {slug === "pdf-to-image" && <>
          <label>Sharpness
            <select value={scale} onChange={(e) => setScale(+e.target.value)}>
              <option value={1.5}>Standard</option><option value={2}>High</option><option value={3}>Very high</option>
            </select>
          </label>
          {imgFmt()}
        </>}
        {slug === "image-to-pdf" && (
          <label className="check"><input type="checkbox" checked={scan} onChange={(e) => setScan(e.target.checked)} />Scanned look<small>Black and white with higher contrast, like a document scanner.</small></label>
        )}
        {slug === "pdf-grayscale" && <p className="hint">Each page is redrawn as a grayscale image, so text can no longer be selected or searched in the new file.</p>}
        {slug === "pdf-merge" && <p className="hint">Files are joined in the order you pick them. Pick again to replace and reorder.</p>}
        {slug === "pdf-split" && <>
          <label>Pages<input type="text" value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 5" disabled={perPage} /></label>
          <label className="check"><input type="checkbox" checked={perPage} onChange={(e) => setPerPage(e.target.checked)} />One file per page<small>Ignore the range and split every page into its own PDF.</small></label>
        </>}
        {slug === "pdf-rotate" && <>
          <label>Turn
            <select value={angle} onChange={(e) => setAngle(e.target.value)}>
              <option value="90">90° clockwise</option>
              <option value="180">180°</option>
              <option value="270">270° clockwise</option>
            </select>
          </label>
          <label>Pages<input type="text" value={range} onChange={(e) => setRange(e.target.value)} placeholder="all" /></label>
          <p className="hint">Leave Pages empty to rotate every page.</p>
        </>}
        {slug === "pdf-unlock" && <>
          <label>Password<input type="password" value={pdfPw} onChange={(e) => setPdfPw(e.target.value)} placeholder="Only if it asks for one" autoComplete="off" /></label>
          <p className="hint">Use this for PDFs you own or are allowed to unlock. The file and password never leave your device. A PDF that cannot be opened without its password cannot be unlocked without it.</p>
        </>}
        {slug === "pdf-lock" && <>
          <label>Password<input type="password" value={pdfPw} onChange={(e) => setPdfPw(e.target.value)} placeholder="Password to open the PDF" autoComplete="new-password" /></label>
          <label className="check"><input type="checkbox" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} />Allow printing<small>Turn off to block printing on most viewers.</small></label>
          <label className="check"><input type="checkbox" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} />Allow copying text<small>Turn off to block selecting and copying text.</small></label>
          <p className="hint">AES-256 encryption. The file and password never leave your device. Keep the password safe — there is no recovery if you lose it.</p>
        </>}
      </div>

      <button className="btn primary" disabled={!files.length || busy} onClick={run}>{busy ? status || "Working" : cfg.cta}</button>
      {err && <p className="err" role="alert">{err}</p>}
      </div>

      <section className="wb-out" aria-label="Result" aria-live="polite">
        {out.length > 0 ? (
          <ul className="res">
            {out.map((o) => (
              <li key={o.url}><div><b>{o.name}</b><span>{o.note}</span></div><a className="btn" href={o.url} download={o.name}>Download</a></li>
            ))}
          </ul>
        ) : (
          <p className="empty">{busy ? status || "Working" : files.length ? "Ready. Your result will appear here." : "Your result will appear here."}</p>
        )}
      </section>
    </div>
  );
}