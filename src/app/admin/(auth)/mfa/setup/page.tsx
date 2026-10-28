import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getStaffSession } from "@/server/auth/session";
import { ensurePendingMfaSecret, mfaQrDataUrl, newMfaSecret } from "@/server/auth/mfa";
import { decrypt } from "@/server/crypto";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { MfaSetupForm } from "../../forms";

export const metadata = { title: "Set up two-step verification" };

export default function MfaSetupPage() {
  return (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const ctx = await getStaffSession();
  if (!ctx) redirect("/admin/login");
  if (ctx.user.mfaEnabled) redirect(ctx.session.mfaVerified ? "/admin" : "/admin/mfa");
  await ensurePendingMfaSecret(ctx.user.id, newMfaSecret());
  const fresh = await db().query.users.findFirst({ where: eq(users.id, ctx.user.id) });
  const secret = decrypt(fresh!.mfaSecretEnc!);
  const qr = await mfaQrDataUrl(ctx.user.email, secret);
  return (
    <>
      <h1 className="font-display text-3xl">Protect your account</h1>
      <p className="mt-1 text-sm text-muted">
        Two-step verification is required for every dashboard user. Scan this code with Google Authenticator, Microsoft
        Authenticator, 1Password or a similar app.
      </p>
      <div className="my-6 flex flex-col items-center gap-3">
        <Image src={qr} alt="QR code for your authenticator app" width={220} height={220} unoptimized className="rounded-xl border border-line" />
        <details className="text-center text-xs text-muted">
          <summary className="cursor-pointer">Can&apos;t scan? Enter this key</summary>
          <code className="mt-2 block break-all rounded-lg bg-mist p-2 font-mono text-ink">{secret}</code>
        </details>
      </div>
      <MfaSetupForm />
    </>
  );
}
