import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { can, type Role } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { cloverItemMappings, inventoryBalances, products, productVariants, stockMovements, stockReservations, users, orders } from "@/server/db/schema";
import { availableToSell, defaultLocationId } from "@/server/inventory";
import { dateET, variantLabel } from "@/lib/format";
import { Badge, PageHeader, Panel, Stat, Table, Td } from "@/components/admin/ui";
import { AdjustForm, BalanceSettingsForm } from "../forms";

export const metadata = { title: "Stock history" };

const TYPE: Record<string, string> = {
  initial_import: "Initial import",
  sale_online: "Online sale",
  sale_pos: "In-store sale",
  adjustment: "Adjustment",
  return_restock: "Returned to stock",
  reconciliation: "Count / reconciliation",
  pos_sync: "Clover sync",
};

export default function VariantStockPage(props: PageProps<"/admin/inventory/[variantId]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params }: PageProps<"/admin/inventory/[variantId]">) {
  const ctx = await requireStaff("inventory.view");
  const { variantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(variantId)) notFound();
  const loc = await defaultLocationId();
  const v = await db().query.productVariants.findFirst({ where: eq(productVariants.id, variantId) });
  if (!v) notFound();
  const [p, b, moves, holds, map, staff] = await Promise.all([
    db().query.products.findFirst({ where: eq(products.id, v.productId) }),
    db().query.inventoryBalances.findFirst({ where: and(eq(inventoryBalances.variantId, variantId), eq(inventoryBalances.locationId, loc)) }),
    db().select().from(stockMovements).where(eq(stockMovements.variantId, variantId)).orderBy(desc(stockMovements.createdAt)).limit(200),
    db()
      .select({ r: stockReservations, number: orders.number })
      .from(stockReservations)
      .innerJoin(orders, eq(orders.id, stockReservations.orderId))
      .where(and(eq(stockReservations.variantId, variantId), eq(stockReservations.status, "active"))),
    db().query.cloverItemMappings.findFirst({ where: eq(cloverItemMappings.variantId, variantId) }),
    db().select({ id: users.id, name: users.name }).from(users),
  ]);
  const role = ctx.user.role as Role;
  const bal = b ?? { onHand: 0, reserved: 0, safetyStock: 0, checkoutPaused: false, pauseReason: null, lastSyncedAt: null };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/inventory", label: "Inventory" }}
        title={p?.title ?? "Variant"}
        description={`SKU ${v.sku}${variantLabel(v.options) ? ` · ${variantLabel(v.options)}` : ""}`}
        actions={p ? <Link href={`/admin/products/${p.id}`} className="btn btn-outline btn-sm">Edit product</Link> : null}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="On hand" value={bal.onHand} tone={bal.onHand < 0 ? "alert" : "default"} />
        <Stat label="Held in checkout" value={bal.reserved} />
        <Stat label="Safety stock" value={bal.safetyStock} />
        <Stat label="Sellable online" value={bal.checkoutPaused ? "Paused" : availableToSell(bal as never)} hint={bal.lastSyncedAt ? `Clover sync ${dateET(bal.lastSyncedAt, true)}` : map ? "Not synced yet" : "Not linked to Clover"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {can(role, "inventory.adjust") && (
          <>
            <Panel title="Record a stock change">
              <AdjustForm variantId={variantId} onHand={bal.onHand} />
              {map?.syncStatus === "ok" && <p className="mt-3 text-xs text-muted">This SKU is linked to Clover; the change is also written to Clover.</p>}
            </Panel>
            <Panel title="Online selling">
              <BalanceSettingsForm variantId={variantId} safetyStock={bal.safetyStock} paused={bal.checkoutPaused} />
              {bal.checkoutPaused && bal.pauseReason && bal.pauseReason !== "manual" && (
                <p className="mt-3 text-xs text-warning">Paused automatically ({bal.pauseReason.replace("_", " ")}). It resumes after the next successful Clover sync.</p>
              )}
            </Panel>
          </>
        )}
      </div>
      {holds.length > 0 && (
        <Panel title="Held in checkout right now" className="mt-6">
          <ul className="text-sm">
            {holds.map(({ r, number }) => (
              <li key={r.id}>
                {r.quantity} for order {number} · releases {dateET(r.expiresAt, true)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Movement ledger (append-only)" className="mt-6" pad={false}>
        <Table head={["When (ET)", "Type", "Change", "On hand after", "Source", "By", "Reason"]}>
          {moves.map((m) => (
            <tr key={m.id}>
              <Td className="text-xs text-muted">{dateET(m.createdAt, true)}</Td>
              <Td><Badge tone={m.quantityDelta < 0 ? "orchid" : "iris"}>{TYPE[m.movementType] ?? m.movementType}</Badge></Td>
              <Td className={`font-semibold ${m.quantityDelta < 0 ? "text-danger" : "text-success"}`}>{m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}</Td>
              <Td>{m.onHandAfter}</Td>
              <Td className="text-xs">
                {m.sourceType === "order" && m.sourceId ? <Link className="text-iris-700" href={`/admin/orders/${m.sourceId}`}>order</Link> : m.sourceType}
              </Td>
              <Td className="text-xs">{m.actorUserId ? staff.find((s) => s.id === m.actorUserId)?.name ?? "Staff" : "System"}</Td>
              <Td className="text-xs text-muted">{m.reason}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
