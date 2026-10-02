import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitIn | Sofa replacement",
  description: "A simplified, bilingual furniture replacement checker for one preset room. HacKU 2026 first development version.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}