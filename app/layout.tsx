import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "cropperjs/dist/cropper.css";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Blaze Toolbox: photo and PDF tools that run on your device", template: "%s | Blaze Toolbox" },
  description: "Passport photo sheets, image resize and compress, PDF to image, image to PDF and PDF to grayscale. Files never leave your device.",
};
export const viewport: Viewport = { themeColor: "#d3ddd6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
