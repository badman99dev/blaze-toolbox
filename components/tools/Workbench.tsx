"use client";
import { useEffect, useRef, useState } from "react";
import { getSumi } from "@/lib/sumi";
import { fetchProgress, downloadParts, loadLib } from "@/lib/loadlog";

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
function drawFrom(src: CanvasImageSource, w: number, h: number, fill?: string) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  if (fill) { x.fillStyle = fill; x.fillRect(0, 0, w, h); }
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, w, h);
  return c;
}

// Compress to an exact file size: binary-search the highest JPEG/WebP quality
// that still fits the target, and if even a low quality is too big, step the
// pixel size down and try again. Returns the best file it could make.
const MIN_QUALITY = 0.28;
const MIN_LONG_EDGE = 320;
const TARGET_MIN = 1024;            // 1 KB
const TARGET_MAX = 20 * 1048576;    // 20 MB
const unitBytes = (u: string) => (u === "MB" ? 1048576 : 1024);
function clampTarget(v: string, u: string) {
  const unit = unitBytes(u);
  const n = parseFloat(v);
  const min = TARGET_MIN / unit, max = TARGET_MAX / unit;
  const c = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  return String(Math.round(c * 1000) / 1000);
}
type Fitted = { blob: Blob; quality: number; width: number; height: number; met: boolean };
async function shrinkToTarget(b: ImageBitmap, type: string, target: number): Promise<Fitted> {
  const fill = type === "image/jpeg" ? "#fff" : undefined;
  const base = drawFrom(b, b.width, b.height, fill);
  let scale = 1;
  let fallback: Fitted | null = null;
  for (let step = 0; step < 8; step++) {
    const w = Math.max(1, Math.round(b.width * scale));
    const h = Math.max(1, Math.round(b.height * scale));
    const c = w === b.width && h === b.height ? base : drawFrom(base, w, h, fill);
    const low = await toBlob(c, type, MIN_QUALITY);
    if (low.size <= target) {
      let lo = MIN_QUALITY, hi = 0.95, quality = MIN_QUALITY, blob = low;
      for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        const t = await toBlob(c, type, mid);
        if (t.size <= target) { quality = mid; blob = t; lo = mid; } else hi = mid;
      }
      return { blob, quality: Math.round(quality * 100), width: w, height: h, met: true };
    }
    fallback = { blob: low, quality: Math.round(MIN_QUALITY * 100), width: w, height: h, met: false };
    if (Math.max(w, h) <= MIN_LONG_EDGE) break;
    scale *= 0.82;
  }
  return fallback!;
}

// Reach a *minimum* size: pad a file with invisible metadata so it hits the
// target without touching a single pixel. JPEG gets empty comment (COM)
// segments before the scan, PNG gets one ancillary chunk before IEND, and
// other formats (incl. WebP) get trailing bytes — all ignored by decoders.
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function jpegScanStart(b: Uint8Array): number {
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda) return i;
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 2;
}
function padToTarget(bytes: Uint8Array, target: number): Uint8Array {
  const need = target - bytes.length;
  if (need <= 0) return bytes;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isJpeg) {
    const at = jpegScanStart(bytes);
    const parts: Uint8Array[] = [];
    let rem = need;
    while (rem > 0) {
      const payload = Math.min(65533, rem - 4);
      const size = (payload > 0 ? payload : 0) + 4;
      const seg = new Uint8Array(size);
      seg[0] = 0xff; seg[1] = 0xfe;
      seg[2] = ((size - 2) >> 8) & 0xff; seg[3] = (size - 2) & 0xff;
      parts.push(seg);
      rem -= size;
      if (payload <= 0) break;
    }
    const add = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(bytes.length + add);
    out.set(bytes.subarray(0, at), 0);
    let o = at;
    for (const p of parts) { out.set(p, o); o += p.length; }
    out.set(bytes.subarray(at), o);
    return out;
  }
  if (isPng && bytes.length > 12) {
    const dataLen = Math.max(0, need - 12);
    const chunk = new Uint8Array(12 + dataLen);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, dataLen);
    chunk[4] = 0x62; chunk[5] = 0x6c; chunk[6] = 0x61; chunk[7] = 0x7a; // "blaz" (ancillary)
    dv.setUint32(8 + dataLen, crc32(chunk.subarray(4, 8 + dataLen)));
    const at = bytes.length - 12;
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, at), 0);
    out.set(chunk, at);
    out.set(bytes.subarray(at), at + chunk.length);
    return out;
  }
  const out = new Uint8Array(target);
  out.set(bytes, 0);
  return out;
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
const MM = 72 / 25.4;
function romanNum(n: number) {
  if (n <= 0) return String(n);
  const map: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let s = "";
  for (const [v, sym] of map) { while (n >= v) { s += sym; n -= v; } }
  return s;
}
function alphaNum(n: number) {
  if (n <= 0) return String(n);
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function fmtPageNumber(n: number, format: string, digits: number) {
  if (format === "romanLower") return romanNum(n).toLowerCase();
  if (format === "romanUpper") return romanNum(n);
  if (format === "alphaLower") return alphaNum(n).toLowerCase();
  if (format === "alphaUpper") return alphaNum(n);
  const s = String(n);
  return digits > 1 ? s.padStart(digits, "0") : s;
}
function fillPattern(pattern: string, num: string, cnt: string) {
  return pattern.replace(/\{NUM\}/gi, num).replace(/\{CNT\}/gi, cnt).replace(/\{N\}/gi, num).replace(/\{TOTAL\}/gi, cnt);
}
function hexRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const v = parseInt(m[1], 16);
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}
// qpdf compiled to WebAssembly handles real-world protected PDFs (xref streams,
// AES-256, owner-only restrictions) and writes a genuinely unencrypted copy.
// The 1.3 MB wasm is served from /qpdf/qpdf.wasm and only fetched on first use.
type Qpdf = { FS: { writeFile: (p: string, d: Uint8Array) => void; readFile: (p: string) => Uint8Array; unlink: (p: string) => void }; callMain: (a: string[]) => number };
let qpdfReady: Promise<Qpdf> | null = null;
async function getQpdf(): Promise<Qpdf> {
  if (!qpdfReady) {
    qpdfReady = (async () => {
      const mod: any = await loadLib("qpdf", "PDF engine (qpdf)", () => import("@neslinesli93/qpdf-wasm"));
      const create = mod.default ?? mod;
      const wasm = await fetchProgress("/qpdf/qpdf.wasm", "PDF engine (qpdf.wasm, 1.3 MB)");
      const wasmURL = URL.createObjectURL(new Blob([wasm as unknown as BlobPart], { type: "application/wasm" }));
      return (await create({ locateFile: (p: string) => (p.endsWith(".wasm") ? wasmURL : p) })) as Qpdf;
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

// Lossless structural compression: pack objects into compressed object streams,
// re-deflate at level 9 and drop unreferenced resources. Content streams, fonts,
// text, vectors and annotations are copied through untouched — pages are never
// rasterised, so text stays selectable. Big gains on PDFs with a loose object
// structure; already-tight files come back about the same size.
async function compressPdf(bytes: Uint8Array) {
  const { out, code } = await qpdfRun(bytes, (input, output) => [
    "--object-streams=generate",
    "--recompress-flate",
    "--compression-level=9",
    "--compress-streams=y",
    "--remove-unreferenced-resources=yes",
    "--", input, output,
  ]);
  if (!out || !out.length) {
    throw new Error(code === 2
      ? "This PDF needs a password first. Unlock it, then compress."
      : "Could not read this PDF. It may be damaged or use an unsupported feature.");
  }
  return out;
}
// "Compress" additionally re-encodes the JPEG photos *inside* the PDF. It only
// swaps the image streams: content streams, fonts, text and vectors are copied
// through untouched, so the words stay selectable — pages are never turned into
// images. Photos the browser cannot decode (CMYK, exotic JPEGs) are left alone.
type PdfPhoto = { key: string; bytes: Uint8Array; w: number; h: number; el: HTMLImageElement | null };
const PDF_Q_MIN = 0.2;
const PDF_MAX_PHOTOS = 200;
const PDF_TARGET_MIN = 1024;            // 1 KB
const PDF_TARGET_MAX = 100 * 1048576;   // 100 MB
function clampPdfTarget(v: string, u: string) {
  const unit = unitBytes(u);
  const n = parseFloat(v);
  const min = PDF_TARGET_MIN / unit, max = PDF_TARGET_MAX / unit;
  const c = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  return String(Math.round(c * 1000) / 1000);
}
const asName = (o: unknown) => (o && typeof (o as { asString?: () => string }).asString === "function" ? (o as { asString: () => string }).asString() : "");
const asNum = (o: unknown) => (o && typeof (o as { asNumber?: () => number }).asNumber === "function" ? (o as { asNumber: () => number }).asNumber() : 0);
function decodeJpeg(bytes: Uint8Array) {
  return new Promise<HTMLImageElement | null>((res) => {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" }));
    const el = new Image();
    el.onload = () => { URL.revokeObjectURL(url); res(el); };
    el.onerror = () => { URL.revokeObjectURL(url); res(null); };
    el.src = url;
  });
}
async function collectPdfPhotos(bytes: Uint8Array) {
  const { PDFDocument, PDFName, PDFRawStream } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const photos: PdfPhoto[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (asName(d.get(PDFName.of("Subtype"))) !== "/Image") continue;
    if (asName(d.get(PDFName.of("Filter"))) !== "/DCTDecode") continue;
    if (d.get(PDFName.of("SMask")) || d.get(PDFName.of("Mask"))) continue;
    const w = asNum(d.get(PDFName.of("Width"))), h = asNum(d.get(PDFName.of("Height")));
    if (!w || !h || obj.contents.length < 2048) continue;
    photos.push({ key: ref.toString(), bytes: obj.contents, w, h, el: null });
    if (photos.length >= PDF_MAX_PHOTOS) break;
  }
  for (const p of photos) p.el = await decodeJpeg(p.bytes);
  return photos;
}
async function encodePdfPhotos(photos: PdfPhoto[], quality: number, maxDim: number) {
  const out = new Map<string, { bytes: Uint8Array; w: number; h: number }>();
  for (const p of photos) {
    const el = p.el;
    if (!el) continue;
    let w = el.naturalWidth || p.w, h = el.naturalHeight || p.h;
    if (maxDim && Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
    let blob: Blob;
    try { blob = await toBlob(drawFrom(el, w, h, "#ffffff"), "image/jpeg", quality); } catch { continue; }
    const nb = new Uint8Array(await blob.arrayBuffer());
    if (nb.length && nb.length < p.bytes.length) out.set(p.key, { bytes: nb, w, h });
  }
  return out;
}
async function applyPdfPhotos(bytes: Uint8Array, encoded: Map<string, { bytes: Uint8Array; w: number; h: number }>) {
  if (!encoded.size) return null;
  const { PDFDocument, PDFName, PDFNumber, PDFDict, PDFRawStream } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  let changed = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (asName(d.get(PDFName.of("Subtype"))) !== "/Image") continue;
    if (asName(d.get(PDFName.of("Filter"))) !== "/DCTDecode") continue;
    const enc = encoded.get(ref.toString());
    if (!enc) continue;
    const nd = PDFDict.withContext(ctx);
    nd.set(PDFName.of("Type"), PDFName.of("XObject"));
    nd.set(PDFName.of("Subtype"), PDFName.of("Image"));
    nd.set(PDFName.of("Width"), PDFNumber.of(enc.w));
    nd.set(PDFName.of("Height"), PDFNumber.of(enc.h));
    nd.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
    nd.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
    nd.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
    ctx.assign(ref, PDFRawStream.of(nd, new Uint8Array(enc.bytes)));
    changed++;
  }
  if (!changed) return null;
  return new Uint8Array(await doc.save({ useObjectStreams: true }));
}
async function reencodePdf(baseBytes: Uint8Array, photos: PdfPhoto[], quality: number, maxDim: number) {
  const replaced = await applyPdfPhotos(baseBytes, await encodePdfPhotos(photos, quality, maxDim));
  return compressPdf(replaced ?? baseBytes);
}
async function pdfToTarget(baseBytes: Uint8Array, photos: PdfPhoto[], target: number) {
  let best = await compressPdf(baseBytes);
  if (best.length <= target) return { out: best, note: "fits once the structure is repacked" };
  if (!photos.some((p) => p.el)) return { out: best, note: "no embedded photos to shrink" };
  const dims = [0, 1400, 900, 550];
  const qs = [0.8, 0.68, 0.56, 0.45, 0.35];
  for (const dim of dims) {
    for (const q of qs) {
      const out = await reencodePdf(baseBytes, photos, q, dim);
      if (out.length < best.length) best = out;
      if (out.length <= target) return { out, note: `hit your ${kb(target)} target` };
    }
  }
  return { out: best, note: `closest we could get to ${kb(target)}` };
}
// ---- Video to audio -------------------------------------------------------
// MP3 and WAV are made on-device with the Web Audio API (decode) plus lamejs
// (MP3 only) — instant, no download. Every other format, and any container the
// browser's own decoder cannot read (mkv, avi, …), goes through ffmpeg.wasm,
// fetched once from a CDN on first use and then cached. Either way the picture
// is dropped and only the audio track is kept — always on the device.
const AUDIO_FMTS = [
  { id: "mp3", label: "MP3", lossy: true },
  { id: "wav", label: "WAV", lossy: false },
  { id: "m4a", label: "M4A (AAC)", lossy: true },
  { id: "ogg", label: "OGG (Vorbis)", lossy: true },
  { id: "opus", label: "OPUS", lossy: true },
  { id: "flac", label: "FLAC", lossy: false },
];
const audioLabel = (id: string) => AUDIO_FMTS.find((f) => f.id === id)?.label ?? id;
const audioLossy = (id: string) => AUDIO_FMTS.find((f) => f.id === id)?.lossy ?? true;
const FF_EXT: Record<string, string> = { mp3: "mp3", wav: "wav", m4a: "m4a", ogg: "ogg", opus: "opus", flac: "flac" };
const FF_MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac" };
function ffArgs(fmt: string, kbps: number): string[] {
  switch (fmt) {
    case "mp3": return ["-vn", "-c:a", "libmp3lame", "-b:a", `${kbps}k`];
    case "m4a": return ["-vn", "-c:a", "aac", "-b:a", `${kbps}k`];
    case "ogg": return ["-vn", "-c:a", "libvorbis", "-b:a", `${kbps}k`];
    case "opus": return ["-vn", "-c:a", "libopus", "-b:a", `${kbps}k`, "-f", "ogg"];
    case "flac": return ["-vn", "-c:a", "flac"];
    default: return ["-vn", "-c:a", "pcm_s16le"];
  }
}
async function decodeAudio(file: File) {
  const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try { return await ctx.decodeAudioData(await file.arrayBuffer()); }
  finally { ctx.close(); }
}
function wavBlob(buf: AudioBuffer) {
  const ch = Math.min(2, buf.numberOfChannels) || 1, sr = buf.sampleRate, n = buf.length;
  const blockAlign = ch * 2, dataSize = n * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize), dv = new DataView(ab);
  const ws = (off: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * blockAlign, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, dataSize, true);
  const chans: Float32Array[] = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([ab], { type: "audio/wav" });
}
async function mp3Blob(buf: AudioBuffer, kbps: number, onProg: (p: number) => void) {
  const { Mp3Encoder } = await loadLib("lamejs", "MP3 encoder (lamejs)", () => import("@breezystack/lamejs"));
  const ch = Math.min(2, buf.numberOfChannels) || 1;
  const enc = new Mp3Encoder(ch, buf.sampleRate, kbps);
  const l = buf.getChannelData(0), r = ch > 1 ? buf.getChannelData(1) : null;
  const toI16 = (f: Float32Array, start: number, len: number) => {
    const a = new Int16Array(len);
    for (let i = 0; i < len; i++) { const s = Math.max(-1, Math.min(1, f[start + i])); a[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return a;
  };
  const parts: BlobPart[] = [], block = 1152;
  for (let i = 0; i < l.length; i += block) {
    const len = Math.min(block, l.length - i);
    const lv = toI16(l, i, len);
    const b = r ? enc.encodeBuffer(lv, toI16(r, i, len)) : enc.encodeBuffer(lv);
    if (b.length) parts.push(new Uint8Array(b) as unknown as BlobPart);
    if (i % (block * 256) === 0) onProg(i / l.length);
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end) as unknown as BlobPart);
  onProg(1);
  return new Blob(parts, { type: "audio/mpeg" });
}
let ffmpegPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;
let ffProg: (p: number) => void = () => {};
async function getFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const { FFmpeg } = await loadLib("ffmpeg", "Audio engine (ffmpeg.wasm)", () => import("@ffmpeg/ffmpeg"));
      const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      const [core, wasm] = await downloadParts("Audio engine (ffmpeg.wasm, ~31 MB, one time)", [`${base}/ffmpeg-core.js`, `${base}/ffmpeg-core.wasm`]);
      const ff = new FFmpeg();
      ff.on("progress", ({ progress }) => { if (Number.isFinite(progress)) ffProg(Math.max(0, Math.min(1, progress))); });
      await ff.load({
        coreURL: URL.createObjectURL(new Blob([core as unknown as BlobPart], { type: "text/javascript" })),
        wasmURL: URL.createObjectURL(new Blob([wasm as unknown as BlobPart], { type: "application/wasm" })),
      });
      return ff;
    })();
    ffmpegPromise.catch(() => { ffmpegPromise = null; });
  }
  return ffmpegPromise;
}
async function ffmpegExtract(file: File, fmt: string, kbps: number, onProg: (p: number) => void) {
  const ff = await getFfmpeg();
  const { fetchFile } = await loadLib("ffmpeg-util", "Audio engine (ffmpeg helper)", () => import("@ffmpeg/util"));
  ffProg = onProg;
  const input = "in_" + (file.name.replace(/[^\w.-]/g, "_") || "input");
  const output = "out." + FF_EXT[fmt];
  await ff.writeFile(input, await fetchFile(file));
  const code = await ff.exec(["-i", input, ...ffArgs(fmt, kbps), output]);
  let data: Uint8Array | string | null = null;
  try { data = await ff.readFile(output); } catch { data = null; }
  try { await ff.deleteFile(input); } catch { /* ignore */ }
  try { await ff.deleteFile(output); } catch { /* ignore */ }
  if (code !== 0 || !data || typeof data === "string" || !data.length) throw new Error("Could not find an audio track in this file. Is it a real video or audio file?");
  return new Blob([data as unknown as BlobPart], { type: FF_MIME[fmt] });
}
// ---- Audio to video -------------------------------------------------------
// Puts an audio track on a still background (a plain black or white frame, or a
// picture the user picks) and encodes a real MP4 with ffmpeg.wasm. The frame is
// drawn here in a canvas at the chosen size and handed to ffmpeg as one looping
// PNG, so no ffmpeg filters are needed. Nothing is uploaded — only the engine
// binary is downloaded, once.
const VIDEO_SIZES = [
  { id: "1920x1080", label: "1920 × 1080 (Full HD, landscape)" },
  { id: "1280x720", label: "1280 × 720 (HD, landscape)" },
  { id: "1080x1080", label: "1080 × 1080 (Square)" },
  { id: "1080x1920", label: "1080 × 1920 (Vertical, Reels/Shorts)" },
  { id: "854x480", label: "854 × 480 (SD, small file)" },
];
const videoSizeLabel = (id: string) => VIDEO_SIZES.find((s) => s.id === id)?.label ?? id;
function solidCanvas(W: number, H: number, fill: string) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = fill; x.fillRect(0, 0, W, H);
  return c;
}
function fitCanvas(src: CanvasImageSource, sw: number, sh: number, W: number, H: number, mode: "cover" | "contain") {
  const c = solidCanvas(W, H, "#000");
  const x = c.getContext("2d")!;
  const scale = mode === "cover" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const dw = sw * scale, dh = sh * scale;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return c;
}
async function makeBgBlob(bg: string, img: File | null, W: number, H: number, mode: "cover" | "contain"): Promise<Blob> {
  if (bg === "image") {
    if (!img) throw new Error("Pick a picture for the background, or choose a black or white screen.");
    const bmp = await createImageBitmap(img);
    try { return await toBlob(fitCanvas(bmp, bmp.width, bmp.height, W, H, mode), "image/png"); }
    finally { bmp.close(); }
  }
  return toBlob(solidCanvas(W, H, bg === "white" ? "#ffffff" : "#000000"), "image/png");
}
async function ffmpegAudioToVideo(audio: File, bg: Blob, W: number, H: number, kbps: number, dur: number, onProg: (p: number) => void) {
  const ff = await getFfmpeg();
  const { fetchFile } = await loadLib("ffmpeg-util", "Audio engine (ffmpeg helper)", () => import("@ffmpeg/util"));
  ffProg = onProg;
  const aName = "a_" + (audio.name.replace(/[^\w.-]/g, "_") || "input");
  const out = "out.mp4";
  await ff.writeFile("bg.png", await fetchFile(bg));
  await ff.writeFile(aName, await fetchFile(audio));
  const args = [
    "-loop", "1", "-framerate", "25", "-i", "bg.png",
    "-i", aName,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "26", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", `${kbps}k`,
  ];
  // A looping image never "ends", so -shortest alone does not reliably stop the
  // video at the audio's length. -t (when the length is known) plus these two
  // flags pin the output to exactly the audio.
  if (dur > 0) args.push("-t", dur.toFixed(3));
  else args.push("-shortest");
  args.push("-fflags", "+shortest", "-max_interleave_delta", "0", "-movflags", "+faststart", out);
  const code = await ff.exec(args);
  let data: Uint8Array | string | null = null;
  try { data = await ff.readFile(out); } catch { data = null; }
  try { await ff.deleteFile("bg.png"); } catch { /* ignore */ }
  try { await ff.deleteFile(aName); } catch { /* ignore */ }
  try { await ff.deleteFile(out); } catch { /* ignore */ }
  if (code !== 0 || !data || typeof data === "string" || !data.length) throw new Error("Could not build the video from this file. Is it a real audio file?");
  return new Blob([data as unknown as BlobPart], { type: "video/mp4" });
}
// ---- Trim / split audio and video -----------------------------------------
// Cuts by re-encoding with ffmpeg.wasm (frame-accurate, unlike a stream copy).
// The audio or video keeps its own format where ffmpeg can write it; video
// always comes out as MP4 (H.264 + AAC). Nothing is uploaded.
type Cut = { start: number; dur: number; name: string };
function parseTime(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  const parts = t.split(":").map((p) => parseFloat(p));
  if (!parts.length || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}
function fmtTime(s: number): string {
  const sec = Math.floor(s % 60), m = Math.floor(s / 60);
  if (m < 60) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function outExt(file: File, isVideo: boolean): string {
  if (isVideo) return "mp4";
  const e = (file.name.split(".").pop() || "").toLowerCase();
  if (e === "wav") return "wav";
  if (e === "flac") return "flac";
  if (e === "ogg" || e === "oga" || e === "opus") return "ogg";
  if (e === "m4a" || e === "aac" || e === "mp4") return "m4a";
  return "mp3";
}
function trimEncoder(file: File, isVideo: boolean): { args: string[]; mime: string; faststart: boolean } {
  if (isVideo) return { args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k"], mime: "video/mp4", faststart: true };
  switch (outExt(file, false)) {
    case "wav": return { args: ["-c:a", "pcm_s16le"], mime: "audio/wav", faststart: false };
    case "flac": return { args: ["-c:a", "flac"], mime: "audio/flac", faststart: false };
    case "ogg": return { args: ["-c:a", "libvorbis", "-b:a", "192k"], mime: "audio/ogg", faststart: false };
    case "m4a": return { args: ["-c:a", "aac", "-b:a", "192k"], mime: "audio/mp4", faststart: true };
    default: return { args: ["-c:a", "libmp3lame", "-b:a", "192k"], mime: "audio/mpeg", faststart: false };
  }
}
function mediaDuration(file: File): Promise<number> {
  return new Promise((ok, no) => {
    const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
    const url = URL.createObjectURL(file);
    const done = () => URL.revokeObjectURL(url);
    el.preload = "metadata";
    el.onloadedmetadata = () => { const d = el.duration; done(); Number.isFinite(d) && d > 0 ? ok(d) : no(new Error("This file does not report a length, so it cannot be trimmed.")); };
    el.onerror = () => { done(); no(new Error("Could not read this file. Is it a real audio or video file?")); };
    el.src = url;
  });
}
async function ffmpegTrim(file: File, jobs: Cut[], onProg: (done: number, total: number, label: string) => void) {
  const ff = await getFfmpeg();
  const { fetchFile } = await loadLib("ffmpeg-util", "Audio engine (ffmpeg helper)", () => import("@ffmpeg/util"));
  const isVideo = file.type.startsWith("video/");
  const ext = outExt(file, isVideo);
  const enc = trimEncoder(file, isVideo);
  const inName = "in_" + (file.name.replace(/[^\w.-]/g, "_") || "input");
  await ff.writeFile(inName, await fetchFile(file));
  const outs: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const segName = `seg${i}.${ext}`;
    ffProg = (p) => onProg(i + Math.max(0, Math.min(1, p)), jobs.length, job.name);
    const args = ["-ss", job.start.toFixed(3), "-i", inName, "-t", job.dur.toFixed(3), ...enc.args];
    if (enc.faststart) args.push("-movflags", "+faststart");
    args.push(segName);
    const code = await ff.exec(args);
    let data: Uint8Array | string | null = null;
    try { data = await ff.readFile(segName); } catch { data = null; }
    try { await ff.deleteFile(segName); } catch { /* ignore */ }
    if (code !== 0 || !data || typeof data === "string" || !data.length) throw new Error("Could not cut this part of the file.");
    outs.push({ name: job.name, blob: new Blob([data as unknown as BlobPart], { type: enc.mime }) });
  }
  try { await ff.deleteFile(inName); } catch { /* ignore */ }
  return outs;
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
  const pdfjs = await loadLib("pdfjs", "PDF reader (pdf.js)", () => import("pdfjs-dist"));
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
  "image-compress": { accept: "image/*", multi: true, hint: "JPG, PNG or WebP. Pick several, then add more below.", cta: "Compress" },
  "image-target-size": { accept: "image/*", multi: false, hint: "Pick a photo to shrink to your target size.", cta: "Compress to target" },
  "image-convert": { accept: "image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp", multi: true, hint: "Pick images to convert, then add more below.", cta: "Convert" },
  "heic-to-jpg": { accept: ".heic,.heif,image/heic,image/heif", multi: true, hint: "iPhone HEIC or HEIF photos. Pick several, then add more below.", cta: "Convert" },
  "svg-to-png": { accept: ".svg,image/svg+xml", multi: true, hint: "One or more SVG files; add more below.", cta: "Rasterize" },
  "favicon-generator": { accept: "image/*", multi: false, hint: "One square image works best.", cta: "Build icon pack" },
  "circle-crop": { accept: "image/*", multi: true, hint: "Pick photos to turn into round avatars; add more below.", cta: "Crop to circle" },
  "watermark": { accept: "image/*", multi: true, hint: "Pick photos to watermark; add more below.", cta: "Add watermark" },
  "image-to-base64": { accept: "image/*", multi: true, hint: "Pick images to encode; add more below.", cta: "Encode" },
  "pdf-to-image": { accept: "application/pdf", multi: false, hint: "One PDF. Every page becomes an image.", cta: "Convert pages" },
  "pdf-compress": { accept: "application/pdf", multi: false, hint: "One PDF. Text and vectors are kept — pages are not turned into images.", cta: "Compress PDF" },
  "image-to-pdf": { accept: "image/*", multi: true, hint: "Pick photos in the order you want the pages. Add more or reorder below.", cta: "Make PDF" },
  "pdf-grayscale": { accept: "application/pdf", multi: false, hint: "One color PDF.", cta: "Convert to grayscale" },
  "pdf-merge": { accept: "application/pdf", multi: true, hint: "Pick PDFs to join. They merge top to bottom in this order — add more or reorder below.", cta: "Merge" },
  "pdf-split": { accept: "application/pdf", multi: false, hint: "One PDF. Choose the pages to keep.", cta: "Split" },
  "pdf-rotate": { accept: "application/pdf", multi: false, hint: "One PDF.", cta: "Rotate" },
  "pdf-unlock": { accept: "application/pdf", multi: false, hint: "One PDF. Enter its password if it asks for one.", cta: "Unlock" },
  "pdf-lock": { accept: "application/pdf", multi: false, hint: "One PDF. Choose a password to open it.", cta: "Lock" },
  "pdf-page-numbers": { accept: "application/pdf", multi: true, hint: "One or more PDFs. Numbers continue in this order — add more or reorder below.", cta: "Add page numbers" },
  "video-to-audio": { accept: "video/*,audio/*", multi: true, hint: "Pick a video (or an audio file) to take the sound from; add more below.", cta: "Extract audio" },
  "audio-to-video": { accept: "audio/*,video/*", multi: false, hint: "Pick a song, voice note or any audio file to put on a video.", cta: "Make video" },
  "trim-media": { accept: "audio/*,video/*", multi: false, hint: "Pick an audio or video file to trim or split.", cta: "Trim / split" },
};

export function Workbench({ slug }: { slug: string }) {
  const cfg = CFG[slug];
  const [files, setFiles] = useState<File[]>([]);
  const [out, setOut] = useState<Out[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [fmt, setFmt] = useState(slug === "image-compress" || slug === "image-target-size" || slug === "heic-to-jpg" || slug === "watermark" ? "image/jpeg" : slug === "image-convert" ? "image/webp" : "image/png");
  const [q, setQ] = useState(70);
  const [target, setTarget] = useState("200");
  const [targetUnit, setTargetUnit] = useState("KB");
  const [pad, setPad] = useState(false);
  const [pcMode, setPcMode] = useState<"optimize" | "compress">("optimize");
  const [pcBy, setPcBy] = useState<"quality" | "target">("quality");
  const [pcQ, setPcQ] = useState(60);
  const [pcTarget, setPcTarget] = useState("2");
  const [pcTargetUnit, setPcTargetUnit] = useState("MB");
  const [vaFmt, setVaFmt] = useState("mp3");
  const [vaBitrate, setVaBitrate] = useState("192");
  const [avBg, setAvBg] = useState("black");
  const [avSize, setAvSize] = useState("1280x720");
  const [avFit, setAvFit] = useState<"cover" | "contain">("cover");
  const [avBitrate, setAvBitrate] = useState("192");
  const [avBgFile, setAvBgFile] = useState<File | null>(null);
  const [tmMode, setTmMode] = useState("trim");
  const [tmFrom, setTmFrom] = useState("");
  const [tmTo, setTmTo] = useState("");
  const [tmSplit, setTmSplit] = useState("parts");
  const [tmParts, setTmParts] = useState("2");
  const [tmEvery, setTmEvery] = useState("30");
  const [tmDur, setTmDur] = useState(0);
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
  const [pnPattern, setPnPattern] = useState("{NUM} / {CNT}");
  const [pnPos, setPnPos] = useState("bottom-center");
  const [pnSize, setPnSize] = useState("10");
  const [pnFont, setPnFont] = useState("sans");
  const [pnBold, setPnBold] = useState(false);
  const [pnItalic, setPnItalic] = useState(false);
  const [pnColor, setPnColor] = useState("#000000");
  const [pnOpacity, setPnOpacity] = useState(100);
  const [pnAngle, setPnAngle] = useState("0");
  const [pnSpaceX, setPnSpaceX] = useState("5");
  const [pnSpaceY, setPnSpaceY] = useState("5");
  const [pnFirstPage, setPnFirstPage] = useState("1");
  const [pnFirstNumber, setPnFirstNumber] = useState("1");
  const [pnLastPage, setPnLastPage] = useState("");
  const [pnFormat, setPnFormat] = useState("arabic");
  const [pnDigits, setPnDigits] = useState("1");
  const [pnContinuous, setPnContinuous] = useState(false);
  const [grayModel, setGrayModel] = useState<"luma" | "colorimetric">("luma");
  const urls = useRef<string[]>([]);

  useEffect(() => {
    if (slug !== "trim-media" || !files[0]) { setTmDur(0); return; }
    let live = true;
    mediaDuration(files[0]).then((d) => { if (live) setTmDur(d); }).catch(() => { if (live) setTmDur(0); });
    return () => { live = false; };
  }, [slug, files]);

  const keep = (blob: Blob) => { const u = URL.createObjectURL(blob); urls.current.push(u); return u; };
  const orderMatters = slug === "pdf-merge" || slug === "image-to-pdf" || slug === "pdf-page-numbers";
  const addFiles = (list: File[]) => {
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const next = [...prev];
      for (const f of list) {
        const key = `${f.name}|${f.size}|${f.lastModified}`;
        if (!seen.has(key)) { seen.add(key); next.push(f); }
      }
      return next;
    });
    setOut([]); setErr("");
  };
  const removeAt = (i: number) => { setFiles((prev) => prev.filter((_, j) => j !== i)); setOut([]); };
  const moveAt = (i: number, d: number) => {
    setFiles((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOut([]);
  };

  async function run() {
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    setOut([]); setErr(""); setBusy(true);
    try {
      const res: Out[] = [];
      if (slug === "image-compress") {
        for (const f of files) {
          setStatus(`Working on ${f.name}`);
          const b = await createImageBitmap(f);
          const type = fmt === "image/png" ? "image/jpeg" : fmt;
          const blob = await toBlob(draw(b, b.width, b.height), type, q / 100);
          const note = `${kb(f.size)} to ${kb(blob.size)} (${blob.size < f.size ? "-" : "+"}${Math.abs(Math.round((1 - blob.size / f.size) * 100))}%)`;
          res.push({ name: `${base(f.name)}-compressed.${EXT[type]}`, url: keep(blob), note });
        }
      } else if (slug === "image-target-size") {
        const type = fmt === "image/png" ? "image/jpeg" : fmt;
        const unit = unitBytes(targetUnit);
        const raw = parseFloat(target);
        const want = Math.min(TARGET_MAX, Math.max(TARGET_MIN, Math.round((Number.isFinite(raw) ? raw : 200) * unit)));
        for (const f of files) {
          if (f.size <= want) {
            if (pad) {
              setStatus(`Padding ${f.name}`);
              const bytes = new Uint8Array(await f.arrayBuffer());
              const padded = padToTarget(bytes, want);
              const ext = (f.name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
              res.push({ name: `${base(f.name)}-${target}${targetUnit.toLowerCase()}${ext}`, url: keep(new Blob([padded as unknown as BlobPart], { type: f.type || "application/octet-stream" })), note: `Padded ${kb(f.size)} to ${kb(padded.length)} — picture unchanged, no quality lost` });
            } else {
              setStatus(`Checking ${f.name}`);
              res.push({ name: f.name, url: keep(f), note: `Already ${kb(f.size)} — under your ${kb(want)} target, left untouched` });
            }
            continue;
          }
          setStatus(`Fitting ${f.name} to ${kb(want)}`);
          const b = await createImageBitmap(f);
          const r = await shrinkToTarget(b, type, want);
          if (r.blob.size >= f.size) {
            res.push({ name: f.name, url: keep(f), note: `Already the smallest at ${kb(f.size)} — left untouched` });
            continue;
          }
          const dim = r.width !== b.width ? `, ${r.width} × ${r.height} px` : "";
          const note = r.met
            ? `Fits ${kb(want)}: ${kb(f.size)} to ${kb(r.blob.size)} at quality ${r.quality}%${dim}`
            : `Smallest we could make it: ${kb(r.blob.size)} at quality ${r.quality}%${dim} — could not reach ${kb(want)}`;
          res.push({ name: `${base(f.name)}-${target}${targetUnit.toLowerCase()}.${EXT[type]}`, url: keep(r.blob), note });
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
        const heicMod = await loadLib("heic2any", "HEIC decoder (heic2any)", () => import("heic2any"));
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
          const jsZipMod = await loadLib("jszip", "ZIP writer (JSZip)", () => import("jszip"));
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
        const { PDFDocument } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
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
        setStatus("Loading the grayscale engine");
        const sumi = await getSumi();
        const bytes = new Uint8Array(await files[0].arrayBuffer());
        setStatus("Rewriting colors");
        const { pdf, report } = sumi.sumi_convert(bytes, "grayscale", grayModel, 0.5);
        const out = new Uint8Array(pdf);
        const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
        const warn = report.warnings ? `, ${report.warnings} part${report.warnings === 1 ? "" : "s"} left as-is` : "";
        res.push({
          name: `${base(files[0].name)}-grayscale.pdf`,
          url: keep(blob),
          note: `Grayscale, text kept${warn}, ${kb(files[0].size)} to ${kb(blob.size)}`,
        });
      } else if (slug === "pdf-merge") {
        if (files.length < 2) throw new Error("Pick at least two PDFs to merge.");
        const { PDFDocument } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
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
        const { PDFDocument } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
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
        const { PDFDocument, degrees } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
        const src = await PDFDocument.load(await files[0].arrayBuffer());
        const total = src.getPageCount();
        const sel = range.trim() ? parsePages(range, total) : Array.from({ length: total }, (_, i) => i + 1);
        if (!sel.length) throw new Error(`Enter page numbers between 1 and ${total}, or leave it empty for all pages.`);
        const add = Number(angle);
        sel.forEach((n) => { const p = src.getPage(n - 1); p.setRotation(degrees((p.getRotation().angle + add) % 360)); });
        const blob = new Blob([(await src.save()) as unknown as BlobPart], { type: "application/pdf" });
        res.push({ name: `${base(files[0].name)}-rotated.pdf`, url: keep(blob), note: `${sel.length} page(s) turned ${add}°, ${kb(blob.size)}` });
      } else if (slug === "pdf-compress") {
        const f = files[0];
        const bytes = new Uint8Array(await f.arrayBuffer());
        let out: Uint8Array;
        let note: string;
        if (pcMode === "optimize") {
          setStatus("Optimizing (lossless)");
          out = await compressPdf(bytes);
          note = "structure repacked, text and vectors kept";
        } else {
          setStatus("Reading photos");
          const photos = await collectPdfPhotos(bytes);
          const found = photos.filter((p) => p.el).length;
          if (pcBy === "target") {
            const unit = unitBytes(pcTargetUnit);
            const raw = parseFloat(pcTarget);
            const want = Math.min(PDF_TARGET_MAX, Math.max(PDF_TARGET_MIN, Math.round((Number.isFinite(raw) ? raw : 1) * unit)));
            setStatus(`Compressing to ${kb(want)}`);
            const r = await pdfToTarget(bytes, photos, want);
            out = r.out; note = `${r.note} (${found} of ${photos.length} photos re-encoded)`;
          } else {
            setStatus(`Re-encoding photos at ${pcQ}%`);
            out = await reencodePdf(bytes, photos, pcQ / 100, 0);
            note = found ? `${found} photo${found === 1 ? "" : "s"} re-encoded at ${pcQ}%, text kept` : "no embedded photos found, only the structure was repacked";
          }
        }
        if (out.length >= f.size) {
          res.push({ name: f.name, url: keep(f), note: `Already well optimized at ${kb(f.size)} — left untouched` });
        } else {
          const blob = new Blob([out as unknown as BlobPart], { type: "application/pdf" });
          const pct = Math.round((1 - out.length / f.size) * 100);
          res.push({ name: `${base(f.name)}-compressed.pdf`, url: keep(blob), note: `${kb(f.size)} to ${kb(out.length)} (-${pct}%), ${note}` });
        }
      } else if (slug === "video-to-audio") {
        const fmt = vaFmt, kbps = Number(vaBitrate) || 192;
        for (const f of files) {
          setStatus(`Reading ${f.name}`);
          let blob: Blob | null = null;
          if (fmt === "mp3" || fmt === "wav") {
            try {
              const buf = await decodeAudio(f);
              blob = fmt === "wav"
                ? wavBlob(buf)
                : await mp3Blob(buf, kbps, (p) => setStatus(`Encoding ${f.name} — ${Math.round(p * 100)}%`));
            } catch { blob = null; }
          }
          if (!blob) {
            setStatus("Loading audio engine (first time only)…");
            blob = await ffmpegExtract(f, fmt, kbps, (p) => setStatus(`Converting ${f.name} — ${Math.round(p * 100)}%`));
          }
          res.push({
            name: `${base(f.name)}.${FF_EXT[fmt]}`,
            url: keep(blob),
            note: `${audioLabel(fmt)}${audioLossy(fmt) ? `, ${kbps} kbps` : ", lossless"}, ${kb(blob.size)}`,
          });
        }
      } else if (slug === "audio-to-video") {
        const f = files[0];
        if (!f) throw new Error("Pick an audio file first.");
        const [W, H] = avSize.split("x").map(Number);
        const kbps = Number(avBitrate) || 192;
        setStatus("Preparing the frame");
        const bgBlob = await makeBgBlob(avBg, avBgFile, W, H, avFit);
        const dur = await mediaDuration(f).catch(() => 0);
        setStatus("Building the video (the first run loads the engine)...");
        const blob = await ffmpegAudioToVideo(f, bgBlob, W, H, kbps, dur, (p) => setStatus(`Building ${base(f.name)}.mp4 — ${Math.round(p * 100)}%`));
        const bgLabel = avBg === "image" ? "your picture" : `${avBg} screen`;
        res.push({ name: `${base(f.name)}.mp4`, url: keep(blob), note: `${W} × ${H}, ${bgLabel}, ${kbps} kbps audio, ${kb(blob.size)}` });
      } else if (slug === "trim-media") {
        const f = files[0];
        if (!f) throw new Error("Pick an audio or video file first.");
        const dur = tmDur > 0 ? tmDur : await mediaDuration(f);
        const ext = outExt(f, f.type.startsWith("video/"));
        const jobs: Cut[] = [];
        if (tmMode === "trim") {
          let start = parseTime(tmFrom);
          let end = tmTo.trim() ? parseTime(tmTo) : dur;
          if (!Number.isFinite(start) || start < 0) start = 0;
          if (!Number.isFinite(end) || end > dur) end = dur;
          if (end <= start) throw new Error("The end time must be after the start time.");
          jobs.push({ start, dur: end - start, name: `${base(f.name)}-trim.${ext}` });
        } else if (tmSplit === "parts") {
          const n = Math.max(2, Math.min(50, Math.round(Number(tmParts) || 2)));
          const seg = dur / n;
          for (let i = 0; i < n; i++) jobs.push({ start: i * seg, dur: seg, name: `${base(f.name)}-part${i + 1}.${ext}` });
        } else {
          const every = Math.max(1, Number(tmEvery) || 30);
          const n = Math.max(1, Math.ceil(dur / every));
          for (let i = 0; i < n; i++) { const s = i * every; jobs.push({ start: s, dur: Math.min(every, dur - s), name: `${base(f.name)}-part${i + 1}.${ext}` }); }
        }
        setStatus("Loading the engine (first time only)...");
        const outs = await ffmpegTrim(f, jobs, (done, total, label) => setStatus(`Cutting ${label} — ${Math.round((done / total) * 100)}%`));
        outs.forEach((o, i) => {
          const j = jobs[i];
          res.push({ name: o.name, url: keep(o.blob), note: `${fmtTime(j.start)} → ${fmtTime(j.start + j.dur)}, ${kb(o.blob.size)}` });
        });
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
      } else if (slug === "pdf-page-numbers") {
        const { PDFDocument, StandardFonts, rgb, degrees } = await loadLib("pdf-lib", "PDF library (pdf-lib)", () => import("pdf-lib"));
        const F = StandardFonts;
        const fontName = pnFont === "serif"
          ? (pnBold && pnItalic ? F.TimesRomanBoldItalic : pnBold ? F.TimesRomanBold : pnItalic ? F.TimesRomanItalic : F.TimesRoman)
          : pnFont === "mono"
          ? (pnBold && pnItalic ? F.CourierBoldOblique : pnBold ? F.CourierBold : pnItalic ? F.CourierOblique : F.Courier)
          : (pnBold && pnItalic ? F.HelveticaBoldOblique : pnBold ? F.HelveticaBold : pnItalic ? F.HelveticaOblique : F.Helvetica);
        const docs: { f: File; d: Awaited<ReturnType<typeof PDFDocument.load>> }[] = [];
        let allPages = 0;
        for (const f of files) {
          setStatus(`Reading ${f.name}`);
          const d = await PDFDocument.load(await f.arrayBuffer());
          docs.push({ f, d });
          allPages += d.getPageCount();
        }
        const fsize = Math.max(4, Number(pnSize) || 10);
        const sx = Math.max(0, Number(pnSpaceX) || 0) * MM;
        const sy = Math.max(0, Number(pnSpaceY) || 0) * MM;
        const firstPage = Math.max(1, Number(pnFirstPage) || 1);
        const lastPage = pnLastPage.trim() ? Math.max(1, Number(pnLastPage) || 0) : Infinity;
        const digits = Math.max(1, Number(pnDigits) || 1);
        const col = hexRgb(pnColor);
        let counter = Number(pnFirstNumber) || 1;
        for (const { f, d } of docs) {
          const total = d.getPageCount();
          const font = await d.embedFont(fontName);
          const cnt = pnContinuous ? allPages : total;
          let num = pnContinuous ? counter : (Number(pnFirstNumber) || 1);
          let numbered = 0;
          for (let i = 1; i <= total; i++) {
            if (i < firstPage || i > lastPage) continue;
            const page = d.getPage(i - 1);
            const { width: W, height: H } = page.getSize();
            const text = fillPattern(pnPattern.trim() || "{NUM} / {CNT}", fmtPageNumber(num, pnFormat, digits), fmtPageNumber(cnt, pnFormat, digits));
            const tw = font.widthOfTextAtSize(text, fsize);
            const [, horiz] = pnPos.split("-");
            const outsideRight = i % 2 === 1;
            const x = horiz === "left" ? sx : horiz === "center" ? (W - tw) / 2 : horiz === "right" ? W - sx - tw : outsideRight ? W - sx - tw : sx;
            const vert = pnPos.split("-")[0];
            const y = vert === "top" ? H - sy - fsize : vert === "middle" ? H / 2 - fsize / 2 : sy;
            page.drawText(text, { x, y, size: fsize, font, color: rgb(col.r, col.g, col.b), opacity: pnOpacity / 100, rotate: degrees(Number(pnAngle) || 0) });
            num++; numbered++;
          }
          if (pnContinuous) counter = num;
          const blob = new Blob([(await d.save()) as unknown as BlobPart], { type: "application/pdf" });
          res.push({ name: `${base(f.name)}-numbered.pdf`, url: keep(blob), note: `${numbered} of ${total} pages numbered, ${kb(blob.size)}` });
        }
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
        <strong>{files.length
          ? cfg.multi
            ? <>{files.length} file{files.length === 1 ? "" : "s"} ready <span className="fsz">{kb(files.reduce((n, f) => n + f.size, 0))}</span></>
            : <>{files[0].name} <span className="fsz">{kb(files[0].size)}</span></>
          : "Choose a file"}</strong>
        <span>{files.length ? (cfg.multi ? "Choose again to add more." : "Choose again to replace.") : `${cfg.hint} Or drop it here.`}</span>
        <input type="file" accept={cfg.accept} multiple={cfg.multi} onChange={(e) => {
          const list = Array.from(e.target.files || []);
          if (cfg.multi) addFiles(list);
          else { setFiles(list); setOut([]); setErr(""); }
          e.target.value = "";
        }} />
      </label>

      {cfg.multi && files.length > 0 && (
        <ul className="picks">
          {files.map((f, i) => (
            <li key={`${f.name}|${f.size}|${f.lastModified}`}>
              <span className="nm" title={f.name}>{f.name}</span>
              <span className="fsz">{kb(f.size)}</span>
              {orderMatters && <>
                <button type="button" className="mv" onClick={() => moveAt(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
                <button type="button" className="mv" onClick={() => moveAt(i, 1)} disabled={i === files.length - 1} aria-label="Move down">▼</button>
              </>}
              <button type="button" className="rm" onClick={() => removeAt(i)} aria-label="Remove">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="opts">
        {slug === "image-compress" && <>
          <label>Quality: {q}<input type="range" min="10" max="95" value={q} onChange={(e) => setQ(+e.target.value)} /></label>
          {imgFmt()}
          <p className="hint">Lower quality gives a smaller file. PNG photos are saved as JPG or WebP.</p>
        </>}
        {slug === "image-target-size" && <>
          <label>Target size
            <span className="pair">
              <input
                type="number"
                inputMode="decimal"
                min={targetUnit === "MB" ? "0.001" : "1"}
                max={targetUnit === "MB" ? "20" : "20480"}
                step={targetUnit === "MB" ? "any" : "1"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onBlur={(e) => setTarget(clampTarget(e.target.value, targetUnit))}
              />
              <select value={targetUnit} onChange={(e) => { const u = e.target.value; setTargetUnit(u); setTarget((t) => clampTarget(t, u)); }}>
                <option value="KB">KB</option>
                <option value="MB">MB</option>
              </select>
            </span>
          </label>
          <label>Format
            <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          <p className="hint">Quality, and if needed the pixel size, drop automatically until the file fits your target. Target can be from 1 KB up to 20 MB. Great for upload limits and forms — like “under 200 KB”. A photo that is already smaller than the target is left untouched, so a file never gets bigger. WebP gets a bit smaller than JPG.</p>
          <label className="check"><input type="checkbox" checked={pad} onChange={(e) => setPad(e.target.checked)} />Reach the target exactly<small>If a photo is already under the target, add invisible metadata so it grows to the target. The picture is not changed and no quality is lost — handy when a form needs a minimum size.</small></label>
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
        {slug === "pdf-grayscale" && <>
          <label>Gray tones
            <select value={grayModel} onChange={(e) => setGrayModel(e.target.value as "luma" | "colorimetric")}>
              <option value="luma">Standard (PDF spec)</option>
              <option value="colorimetric">Colorimetric (closer to print)</option>
            </select>
          </label>
          <p className="hint">Only the colors change — text, fonts and vectors are kept, so the words stay <b>selectable and searchable</b>. Nothing is uploaded.</p>
        </>}
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
        {slug === "pdf-compress" && <>
          <label>Mode
            <select value={pcMode} onChange={(e) => setPcMode(e.target.value as "optimize" | "compress")}>
              <option value="optimize">Optimize only — lossless</option>
              <option value="compress">Compress — shrink photos too</option>
            </select>
          </label>
          {pcMode === "compress" && <>
            <label>Shrink by
              <select value={pcBy} onChange={(e) => setPcBy(e.target.value as "quality" | "target")}>
                <option value="quality">Quality</option>
                <option value="target">Target file size</option>
              </select>
            </label>
            {pcBy === "quality" && (
              <label>Photo quality: {pcQ}%<input type="range" min="20" max="90" value={pcQ} onChange={(e) => setPcQ(+e.target.value)} /></label>
            )}
            {pcBy === "target" && (
              <label>Target size
                <span className="pair">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={pcTargetUnit === "MB" ? "0.001" : "1"}
                    max={pcTargetUnit === "MB" ? "100" : "102400"}
                    step={pcTargetUnit === "MB" ? "any" : "1"}
                    value={pcTarget}
                    onChange={(e) => setPcTarget(e.target.value)}
                    onBlur={(e) => setPcTarget(clampPdfTarget(e.target.value, pcTargetUnit))}
                  />
                  <select value={pcTargetUnit} onChange={(e) => { const u = e.target.value; setPcTargetUnit(u); setPcTarget((t) => clampPdfTarget(t, u)); }}>
                    <option value="KB">KB</option>
                    <option value="MB">MB</option>
                  </select>
                </span>
              </label>
            )}
          </>}
          <p className="hint"><b>Optimize only</b> repacks the file structure — lossless, text stays selectable, nothing is blurred. <b>Compress</b> also re-encodes the photos inside the PDF at the quality or target size you pick while keeping text, fonts and vectors. Pages are never turned into images, so words stay selectable either way. A PDF that is already well optimized may barely change, and scanned photos that are already small cannot shrink much further.</p>
        </>}
        {slug === "video-to-audio" && <>
          <label>Output format
            <select value={vaFmt} onChange={(e) => setVaFmt(e.target.value)}>
              {AUDIO_FMTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          {audioLossy(vaFmt) && (
            <label>Bitrate
              <select value={vaBitrate} onChange={(e) => setVaBitrate(e.target.value)}>
                <option value="320">320 kbps</option>
                <option value="256">256 kbps</option>
                <option value="192">192 kbps</option>
                <option value="128">128 kbps</option>
                <option value="96">96 kbps</option>
              </select>
            </label>
          )}
          <p className="hint">Takes the sound out of a video and drops the picture. <b>MP3 and WAV are made instantly on your device.</b> The other formats use a one-time audio engine (about 31 MB) that loads from the web once and is then cached. Your file is never uploaded.</p>
        </>}
        {slug === "audio-to-video" && <>
          <label>Background
            <select value={avBg} onChange={(e) => setAvBg(e.target.value)}>
              <option value="black">Black screen</option>
              <option value="white">White screen</option>
              <option value="image">Your picture</option>
            </select>
          </label>
          <label>Video size
            <select value={avSize} onChange={(e) => setAvSize(e.target.value)}>
              {VIDEO_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label>Audio bitrate
            <select value={avBitrate} onChange={(e) => setAvBitrate(e.target.value)}>
              <option value="320">320 kbps</option>
              <option value="256">256 kbps</option>
              <option value="192">192 kbps</option>
              <option value="128">128 kbps</option>
              <option value="96">96 kbps</option>
            </select>
          </label>
          {avBg === "image" && (
            <label className="full">Picture for the background
              <input type="file" accept="image/*" onChange={(e) => setAvBgFile(e.target.files?.[0] ?? null)} />
            </label>
          )}
          {avBg === "image" && (
            <label>Picture fit
              <select value={avFit} onChange={(e) => setAvFit(e.target.value as "cover" | "contain")}>
                <option value="cover">Fill the frame (crop edges)</option>
                <option value="contain">Fit inside (add bars)</option>
              </select>
            </label>
          )}
          <p className="hint">Turns audio into a real <b>MP4</b> video on a black screen or your own picture. The first run loads a one-time video engine (about 31 MB) from the web and caches it. Your file is never uploaded.</p>
        </>}
        {slug === "trim-media" && <>
          <label>What to do
            <select value={tmMode} onChange={(e) => setTmMode(e.target.value)}>
              <option value="trim">Trim one part</option>
              <option value="split">Split into parts</option>
            </select>
          </label>
          {tmMode === "trim" && (
            <label>From
              <input type="text" value={tmFrom} onChange={(e) => setTmFrom(e.target.value)} placeholder="0:00" inputMode="numeric" />
            </label>
          )}
          {tmMode === "trim" && (
            <label>To
              <input type="text" value={tmTo} onChange={(e) => setTmTo(e.target.value)} placeholder={tmDur > 0 ? fmtTime(tmDur) : "end"} inputMode="numeric" />
            </label>
          )}
          {tmMode === "split" && (
            <label>Split by
              <select value={tmSplit} onChange={(e) => setTmSplit(e.target.value)}>
                <option value="parts">Equal parts</option>
                <option value="every">Every few seconds</option>
              </select>
            </label>
          )}
          {tmMode === "split" && tmSplit === "parts" && (
            <label>Number of parts
              <input type="number" min={2} max={50} value={tmParts} onChange={(e) => setTmParts(e.target.value)} />
            </label>
          )}
          {tmMode === "split" && tmSplit === "every" && (
            <label>Seconds per part
              <input type="number" min={1} value={tmEvery} onChange={(e) => setTmEvery(e.target.value)} />
            </label>
          )}
          <p className="hint">{tmDur > 0 ? <>This file is <b>{fmtTime(tmDur)}</b> long. </> : null}Type times as <b>m:ss</b> or <b>h:mm:ss</b> (e.g. 1:30 or 0:12.5). The cut is re-encoded so it lands exactly where you want. The first run loads a one-time engine (about 31 MB) from the web; your file is never uploaded.</p>
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
        {slug === "pdf-page-numbers" && <>
          <label className="full">Pattern<input type="text" value={pnPattern} onChange={(e) => setPnPattern(e.target.value)} placeholder="{NUM} / {CNT}" /></label>
          <label>Position
            <select value={pnPos} onChange={(e) => setPnPos(e.target.value)}>
              <optgroup label="Top">
                <option value="top-left">Top, left</option>
                <option value="top-center">Top, center</option>
                <option value="top-right">Top, right</option>
                <option value="top-outside">Top, outside</option>
              </optgroup>
              <optgroup label="Middle">
                <option value="middle-left">Middle, left</option>
                <option value="middle-center">Middle, center</option>
                <option value="middle-right">Middle, right</option>
              </optgroup>
              <optgroup label="Bottom">
                <option value="bottom-left">Bottom, left</option>
                <option value="bottom-center">Bottom, center</option>
                <option value="bottom-right">Bottom, right</option>
                <option value="bottom-outside">Bottom, outside</option>
              </optgroup>
            </select>
          </label>
          <label>Font size<input type="number" min="4" max="72" value={pnSize} onChange={(e) => setPnSize(e.target.value)} /></label>
          <label>Font
            <select value={pnFont} onChange={(e) => setPnFont(e.target.value)}>
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={pnBold} onChange={(e) => setPnBold(e.target.checked)} />Bold</label>
          <label className="check"><input type="checkbox" checked={pnItalic} onChange={(e) => setPnItalic(e.target.checked)} />Italic</label>
          <label>Colour<input type="color" value={pnColor} onChange={(e) => setPnColor(e.target.value)} /></label>
          <label>Opacity: {pnOpacity}%<input type="range" min="10" max="100" step="5" value={pnOpacity} onChange={(e) => setPnOpacity(+e.target.value)} /></label>
          <label>Angle (°)<input type="number" value={pnAngle} onChange={(e) => setPnAngle(e.target.value)} /></label>
          <label>Side space (mm)<input type="number" min="0" value={pnSpaceX} onChange={(e) => setPnSpaceX(e.target.value)} /></label>
          <label>Edge space (mm)<input type="number" min="0" value={pnSpaceY} onChange={(e) => setPnSpaceY(e.target.value)} /></label>
          <label>First page<input type="number" min="1" value={pnFirstPage} onChange={(e) => setPnFirstPage(e.target.value)} /></label>
          <label>First number<input type="number" value={pnFirstNumber} onChange={(e) => setPnFirstNumber(e.target.value)} /></label>
          <label>Last page (optional)<input type="number" min="1" value={pnLastPage} onChange={(e) => setPnLastPage(e.target.value)} placeholder="end" /></label>
          <label>Number style
            <select value={pnFormat} onChange={(e) => setPnFormat(e.target.value)}>
              <option value="arabic">1, 2, 3</option>
              <option value="romanLower">i, ii, iii</option>
              <option value="romanUpper">I, II, III</option>
              <option value="alphaLower">a, b, c</option>
              <option value="alphaUpper">A, B, C</option>
            </select>
          </label>
          <label>Digits<input type="number" min="1" max="10" value={pnDigits} onChange={(e) => setPnDigits(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={pnContinuous} onChange={(e) => setPnContinuous(e.target.checked)} />Continue across files<small>Carries the count from one PDF to the next, in the order you picked them.</small></label>
          <p className="hint">Use <b>{"{NUM}"}</b> for the page number and <b>{"{CNT}"}</b> for the total, e.g. <b>{"Page {NUM} of {CNT}"}</b>. Inserted text is real text the viewer can search and copy.</p>
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