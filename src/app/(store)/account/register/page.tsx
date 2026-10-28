import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell title="Join the" accent="family." subtitle="Track orders, save your details and hear about restocks first.">
      <RegisterForm />
      <p className="mt-6 text-xs leading-relaxed text-muted">
        By creating an account you agree to our{" "}
        <Link href="/policies/terms" className="underline">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/policies/privacy" className="underline">
          privacy policy
        </Link>
        . You must be 13 or older.
      </p>
      <p className="mt-6 border-t border-line pt-6 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href="/account/login" className="font-bold text-iris-700">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
