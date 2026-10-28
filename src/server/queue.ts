/**
 * Background jobs. With Redis configured, jobs go to BullMQ and the separate
 * worker service runs them (retries with backoff, dead-letter = failed set).
 * Without Redis (local dev), jobs run inline so nothing is ever dropped.
 *
 * Durability does not depend on Redis: webhook events are written to
 * integration_events first, and the worker sweeps any still-pending rows.
 */
import { Queue, type JobsOptions } from "bullmq";
import { redisConnectionOptions } from "./redis";

export type JobMap = {
  "events:process": { eventId: string };
  "clover:push": { outboundId?: string };
  "clover:refresh-items": { merchantId: string; itemIds: string[]; reason: string };
  "clover:refresh-order": { merchantId: string; orderId: string };
  "clover:reconcile": { triggeredBy: string };
  "clover:import": { triggeredBy: string };
  "email:send": { template: string; to: string; data: Record<string, unknown> };
};

export type JobName = keyof JobMap;

const QUEUE_FOR: Record<JobName, "events" | "clover" | "email"> = {
  "events:process": "events",
  "clover:push": "clover",
  "clover:refresh-items": "clover",
  "clover:refresh-order": "clover",
  "clover:reconcile": "clover",
  "clover:import": "clover",
  "email:send": "email",
};

const g = globalThis as unknown as { __flQueues?: Map<string, Queue> };

function queue(name: string): Queue | null {
  const conn = redisConnectionOptions();
  if (!conn) return null;
  g.__flQueues ??= new Map();
  let q = g.__flQueues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: conn,
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
    g.__flQueues.set(name, q);
  }
  return q;
}

type InlineRunner = <N extends JobName>(name: N, data: JobMap[N]) => Promise<void>;
let inlineRunner: InlineRunner | null = null;

/** The worker module registers its processors here so inline mode can reuse them. */
export function registerInlineRunner(fn: InlineRunner) {
  inlineRunner = fn;
}

export async function enqueue<N extends JobName>(name: N, data: JobMap[N], opts?: JobsOptions) {
  const q = queue(QUEUE_FOR[name]);
  if (q) {
    try {
      await q.add(name, data, opts);
      return;
    } catch (err) {
      console.error(`[queue] could not enqueue ${name}, running inline`, err);
    }
  }
  if (!inlineRunner) {
    const mod = await import("./jobs");
    registerInlineRunner(mod.runJob);
  }
  try {
    await inlineRunner!(name, data);
  } catch (err) {
    // Inline failures are retried by the sweepers (pending events / outbound rows stay pending).
    console.error(`[queue] inline job ${name} failed`, err);
  }
}

export const QUEUE_NAMES = ["events", "clover", "email"] as const;
