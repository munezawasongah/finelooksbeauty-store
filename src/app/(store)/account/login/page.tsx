import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { SignInForm } from "../forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/account/login">) {
  return (
    <AuthShell title="Welcome" accent="back." subtitle="Sign in to see your orders and check out faster.">
      <Suspense fallback={<SignInForm next="/account" />}>
        <Form searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-soft">
        New here?{" "}
        <Link href="/account/register" className="font-bold text-iris-700">
          Create an account
        </Link>{" "}
        — or just check out as a guest.
      </p>
    </AuthShell>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/account/login">["searchParams"] }) {
  const sp = await searchParams;
  return <SignInForm next={typeof sp.next === "string" ? sp.next : "/account"} />;
}
