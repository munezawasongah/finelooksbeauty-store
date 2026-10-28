import { Suspense } from "react";
import Link from "next/link";
import { staffLogout } from "../(auth)/actions";
import { sql } from "drizzle-orm";
import { AdminNav, type NavItem } from "@/components/admin/AdminNav";
import { requireStaff } from "@/server/auth/session";
import { can, ROLE_LABELS, type Permission, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { alerts, orders } from "@/server/db/schema";

export const metadata = { title: { default: "Dashboard", template: "%s · Fine Looks Admin" }, robots: { index: false, follow: false } };

const ITEMS: (NavItem & { perm: Permission })[] = [
  { href: "/admin", label: "Overview", icon: "dashboard", perm: "dashboard.view" },
  { href: "/admin/orders", label: "Orders", icon: "orders", perm: "orders.view" },
  { href: "/admin/products", label: "Products", icon: "products", perm: "products.view" },
  { href: "/admin/categories", label: "Categories", icon: "categories", perm: "products.edit" },
  { href: "/admin/inventory", label: "Inventory", icon: "inventory", perm: "inventory.view" },
  { href: "/admin/customers", label: "Customers", icon: "customers", perm: "customers.view" },
  { href: "/admin/discounts", label: "Discounts", icon: "discounts", perm: "discounts.manage" },
  { href: "/admin/integrations", label: "Integrations", icon: "integrations", perm: "integrations.manage" },
  { href: "/admin/alerts", label: "Alerts", icon: "alerts", perm: "dashboard.view" },
  { href: "/admin/staff", label: "Staff", icon: "staff", perm: "staff.manage" },
  { href: "/admin/settings", label: "Settings", icon: "settings", perm: "settings.manage" },
  { href: "/admin/audit", label: "Audit log", icon: "audit", perm: "audit.view" },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f7f5fc]" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaff();
  const role = ctx.user.role as Role;
  const [counts] = (
    await db().execute(sql`
      select (select count(*)::int from ${orders} where status in ('paid','processing','exception')) as to_do,
             (select count(*)::int from ${alerts} where resolved_at is null and severity <> 'info') as alerts
    `)
  ).rows as { to_do: number; alerts: number }[];
  const items: NavItem[] = ITEMS.filter((i) => can(role, i.perm)).map((i) => ({
    href: i.href,
    label: i.label,
    icon: i.icon,
    badge: i.href === "/admin/orders" ? counts.to_do : i.href === "/admin/alerts" ? counts.alerts : undefined,
  }));
  return (
    <AdminNav items={items} user={{ name: ctx.user.name, role: ROLE_LABELS[role] }}>
      <TopBar name={ctx.user.name} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </AdminNav>
  );
}


function TopBar({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-end gap-3 border-b border-line bg-white px-4 py-2.5 sm:px-6 lg:px-8">
      <Link href="/admin/account" className="text-sm font-semibold text-ink-soft hover:text-ink">
        {name}
      </Link>
      <form action={staffLogout}>
        <button className="btn btn-ghost btn-sm">Sign out</button>
      </form>
    </div>
  );
}
