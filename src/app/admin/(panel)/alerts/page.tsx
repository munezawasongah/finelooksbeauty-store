import { Suspense } from "react";
import { desc, eq, isNotNull, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { assertStaff, requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { alerts } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { dateET } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Alerts" };

async function resolveAlert(form: FormData) {
  "use server";
  const ctx = await assertStaff("dashboard.view");
  const id = String(form.get("id") ?? "");
  await db().update(alerts).set({ resolvedAt: new Date(), resolvedBy: ctx.user.id }).where(eq(alerts.id, id));
  await audit(ctx.actor, "alert.resolve", "alert", id);
  refresh();
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireStaff("dashboard.view");
  const [open, closed] = await Promise.all([
    db().select().from(alerts).where(isNull(alerts.resolvedAt)).orderBy(desc(alerts.createdAt)).limit(200),
    db().select().from(alerts).where(isNotNull(alerts.resolvedAt)).orderBy(desc(alerts.resolvedAt)).limit(50),
  ]);
  const tone = (s: string) => (s === "critical" ? "red" : s === "warning" ? "amber" : "iris") as "red";
  return (
    <>
      <PageHeader title="Alerts" description="Payment, stock and integration problems that need a person. Critical and warning alerts are also emailed to owners and managers." />
      <Panel title={`Open (${open.length})`} pad={false} className="mb-6">
        {open.length === 0 ? (
          <Empty>No open alerts.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {open.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                <span className="max-w-3xl">
                  <Badge tone={tone(a.severity)}>{a.severity}</Badge> <span className="ml-1 font-semibold">{a.message}</span>
                  <span className="block text-xs text-muted">{a.kind} · {dateET(a.createdAt, true)}</span>
                </span>
                <form action={resolveAlert}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-outline btn-sm">Mark resolved</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Recently resolved" pad={false}>
        <ul className="divide-y divide-line">
          {closed.map((a) => (
            <li key={a.id} className="px-5 py-3 text-sm text-muted">
              {a.message} <span className="block text-xs">resolved {dateET(a.resolvedAt, true)}</span>
            </li>
          ))}
          {closed.length === 0 && <Empty>Nothing yet.</Empty>}
        </ul>
      </Panel>
    </>
  );
}
