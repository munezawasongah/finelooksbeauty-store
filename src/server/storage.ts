/**
 * Product image storage (section 12.1 "Unsafe file uploads"):
 * allow-listed types, size limit, re-encoded server-side with sharp (strips
 * metadata and any embedded payload), random file names, never executable.
 * Uses S3-compatible storage when configured (required in production), or a
 * local folder for development.
 */
import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp, { type Sharp, type Metadata } from "sharp";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomToken } from "./crypto";
import { env, isS3Configured } from "./env";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export const LOCAL_DIR = path.join(process.cwd(), "storage", "uploads");

let s3: S3Client | null = null;
function client() {
  if (!s3) {
    const e = env();
    s3 = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(e.S3_ENDPOINT),
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    });
  }
  return s3;
}

export class UploadError extends Error {}

export async function storeImage(file: File, folder = "products") {
  if (!(file instanceof File) || file.size === 0) throw new UploadError("Choose an image to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("Images must be 10 MB or smaller.");
  if (!ALLOWED.has(file.type)) throw new UploadError("Use a JPG, PNG, WebP or AVIF image.");
  if (process.env.NODE_ENV === "production" && !isS3Configured()) {
    throw new UploadError("Image storage isn't configured yet (S3 settings). Ask the site administrator.");
  }

  const input = Buffer.from(await file.arrayBuffer());
  let img: Sharp;
  let meta: Metadata;
  try {
    img = sharp(input, { failOn: "error", limitInputPixels: 50_000_000 });
    meta = await img.metadata();
  } catch {
    throw new UploadError("That file isn't a valid image.");
  }
  if (!meta.format || !["jpeg", "png", "webp", "avif"].includes(meta.format)) {
    throw new UploadError("Use a JPG, PNG, WebP or AVIF image.");
  }
  const { data, info } = await img
    .rotate()
    .resize({ width: 2000, height: 2500, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });

  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.webp`;
  if (isS3Configured()) {
    await client().send(
      new PutObjectCommand({
        Bucket: env().S3_BUCKET!,
        Key: key,
        Body: data,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    const base = (env().S3_PUBLIC_URL || "").replace(/\/$/, "");
    return { url: base ? `${base}/${key}` : `/media/${key}`, key, width: info.width, height: info.height };
  }
  const dest = path.join(LOCAL_DIR, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, data);
  return { url: `/media/${key}`, key, width: info.width, height: info.height };
}

export async function deleteStoredImage(url: string) {
  const key = keyFromUrl(url);
  if (!key) return;
  try {
    if (isS3Configured()) await client().send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET!, Key: key }));
    else await unlink(path.join(LOCAL_DIR, key));
  } catch {
    /* already gone */
  }
}

function keyFromUrl(url: string) {
  if (url.startsWith("/media/")) return url.slice("/media/".length);
  const base = (env().S3_PUBLIC_URL || "").replace(/\/$/, "");
  if (base && url.startsWith(base + "/")) return url.slice(base.length + 1);
  return null;
}

/** For /media/* when images are proxied from a private bucket. */
export async function readStoredObject(key: string): Promise<Uint8Array | null> {
  if (!/^[a-z0-9/_-]+\.webp$/i.test(key) || key.includes("..")) return null;
  if (isS3Configured()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const r = await client().send(new GetObjectCommand({ Bucket: env().S3_BUCKET!, Key: key }));
      return r.Body ? await r.Body.transformToByteArray() : null;
    } catch {
      return null;
    }
  }
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path.join(LOCAL_DIR, key));
  } catch {
    return null;
  }
}
