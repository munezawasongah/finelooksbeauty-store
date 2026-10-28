import { Suspense } from "react";
import { InviteForm } from "../forms";

export const metadata = { title: "Set your password" };

export default function InvitePage({ searchParams }: PageProps<"/admin/invite">) {
  return (
    <>
      <h1 className="font-display text-3xl">Set your password</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Then you&apos;ll set up two-step verification on your phone.</p>
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/invite">["searchParams"] }) {
  const sp = await searchParams;
  return <InviteForm token={typeof sp.token === "string" ? sp.token : ""} />;
}
