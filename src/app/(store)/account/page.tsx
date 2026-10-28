import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { getCustomer } from "@/server/auth/session";
import { dateET, money } from "@/lib/format";
import { ProfileForm } from "./forms";
import { deleteAccount, signOut } from "./actions";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

const LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  paid: "Confirmed",
  processing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  shipped: "Shipped",
  delivered: "Completed",
  cancelled: "Cancelled",
  exception: "Being reviewed",
};

export default function AccountPage() {
  return (
    <div className="container-x pt-10 pb-24">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-mist" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const c = await getCustomer();
  if (!c) redirect("/account/login?next=/account");
  const list = await db()
    .select()
    .from(orders)
    .where(eq(orders.customerId, c.id))
    .orderBy(desc(orders.createdAt))
    .limit(50);
  const visible = list.filter((o) => o.status !== "pending_payment" || o.paymentStatus === "paid");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[2.6rem] leading-none font-light sm:text-6xl">
          Hi, <em className="accent">{c.firstName ?? "there"}.</em>
        </h1>
        <form action={signOut}>
          <button className="btn btn-outline btn-sm">
            <LogOut size={15} aria-hidden /> Sign out
          </button>
        </form>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="card p-6 sm:p-8" aria-labelledby="orders-h">
          <h2 id="orders-h" className="font-display text-2xl">
            Your orders
          </h2>
          {visible.length === 0 ? (
            <p className="mt-4 text-muted">
              No orders yet.{" "}
              <Link href="/shop" className="font-bold text-iris-700">
                Start shopping
              </Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {visible.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:text-iris-700">
                    <span>
                      <span className="block font-semibold">{o.number}</span>
                      <span className="text-sm text-muted">{dateET(o.createdAt)}</span>
                    </span>
                    <span className="chip bg-mist text-iris-800 normal-case">{LABEL[o.status] ?? o.status}</span>
                    <span className="font-semibold">{money(o.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="space-y-6">
          <section className="card p-6" aria-labelledby="profile-h">
            <h2 id="profile-h" className="font-display text-xl">
              Your details
            </h2>
            <p className="mt-1 text-sm text-muted">{c.email}</p>
            <div className="mt-5">
              <ProfileForm
                defaults={{
                  firstName: c.firstName ?? "",
                  lastName: c.lastName ?? "",
                  phone: c.phone ?? "",
                  marketing: c.marketingOptIn,
                }}
              />
            </div>
          </section>
          <details className="card p-6 text-sm">
            <summary className="cursor-pointer font-semibold text-ink-soft">Delete my account</summary>
            <p className="mt-3 text-muted">
              This removes your name, email, phone and password. Order records are kept for tax and accounting, without
              your contact details.
            </p>
            <form action={deleteAccount} className="mt-4">
              <button className="btn btn-sm border-[1.5px] border-danger text-danger hover:bg-red-50">Delete account</button>
            </form>
          </details>
        </aside>
      </div>
    </>
  );
}
