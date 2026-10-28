/**
 * Clover REST adapter (section 8). Isolates Clover API, region and token details
 * from the domain model. North America endpoints; sandbox or production by env.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { cloverConnections } from "../db/schema";
import { decrypt, encrypt } from "../crypto";
import { env } from "../env";

export function cloverUrls() {
  const prod = env().CLOVER_ENVIRONMENT === "production";
  // Test-only: point the adapter at a local mock Clover server (never set in production).
  const override = process.env.NODE_ENV !== "production" ? process.env.CLOVER_API_BASE_OVERRIDE : undefined;
  if (override) return { authorize: `${override}/oauth/v2/authorize`, api: override };
  return {
    authorize: prod ? "https://www.clover.com/oauth/v2/authorize" : "https://sandbox.dev.clover.com/oauth/v2/authorize",
    api: prod ? "https://api.clover.com" : "https://apisandbox.dev.clover.com",
  };
}

export class CloverError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

type TokenResponse = {
  access_token: string;
  access_token_expiration?: number;
  refresh_token?: string;
  refresh_token_expiration?: number;
};

const toDate = (v?: number) => (v ? new Date(v > 1e12 ? v : v * 1000) : null);

export async function exchangeCode(code: string) {
  const res = await fetch(`${cloverUrls().api}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env().CLOVER_APP_ID, client_secret: env().CLOVER_APP_SECRET, code }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new CloverError(`Token exchange failed (${res.status})`, res.status, false);
  return (await res.json()) as TokenResponse;
}

export async function saveConnection(merchantId: string, t: TokenResponse) {
  const values = {
    merchantId,
    environment: env().CLOVER_ENVIRONMENT,
    accessTokenEnc: encrypt(t.access_token),
    refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    accessTokenExpiresAt: toDate(t.access_token_expiration),
    refreshTokenExpiresAt: toDate(t.refresh_token_expiration),
    status: "connected" as const,
    lastError: null,
    updatedAt: new Date(),
  };
  await db()
    .insert(cloverConnections)
    .values(values)
    .onConflictDoUpdate({ target: cloverConnections.merchantId, set: values });
}

export async function activeConnection() {
  return db().query.cloverConnections.findFirst({
    where: and(eq(cloverConnections.status, "connected")),
    orderBy: (c, { desc }) => [desc(c.updatedAt)],
  });
}

async function accessToken(merchantId: string): Promise<string> {
  const conn = await db().query.cloverConnections.findFirst({ where: eq(cloverConnections.merchantId, merchantId) });
  if (!conn || conn.status === "disconnected") throw new CloverError("Clover is not connected", 401, false);
  const exp = conn.accessTokenExpiresAt?.getTime();
  if (!exp || exp - Date.now() > 5 * 60_000 || !conn.refreshTokenEnc) return decrypt(conn.accessTokenEnc);

  const res = await fetch(`${cloverUrls().api}/oauth/v2/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env().CLOVER_APP_ID, refresh_token: decrypt(conn.refreshTokenEnc) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    await db()
      .update(cloverConnections)
      .set({ status: "error", lastError: `Token refresh failed (${res.status}). Reconnect Clover.`, updatedAt: new Date() })
      .where(eq(cloverConnections.merchantId, merchantId));
    throw new CloverError(`Token refresh failed (${res.status})`, res.status, false);
  }
  const t = (await res.json()) as TokenResponse;
  await saveConnection(merchantId, t);
  return t.access_token;
}

export async function cloverFetch<T>(
  merchantId: string,
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await accessToken(merchantId);
    const res = await fetch(`${cloverUrls().api}/v3/merchants/${encodeURIComponent(merchantId)}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 1000 * 2 ** attempt;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, Math.min(wait, 15_000)));
        continue;
      }
      throw new CloverError(`Clover ${path} → ${res.status}`, res.status, true);
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      throw new CloverError(`Clover ${path} → ${res.status} ${text}`, res.status, res.status === 401 || res.status === 408);
    }
    return (await res.json()) as T;
  }
  throw new CloverError(`Clover ${path} failed`, 0, true);
}

export type CloverItem = {
  id: string;
  name: string;
  sku?: string | null;
  code?: string | null;
  price?: number | null;
  hidden?: boolean;
  available?: boolean;
  stockCount?: number | null;
  itemStock?: { quantity?: number | null; stockCount?: number | null } | null;
  autoManage?: boolean;
};

export function stockOf(item: CloverItem): number | null {
  const q = item.itemStock?.quantity ?? item.itemStock?.stockCount ?? item.stockCount;
  return q == null ? null : Math.floor(Number(q));
}

export async function listAllItems(merchantId: string): Promise<CloverItem[]> {
  const out: CloverItem[] = [];
  const limit = 1000;
  for (let offset = 0; offset < 50_000; offset += limit) {
    const page = await cloverFetch<{ elements?: CloverItem[] }>(
      merchantId,
      `/items?expand=itemStock&limit=${limit}&offset=${offset}`,
    );
    const els = page.elements ?? [];
    out.push(...els);
    if (els.length < limit) break;
  }
  return out;
}

export async function getItemStock(merchantId: string, itemId: string): Promise<number | null> {
  try {
    const r = await cloverFetch<{ quantity?: number; stockCount?: number }>(
      merchantId,
      `/item_stocks/${encodeURIComponent(itemId)}`,
    );
    const q = r.quantity ?? r.stockCount;
    return q == null ? null : Math.floor(Number(q));
  } catch (err) {
    if (err instanceof CloverError && err.status === 404) return null;
    throw err;
  }
}

/** Clover's endpoint sets an absolute quantity (it has no relative decrement). */
export async function setItemStock(merchantId: string, itemId: string, quantity: number) {
  await cloverFetch(merchantId, `/item_stocks/${encodeURIComponent(itemId)}`, { method: "POST", body: { quantity } });
}

export async function getOrderItemIds(merchantId: string, orderId: string): Promise<string[]> {
  const o = await cloverFetch<{ lineItems?: { elements?: { item?: { id?: string } }[] } }>(
    merchantId,
    `/orders/${encodeURIComponent(orderId)}?expand=lineItems`,
  );
  return [...new Set((o.lineItems?.elements ?? []).map((l) => l.item?.id).filter(Boolean) as string[])];
}
