"use client";
import { useLinkStatus } from "next/link";
import { LoaderArt } from "@/components/Loader";

/* Put inside a <Link>. While that link's page is loading, the current page stays on
   screen and shows a loading indicator right where the user clicked. */
export function LinkPending({ variant = "bar" }: { variant?: "card" | "inline" | "bar" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span className="topbar" aria-hidden="true" />
      {variant === "card" && (
        <span className="pend-card" role="status" aria-label="Opening tool">
          <LoaderArt />
          <span>Opening…</span>
        </span>
      )}
      {variant === "inline" && <span className="pend-spin" role="status" aria-label="Loading" />}
    </>
  );
}
