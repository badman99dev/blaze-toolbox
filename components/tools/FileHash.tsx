"use client";
import { useRef, useState } from "react";

type Hashes = { md5: string; sha1: string; sha256: string; sha512: string };
type Row = { name: string; size: number; hashes: Hashes };
const ALGOS: { key: keyof Hashes; label: string }[] = [
  { key: "sha256", label: "SHA-256" },
  { key: "sha1", label: "SHA-1" },
  { key: "md5", label: "MD5" },
  { key: "sha512", label: "SHA-512" },
];
const kb = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : n > 1024 ? Math.round(n / 1024) + " KB" : n + " B");
const toHex = (b: Uint8Array) => { let s = ""; for (const x of b) s += x.toString(16).padStart(2, "0"); return s; };

// SHA-1 / SHA-256 / SHA-512 come straight from the browser (crypto.subtle), so
// there is no library to download. MD5 is not part of the Web Crypto API, so it
// is computed here — a small, self-contained implementation with no dependency.
async function sha(alg: "SHA-1" | "SHA-256" | "SHA-512", buf: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot hash files. Open the site over https:// (or localhost) and try again.");
  return toHex(new Uint8Array(await subtle.digest(alg, buf)));
}
function md5(bytes: Uint8Array): string {
  const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const len = bytes.length;
  const bitLen = len * 8;
  const total = ((len + 8) >> 6 << 6) + 64;
  const buf = new Uint8Array(total);
  buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, bitLen >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bitLen / 4294967296), true);
  const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true); odv.setUint32(4, b0, true); odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
  return toHex(out);
}
async function hashFile(file: File, step: (s: number) => void): Promise<Hashes> {
  const buf = await file.arrayBuffer();
  const sha256 = await sha("SHA-256", buf); step(1);
  const sha1 = await sha("SHA-1", buf); step(2);
  const sha512 = await sha("SHA-512", buf); step(3);
  const md5h = md5(new Uint8Array(buf)); step(4);
  return { md5: md5h, sha1, sha256, sha512 };
}

export function FileHash() {
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setRows([]); setErr("");
  };
  const removeAt = (i: number) => { setFiles((prev) => prev.filter((_, j) => j !== i)); setRows([]); };

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
    }
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(""), 1400);
  };

  async function run() {
    setErr(""); setRows([]); setBusy(true);
    try {
      const out: Row[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const hashes = await hashFile(f, (s) => setStatus(`Hashing ${f.name} (${i + 1}/${files.length}) — ${Math.round((s / 4) * 100)}%`));
        out.push({ name: f.name, size: f.size, hashes });
        setRows([...out]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not hash this file.");
    } finally {
      setBusy(false); setStatus("");
    }
  }

  const many = rows.length > 1;
  const ref = rows[0];
  const allSame = many && rows.every((r) => r.hashes.sha256 === ref.hashes.sha256);

  return (
    <div className="wb">
      <div className="wb-in">
        <label className="drop">
          <b>{files.length ? <>{files.length} file{files.length === 1 ? "" : "s"} ready</> : "Choose one or more files"}</b>
          <span>Any file type. Pick one to just see its hashes, or two or more to compare them.</span>
          <input type="file" multiple onChange={(e) => { if (e.target.files) addFiles([...e.target.files]); e.target.value = ""; }} />
        </label>
        {files.length > 0 && (
          <ul className="picks">
            {files.map((f, i) => (
              <li key={`${f.name}|${i}`}>
                <span className="nm" title={f.name}>{f.name} <span className="fsz">{kb(f.size)}</span></span>
                <button type="button" className="rm" onClick={() => removeAt(i)} aria-label={`Remove ${f.name}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn primary" disabled={!files.length || busy} onClick={run}>{busy ? status || "Hashing" : "Show hashes"}</button>
        {err && <p className="err" role="alert">{err}</p>}
        <p className="hint">The hashes are worked out on your device from the file's own bytes — nothing is uploaded, and nothing is downloaded. Two files are the same only when they produce the same hash. SHA-256 is the one to trust for checking a download.</p>
      </div>

      <section className="wb-out" aria-label="Result" aria-live="polite">
        {rows.length ? (
          <div className="hash">
            {many && (
              <div className={`verdict${allSame ? " ok" : " no"}`}>
                {allSame
                  ? <>All {rows.length} files are exactly the same — identical SHA-256.</>
                  : <>{rows.length} files compared: they are <b>not all the same</b>. The ones marked <i>same</i> below match the first file.</>}
              </div>
            )}
            <ul className="hash-list">
              {rows.map((r, i) => (
                <li key={`${r.name}|${i}`}>
                  <div className="hash-file">
                    <b>{r.name}</b>
                    <span className="fsz">{kb(r.size)}</span>
                    {many && (
                      i === 0
                        ? <span className="hash-tag">reference</span>
                        : <span className={`hash-tag ${r.hashes.sha256 === ref.hashes.sha256 ? "same" : "diff"}`}>{r.hashes.sha256 === ref.hashes.sha256 ? "same" : "different"}</span>
                    )}
                  </div>
                  {ALGOS.map((a) => {
                    const key = `${i}:${a.key}`;
                    return (
                      <div className="hash-row" key={a.key}>
                        <span className="hash-algo">{a.label}</span>
                        <code className="hash-val">{r.hashes[a.key]}</code>
                        <button type="button" className={`hash-copy${copied === key ? " done" : ""}`} onClick={() => copy(r.hashes[a.key], key)}>{copied === key ? "Copied" : "Copy"}</button>
                      </div>
                    );
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="empty">{busy ? status || "Hashing" : files.length ? "Ready. The hashes will appear here." : "Choose a file to begin."}</p>
        )}
      </section>
    </div>
  );
}
