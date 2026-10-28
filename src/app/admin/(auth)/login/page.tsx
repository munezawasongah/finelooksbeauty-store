import { LoginForm } from "../forms";

export const metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Staff access only. You&apos;ll confirm with your authenticator app next.</p>
      <LoginForm />
    </>
  );
}
