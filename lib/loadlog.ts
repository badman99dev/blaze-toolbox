// A tiny global log of "downloading a package" tasks. Any lib/wasm fetch can
// report progress here and the <LoadIndicator> toast (mounted site-wide) shows
// it live, so the user can see we are pulling a published package from the web
// and not running injected code. Framework-agnostic: no React import here.
export type LoadTask = { id: number; label: string; loaded: number; total: number };

let tasks: LoadTask[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getTasks() {
  return tasks;
}

export function startTask(label: string) {
  const id = seq++;
  tasks = [...tasks, { id, label, loaded: 0, total: 0 }];
  emit();
  return id;
}
export function updateTask(id: number, loaded: number, total?: number) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, loaded, total: total ?? t.total } : t));
  emit();
}
export function endTask(id: number) {
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}

// Show an indeterminate task while a promise (usually a dynamic import of a
// library chunk) resolves. Cached imports resolve instantly, so with the CSS
// fade-in nothing flashes for them.
export async function withLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const id = startTask(label);
  try {
    return await fn();
  } finally {
    endTask(id);
  }
}

const libCache = new Map<string, Promise<unknown>>();
// Import a library once, reporting it the first time it actually loads.
export function loadLib<T>(key: string, label: string, importer: () => Promise<T>): Promise<T> {
  let p = libCache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = withLoad(label, importer);
    libCache.set(key, p as Promise<unknown>);
    p.catch(() => libCache.delete(key));
  }
  return p;
}

// Fetch one URL, streaming byte progress into the indicator.
export async function fetchProgress(url: string, label: string): Promise<Uint8Array> {
  const id = startTask(label);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${label} (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body) {
      const buf = new Uint8Array(await res.arrayBuffer());
      updateTask(id, buf.length, total || buf.length);
      return buf;
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      updateTask(id, loaded, total);
    }
    const out = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    updateTask(id, loaded, total || loaded);
    return out;
  } finally {
    endTask(id);
  }
}

// Fetch several URLs under one combined progress bar (used for ffmpeg's core
// script + wasm).
export async function downloadParts(label: string, urls: string[]): Promise<Uint8Array[]> {
  const id = startTask(label);
  try {
    const outs: Uint8Array[] = [];
    let done = 0, grand = 0;
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not download ${label} (${res.status}).`);
      grand += Number(res.headers.get("content-length")) || 0;
      if (!res.body) {
        const b = new Uint8Array(await res.arrayBuffer());
        outs.push(b); done += b.length; updateTask(id, done, grand);
        continue;
      }
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done: d, value } = await reader.read();
        if (d) break;
        parts.push(value);
        got += value.length;
        updateTask(id, done + got, grand);
      }
      const buf = new Uint8Array(got);
      let o = 0;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      outs.push(buf); done += got; updateTask(id, done, grand);
    }
    return outs;
  } finally {
    endTask(id);
  }
}
