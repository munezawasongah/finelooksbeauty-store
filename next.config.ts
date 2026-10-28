import type { NextConfig } from "next";

const s3Public = process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL) : null;

/**
 * Content-Security-Policy (section 12.1). Card details are entered only on
 * Stripe-hosted Checkout (form-action allows it); the store map is a Google
 * Maps embed. Inline scripts are required by the Next.js runtime.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${s3Public ? ` ${s3Public.origin}` : ""} https://*.stripe.com`,
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.google.com https://maps.google.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://checkout.stripe.com\")" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      // Product photo uploads (validated again in the action: 24 MB per request).
      bodySizeLimit: "25mb",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: s3Public ? [{ protocol: s3Public.protocol.replace(":", "") as "https", hostname: s3Public.hostname }] : [],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
