import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { requireStaff } from "@/server/auth/session";
import { db } from "@/server/db";
import { discounts } from "@/server/db/schema";
import { dateET, money } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel, Table, Td } from "@/components/admin/ui";
import { DiscountForm } from "./DiscountForm";
import { toggleDiscount } from "./actions";

export const metadata = { title: "Discounts" };

export default function DiscountsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireStaff("discounts.manage");
  const rows = await db().select().from(discounts).orderBy(desc(discounts.createdAt));
  return (
    <>
      <PageHeader title="Discount codes" description="Codes apply to the product subtotal. One code per order." />
      <Panel pad={false} className="mb-6">
        <Table head={["Code", "Value", "Minimum", "Dates (ET)", "Used", "Status", ""]} empty={rows.length === 0 ? <Empty>No discount codes yet.</Empty> : null}>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td>
                <span className="font-mono font-bold">{d.code}</span>
                {d.description && <span className="block text-xs text-muted">{d.description}</span>}
              </Td>
              <Td>{d.type === "percent" ? `${d.value}% off` : `${money(d.value)} off`}</Td>
              <Td>{d.minSubtotalCents ? money(d.minSubtotalCents) : "—"}</Td>
              <Td className="text-xs">{d.startsAt ? dateET(d.startsAt) : "now"} → {d.endsAt ? dateET(d.endsAt) : "no end"}</Td>
              <Td>{d.usedCount}{d.usageLimit ? ` / ${d.usageLimit}` : ""}</Td>
              <Td><Badge tone={d.active ? "green" : "neutral"}>{d.active ? "active" : "off"}</Badge></Td>
              <Td>
                <form action={toggleDiscount}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-sm font-bold text-iris-700">{d.active ? "Turn off" : "Turn on"}</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Panel title="New discount code">
        <DiscountForm />
      </Panel>
    </>
  );
}
