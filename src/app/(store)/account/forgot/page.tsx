import type { Metadata } from "next";
import { AuthShell } from "../AuthShell";
import { ForgotForm } from "../forms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPage() {
  return (
    <AuthShell title="Forgot your" accent="password?" subtitle="Enter your email and we'll send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
