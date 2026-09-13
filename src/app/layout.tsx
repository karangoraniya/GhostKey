import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostKey",
  description: "Give agents authority, not secrets.",
  icons: {
    icon: [
      { url: "/favicon-ghost2.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-ghost4.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [{ url: "/apple-touch-ghost2.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
