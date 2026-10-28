import { Suspense } from "react";
import { and, desc, lt, sql, type SQL } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { dateET } from "@/lib/format";
import { Empty, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import Link from "next/link";

export const metadata = { title: "Audit log" };

export default function AuditPage(props: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/audit">) {
  await requireStaff("audit.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const before = Number(sp.before) || 0;
  const where: SQL[] = [];
  if (q) where.push(sql`(${auditLogs.action} ilike ${"%" + q + "%"} or ${auditLogs.actorLabel} ilike ${"%" + q + "%"} or ${auditLogs.entity} ilike ${"%" + q + "%"})`);
  if (before) where.push(lt(auditLogs.id, before));
  const rows = await db().select().from(auditLogs).where(where.length ? and(...where) : undefined).orderBy(desc(auditLogs.id)).limit(100);
  return (
    <>
      <PageHeader title="Audit log" description="Every privileged action. Append-only — entries can't be edited or deleted, even from the database." />
      <Panel pad={false}>
        <form className="flex gap-2 border-b border-line p-3" role="search">
          <label htmlFor="aq" className="sr-only">Filter</label>
          <input id="aq" name="q" defaultValue={q} placeholder="Action, person or entity (e.g. refund, price, staff)" className="field flex-1 !py-2" />
          <button className="btn btn-dark btn-sm">Filter</button>
        </form>
        <Table head={["When (ET)", "Who", "Action", "Entity", "Details", "IP"]} empty={rows.length === 0 ? <Empty>No entries.</Empty> : null}>
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="whitespace-nowrap text-xs text-muted">{dateET(r.createdAt, true)}</Td>
              <Td className="text-xs">{r.actorLabel}</Td>
              <Td className="font-mono text-xs font-semibold">{r.action}</Td>
              <Td className="text-xs">{r.entity}{r.entityId ? <span className="block text-muted">{r.entityId.slice(0, 8)}</span> : null}</Td>
              <Td><code className="block max-w-md overflow-hidden text-ellipsis whitespace-pre-wrap break-all text-[0.7rem] text-ink-soft">{JSON.stringify(r.summary)}</code></Td>
              <Td className="text-xs text-muted">{r.ip ?? ""}</Td>
            </tr>
          ))}
        </Table>
        {rows.length === 100 && (
          <div className="border-t border-line p-3 text-right">
            <Link href={`/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), before: String(rows[rows.length - 1].id) })}`} className="btn btn-outline btn-sm">Older</Link>
          </div>
        )}
      </Panel>
    </>
  );
}
