import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitIn | Whole-flat layout",
  description: "A browser-only bilingual whole-flat furniture editor with rotated-footprint checks. Simplified demo assumptions for HacKU 2026.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}