import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { dateET } from "@/lib/format";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { InviteForm, StaffRowActions } from "./forms";

export const metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireStaff("staff.manage");
  const rows = await db().select().from(users).orderBy(asc(users.createdAt));
  return (
    <>
      <PageHeader title="Staff" description="Everyone signs in with a password and an authenticator app. Changing a role signs that person out." />
      <Panel pad={false} className="mb-6">
        <ul className="divide-y divide-line">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
              <div className="text-sm">
                <p className="font-semibold">
                  {u.name} {u.id === ctx.user.id && <span className="text-xs text-muted">(you)</span>}
                </p>
                <p className="text-muted">{u.email}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  <Badge tone="iris">{ROLE_LABELS[u.role as Role]}</Badge>
                  {u.mfaEnabled ? <Badge tone="green">2-step on</Badge> : <Badge tone="amber">2-step not set up</Badge>}
                  {u.disabledAt && <Badge tone="red">disabled</Badge>}
                  {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="red">locked</Badge>}
                </p>
                <p className="mt-1 text-xs text-muted">Last sign-in {u.lastLoginAt ? dateET(u.lastLoginAt, true) : "never"}</p>
              </div>
              <StaffRowActions id={u.id} role={u.role} disabled={Boolean(u.disabledAt)} self={u.id === ctx.user.id} />
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Invite someone">
          <InviteForm />
        </Panel>
        <Panel title="What each role can do">
          <dl className="space-y-3 text-sm">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <div key={r}>
                <dt className="font-semibold">{ROLE_LABELS[r]}</dt>
                <dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
