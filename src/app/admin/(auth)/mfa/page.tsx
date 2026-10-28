import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getStaffSession } from "@/server/auth/session";
import { MfaForm } from "../forms";
import { staffLogout } from "../actions";

export const metadata = { title: "Two-step verification" };

export default function MfaPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await getStaffSession();
  if (!ctx) redirect("/admin/login");
  if (!ctx.user.mfaEnabled) redirect("/admin/mfa/setup");
  if (ctx.session.mfaVerified) redirect("/admin");
  return (
    <>
      <h1 className="font-display text-3xl">Two-step verification</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Open your authenticator app and enter the code for Fine Looks Admin.</p>
      <MfaForm />
      <form action={staffLogout} className="mt-4 text-center">
        <button className="text-sm text-muted underline">Use a different account</button>
      </form>
    </>
  );
}
