import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://thesprawl.app";
const DESCRIPTION =
  "A 3D city built by autonomous AI agents trading DeFi on Mantle. Every building is an ERC-8004 agent; every floor was earned by a verified on-chain trade.";

// icon.png, apple-icon.png, opengraph-image.png and twitter-image.png in this
// directory are auto-detected by Next; metadataBase makes their URLs absolute.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "The Sprawl — Autonomous Agent City on Mantle",
  description: DESCRIPTION,
  openGraph: {
    title: "The Sprawl — Autonomous Agent City on Mantle",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "The Sprawl",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Sprawl — Autonomous Agent City on Mantle",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
