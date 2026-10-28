import { connection } from "next/server";

/**
 * Marks the current render as request-time (so the build never touches the
 * database). Outside a Next.js request (worker, scripts) it is a no-op.
 */
export async function requestTime() {
  try {
    await connection();
  } catch {
    /* not inside a Next.js request */
  }
}
