export type Tool = { slug: string; name: string; blurb: string; meta: string };

export const TOOLS: Tool[] = [
  { slug: "passport-photo", name: "Passport photo sheet", blurb: "Crop once, then fill an A4 page with tightly spaced copies. Download a print-ready PDF.", meta: "A4 sheet, 35 × 45 mm and more" },
  { slug: "image-resize", name: "Image resize", blurb: "Set exact pixels or a percentage, and keep the aspect ratio.", meta: "JPG, PNG, WebP" },
  { slug: "image-compress", name: "Image compress", blurb: "Shrink file size and compare before and after.", meta: "Quality slider" },
  { slug: "pdf-to-image", name: "PDF to image", blurb: "Turn each page into a sharp PNG or JPG.", meta: "PNG, JPG" },
  { slug: "image-to-pdf", name: "Image to PDF, scanned look", blurb: "Combine photos into one PDF with the flat, high-contrast look of a scanner.", meta: "Many images, one file" },
  { slug: "pdf-grayscale", name: "Color PDF to grayscale", blurb: "Make a black-and-white copy that is cheaper to print.", meta: "Keeps page size" },
];
