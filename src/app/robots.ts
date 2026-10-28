import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const STAGING_HOST = /\.(up\.railway\.app|railway\.app|vercel\.app)$/i;

export default function robots(): MetadataRoute.Robots {
  // Temporary platform domain: keep the whole site out of search until the real domain is live.
  if (STAGING_HOST.test(new URL(SITE_URL).hostname)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/checkout", "/account", "/orders/", "/track", "/shop?q=", "/*?*q="],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
