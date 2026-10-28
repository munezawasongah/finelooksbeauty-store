import { db, type Tx } from "./db";
import { auditLogs, alerts } from "./db/schema";
import { sql } from "drizzle-orm";

export type Actor = { userId: string | null; label: string; ip?: string | null };

export const SYSTEM_ACTOR: Actor = { userId: null, label: "system" };

export async function audit(
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  summary: Record<string, unknown> = {},
  tx?: Tx,
  correlationId?: string,
) {
  await (tx ?? db()).insert(auditLogs).values({
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action,
    entity,
    entityId,
    summary,
    ip: actor.ip ?? null,
    correlationId: correlationId ?? null,
  });
}

/**
 * Raise an operational alert shown on the dashboard (and emailed by the worker).
 * With a dedupeKey only one open alert of that key exists at a time.
 */
export async function raiseAlert(input: {
  kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
  dedupeKey?: string;
  context?: Record<string, unknown>;
}, tx?: Tx) {
  await (tx ?? db())
    .insert(alerts)
    .values({
      kind: input.kind,
      severity: input.severity,
      message: input.message,
      dedupeKey: input.dedupeKey ?? null,
      context: input.context ?? {},
    })
    .onConflictDoNothing({
      target: alerts.dedupeKey,
      where: sql`${alerts.dedupeKey} is not null and ${alerts.resolvedAt} is null`,
    });
}
