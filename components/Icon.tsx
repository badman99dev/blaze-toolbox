const P: Record<string, React.ReactNode> = {
  "passport-photo": <><rect x="4" y="5" width="11" height="14" /><rect x="17" y="5" width="11" height="14" /><rect x="4" y="21" width="11" height="7" /><rect x="17" y="21" width="11" height="7" /></>,
  "image-resize": <><rect x="4" y="12" width="16" height="16" /><path d="M20 4h8v8M28 4 16 16" /></>,
  "image-compress": <><path d="M12 5l4 4 4-4M12 27l4-4 4 4M5 16h22" /></>,
  "image-convert": <><rect x="4" y="8" width="13" height="16" rx="2" /><path d="M20 13h8M25 10l3 3-3 3M28 23h-8M23 20l-3 3 3 3" /></>,
  "heic-to-jpg": <><rect x="4" y="7" width="13" height="18" rx="2" /><path d="M14 13l3-4 3 4M17 9v9" /><path d="M21 23h7M25 20l3 3-3 3" /></>,
  "svg-to-png": <><rect x="4" y="5" width="13" height="13" rx="2" /><path d="M8 15l3-4 2 2.5 2-3 2 4.5" /><path d="M19 20l6 5 6-5M25 25v-9" transform="translate(-2 0)" /></>,
  "favicon-generator": <><rect x="5" y="5" width="22" height="22" rx="5" /><circle cx="16" cy="16" r="4" /><path d="M16 9v2M16 21v2M9 16h2M21 16h2" /></>,
  "circle-crop": <><circle cx="16" cy="16" r="11" /><path d="M9.5 9.5l13 13M22.5 9.5l-13 13" /></>,
  "watermark": <><rect x="4" y="8" width="24" height="18" rx="2" /><path d="M8 21l3-4 2 2 3-4 3 5" /><path d="M23 3l1.4 3.1L27.5 7.5l-3.1 1.4L23 12l-1.4-3.1L18.5 7.5l3.1-1.4z" /></>,
  "image-to-base64": <><rect x="4" y="8" width="12" height="16" rx="2" /><path d="M21 16h7M24 13l4 3-4 3" /></>,
  "pdf-to-image": <><path d="M8 4h11l5 5v19H8zM19 4v5h5M11 24l4-5 3 3 2-2 3 4" /></>,
  "image-to-pdf": <><rect x="4" y="8" width="14" height="16" /><path d="M7 21l4-5 3 3M21 12h7v16H11v-4" /></>,
  "pdf-grayscale": <><circle cx="16" cy="16" r="11" /><path d="M16 5a11 11 0 0 1 0 22z" fill="currentColor" /></>,
  "pdf-merge": <><rect x="4" y="6" width="11" height="20" rx="2" /><rect x="19" y="10" width="9" height="12" rx="2" /><path d="M15 16h4" /></>,
  "pdf-split": <><rect x="4" y="5" width="24" height="22" rx="2" /><path d="M16 5v22" strokeDasharray="2.5 2.5" /></>,
  "pdf-rotate": <><path d="M25 12a9 9 0 1 0-1.2 9" /><path d="M25 7v5h-5" /><rect x="11" y="11" width="10" height="12" rx="1.5" /></>,
  "pdf-unlock": <><rect x="9" y="14" width="14" height="12" rx="2" /><path d="M12 14v-3a4 4 0 0 1 7.5-2" /><circle cx="16" cy="20" r="1.6" /></>,
  "pdf-lock": <><rect x="9" y="14" width="14" height="12" rx="2" /><path d="M12 14v-3a4 4 0 0 1 8 0v3" /><circle cx="16" cy="20" r="1.6" /></>,
};
export function Icon({ slug }: { slug: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {P[slug]}
    </svg>
  );
}