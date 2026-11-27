"use client";
import { useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

type Out = { name: string; url: string; note: string };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const base = (n: string) => n.replace(/\.[^.]+$/, "");

const RATIOS: { id: string; label: string; value: number }[] = [
  { id: "free", label: "Free", value: NaN },
  { id: "1:1", label: "1:1", value: 1 },
  { id: "4:3", label: "4:3", value: 4 / 3 },
  { id: "3:4", label: "3:4", value: 3 / 4 },
  { id: "16:9", label: "16:9", value: 16 / 9 },
  { id: "9:16", label: "9:16", value: 9 / 16 },
];

export function ImageResize() {
  const imgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const urls = useRef<string[]>([]);

  const [name, setName] = useState("");
  const [src, setSrc] = useState("");
  const [ratioId, setRatioId] = useState("free");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [lock, setLock] = useState(true);
  const [fmt, setFmt] = useState("image/png");
  const [q, setQ] = useState(92);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState<Out[]>([]);
  const [cropInfo, setCropInfo] = useState("");

  const ratio = RATIOS.find((r) => r.id === ratioId)?.value ?? NaN;

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !src) return;
    let cancelled = false;
    const init = () => {
      if (cancelled) return;
      cropperRef.current?.destroy();
      cropperRef.current = new Cropper(img, {
        aspectRatio: Number.isNaN(ratio) ? NaN : ratio,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 0.9,
        background: false,
        responsive: true,
        toggleDragModeOnDblclick: false,
        crop: () => {
          const cr = cropperRef.current;
          if (!cr) return;
          const d = cr.getData();
          const next = `${Math.round(d.width)} × ${Math.round(d.height)} px`;
          setCropInfo((prev) => (prev === next ? prev : next));
        },
      });
    };
    if (img.complete && img.naturalWidth > 0) init();
    img.addEventListener("load", init, { once: true });
    return () => {
      cancelled = true;
      img.removeEventListener("load", init);
      cropperRef.current?.destroy();
      cropperRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (cropperRef.current) cropperRef.current.setAspectRatio(Number.isNaN(ratio) ? NaN : ratio);
  }, [ratio]);

  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); urls.current = []; }, []);

  function pick(file: File | null) {
    setOut([]); setErr(""); setCropInfo("");
    if (!file) { setSrc(""); setName(""); return; }
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setName(file.name);
    setSrc(url);
  }

  function onW(v: string) {
    setW(v);
    if (!lock) return;
    const d = cropperRef.current?.getData();
    const n = parseFloat(v);
    if (n > 0 && d && d.height > 0) setH(String(Math.round((n * d.height) / d.width)));
  }
  function onH(v: string) {
    setH(v);
    if (!lock) return;
    const d = cropperRef.current?.getData();
    const n = parseFloat(v);
    if (n > 0 && d && d.width > 0) setW(String(Math.round((n * d.width) / d.height)));
  }

  function reset() {
    cropperRef.current?.reset();
    setRatioId("free");
    setW(""); setH("");
  }

  async function run() {
    const cr = cropperRef.current;
    if (!cr) { setErr("Choose an image first."); return; }
    setErr(""); setBusy(true); setOut([]);
    try {
      const d = cr.getData();
      let tw = parseInt(w, 10) || 0;
      let th = parseInt(h, 10) || 0;
      if (!tw && !th) { tw = Math.round(d.width); th = Math.round(d.height); }
      else if (tw && !th) th = Math.round((tw * d.height) / d.width);
      else if (!tw && th) tw = Math.round((th * d.width) / d.height);
      if (tw < 1 || th < 1) throw new Error("Choose a size larger than zero.");

      const canvas = cr.getCroppedCanvas({
        width: tw,
        height: th,
        fillColor: fmt === "image/jpeg" ? "#fff" : undefined,
        imageSmoothingQuality: "high",
      });
      if (!canvas) throw new Error("The image is still loading. Try again in a moment.");

      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, fmt, fmt === "image/png" ? undefined : q / 100));
      if (!blob) throw new Error("This browser could not export that format. Try PNG, JPG or WebP.");

      urls.current.slice(1).forEach(URL.revokeObjectURL);
      urls.current = urls.current.slice(0, 1);
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setOut([{ name: `${base(name) || "image"}-${tw}x${th}.${EXT[fmt]}`, url, note: `${tw} × ${th} px, ${kb(blob.size)}` }]);
    } catch (e: any) {
      setErr(e?.message || "Could not resize this image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wb">
      <div className="wb-in">
        <label className="drop">
          <b>{name || "Choose an image"}</b>
          <span>{name ? "Click to pick a different image" : "JPG, PNG or WebP. One image at a time."}</span>
          <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0] || null)} />
        </label>

        {src && (
          <>
            <div className="crop-stage">
              <img ref={imgRef} src={src} alt="" />
            </div>
            <div className="crop-actions" role="group" aria-label="Crop shape">
              {RATIOS.map((r) => (
                <button key={r.id} type="button" className={`chip${ratioId === r.id ? " on" : ""}`} aria-pressed={ratioId === r.id} onClick={() => setRatioId(r.id)}>{r.label}</button>
              ))}
            </div>
            <div className="crop-actions" role="group" aria-label="Crop tools">
              <button type="button" className="btn" onClick={() => cropperRef.current?.rotate(-90)}>Rotate left</button>
              <button type="button" className="btn" onClick={() => cropperRef.current?.rotate(90)}>Rotate right</button>
              <button type="button" className="btn" onClick={() => cropperRef.current?.zoom(0.1)}>Zoom in</button>
              <button type="button" className="btn" onClick={() => cropperRef.current?.zoom(-0.1)}>Zoom out</button>
              <button type="button" className="btn" onClick={reset}>Reset</button>
            </div>
          </>
        )}

        <div className="opts">
          <label>Width (px)<input type="number" min="1" value={w} onChange={(e) => onW(e.target.value)} placeholder="auto" /></label>
          <label>Height (px)<input type="number" min="1" value={h} onChange={(e) => onH(e.target.value)} placeholder="auto" /></label>
          <label>Format
            <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPG</option>
              <option value="image/webp">WebP</option>
            </select>
          </label>
          {fmt !== "image/png" && <label>Quality: {q}<input type="range" min="10" max="100" value={q} onChange={(e) => setQ(+e.target.value)} /></label>}
          <label className="check"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />Keep aspect ratio<small>When on, typing one side fills the other to match the crop.</small></label>
          <p className="hint">Drag the photo to frame it, or drag the box handles. Leave width and height empty to keep the cropped pixels; fill one or both for an exact size.</p>
        </div>

        <button className="btn primary" disabled={!src || busy} onClick={run}>{busy ? "Resizing" : "Resize image"}</button>
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
          <p className="empty">{busy ? "Resizing" : src ? (cropInfo ? `Cropped area: ${cropInfo}. Your result will appear here.` : "Ready. Your result will appear here.") : "Choose an image to begin."}</p>
        )}
      </section>
    </div>
  );
}