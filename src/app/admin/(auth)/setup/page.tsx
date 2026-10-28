import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { SetupForm } from "../forms";

export const metadata = { title: "First-time setup" };

export default function SetupPage({ searchParams }: PageProps<"/admin/setup">) {
  return (
    <Suspense fallback={null}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/setup">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const [{ n }] = await db().select({ n: sql<number>`count(*)::int` }).from(users);
  const expected = env().SETUP_TOKEN;
  if (n > 0 || !expected || !token || !safeEqual(token, expected)) {
    return (
      <>
        <h1 className="font-display text-3xl">Setup unavailable</h1>
        <p className="mt-2 text-sm text-muted">
          {n > 0 ? "The owner account already exists. Sign in instead." : "This setup link isn't valid."}
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="font-display text-3xl">Create the owner account</h1>
      <p className="mt-1 mb-6 text-sm text-muted">This is a one-time step. Afterwards, invite staff from the Staff page.</p>
      <SetupForm token={token} />
    </>
  );
}
