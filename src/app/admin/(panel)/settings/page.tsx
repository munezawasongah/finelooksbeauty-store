import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { shippingMethods } from "@/server/db/schema";
import { getSettings } from "@/server/settings";
import { PageHeader, Panel } from "@/components/admin/ui";
import { CommerceForm, HomeForm, PoliciesForm, ShippingForm, StoreForm } from "./forms";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "store", label: "Store details" },
  { key: "checkout", label: "Checkout & stock" },
  { key: "shipping", label: "Shipping" },
  { key: "home", label: "Home page" },
  { key: "policies", label: "Policies" },
] as const;

export default function SettingsPage(props: PageProps<"/admin/settings">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: PageProps<"/admin/settings">) {
  await requireStaff("settings.manage");
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "store";
  const s = await getSettings(["store", "commerce", "home", "policies"]);
  const ship = tab === "shipping" ? await db().select().from(shippingMethods).orderBy(asc(shippingMethods.sortOrder)) : [];
  return (
    <>
      <PageHeader title="Settings" />
      <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/settings?tab=${t.key}`} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${t.key === tab ? "bg-ink text-white" : "text-ink-soft hover:bg-white"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      <Panel>
        {tab === "store" && <StoreForm store={s.store} />}
        {tab === "checkout" && <CommerceForm commerce={s.commerce} />}
        {tab === "shipping" && <ShippingForm methods={ship} />}
        {tab === "home" && <HomeForm home={s.home} />}
        {tab === "policies" && <PoliciesForm policies={s.policies} />}
      </Panel>
    </>
  );
}
