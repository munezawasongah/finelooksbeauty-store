import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_SLUGS } from "@/lib/urls";
import { resolveCategory, resolveProduct } from "@/server/routing";

const isProd = process.env.NODE_ENV === "production";
const STAFF_COOKIE = isProd ? "__Host-fl_staff" : "fl_staff";
const PUBLIC_ADMIN = ["/admin/login", "/admin/setup", "/admin/invite", "/admin/mfa", "/admin/recovery-codes"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Temporary platform hostnames (staging/preview) are never indexed; the real domain is. */
const STAGING_HOST = /\.(up\.railway\.app|railway\.app|vercel\.app)$/i;

/**
 * Runs before routes render:
 *  - Server Action POSTs must carry an Origin header (CSRF hardening; Next.js
 *    itself checks that the Origin matches the host when present).
 *  - Admin pages without a staff session cookie go straight to sign-in. Every
 *    admin page and action still verifies the session and role server-side.
 *  - Catalog URLs are resolved first so unknown pages return a real 404 and
 *    renamed or moved products/categories return a permanent redirect.
 */
export async function proxy(req: NextRequest) {
  const res = await route(req);
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.hostname).split(":")[0];
  if (STAGING_HOST.test(host)) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

async function route(req: NextRequest): Promise<NextResponse> {
  if (req.method === "POST" && req.headers.has("next-action")) {
    const origin = req.headers.get("origin");
    if (!origin) return new NextResponse("Missing Origin", { status: 403 });
  }

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/admin")) {
    if (!PUBLIC_ADMIN.some((p) => pathname.startsWith(p)) && !req.cookies.get(STAFF_COOKIE)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if ((req.method === "GET" || req.method === "HEAD") && !req.headers.has("next-action") && !req.headers.has("x-fl-not-found")) {
    const parts = pathname.split("/").filter(Boolean);
    const first = parts[0];
    try {
      if (parts.length === 1 && !RESERVED_SLUGS.has(first)) {
        if (!SLUG.test(first)) return notFound(req);
        const r = await resolveCategory(first);
        if (r.kind === "redirect") return redirect(req, r.to);
        if (r.kind === "notfound") return notFound(req);
      } else if (parts.length === 2 && (first === "shop" || !RESERVED_SLUGS.has(first))) {
        if (!SLUG.test(parts[1]) || (first !== "shop" && !SLUG.test(first))) return notFound(req);
        const r = await resolveProduct(first === "shop" ? null : first, parts[1]);
        if (r.kind === "redirect") return redirect(req, r.to);
        if (r.kind === "notfound") return notFound(req);
      } else if (parts.length > 2 && !RESERVED_SLUGS.has(first)) {
        return notFound(req);
      }
    } catch (err) {
      // Never take the storefront down because of a lookup failure; the page itself handles it.
      console.error("[proxy] route resolution failed", err);
    }
  }
  return NextResponse.next();
}

function redirect(req: NextRequest, to: string) {
  const url = req.nextUrl.clone();
  url.pathname = to;
  return NextResponse.redirect(url, 308);
}

/**
 * Serve the store's "not found" page with a real 404 status. Streaming pages send
 * their status with the first byte, so the page is rendered internally first.
 */
async function notFound(req: NextRequest) {
  try {
    const port = process.env.PORT || "3000";
    const res = await fetch(`http://127.0.0.1:${port}/__not-found`, {
      headers: { "x-fl-not-found": "1", "user-agent": req.headers.get("user-agent") ?? "" },
      signal: AbortSignal.timeout(5000),
    });
    return new NextResponse(res.body, {
      status: 404,
      headers: { "content-type": res.headers.get("content-type") ?? "text/html; charset=utf-8", "x-robots-tag": "noindex" },
    });
  } catch {
    return new NextResponse("Page not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|brand/|media/|api/|icon.png|apple-icon.png|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
};
