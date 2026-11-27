"use client";
import { useEffect, useRef, useState } from "react";
import { useLinkStatus } from "next/link";
import { LoaderArt } from "@/components/Loader";

/* Put inside a <Link>. While that link's page is loading, the current page stays on
   screen and shows a loading indicator right where the user clicked.

   If the navigation never settles (stale chunk after a deploy, flaky network), we
   don't spin forever: the overlay offers a Reload button and, a few seconds later,
   reloads on its own to load the current build. */
const KEY = "bt:nav-reload";

function safeReload() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 20000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* ignore */ }
  window.location.reload();
}

export function LinkPending({ variant = "bar" }: { variant?: "card" | "inline" | "bar" }) {
  const { pending } = useLinkStatus();
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!pending) { setSlow(false); return; }
    slowTimer.current = window.setTimeout(() => setSlow(true), 8000);
    return () => { if (slowTimer.current) window.clearTimeout(slowTimer.current); };
  }, [pending]);

  useEffect(() => {
    if (!slow) return;
    const t = window.setTimeout(safeReload, 12000);
    return () => window.clearTimeout(t);
  }, [slow]);

  if (!pending) return null;

  const reloadBtn = (
    <button
      type="button"
      className="pend-reload"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); safeReload(); }}
    >
      Taking too long. Reload
    </button>
  );

  return (
    <>
      <span className="topbar" aria-hidden="true" />
      {variant === "card" && (
        <span className="pend-card" role="status" aria-label="Opening tool">
          <LoaderArt />
          {slow ? reloadBtn : <span>Opening...</span>}
        </span>
      )}
      {variant === "inline" && <span className="pend-spin" role="status" aria-label="Loading" />}
    </>
  );
}