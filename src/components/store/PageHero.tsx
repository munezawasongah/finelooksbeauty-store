import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold text-muted">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={12} aria-hidden />}
            {it.href ? (
              <Link href={it.href} className="hover:text-iris-700">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink-soft">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHero({
  eyebrow,
  title,
  accent,
  description,
  crumbs,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  description?: string | null;
  crumbs?: { name: string; href?: string }[];
}) {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full bg-orchid-50 blur-3xl" />
      <div className="container-x relative pt-8 pb-10 sm:pt-10 sm:pb-14">
        {crumbs && <Breadcrumbs items={crumbs} />}
        {eyebrow && <p className="eyebrow mt-8">{eyebrow}</p>}
        <h1 className="mt-3 text-[2.6rem] leading-[1.02] font-light sm:text-6xl">
          {title} {accent && <em className="accent">{accent}</em>}
        </h1>
        {description && <p className="mt-4 max-w-2xl text-lg text-ink-soft">{description}</p>}
      </div>
    </section>
  );
}
