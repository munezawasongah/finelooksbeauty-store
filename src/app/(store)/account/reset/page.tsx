import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "../AuthShell";
import { ResetForm } from "../forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default function ResetPage({ searchParams }: PageProps<"/account/reset">) {
  return (
    <AuthShell title="Choose a new" accent="password.">
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/account/reset">["searchParams"] }) {
  const sp = await searchParams;
  return <ResetForm token={typeof sp.token === "string" ? sp.token : ""} />;
}
