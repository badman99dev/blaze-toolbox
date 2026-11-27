"use client";
import { useEffect } from "react";

/* After a new deploy, a tab that is still open points at old hashed JS chunks.
   Loading one of those fails (404) and client-side navigation can hang on the
   loading overlay. When we see a chunk-load failure, reload once to pick up the
   new build. The sessionStorage guard stops a reload loop if something else is
   broken. */
const KEY = "bt:chunk-reload";

function isChunkError(text: string) {
  return /ChunkLoadError|Loading (CSS )?chunk[^]*failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(text);
}

function msgOf(v: unknown) {
  if (!v) return "";
  if (typeof v === "string") return v;
  const o = v as { name?: string; message?: string };
  return `${o.name || ""} ${o.message || ""}`;
}

export function ChunkGuard() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < 20000) return;
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch { /* ignore */ }
      window.location.reload();
    };
    const onErr = (e: ErrorEvent) => {
      if (isChunkError(`${msgOf(e.error)} ${e.message || ""}`)) reloadOnce();
    };
    const onRej = (e: PromiseRejectionEvent) => {
      if (isChunkError(msgOf(e.reason))) reloadOnce();
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  return null;
}