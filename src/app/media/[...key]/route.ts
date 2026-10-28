import { readStoredObject } from "@/server/storage";

/** Serves uploaded images (local disk in development, or a private S3 bucket). */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const data = await readStoredObject(key.join("/"));
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
