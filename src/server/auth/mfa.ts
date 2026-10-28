import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";

const ISSUER = "Fine Looks Admin";

export function newMfaSecret() {
  return generateSecret();
}

export async function mfaQrDataUrl(email: string, secret: string) {
  const uri = generateURI({ issuer: ISSUER, label: email, secret });
  return QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#2a1d5c", light: "#ffffff" } });
}

/** Verify a TOTP code and reject replays of the same or earlier time step. */
export async function verifyTotp(secret: string, code: string, lastStep: number | null) {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false as const };
  const res = await verify({
    secret,
    token,
    epochTolerance: 30,
    ...(lastStep != null ? { afterTimeStep: lastStep } : {}),
  });
  if (!res.valid) return { ok: false as const };
  return { ok: true as const, step: (res as { timeStep?: number }).timeStep ?? Math.floor(Date.now() / 30000) };
}

export async function verifyUserTotp(user: typeof users.$inferSelect, code: string) {
  if (!user.mfaSecretEnc) return false;
  const res = await verifyTotp(decrypt(user.mfaSecretEnc), code, user.mfaLastStep);
  if (res.ok) {
    await db().update(users).set({ mfaLastStep: res.step }).where(eq(users.id, user.id));
    return true;
  }
  // Single-use recovery code fallback.
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const h = sha256(normalized);
  if (normalized.length >= 10 && user.mfaRecoveryHashes.includes(h)) {
    await db()
      .update(users)
      .set({ mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) })
      .where(eq(users.id, user.id));
    return true;
  }
  return false;
}

export function generateRecoveryCodes(count = 8) {
  const codes = Array.from({ length: count }, () => {
    const raw = randomToken(8).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10).padEnd(10, "X");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c.replace(/-/g, ""))) };
}

export const encryptSecret = encrypt;

/** Store a pending (not yet confirmed) TOTP secret for a user who hasn't enrolled. Server-only. */
export async function ensurePendingMfaSecret(userId: string, newSecret: string) {
  await db()
    .update(users)
    .set({ mfaSecretEnc: encrypt(newSecret) })
    .where(and(eq(users.id, userId), isNull(users.mfaSecretEnc), eq(users.mfaEnabled, false)));
}
