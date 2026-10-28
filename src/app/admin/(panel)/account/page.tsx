import { Suspense } from "react";
import { requireStaff } from "@/server/auth/session";
import { ROLE_LABELS, type Role } from "@/server/auth/permissions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ChangePasswordForm, RecoveryCodesForm } from "./forms";

export const metadata = { title: "My account" };

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await requireStaff();
  return (
    <>
      <PageHeader title="My account" description={`${ctx.user.email} · ${ROLE_LABELS[ctx.user.role as Role]}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Change password">
          <ChangePasswordForm />
        </Panel>
        <Panel title="Two-step recovery codes">
          <p className="mb-3 text-sm text-muted">{ctx.user.mfaRecoveryHashes.length} unused codes left. Generating new codes cancels the old ones.</p>
          <RecoveryCodesForm />
        </Panel>
      </div>
    </>
  );
}
