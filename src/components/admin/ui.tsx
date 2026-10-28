import Link from "next/link";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link href={back.href} className="mb-2 inline-block text-xs font-bold text-iris-700">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className = "", pad = true }: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(30,20,51,0.04)] ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          {title && <h2 className="font-sans text-sm font-bold tracking-normal text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-mist text-ink-soft",
  iris: "bg-iris-50 text-iris-700",
  orchid: "bg-orchid-50 text-orchid-700",
  green: "bg-green-50 text-success",
  amber: "bg-amber-50 text-warning",
  red: "bg-red-50 text-danger",
  dark: "bg-ink text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${TONES[tone]}`}>{children}</span>;
}

export const ORDER_STATUS: Record<string, { label: string; tone: keyof typeof TONES }> = {
  pending_payment: { label: "Awaiting payment", tone: "neutral" },
  paid: { label: "Paid — to fulfill", tone: "iris" },
  processing: { label: "Processing", tone: "iris" },
  ready_for_pickup: { label: "Ready for pickup", tone: "orchid" },
  shipped: { label: "Shipped", tone: "green" },
  delivered: { label: "Completed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  exception: { label: "Needs review", tone: "red" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: keyof typeof TONES }> = {
  unpaid: { label: "Unpaid", tone: "neutral" },
  paid: { label: "Paid", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  partially_refunded: { label: "Part refunded", tone: "amber" },
  refunded: { label: "Refunded", tone: "amber" },
  disputed: { label: "Disputed", tone: "red" },
};

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "alert" }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${tone === "alert" ? "border-red-200" : "border-line"}`}>
      <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">{label}</p>
      <p className={`mt-2 font-display text-3xl ${tone === "alert" ? "text-danger" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-3 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty}
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
      <span className="text-muted">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={href(page - 1)} className="btn btn-outline btn-sm">
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(page + 1)} className="btn btn-outline btn-sm">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}

export function Denied() {
  return (
    <div className="rounded-2xl border border-line bg-white p-10 text-center">
      <p className="font-display text-2xl">You don&apos;t have access to this page.</p>
      <p className="mt-2 text-sm text-muted">Ask the store owner if you need it.</p>
    </div>
  );
}
