import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const COST = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

/** A constant-time dummy compare so unknown emails take as long as known ones. */
const DUMMY_HASH = "$2b$12$aZ4gPEs7yUEj/r.YsG/cE.h1KSSQyBLq0DadMMEkm9UmINPejdn1i";
export async function burnPasswordCheck(password: string) {
  await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
}

export type PasswordProblem = string | null;

/** Policy: 12+ characters, not a known-breached password (HIBP k-anonymity range API). */
export async function checkPasswordPolicy(password: string, context: string[] = []): Promise<PasswordProblem> {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 128) return "Use 128 characters or fewer.";
  const lower = password.toLowerCase();
  for (const c of context) {
    const part = c.toLowerCase().split("@")[0];
    if (part.length >= 4 && lower.includes(part)) return "Don't include your name or email in the password.";
  }
  if (await isBreached(password)) {
    return "This password has appeared in a data breach. Choose a different one.";
  }
  return null;
}

async function isBreached(password: string): Promise<boolean> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "FineLooks-Store" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [hash, count] = line.trim().split(":");
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    // Fail open: the service being unreachable must not block staff from setting passwords.
    return false;
  }
}
