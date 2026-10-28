import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/server/auth/session";
import { decrypt } from "@/server/crypto";
import { RecoveryCodes } from "../forms";
import { finishRecoveryCodes } from "../actions";

export const metadata = { title: "Save your recovery codes" };

export default function RecoveryCodesPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await getStaffSession();
  if (!ctx?.session.mfaVerified) redirect("/admin/login");
  const raw = (await cookies()).get("fl_recovery")?.value;
  let codes: string[] = [];
  try {
    codes = raw ? (JSON.parse(decrypt(raw)) as string[]) : [];
  } catch {
    codes = [];
  }
  if (!codes.length) redirect("/admin");
  return (
    <>
      <p className="rounded-xl bg-green-50 px-3 py-2.5 text-sm font-semibold text-success">Two-step verification is on.</p>
      <h1 className="mt-4 font-display text-3xl">Save your recovery codes</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Each code works once if you lose your phone. Keep them somewhere safe — they won&apos;t be shown again.
      </p>
      <RecoveryCodes codes={codes} />
      <form action={finishRecoveryCodes} className="mt-6">
        <button className="btn btn-primary w-full">I&apos;ve saved them — go to the dashboard</button>
      </form>
    </>
  );
}
