import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the database. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __flPool?: Pool; __flDb?: DB };

function createPool() {
  const url = env().DATABASE_URL;
  const needsSsl = /sslmode=require/.test(url) || /\.rlwy\.net|\.railway\.app/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export function pool(): Pool {
  if (!globalForDb.__flPool) globalForDb.__flPool = createPool();
  return globalForDb.__flPool;
}

export function db(): DB {
  if (!globalForDb.__flDb) globalForDb.__flDb = drizzle(pool(), { schema, casing: undefined });
  return globalForDb.__flDb;
}

export { schema };
