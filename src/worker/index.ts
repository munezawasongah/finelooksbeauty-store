/**
 * Worker service (run as a separate Railway service: `npm run worker`).
 * Webhook processing and Clover sync run here, separately from web requests,
 * so a burst of events can never slow down checkout (section 5.3).
 */
import { Worker, Queue } from "bullmq";
import { redisConnectionOptions } from "../server/redis";
import { runJob } from "../server/jobs";
import { registerInlineRunner, type JobName } from "../server/queue";
import { sweepEvents } from "../server/events";
import { expireStaleReservations } from "../server/inventory";
import { expireOverdueOrders } from "../server/orders/lifecycle";
import { pushPending, reconcile, staleSyncGuard } from "../server/clover/sync";
import { db } from "../server/db";
import { alerts } from "../server/db/schema";
import { and, gt, isNull } from "drizzle-orm";
import { enqueue } from "../server/queue";
import { isCloverConfigured } from "../server/env";
import { lowStockDigest, purgeExpiredSessions } from "../server/reports";

registerInlineRunner(runJob);

const conn = redisConnectionOptions();
if (!conn) {
  console.error("REDIS_URL is required for the worker.");
  process.exit(1);
}

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

const processor = async (job: { name: string; data: unknown }) => {
  await runJob(job.name as JobName, job.data as never);
};

const workers = [
  new Worker("events", processor, { connection: conn, concurrency: 5 }),
  // Clover jobs run one at a time (plus a database lock) so reads and writes never interleave.
  new Worker("clover", processor, { connection: conn, concurrency: 1 }),
  new Worker("email", processor, { connection: conn, concurrency: 3 }),
];

for (const w of workers) {
  w.on("failed", (job, err) => log(`job ${job?.name} failed (attempt ${job?.attemptsMade})`, err.message));
  w.on("error", (err) => log("worker error", err.message));
}

/* ------------------------------------------------------------------ */
/* Scheduled maintenance                                                */
/* ------------------------------------------------------------------ */

type Task = { name: string; everyMs: number; run: () => Promise<unknown> };

let lastAlertCheck = new Date();

const tasks: Task[] = [
  {
    name: "expire-reservations",
    everyMs: 60_000,
    run: async () => expireOverdueOrders(await expireStaleReservations()),
  },
  { name: "sweep-events", everyMs: 60_000, run: () => sweepEvents() },
  { name: "clover-push", everyMs: 60_000, run: () => (isCloverConfigured() ? pushPending() : Promise.resolve()) },
  { name: "clover-stale-guard", everyMs: 120_000, run: () => (isCloverConfigured() ? staleSyncGuard() : Promise.resolve()) },
  {
    name: "clover-reconcile",
    everyMs: 10 * 60_000,
    run: () => (isCloverConfigured() ? reconcile("schedule") : Promise.resolve()),
  },
  {
    name: "email-new-alerts",
    everyMs: 60_000,
    run: async () => {
      const since = lastAlertCheck;
      lastAlertCheck = new Date();
      const fresh = await db()
        .select()
        .from(alerts)
        .where(and(gt(alerts.createdAt, since), isNull(alerts.resolvedAt)));
      for (const a of fresh.filter((x) => x.severity !== "info")) {
        await enqueue("email:send", { template: "staff_alert", to: "__staff__", data: { severity: a.severity, message: a.message } });
      }
    },
  },
  { name: "low-stock-digest", everyMs: 24 * 3600_000, run: () => lowStockDigest() },
  { name: "purge-sessions", everyMs: 6 * 3600_000, run: () => purgeExpiredSessions() },
];

const running = new Set<string>();
for (const t of tasks) {
  const tick = async () => {
    if (running.has(t.name)) return;
    running.add(t.name);
    try {
      await t.run();
    } catch (err) {
      log(`task ${t.name} failed`, err instanceof Error ? err.message : err);
    } finally {
      running.delete(t.name);
    }
  };
  setTimeout(tick, 5_000 + Math.random() * 5_000);
  setInterval(tick, t.everyMs);
}

log("started: queues events, clover, email; maintenance tasks", tasks.map((t) => t.name).join(", "));

async function shutdown() {
  log("shutting down");
  await Promise.allSettled(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

void Queue;
