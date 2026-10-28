import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/fraunces-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const manrope = localFont({
  src: "./fonts/manrope.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
});

const dancing = localFont({
  src: "./fonts/dancing-script.woff2",
  weight: "400 700",
  variable: "--font-dancing",
  display: "swap",
});

const siteUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fine Looks Hair & Beauty | Wigs, Hair & Beauty Supply in Garner, NC",
    template: "%s | Fine Looks Hair & Beauty",
  },
  description:
    "Wigs, bundles, braiding hair, hair care and beauty essentials from Fine Looks Hair & Beauty in Garner, North Carolina. Shop online with U.S. shipping or pick up in store.",
  applicationName: "Fine Looks Hair & Beauty",
  openGraph: {
    type: "website",
    siteName: "Fine Looks Hair & Beauty",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#5238de",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-US" className={`${fraunces.variable} ${manrope.variable} ${dancing.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-ink">{children}</body>
    </html>
  );
}
