"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Cropper from "cropperjs";
import s from "./passport.module.css";

type Item = { id: number; src: string; bg: string | null; w: number; h: number; n: number };
type Pend = { orig: string; crop: string | null; ar: number; name: string; alpha: boolean; bg: string };
type Rect = { it: Item; rot: boolean; w: number; h: number; x: number; y: number; key?: string };
type Cell = { x: number; y: number; w: number; h: number; rot: boolean };
type Page = Rect[];
type Settings = {
  margin: string; gap: string; m_t: string; m_b: string; m_l: string; m_r: string;
  copies: string; rot: boolean; adv: boolean;
};

const PRESETS: [number, number, string][] = [
  [35, 45, "India and most passports"],
  [51, 51, "US 2 × 2 in"],
  [30, 40, "Visa and ID"],
  [25, 35, "Small ID"],
  [20, 25, "Stamp size"],
];
const MM = 96 / 25.4;
const DEFAULTS: Settings = { margin: "0", gap: "3", m_t: "0", m_b: "0", m_l: "0", m_r: "0", copies: "6", rot: true, adv: false };
const BG_SWATCHES = ["#ffffff", "#cfe4f7", "#2f6fd0", "#c62828"];

const ICON_ON = (
  <svg viewBox="0 0 16 16" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
);
const ICON_OFF = (
  <svg viewBox="0 0 16 16" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" /></svg>
);

const cl = (v: string) => Math.max(0, parseFloat(v) || 0);

const HELP = {
  margin: {
    title: "Page margin",
    img: "/help/page-margin.svg",
    alt: "A4 sheet with passport photos. The blank border around all photos is highlighted as the page margin.",
    text: "The blank border between the paper edge and your photos, on all four sides. Raise it if your printer cuts off the edges. A margin of 0 fits the most photos on a sheet.",
  },
  sides: {
    title: "Set each side separately",
    img: "/help/separate-sides.svg",
    alt: "A4 sheet with passport photos. The top, bottom, left and right margins are highlighted with different widths.",
    text: "Give the top, bottom, left and right margins different values. Useful when your printer needs more room on one side, or when you want the photos moved away from one edge.",
  },
  gap: {
    title: "Gap between photos",
    img: "/help/photo-gap.svg",
    alt: "A4 sheet with passport photos. The spaces between neighbouring photos are highlighted as the gap.",
    text: "The space between neighbouring photos. A small gap leaves a white border around each photo, so it is easier to cut cleanly. A gap of 0 fits the most photos, but you must cut exactly on the line.",
  },
} as const;
type HelpKey = keyof typeof HELP;

function HelpBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className={s.helpBtn} onClick={onClick} aria-label={`What is ${label}?`} aria-haspopup="dialog">i</button>
  );
}


/* ---------- layout ---------- */
type Opts = { W: number; H: number; g: number; ML: number; MT: number; rotOK: boolean };

function pack(list: Rect[], W: number, H: number, g: number, ML: number, MT: number) {
  const arr = list.slice().sort((a, b) => b.h - a.h);
  const pages: Page[] = [[]];
  let x = 0, y = 0, rh = 0, bottom = 0;
  for (const r of arr) {
    if (r.w > W + 1e-6 || r.h > H + 1e-6) return null;
    if (x > 0 && x + r.w > W + 1e-6) { y += rh + g; x = 0; rh = 0; }
    if (y + r.h > H + 1e-6) { pages.push([]); x = 0; y = 0; rh = 0; }
    pages[pages.length - 1].push({ ...r, x: ML + x, y: MT + y });
    x += r.w + g; rh = Math.max(rh, r.h); bottom = y + rh;
  }
  return { pages, bottom };
}

type Free = { x: number; y: number; w: number; h: number };

function maxrects(list: Rect[], W: number, H: number, g: number, ML: number, MT: number, rotOK: boolean) {
  const BW = W + g, BH = H + g;
  const pages: { free: Free[]; out: Rect[] }[] = [];
  const newPage = () => ({ free: [{ x: 0, y: 0, w: BW, h: BH }] as Free[], out: [] as Rect[] });

  const tryPlace = (pg: { free: Free[]; out: Rect[] }, r: Rect) => {
    let best: { s1: number; s2: number; x: number; y: number; w: number; h: number; rot: boolean } | null = null;
    for (const f of pg.free) for (const rot of (rotOK ? [false, true] : [false])) {
      const w = (rot ? r.h : r.w) + g, h = (rot ? r.w : r.h) + g;
      if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
      const s1 = Math.min(f.w - w, f.h - h), s2 = Math.max(f.w - w, f.h - h);
      if (!best || s1 < best.s1 || (s1 === best.s1 && s2 < best.s2)) best = { s1, s2, x: f.x, y: f.y, w, h, rot };
    }
    if (!best) return false;
    const nf: Free[] = [];
    for (const f of pg.free) {
      if (best.x >= f.x + f.w || best.x + best.w <= f.x || best.y >= f.y + f.h || best.y + best.h <= f.y) { nf.push(f); continue; }
      if (best.x > f.x) nf.push({ x: f.x, y: f.y, w: best.x - f.x, h: f.h });
      if (best.x + best.w < f.x + f.w) nf.push({ x: best.x + best.w, y: f.y, w: f.x + f.w - best.x - best.w, h: f.h });
      if (best.y > f.y) nf.push({ x: f.x, y: f.y, w: f.w, h: best.y - f.y });
      if (best.y + best.h < f.y + f.h) nf.push({ x: f.x, y: best.y + best.h, w: f.w, h: f.y + f.h - best.y - best.h });
    }
    pg.free = nf.filter((a, i) => !nf.some((b, j) => j !== i && a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6 && (i > j || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y)));
    pg.out.push({ it: r.it, rot: best.rot ? !r.rot : r.rot, w: best.w - g, h: best.h - g, x: ML + best.x, y: MT + best.y });
    return true;
  };

  for (const r of list) {
    if (!(r.w <= W + 1e-6 && r.h <= H + 1e-6) && !(rotOK && r.h <= W + 1e-6 && r.w <= H + 1e-6)) return null;
    let ok = false;
    for (const pg of pages) if (tryPlace(pg, r)) { ok = true; break; }
    if (!ok) { const pg = newPage(); pages.push(pg); if (!tryPlace(pg, r)) return null; }
  }
  const last = pages[pages.length - 1].out;
  const bottom = Math.max(...last.map(r => r.y + r.h - MT));
  return { pages: pages.map(p => p.out), bottom };
}

function blocks(list: Rect[], W: number, H: number, g: number, ML: number, MT: number) {
  const w0 = list[0].it.w, h0 = list[0].it.h;
  if (list.some(r => r.it.w !== w0 || r.it.h !== h0)) return null;
  const grid = (x0: number, y0: number, bw: number, bh: number, rot: boolean) => {
    const w = rot ? h0 : w0, h = rot ? w0 : h0;
    const c = Math.floor((bw + g + 1e-6) / (w + g)), rr = Math.floor((bh + g + 1e-6) / (h + g));
    const out: Cell[] = [];
    for (let j = 0; j < rr; j++) for (let i = 0; i < c; i++) out.push({ x: ML + x0 + i * (w + g), y: MT + y0 + j * (h + g), w, h, rot });
    return out;
  };
  let best: Cell[] = [];
  for (const a of [false, true]) for (const b of [false, true]) {
    const wa = a ? h0 : w0, ha = a ? w0 : h0;
    for (let k = 0; k <= Math.floor((W + g) / (wa + g)); k++) {
      const bw = k * (wa + g) - (k ? g : 0);
      const L = k ? grid(0, 0, bw, H, a) : [];
      const R = grid(k ? bw + g : 0, 0, W - (k ? bw + g : 0), H, b);
      if (L.length + R.length > best.length) best = L.concat(R);
    }
    for (let k = 0; k <= Math.floor((H + g) / (ha + g)); k++) {
      const bh = k * (ha + g) - (k ? g : 0);
      const T = k ? grid(0, 0, W, bh, a) : [];
      const B = grid(0, k ? bh + g : 0, W, H - (k ? bh + g : 0), b);
      if (T.length + B.length > best.length) best = T.concat(B);
    }
  }
  if (!best.length) return null;
  best.sort((p, q) => p.y - q.y || p.x - q.x);
  const pages: Page[] = [];
  for (let i = 0; i < list.length; i += best.length)
    pages.push(best.slice(0, Math.min(best.length, list.length - i)).map((cell, j) => ({ it: list[i + j].it, ...cell })));
  const last = pages[pages.length - 1];
  return { pages, bottom: Math.max(...last.map(r => r.y + r.h - MT)) };
}
function computeLayout(items: Item[], used: Record<number, number>, o: Opts) {
  const { W, H, g, ML, MT, rotOK } = o;
  const act = items.filter(it => it.n - (used[it.id] || 0) > 0);
  if (!act.length) return { pages: [] as Page[], bottom: 0 };

  const mk = (flags: boolean[]) => {
    const out: Rect[] = [];
    act.forEach((it, i) => {
      const rot = flags[i];
      const cnt = it.n - (used[it.id] || 0);
      for (let k = 0; k < cnt; k++) out.push({ it, rot, w: rot ? it.h : it.w, h: rot ? it.w : it.h, x: 0, y: 0 });
    });
    return out;
  };

  const n = act.length;
  let combos: boolean[][] = [Array(n).fill(false)];
  if (rotOK) {
    if (n <= 5) { combos = []; for (let b = 0; b < (1 << n); b++) combos.push(act.map((_, i) => !!(b >> i & 1))); }
    else combos.push(Array(n).fill(true));
  }

  const results: { pages: Page[]; bottom: number; sc: number }[] = [];
  const consider = (res: { pages: Page[]; bottom: number } | null) => {
    if (!res) return;
    const lp = res.pages[res.pages.length - 1];
    const right = Math.max(...lp.map(r => r.x + r.w));
    const sc = res.pages.length * 1000 + res.bottom - right * 0.01;
    results.push({ pages: res.pages, bottom: res.bottom, sc });
  };

  for (const f of combos) consider(pack(mk(f), W, H, g, ML, MT));
  const base = mk(Array(n).fill(false));
  if (rotOK) {
    consider(blocks(base, W, H, g, ML, MT));
    ([(a: Rect, b: Rect) => b.w * b.h - a.w * a.h, (a: Rect, b: Rect) => b.h - a.h, (a: Rect, b: Rect) => b.w - a.w] as const)
      .forEach(c => consider(maxrects(base.slice().sort(c), W, H, g, ML, MT, true)));
  }
  if (!results.length) return null;
  results.sort((a, b) => a.sc - b.sc);
  const b = results[0];
  return { pages: b.pages, bottom: b.bottom };
}

type Sheet =
  | { kind: "empty"; pages: Page[]; keep: number; total: number; area: number }
  | { kind: "error"; pages: Page[]; keep: number; total: number; area: number }
  | { kind: "ok"; pages: Page[]; keep: number; total: number; area: number };

function computeSheet(items: Item[], locks: Page[], o: Opts): Sheet {
  if (!items.length) return { kind: "empty", pages: [], keep: 0, total: 0, area: 0 };
  const used: Record<number, number> = {};
  let keep = 0;
  for (const pg of locks) {
    const u = { ...used };
    let ok = true;
    for (const r of pg) {
      if (!items.some(x => x.id === r.it.id)) { ok = false; break; }
      u[r.it.id] = (u[r.it.id] || 0) + 1;
      if (u[r.it.id] > r.it.n) { ok = false; break; }
    }
    if (!ok) break;
    Object.assign(used, u);
    keep++;
  }
  let rest: Page[] = [];
  if (items.some(it => it.n - (used[it.id] || 0) > 0)) {
    const res = computeLayout(items, used, o);
    if (!res) return { kind: "error", pages: [], keep, total: 0, area: 0 };
    rest = res.pages;
  }
  const pages = [...locks.slice(0, keep), ...rest];
  let total = 0, area = 0;
  for (const pg of pages) for (const r of pg) { total++; area += r.w * r.h; }
  return { kind: "ok", pages, keep, total, area };
}

/* ---------- PDF (raw writer, no deps) ---------- */
type PdfImg = { w: number; h: number; bytes: Uint8Array };

function buildPDF(pages: Page[], imgs: Record<string, PdfImg>) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const off: number[] = [];
  let len = 0;
  const push = (x: string | Uint8Array) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (id: number, dict: string, data?: Uint8Array) => {
    off[id] = len;
    push(`${id} 0 obj\n`);
    if (data) { push(dict.replace("LEN", String(data.length)) + "\nstream\n"); push(data); push("\nendstream\nendobj\n"); }
    else push(dict + "\nendobj\n");
  };
  const keys = Object.keys(imgs), K = keys.length, P = pages.length, pt = 72 / 25.4;
  push("%PDF-1.4\n");
  obj(1, "<</Type/Catalog/Pages 2 0 R>>");
  obj(2, `<</Type/Pages/Count ${P}/Kids[${pages.map((_, i) => (3 + K + 2 * i + 1) + " 0 R").join(" ")}]>>`);
  keys.forEach((k, i) => obj(3 + i, `<</Type/XObject/Subtype/Image/Width ${imgs[k].w}/Height ${imgs[k].h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length LEN>>`, imgs[k].bytes));
  const names = keys.map((k, i) => `/I${i} ${3 + i} 0 R`).join(" ");
  pages.forEach((pg, i) => {
    const cid = 3 + K + 2 * i;
    const c = pg.map(r => `q ${(r.w * pt).toFixed(3)} 0 0 ${(r.h * pt).toFixed(3)} ${(r.x * pt).toFixed(3)} ${(841.89 - (r.y + r.h) * pt).toFixed(3)} cm /I${keys.indexOf(r.key || "")} Do Q\n`).join("");
    const cb = enc.encode(c);
    obj(cid, "<</Length LEN>>", cb);
    obj(cid + 1, `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595.276 841.89]/Resources<</XObject<<${names}>>>>/Contents ${cid} 0 R>>`);
  });
  const n = 3 + K + 2 * P, xr = len;
  let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) x += String(off[i]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<</Size ${n}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

async function hasAlpha(url: string) {
  const im = new Image();
  im.src = url;
  await im.decode();
  const k = Math.min(1, 256 / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(im.naturalWidth * k));
  c.height = Math.max(1, Math.round(im.naturalHeight * k));
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(im, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}
export function PassportSheet() {
  const [items, setItems] = useState<Item[]>([]);
  const [sizeVal, setSizeVal] = useState("35,45");
  const [customW, setCustomW] = useState("35");
  const [customH, setCustomH] = useState("45");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [locks, setLocks] = useState<Page[]>([]);
  const [pend, setPend] = useState<Pend | null>(null);
  const [bg, setBg] = useState("#ffffff");
  const [cropOpen, setCropOpen] = useState(false);
  const [zoomMul, setZoomMul] = useState(1);
  const [z, setZ] = useState(1);
  const [help, setHelp] = useState<HelpKey | null>(null);
  useEffect(() => {
    if (!help) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setHelp(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help]);
  const [over, setOver] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [toast, setToast] = useState<{ msg: string; bad: boolean } | null>(null);

  const storeRef = useRef<{ profiles: Record<string, Settings>; bg: string }>({ profiles: {}, bg: "#ffffff" });
  const curKeyRef = useRef("");
  const settingsRef = useRef<Settings>(DEFAULTS);
  const pendRef = useRef<Pend | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const uidRef = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cimgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);

  const size: [number, number] = sizeVal === "custom"
    ? [Number(customW) || 35, Number(customH) || 45]
    : (sizeVal.split(",").map(Number) as [number, number]);
  const sw = size[0], sh = size[1];

  const mg = settings.adv
    ? { t: cl(settings.m_t), b: cl(settings.m_b), l: cl(settings.m_l), r: cl(settings.m_r) }
    : { t: cl(settings.margin), b: cl(settings.margin), l: cl(settings.margin), r: cl(settings.margin) };
  const gap = cl(settings.gap);
  const W = 210 - mg.l - mg.r;
  const H = 297 - mg.t - mg.b;

  const sheet = useMemo(
    () => computeSheet(items, locks, { W, H, g: gap, ML: mg.l, MT: mg.t, rotOK: settings.rot }),
    [items, locks, W, H, gap, mg.l, mg.t, settings.rot],
  );

  const persist = () => { try { localStorage.setItem("passport-sheet:v2", JSON.stringify(storeRef.current)); } catch { /* ignore */ } };
  const toastShow = (msg: string, bad = false) => {
    setToast({ msg, bad });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  const updatePend = (p: Pend | null) => { pendRef.current = p; setPend(p); };
  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    storeRef.current.profiles[curKeyRef.current] = next;
    persist();
    setSettings(next);
  };

  useEffect(() => {
    let st: any = {};
    try { st = JSON.parse(localStorage.getItem("passport-sheet:v2") || "{}") || {}; } catch { /* ignore */ }
    if (!st.profiles) {
      try {
        const o = JSON.parse(localStorage.getItem("passport-sheet:v1") || "{}") || {};
        if (o.size) {
          st = { size: o.size, cw: o.cw, ch: o.ch, profiles: {} };
          st.profiles[o.size === "custom" ? `c:${+o.cw || 0}x${+o.ch || 0}` : o.size] = o;
        }
      } catch { /* ignore */ }
    }
    storeRef.current = { profiles: st.profiles || {}, bg: st.bg || "#ffffff" };
    setBg(storeRef.current.bg);
    const sv = (PRESETS.some(p => `${p[0]},${p[1]}` === st.size) || st.size === "custom") ? st.size : "35,45";
    const cw = String(st.cw ?? "35");
    const ch = String(st.ch ?? "45");
    setSizeVal(sv);
    setCustomW(cw);
    setCustomH(ch);
    const key = keyFor(sv, cw, ch);
    curKeyRef.current = key;
    const prof = storeRef.current.profiles[key];
    const next = prof ? { ...DEFAULTS, ...prof } : DEFAULTS;
    settingsRef.current = next;
    setSettings(next);
  }, []);

  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach(i => URL.revokeObjectURL(i.src));
    const p = pendRef.current;
    if (p) { URL.revokeObjectURL(p.orig); if (p.crop) URL.revokeObjectURL(p.crop); }
  }, []);

  useEffect(() => {
    if (sheet.keep < locks.length) {
      setLocks(prev => prev.slice(0, sheet.keep));
      if (items.length) toastShow(`Sheet ${sheet.keep + 1} and later were unlocked because their photos changed.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.keep, locks.length, items.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const calc = () => {
      const cs = getComputedStyle(stage);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      // Fit one whole A4 sheet (page + label + ruler) inside the visible stage,
      // by width AND by height, so nothing needs scrolling by default.
      const byW = (stage.clientWidth - padX) / (220 * MM);
      const byH = (stage.clientHeight - padY) / (314 * MM);
      const fit = Math.min(1.6, byW, byH);
      setZ(Math.max(0.2, fit * zoomMul));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [zoomMul]);

  useEffect(() => {
    if (!cropOpen) return;
    const img = cimgRef.current;
    const p = pendRef.current;
    if (!img || !p) return;
    img.src = p.orig;
    let cancelled = false;
    const init = () => {
      if (cancelled) return;
      if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null; }
      cropperRef.current = new Cropper(img, {
        aspectRatio: sw / sh,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 0.9,
        background: false,
        responsive: true,
        toggleDragModeOnDblclick: false,
      });
    };
    if (img.complete && img.naturalWidth > 0) init();
    else img.addEventListener("load", init, { once: true });
    return () => {
      cancelled = true;
      img.removeEventListener("load", init);
      if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null; }
    };
  }, [cropOpen, pend?.orig, sw, sh]);

  useEffect(() => {
    if (!cropOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setCropOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [cropOpen]);

  const stepField = (field: keyof Settings, d: number, min: number, max: number) => {
    const cur = parseFloat(String(settingsRef.current[field])) || 0;
    const v = Math.min(max, Math.max(min, cur + d));
    updateSettings({ [field]: String(+v.toFixed(1)) } as Partial<Settings>);
  };

  const selectSize = (nextSize: string, nw = customW, nh = customH) => {
    const newKey = keyFor(nextSize, nw, nh);
    if (newKey === curKeyRef.current) { setSizeVal(nextSize); return; }
    storeRef.current.profiles[curKeyRef.current] = settingsRef.current;
    persist();
    setSizeVal(nextSize);
    curKeyRef.current = newKey;
    const prof = storeRef.current.profiles[newKey];
    if (prof) {
      const next = { ...settingsRef.current, ...prof };
      settingsRef.current = next;
      setSettings(next);
    }
  };

  const commitCustom = () => {
    const newKey = keyFor("custom", customW, customH);
    if (newKey === curKeyRef.current) return;
    storeRef.current.profiles[curKeyRef.current] = settingsRef.current;
    persist();
    curKeyRef.current = newKey;
    const prof = storeRef.current.profiles[newKey];
    if (prof) {
      const next = { ...settingsRef.current, ...prof };
      settingsRef.current = next;
      setSettings(next);
    }
  };

  const addFile = async (f?: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toastShow("That file is not an image. Choose a JPG, PNG or WebP photo.", true); return; }
    const old = pendRef.current;
    if (old) { URL.revokeObjectURL(old.orig); if (old.crop) URL.revokeObjectURL(old.crop); }
    const orig = URL.createObjectURL(f);
    let alpha = false;
    if (/^image\/(png|webp|gif|avif)/.test(f.type)) { try { alpha = await hasAlpha(orig); } catch { /* ignore */ } }
    updatePend({ orig, crop: null, ar: 0, name: f.name, alpha, bg: storeRef.current.bg });
    setCropOpen(true);
  };

  const applyCrop = async () => {
    const cr = cropperRef.current, p = pendRef.current;
    if (!cr || !p) return;
    const cv = cr.getCroppedCanvas({ maxWidth: 3000, maxHeight: 3000, fillColor: p.bg || "#fff", imageSmoothingQuality: "high" });
    const blob = await new Promise<Blob | null>(res => cv.toBlob(res, "image/jpeg", 0.95));
    if (!blob) return;
    if (p.crop) URL.revokeObjectURL(p.crop);
    updatePend({ ...p, crop: URL.createObjectURL(blob), ar: sw / sh });
    setCropOpen(false);
  };

  const addToSheet = () => {
    const p = pendRef.current;
    if (!p) return;
    const [w, h] = size;
    const ok = !!p.crop && Math.abs(p.ar - w / h) < 0.005;
    if (p.crop && !ok) toastShow("The size changed after cropping, so the photo was centered automatically.");
    const src = ok ? (p.crop as string) : p.orig;
    if (src !== p.orig) URL.revokeObjectURL(p.orig);
    if (p.crop && src !== p.crop) URL.revokeObjectURL(p.crop);
    const it: Item = {
      id: ++uidRef.current, src, bg: (!p.crop && p.alpha) ? p.bg : null, w, h,
      n: Math.min(200, Math.max(1, Math.round(+settingsRef.current.copies || 1))),
    };
    setItems(prev => [...prev, it]);
    updatePend(null);
  };

  const removeItem = (id: number) => {
    const it = itemsRef.current.find(x => x.id === id);
    if (it) URL.revokeObjectURL(it.src);
    setItems(prev => prev.filter(x => x.id !== id));
  };

  const clearAll = () => {
    itemsRef.current.forEach(i => URL.revokeObjectURL(i.src));
    setItems([]);
    setLocks([]);
  };

  const setItemCopies = (id: number, n: number) => {
    const val = Math.min(200, Math.max(1, Math.round(n) || 1));
    setItems(prev => prev.map(it => it.id === id ? { ...it, n: val } : it));
  };

  const setBgColor = (c: string) => {
    setBg(c);
    storeRef.current.bg = c;
    const p = pendRef.current;
    if (p) updatePend({ ...p, bg: c });
    persist();
  };

  const resetSettings = () => {
    const next = { ...DEFAULTS };
    settingsRef.current = next;
    storeRef.current.profiles[curKeyRef.current] = next;
    persist();
    setSettings(next);
    toastShow("Settings for this photo size were reset.");
  };

  const toggleLock = (i: number) => {
    const keep = sheet.keep;
    if (i < keep) setLocks(prev => prev.slice(0, i));
    else {
      const add = sheet.pages.slice(keep, i + 1).map(pg => pg.map(r => ({ ...r })));
      setLocks(prev => [...prev.slice(0, keep), ...add]);
    }
  };

  const downloadPdf = async () => {
    if (!items.length) { toastShow("Add at least one photo first.", true); return; }
    if (sheet.kind !== "ok") { toastShow("These photos do not fit on an A4 sheet. Reduce the margin or choose a smaller size.", true); return; }
    setBusyPdf(true);
    try {
      const imgs: Record<string, PdfImg> = {};
      const cache: Record<number, HTMLImageElement> = {};
      const D = 300 / 25.4;
      for (const pg of sheet.pages) for (const r of pg) {
        const key = r.it.id + (r.rot ? "r" : "n");
        r.key = key;
        if (imgs[key]) continue;
        if (!cache[r.it.id]) { const im = new Image(); im.src = r.it.src; await im.decode(); cache[r.it.id] = im; }
        const im = cache[r.it.id];
        const pw = Math.round(r.w * D), ph = Math.round(r.h * D);
        const up = document.createElement("canvas");
        up.width = pw; up.height = ph;
        const u = up.getContext("2d")!;
        const sc = Math.max(pw / im.naturalWidth, ph / im.naturalHeight);
        const dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
        u.fillStyle = r.it.bg || "#fff";
        u.fillRect(0, 0, pw, ph);
        u.drawImage(im, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
        let cv = up;
        if (r.rot) {
          cv = document.createElement("canvas");
          cv.width = ph; cv.height = pw;
          const c = cv.getContext("2d")!;
          c.translate(ph, 0);
          c.rotate(Math.PI / 2);
          c.drawImage(up, 0, 0);
        }
        const blob = await new Promise<Blob | null>(res => cv.toBlob(res, "image/jpeg", 0.95));
        if (!blob) throw new Error("Canvas export failed");
        imgs[key] = { w: cv.width, h: cv.height, bytes: new Uint8Array(await blob.arrayBuffer()) };
      }
      const url = URL.createObjectURL(buildPDF(sheet.pages, imgs));
      const a = document.createElement("a");
      a.href = url; a.download = "passport-photos-A4.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toastShow("Could not create the PDF: " + (e instanceof Error ? e.message : String(e)), true);
    } finally {
      setBusyPdf(false);
    }
  };

  const pendOk = !!pend && !!pend.crop && Math.abs(pend.ar - sw / sh) < 0.005;
  const pendNote = !pend ? "" : (pendOk
    ? "Cropped and ready to add."
    : pend.crop
      ? "The size changed after cropping. Crop again to frame it for the new size."
      : "Not cropped. It will be centered automatically.")
    + (pend.alpha && !pend.crop ? " Transparent areas use the background color you picked." : "");

  let statusText = "";
  let statusBad = false;
  if (sheet.kind === "empty") statusText = "Add a photo to start.";
  else if (sheet.kind === "error") {
    statusText = "This photo size does not fit on A4 with the current margin. Reduce the margin or choose a smaller size.";
    statusBad = true;
  } else {
    const N = sheet.pages.length;
    statusText = `${sheet.total} photo${sheet.total > 1 ? "s" : ""} on ${N} sheet${N > 1 ? "s" : ""}. Photos cover ${Math.round(sheet.area / (210 * 297 * N) * 100)}% of the paper.`
      + (sheet.keep ? (sheet.keep === 1 ? " Sheet 1 is locked." : ` Sheets 1 to ${sheet.keep} are locked.`) : "");
  }

  const sideFields: { key: keyof Settings; label: string }[] = [
    { key: "m_t", label: "Top (mm)" },
    { key: "m_b", label: "Bottom (mm)" },
    { key: "m_l", label: "Left (mm)" },
    { key: "m_r", label: "Right (mm)" },
  ];

  const rulers = (
    <>
      <div className={s.rx} aria-hidden="true">
        {[0, 50, 100, 150, 200].map(v => <span key={v} style={{ left: `${v + 0.6}mm` }}>{v}</span>)}
      </div>
      <div className={s.ry} aria-hidden="true">
        {[50, 100, 150, 200, 250].map(v => <span key={v} style={{ top: `${v}mm` }}>{v}</span>)}
      </div>
    </>
  );

  let pageNodes: ReactNode = null;
  if (sheet.kind === "empty") {
    pageNodes = (
      <div className={s.sheetwrap}>
        <div className={s.sheetbox}>
          {rulers}
          <div className={s.page}>
            <div className={s.empty}>Your sheet is empty. Add a photo and it will be laid out here.</div>
          </div>
        </div>
      </div>
    );
  } else if (sheet.kind === "ok") {
    const N = sheet.pages.length;
    pageNodes = sheet.pages.map((pg, i) => {
      const locked = i < sheet.keep;
      return (
        <div className={s.sheetwrap} key={i}>
          {(N > 1 || sheet.keep > 0) && (
            <div className={s.shead}>
              <span>Sheet {i + 1} of {N}{locked ? ", locked" : ""}</span>
              {(i < N - 1 || locked) ? (
                <button
                  type="button"
                  className={s.lockbtn + (locked ? " " + s.lockbtnOn : "")}
                  onClick={() => toggleLock(i)}
                  title={locked ? "Unlock this sheet and every sheet after it" : "Keep this sheet as it is. Changes only affect the sheets after it."}
                >
                  {locked ? <>{ICON_ON} Unlock</> : <>{ICON_OFF} Lock</>} sheet {i + 1}
                </button>
              ) : null}
            </div>
          )}
          <div className={s.sheetbox}>
            {rulers}
            <div className={s.page + (locked ? " " + s.pageLocked : "")}>
              {pg.map((r, k) => (
                <div
                  key={k}
                  className={s.cell}
                  style={{ left: `${r.x}mm`, top: `${r.y}mm`, width: `${r.w}mm`, height: `${r.h}mm`, ...(r.it.bg ? { background: r.it.bg } : {}) }}
                >
                  <img
                    src={r.it.src}
                    alt=""
                    style={{
                      width: `${r.it.w}mm`, height: `${r.it.h}mm`,
                      left: `${(r.w - r.it.w) / 2}mm`, top: `${(r.h - r.it.h) / 2}mm`,
                      transform: r.rot ? "rotate(90deg)" : undefined,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <div className={s.app}>
      <aside className={s.panel} data-ps-hide>
        <p className={s.muted}>Lay out passport photos on A4 and download a print-ready PDF. Photos stay on your device.</p>

        <section className={s.section}>
          <h2 className={s.h2}>Add a photo</h2>
          <label
            className={s.drop + (over ? " " + s.over : "")}
            onDragEnter={e => { e.preventDefault(); setOver(true); }}
            onDragOver={e => { e.preventDefault(); setOver(true); }}
            onDragLeave={e => { e.preventDefault(); setOver(false); }}
            onDrop={e => { e.preventDefault(); setOver(false); addFile(e.dataTransfer.files?.[0]); }}
          >
            <strong>Choose a photo</strong>
            <span>or drop an image here. JPG, PNG or WebP.</span>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (fileRef.current) fileRef.current.value = ""; addFile(f); }} />
          </label>

          {pend && (
            <div className={s.pend + " " + s.pendOn}>
              <img src={pend.crop || pend.orig} alt="" style={{ background: pend.alpha && !pend.crop ? pend.bg : undefined }} />
              <div>
                <div>{pend.name}</div>
                <div className={s.muted}>{pendNote}</div>
              </div>
            </div>
          )}

          <fieldset className={s.fieldset}>
            <legend className={s.lab}>Photo size</legend>
            <div className={s.sizes}>
              {PRESETS.map(([w, h, name]) => {
                const v = `${w},${h}`;
                return (
                  <label key={v} className={s.chip}>
                    <input type="radio" name="size" value={v} checked={sizeVal === v} onChange={() => selectSize(v)} />
                    <span className={s.box}>
                      <i style={{ width: w * 0.5, height: h * 0.5 }} />
                      <span><b>{w} × {h} mm</b><small>{name}</small></span>
                    </span>
                  </label>
                );
              })}
              <label className={s.chip}>
                <input type="radio" name="size" value="custom" checked={sizeVal === "custom"} onChange={() => selectSize("custom")} />
                <span className={s.box}>
                  <i style={{ width: 15, height: 20 }} />
                  <span><b>Custom</b><small>Enter your own</small></span>
                </span>
              </label>
            </div>
          </fieldset>

          {sizeVal === "custom" && (
            <div className={s.two}>
              <div>
                <label className={s.lab} htmlFor="cw">Width (mm)</label>
                <input className={s.num} id="cw" type="number" value={customW} step={0.1} min={10} max={200} onChange={e => setCustomW(e.target.value)} onBlur={commitCustom} />
              </div>
              <div>
                <label className={s.lab} htmlFor="ch">Height (mm)</label>
                <input className={s.num} id="ch" type="number" value={customH} step={0.1} min={10} max={280} onChange={e => setCustomH(e.target.value)} onBlur={commitCustom} />
              </div>
            </div>
          )}

          <label className={s.lab} htmlFor="copies">Copies</label>
          <div className={s.step}>
            <button className={s.btn} type="button" onClick={() => stepField("copies", -1, 1, 200)} aria-label="Fewer copies">−</button>
            <input id="copies" type="number" value={settings.copies} min={1} max={200} onChange={e => updateSettings({ copies: e.target.value })} />
            <button className={s.btn} type="button" onClick={() => stepField("copies", 1, 1, 200)} aria-label="More copies">+</button>
          </div>

          <div className={s.actions}>
            <button className={s.btn} disabled={!pend} onClick={() => setCropOpen(true)}>Crop photo</button>
            <button className={s.btn + " " + s.btnSolid} disabled={!pend} onClick={addToSheet}>Add to sheet</button>
          </div>
        </section>

        <section className={s.section}>
          <div className={s.sh}>
            <h2 className={s.h2}>On the sheet</h2>
            {items.length > 0 && <button className={s.link} onClick={clearAll}>Remove all</button>}
          </div>
          <div>
            {items.length === 0 ? (
              <p className={s.muted}>Nothing here yet. Add a photo and it will appear on the sheet.</p>
            ) : items.map(it => (
              <div key={it.id} className={s.item}>
                <img src={it.src} alt="" />
                <b>{it.w} × {it.h} mm</b>
                <div className={s.step}>
                  <button className={s.btn} type="button" onClick={() => setItemCopies(it.id, it.n - 1)} aria-label="Fewer copies">−</button>
                  <input type="number" min={1} max={200} value={it.n} aria-label="Copies" onChange={e => setItemCopies(it.id, +e.target.value)} />
                  <button className={s.btn} type="button" onClick={() => setItemCopies(it.id, it.n + 1)} aria-label="More copies">+</button>
                </div>
                <button className={s.rm} onClick={() => removeItem(it.id)} aria-label="Remove this photo">×</button>
              </div>
            ))}
          </div>
        </section>

        <section className={s.section}>
          <h2 className={s.h2} style={{ marginBottom: 4 }}>Sheet settings</h2>
          {!settings.adv && (
            <div>
              <div className={s.labrow}><label className={s.lab} htmlFor="margin">Page margin (mm)</label><HelpBtn label="page margin" onClick={() => setHelp("margin")} /></div>
              <div className={s.step + " " + s.fill}>
                <button className={s.btn} type="button" onClick={() => stepField("margin", -0.5, 0, 50)} aria-label="Decrease margin">−</button>
                <input id="margin" type="number" value={settings.margin} step={0.5} min={0} max={50} onChange={e => updateSettings({ margin: e.target.value })} />
                <button className={s.btn} type="button" onClick={() => stepField("margin", 0.5, 0, 50)} aria-label="Increase margin">+</button>
              </div>
            </div>
          )}
          <div className={s.checkrow}>
          <label className={s.check} style={{ marginTop: 12 }}>
            <input type="checkbox" checked={settings.adv} onChange={e => {
              if (e.target.checked) updateSettings({ adv: true, m_t: settings.margin, m_b: settings.margin, m_l: settings.margin, m_r: settings.margin });
              else updateSettings({ adv: false });
            }} />
            <span>Set each side separately<small>Top, bottom, left and right, one at a time.</small></span>
          </label>
          <HelpBtn label="separate sides" onClick={() => setHelp("sides")} />
          </div>
          {settings.adv && (
            <div className={s.two + " " + s.adv}>
              {sideFields.map(({ key, label }) => (
                <div key={key}>
                  <label className={s.lab} htmlFor={key}>{label}</label>
                  <div className={s.step + " " + s.fill + " " + s.sm}>
                    <button className={s.btn} type="button" onClick={() => stepField(key, -0.5, 0, 50)} aria-label={`Decrease ${label}`}>−</button>
                    <input id={key} type="number" value={String(settings[key])} step={0.5} min={0} max={50} onChange={e => updateSettings({ [key]: e.target.value } as Partial<Settings>)} />
                    <button className={s.btn} type="button" onClick={() => stepField(key, 0.5, 0, 50)} aria-label={`Increase ${label}`}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={s.labrow}><label className={s.lab} htmlFor="gap">Gap between photos (mm)</label><HelpBtn label="the gap between photos" onClick={() => setHelp("gap")} /></div>
          <div className={s.step + " " + s.fill}>
            <button className={s.btn} type="button" onClick={() => stepField("gap", -0.5, 0, 30)} aria-label="Decrease gap">−</button>
            <input id="gap" type="number" value={settings.gap} step={0.5} min={0} max={30} onChange={e => updateSettings({ gap: e.target.value })} />
            <button className={s.btn} type="button" onClick={() => stepField("gap", 0.5, 0, 30)} aria-label="Increase gap">+</button>
          </div>
          <p className={s.hint}>A 3 mm gap leaves a safe white border when you cut. Most home printers cannot print to the page edge, so use the PDF for a zero margin.</p>

          <label className={s.check}>
            <input type="checkbox" checked={settings.rot} onChange={e => updateSettings({ rot: e.target.checked })} />
            <span>Rotate photos to fit more per sheet<small>Some photos print sideways. Turn them upright after cutting.</small></span>
          </label>
        </section>

        <p className={s.hint}>Margins, gap, rotation and copies are remembered in this browser for each photo size.</p>
        <button className={s.link} type="button" style={{ marginTop: 6 }} onClick={resetSettings}>Reset settings for this size</button>
        <p className={s.foot}>Works offline. Nothing is uploaded.</p>
      </aside>

      <main className={s.main}>
        <div className={s.bar} data-ps-hide>
          <div className={s.status + (statusBad ? " " + s.statusBad : "")} aria-live="polite">{statusText}</div>
          <div className={s.zoomg} role="group" aria-label="Preview zoom">
            <button className={s.btn} onClick={() => setZoomMul(m => Math.max(0.4, m - 0.15))} aria-label="Zoom out">−</button>
            <button className={s.btn} onClick={() => setZoomMul(1)}>Fit</button>
            <button className={s.btn} onClick={() => setZoomMul(m => Math.min(2, m + 0.15))} aria-label="Zoom in">+</button>
          </div>
        </div>
        <div className={s.stage} ref={stageRef} style={{ "--z": z } as CSSProperties}>
          <div className={s.sheets}>{pageNodes}</div>
        </div>
        <div className={s.dl} data-ps-hide>
          <button className={s.btn + " " + s.btnAccent + " " + s.dlbtn} disabled={!items.length || busyPdf} onClick={downloadPdf}>{busyPdf ? "Preparing PDF..." : "Download PDF"}</button>
        </div>
      </main>

      {help && (
        <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="htitle" onMouseDown={e => { if (e.target === e.currentTarget) setHelp(null); }}>
          <div className={s.modalBox + " " + s.helpBox}>
            <h2 id="htitle" className={s.h2}>{HELP[help].title}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.helpImg} src={HELP[help].img} alt={HELP[help].alt} />
            <p className={s.muted}>{HELP[help].text}</p>
            <div className={s.actions}>
              <button type="button" className={s.btn + " " + s.btnSolid} autoFocus onClick={() => setHelp(null)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={s.toast + " " + s.toastOn + (toast.bad ? " " + s.toastBad : "")} role="status" aria-live="polite">{toast.msg}</div>}

      {cropOpen && (
        <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="ctitle" onMouseDown={e => { if (e.target === e.currentTarget) setCropOpen(false); }}>
          <div className={s.modalBox}>
            <h2 id="ctitle" className={s.h2}>Crop photo</h2>
            <p className={s.muted} style={{ marginTop: 4 }}>Drag the corners or edges to resize the frame. Drag inside it to move.</p>
            <div className={s.cwrap} style={{ "--pbg": bg } as CSSProperties}>
              <img ref={cimgRef} alt="Photo to crop" />
            </div>
            <div className={s.tools}>
              <button className={s.btn} onClick={() => cropperRef.current?.rotate(-90)}>Rotate left</button>
              <button className={s.btn} onClick={() => cropperRef.current?.rotate(90)}>Rotate right</button>
              <button className={s.btn} onClick={() => cropperRef.current?.zoom(0.1)}>Zoom in</button>
              <button className={s.btn} onClick={() => cropperRef.current?.zoom(-0.1)}>Zoom out</button>
            </div>
            {pend?.alpha && (
              <div className={s.bgrow}>
                <span className={s.lab} style={{ margin: 0 }}>This PNG has transparent areas. Background:</span>
                <div className={s.sw} role="group" aria-label="Background color">
                  {BG_SWATCHES.map(c => (
                    <button
                      key={c}
                      type="button"
                      className={s.swatch + (bg.toLowerCase() === c.toLowerCase() ? " " + s.swatchOn : "")}
                      style={{ background: c }}
                      onClick={() => setBgColor(c)}
                      aria-label={c}
                    />
                  ))}
                  <input className={s.bgc} type="color" value={bg} onChange={e => setBgColor(e.target.value)} aria-label="Pick any background color" />
                </div>
              </div>
            )}
            <div className={s.actions} style={{ marginTop: 0 }}>
              <button className={s.btn} onClick={() => setCropOpen(false)}>Use auto crop</button>
              <button className={s.btn + " " + s.btnSolid} onClick={applyCrop}>Apply crop</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function keyFor(sv: string, cw: string, ch: string) {
  return sv === "custom" ? `c:${+cw || 0}x${+ch || 0}` : sv;
}