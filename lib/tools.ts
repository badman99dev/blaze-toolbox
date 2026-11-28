export type Category = "everyday" | "edit" | "dev";
export type Mode = "local" | "cloud" | "hybrid";
export type MediaTag = "image" | "pdf" | "video" | "text";
export type Tool = { slug: string; name: string; blurb: string; meta: string; cat: Category; mode: Mode; tags: MediaTag[] };

export const TAGS: { id: MediaTag; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "pdf", label: "PDF" },
  { id: "video", label: "Video" },
  { id: "text", label: "Text" },
];

export const MODES: Record<Mode, { label: string; title: string }> = {
  local: { label: "100% Local", title: "Runs entirely on your device. Your file is never uploaded." },
  hybrid: { label: "Local + Cloud", title: "Processed on your device, with a helper engine loaded from the web." },
  cloud: { label: "Cloud", title: "The file is uploaded to a server for processing." },
};

export const CATEGORIES: { id: Category; title: string; desc: string }[] = [
  {
    id: "everyday",
    title: "Everyday tools",
    desc: "The quick jobs most people need: PDFs, photos and print-ready sheets.",
  },
  {
    id: "edit",
    title: "Photo and image editing",
    desc: "Change how a photo looks or what it saves as: convert, crop, watermark, black and white.",
  },
  {
    id: "dev",
    title: "Developer and technical",
    desc: "Formats and assets for websites, apps and code.",
  },
];

export const TOOLS: Tool[] = [
  { slug: "passport-photo", cat: "everyday", mode: "local", tags: ["image", "pdf"], name: "Passport photo sheet", blurb: "Crop once, then fill an A4 page with tightly spaced copies. Download a print-ready PDF.", meta: "A4 sheet, 35 × 45 mm and more" },
  { slug: "image-compress", cat: "everyday", mode: "local", tags: ["image"], name: "Image compress", blurb: "Shrink file size and compare before and after.", meta: "Quality slider" },
  { slug: "image-target-size", cat: "everyday", mode: "local", tags: ["image"], name: "Compress to a target size", blurb: "Shrink a photo until it fits an exact size — like under 200 KB — automatically.", meta: "Target in KB or MB" },
  { slug: "image-resize", cat: "everyday", mode: "local", tags: ["image"], name: "Image resize", blurb: "Crop the photo by hand, then resize to exact pixels — or leave the size empty to keep the crop.", meta: "Crop + exact pixels" },
  { slug: "heic-to-jpg", cat: "everyday", mode: "local", tags: ["image"], name: "HEIC to JPG", blurb: "Turn iPhone HEIC photos into JPG, PNG or WebP files that open everywhere.", meta: "HEIC, HEIF" },
  { slug: "image-to-pdf", cat: "everyday", mode: "local", tags: ["image", "pdf"], name: "Image to PDF, scanned look", blurb: "Combine photos into one PDF with the flat, high-contrast look of a scanner.", meta: "Many images, one file" },
  { slug: "pdf-to-image", cat: "everyday", mode: "local", tags: ["pdf", "image"], name: "PDF to image", blurb: "Turn each page into a sharp PNG or JPG.", meta: "PNG, JPG" },
  { slug: "pdf-merge", cat: "everyday", mode: "local", tags: ["pdf"], name: "Merge PDFs", blurb: "Join several PDFs into one file, in the order you choose.", meta: "Many files, one PDF" },
  { slug: "pdf-split", cat: "everyday", mode: "local", tags: ["pdf"], name: "Split PDF", blurb: "Pull out a page range or break a PDF into single pages.", meta: "By page range" },
  { slug: "pdf-rotate", cat: "everyday", mode: "local", tags: ["pdf"], name: "Rotate PDF", blurb: "Turn pages 90, 180 or 270 degrees and save a fixed copy.", meta: "90 / 180 / 270" },
  { slug: "pdf-unlock", cat: "everyday", mode: "local", tags: ["pdf"], name: "Unlock PDF", blurb: "Remove a password or the printing and copying restrictions from a PDF you own.", meta: "Password or restrictions" },
  { slug: "pdf-lock", cat: "everyday", mode: "local", tags: ["pdf"], name: "Lock PDF", blurb: "Add a password so a PDF can only be opened by the people you share it with.", meta: "Password + permissions" },
  { slug: "pdf-page-numbers", cat: "everyday", mode: "local", tags: ["pdf"], name: "Add page numbers", blurb: "Stamp numbers like Page 1 of 10 on any PDF — pick position, style and where counting starts.", meta: "Pattern + position" },

  { slug: "image-convert", cat: "edit", mode: "local", tags: ["image"], name: "Image converter", blurb: "Convert between PNG, JPG, WebP and AVIF while keeping the quality you want.", meta: "PNG, JPG, WebP, AVIF" },
  { slug: "circle-crop", cat: "edit", mode: "local", tags: ["image"], name: "Circle crop", blurb: "Crop a photo into a round avatar with a transparent background.", meta: "Transparent PNG" },
  { slug: "watermark", cat: "edit", mode: "local", tags: ["image"], name: "Add a watermark", blurb: "Stamp text over your photos to mark them as yours.", meta: "Text watermark" },
  { slug: "pdf-grayscale", cat: "edit", mode: "local", tags: ["pdf"], name: "Color PDF to grayscale", blurb: "Turn a color PDF gray without flattening it — the text stays selectable, so you can still search and copy.", meta: "Keeps text selectable" },

  { slug: "svg-to-png", cat: "dev", mode: "local", tags: ["image"], name: "SVG to PNG", blurb: "Rasterize an SVG to a crisp PNG at the exact pixel size you need.", meta: "Any size" },
  { slug: "favicon-generator", cat: "dev", mode: "local", tags: ["image"], name: "Favicon and app icons", blurb: "Make a full icon pack, PNG sizes plus .ico, from a single image.", meta: "ICO + PNG pack" },
  { slug: "image-to-base64", cat: "dev", mode: "local", tags: ["image", "text"], name: "Image to Base64", blurb: "Turn an image into a data URI ready for HTML, CSS or JSON.", meta: "Data URI" },
];