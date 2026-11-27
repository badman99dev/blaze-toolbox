export type Tool = { slug: string; name: string; blurb: string; meta: string };

export const TOOLS: Tool[] = [
  { slug: "passport-photo", name: "Passport photo sheet", blurb: "Crop once, then fill an A4 page with tightly spaced copies. Download a print-ready PDF.", meta: "A4 sheet, 35 × 45 mm and more" },
  { slug: "image-resize", name: "Image resize", blurb: "Set exact pixels or a percentage, and keep the aspect ratio.", meta: "JPG, PNG, WebP" },
  { slug: "image-compress", name: "Image compress", blurb: "Shrink file size and compare before and after.", meta: "Quality slider" },
  { slug: "image-convert", name: "Image converter", blurb: "Convert between PNG, JPG, WebP and AVIF while keeping the quality you want.", meta: "PNG, JPG, WebP, AVIF" },
  { slug: "heic-to-jpg", name: "HEIC to JPG", blurb: "Turn iPhone HEIC photos into JPG, PNG or WebP files that open everywhere.", meta: "HEIC, HEIF" },
  { slug: "svg-to-png", name: "SVG to PNG", blurb: "Rasterize an SVG to a crisp PNG at the exact pixel size you need.", meta: "Any size" },
  { slug: "favicon-generator", name: "Favicon and app icons", blurb: "Make a full icon pack, PNG sizes plus .ico, from a single image.", meta: "ICO + PNG pack" },
  { slug: "circle-crop", name: "Circle crop", blurb: "Crop a photo into a round avatar with a transparent background.", meta: "Transparent PNG" },
  { slug: "watermark", name: "Add a watermark", blurb: "Stamp text over your photos to mark them as yours.", meta: "Text watermark" },
  { slug: "image-to-base64", name: "Image to Base64", blurb: "Turn an image into a data URI ready for HTML, CSS or JSON.", meta: "Data URI" },
  { slug: "pdf-to-image", name: "PDF to image", blurb: "Turn each page into a sharp PNG or JPG.", meta: "PNG, JPG" },
  { slug: "image-to-pdf", name: "Image to PDF, scanned look", blurb: "Combine photos into one PDF with the flat, high-contrast look of a scanner.", meta: "Many images, one file" },
  { slug: "pdf-grayscale", name: "Color PDF to grayscale", blurb: "Make a black-and-white copy that is cheaper to print.", meta: "Keeps page size" },
  { slug: "pdf-merge", name: "Merge PDFs", blurb: "Join several PDFs into one file, in the order you choose.", meta: "Many files, one PDF" },
  { slug: "pdf-split", name: "Split PDF", blurb: "Pull out a page range or break a PDF into single pages.", meta: "By page range" },
  { slug: "pdf-rotate", name: "Rotate PDF", blurb: "Turn pages 90, 180 or 270 degrees and save a fixed copy.", meta: "90 / 180 / 270" },
];