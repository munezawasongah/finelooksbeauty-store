/**
 * Applies SQL migrations in ./drizzle. Safe to run on every deploy:
 * already-applied migrations are skipped. Uses a Postgres advisory lock so
 * two deploys starting at once cannot run migrations concurrently.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../src/server/db";

async function main() {
  const client = await pool().connect();
  try {
    await client.query("SELECT pg_advisory_lock(727001)");
    await migrate(db(), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    client.release();
    await pool().end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
