const P: Record<string, React.ReactNode> = {
  "passport-photo": <><rect x="4" y="5" width="11" height="14" /><rect x="17" y="5" width="11" height="14" /><rect x="4" y="21" width="11" height="7" /><rect x="17" y="21" width="11" height="7" /></>,
  "image-resize": <><rect x="4" y="12" width="16" height="16" /><path d="M20 4h8v8M28 4 16 16" /></>,
  "image-compress": <><path d="M12 5l4 4 4-4M12 27l4-4 4 4M5 16h22" /></>,
  "pdf-to-image": <><path d="M8 4h11l5 5v19H8zM19 4v5h5M11 24l4-5 3 3 2-2 3 4" /></>,
  "image-to-pdf": <><rect x="4" y="8" width="14" height="16" /><path d="M7 21l4-5 3 3M21 12h7v16H11v-4" /></>,
  "pdf-grayscale": <><circle cx="16" cy="16" r="11" /><path d="M16 5a11 11 0 0 1 0 22z" fill="currentColor" /></>,
};
export function Icon({ slug }: { slug: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {P[slug]}
    </svg>
  );
}
