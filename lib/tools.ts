export type Category = "everyday" | "edit" | "dev";
export type Tool = { slug: string; name: string; blurb: string; meta: string; cat: Category };

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
  { slug: "passport-photo", cat: "everyday", name: "Passport photo sheet", blurb: "Crop once, then fill an A4 page with tightly spaced copies. Download a print-ready PDF.", meta: "A4 sheet, 35 × 45 mm and more" },
  { slug: "image-compress", cat: "everyday", name: "Image compress", blurb: "Shrink file size and compare before and after.", meta: "Quality slider" },
  { slug: "image-resize", cat: "everyday", name: "Image resize", blurb: "Set exact pixels or a percentage, and keep the aspect ratio.", meta: "JPG, PNG, WebP" },
  { slug: "heic-to-jpg", cat: "everyday", name: "HEIC to JPG", blurb: "Turn iPhone HEIC photos into JPG, PNG or WebP files that open everywhere.", meta: "HEIC, HEIF" },
  { slug: "image-to-pdf", cat: "everyday", name: "Image to PDF, scanned look", blurb: "Combine photos into one PDF with the flat, high-contrast look of a scanner.", meta: "Many images, one file" },
  { slug: "pdf-to-image", cat: "everyday", name: "PDF to image", blurb: "Turn each page into a sharp PNG or JPG.", meta: "PNG, JPG" },
  { slug: "pdf-merge", cat: "everyday", name: "Merge PDFs", blurb: "Join several PDFs into one file, in the order you choose.", meta: "Many files, one PDF" },
  { slug: "pdf-split", cat: "everyday", name: "Split PDF", blurb: "Pull out a page range or break a PDF into single pages.", meta: "By page range" },
  { slug: "pdf-rotate", cat: "everyday", name: "Rotate PDF", blurb: "Turn pages 90, 180 or 270 degrees and save a fixed copy.", meta: "90 / 180 / 270" },
  { slug: "pdf-unlock", cat: "everyday", name: "Unlock PDF", blurb: "Remove a password or the printing and copying restrictions from a PDF you own.", meta: "Password or restrictions" },
  { slug: "pdf-lock", cat: "everyday", name: "Lock PDF", blurb: "Add a password so a PDF can only be opened by the people you share it with.", meta: "Password + permissions" },

  { slug: "image-convert", cat: "edit", name: "Image converter", blurb: "Convert between PNG, JPG, WebP and AVIF while keeping the quality you want.", meta: "PNG, JPG, WebP, AVIF" },
  { slug: "circle-crop", cat: "edit", name: "Circle crop", blurb: "Crop a photo into a round avatar with a transparent background.", meta: "Transparent PNG" },
  { slug: "watermark", cat: "edit", name: "Add a watermark", blurb: "Stamp text over your photos to mark them as yours.", meta: "Text watermark" },
  { slug: "pdf-grayscale", cat: "edit", name: "Color PDF to grayscale", blurb: "Make a black-and-white copy that is cheaper to print.", meta: "Keeps page size" },

  { slug: "svg-to-png", cat: "dev", name: "SVG to PNG", blurb: "Rasterize an SVG to a crisp PNG at the exact pixel size you need.", meta: "Any size" },
  { slug: "favicon-generator", cat: "dev", name: "Favicon and app icons", blurb: "Make a full icon pack, PNG sizes plus .ico, from a single image.", meta: "ICO + PNG pack" },
  { slug: "image-to-base64", cat: "dev", name: "Image to Base64", blurb: "Turn an image into a data URI ready for HTML, CSS or JSON.", meta: "Data URI" },
];