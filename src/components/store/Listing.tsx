import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { listBrands, listCategories, searchProducts, SORTS, type SortKey } from "@/server/catalog";
import { ProductCard } from "./ProductCard";
import { AutoSubmit } from "./AutoSubmit";

export type ListingParams = {
  q?: string;
  brand?: string;
  min?: string;
  max?: string;
  stock?: string;
  sort?: string;
  page?: string;
};

export function parseListingParams(sp: Record<string, string | string[] | undefined>): ListingParams {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 100);
  };
  return {
    q: one("q"),
    brand: one("brand"),
    min: one("min"),
    max: one("max"),
    stock: one("stock"),
    sort: one("sort"),
    page: one("page"),
  };
}

const num = (v?: string) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export async function Listing({
  basePath,
  params,
  categorySlug,
}: {
  basePath: string;
  params: ListingParams;
  categorySlug?: string;
}) {
  const sort = (SORTS.some((s) => s.key === params.sort) ? params.sort : "featured") as SortKey;
  const page = Math.max(1, Math.floor(num(params.page) ?? 1));
  const [result, brands, cats] = await Promise.all([
    searchProducts({
      q: params.q,
      category: categorySlug,
      brand: params.brand,
      minPrice: num(params.min),
      maxPrice: num(params.max),
      inStock: params.stock === "1",
      sort,
      page,
      pageSize: 24,
    }),
    listBrands(categorySlug),
    listCategories(),
  ]);

  const qs = (patch: Partial<ListingParams>) => {
    const merged = { ...params, ...patch };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, String(v));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const active: { label: string; href: string }[] = [];
  if (params.q) active.push({ label: `“${params.q}”`, href: qs({ q: undefined, page: undefined }) });
  if (params.brand) active.push({ label: params.brand, href: qs({ brand: undefined, page: undefined }) });
  if (params.min) active.push({ label: `From $${params.min}`, href: qs({ min: undefined, page: undefined }) });
  if (params.max) active.push({ label: `Up to $${params.max}`, href: qs({ max: undefined, page: undefined }) });
  if (params.stock === "1") active.push({ label: "In stock", href: qs({ stock: undefined, page: undefined }) });

  const filters = (p: string) => (
    <form method="get" action={basePath} className="space-y-8" id={`filters-${p}`}>
      <AutoSubmit formId={`filters-${p}`} />
      {params.q && <input type="hidden" name="q" value={params.q} />}
      <input type="hidden" name="sort" value={sort} />

      {!categorySlug && (
        <fieldset>
          <legend className="mb-3 text-xs font-bold tracking-[0.14em] text-ink uppercase">Category</legend>
          <ul className="space-y-1.5">
            {cats
              .filter((c) => !c.parentId)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/${c.slug}`}
                    className="flex items-center justify-between rounded-lg py-1 text-sm text-ink-soft hover:text-iris-700"
                  >
                    {c.name}
                    <span className="text-xs text-muted">{c.productCount}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-3 text-xs font-bold tracking-[0.14em] text-ink uppercase">Availability</legend>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={params.stock === "1"}
            className="h-4 w-4 accent-iris-600"
          />
          In stock only
        </label>
      </fieldset>

      {brands.length > 1 && (
        <fieldset>
          <legend className="mb-3 text-xs font-bold tracking-[0.14em] text-ink uppercase">Brand</legend>
          <label htmlFor={`${p}-f-brand`} className="sr-only">
            Brand
          </label>
          <select id={`${p}-f-brand`} name="brand" defaultValue={params.brand ?? ""} className="field">
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-3 text-xs font-bold tracking-[0.14em] text-ink uppercase">Price (USD)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${p}-f-min`}>
            Minimum price
          </label>
          <input
            id={`${p}-f-min`}
            name="min"
            inputMode="decimal"
            placeholder="Min"
            defaultValue={params.min}
            className="field"
          />
          <span className="text-muted">–</span>
          <label className="sr-only" htmlFor={`${p}-f-max`}>
            Maximum price
          </label>
          <input
            id={`${p}-f-max`}
            name="max"
            inputMode="decimal"
            placeholder="Max"
            defaultValue={params.max}
            className="field"
          />
        </div>
      </fieldset>

      <noscript>
        <button type="submit" className="btn btn-primary w-full">
          Apply filters
        </button>
      </noscript>
      <button type="submit" className="btn btn-primary btn-sm w-full lg:hidden">
        Show results
      </button>
    </form>
  );

  return (
    <div className="container-x pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-4">
        <p className="text-sm text-muted" aria-live="polite">
          <span className="font-bold text-ink">{result.total}</span> {result.total === 1 ? "product" : "products"}
        </p>
        <div className="flex items-center gap-2">
          <details className="group relative lg:hidden">
            <summary className="btn btn-outline btn-sm list-none [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal size={15} aria-hidden /> Filters
            </summary>
            <div className="fixed inset-0 z-50 flex flex-col bg-white p-6">
              <div className="mb-6 flex items-center justify-between">
                <p className="font-display text-2xl">Filters</p>
                <a href={qs({})} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-mist">
                  <X size={20} aria-label="Close filters" />
                </a>
              </div>
              <div className="flex-1 overflow-y-auto">{filters("m")}</div>
            </div>
          </details>
          <form method="get" action={basePath} id="sortform" className="flex items-center gap-2">
            <AutoSubmit formId="sortform" />
            {Object.entries(params).map(([k, v]) =>
              v && k !== "sort" && k !== "page" ? <input key={k} type="hidden" name={k} value={v} /> : null,
            )}
            <label htmlFor="sort" className="hidden text-sm text-muted sm:block">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={sort} className="field !w-auto !rounded-full !py-2 text-sm">
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <noscript>
              <button className="btn btn-sm btn-outline">Go</button>
            </noscript>
          </form>
        </div>
      </div>

      {active.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
          {active.map((a) => (
            <li key={a.label}>
              <Link href={a.href} className="chip bg-mist text-iris-700 normal-case hover:bg-iris-100">
                {a.label} <X size={12} aria-label="Remove filter" />
              </Link>
            </li>
          ))}
          <li>
            <Link href={basePath} className="chip text-muted normal-case underline">
              Clear all
            </Link>
          </li>
        </ul>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-28">{filters("d")}</div>
        </aside>
        <div>
          {result.items.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-cream px-6 py-20 text-center">
              <p className="font-display text-3xl">Nothing matches yet.</p>
              <p className="mx-auto mt-2 max-w-md text-muted">
                Try fewer filters or a different search. You can also call the store and we&apos;ll check what we
                have on the shelf.
              </p>
              <Link href={basePath} className="btn btn-primary mt-6">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:gap-x-6">
              {result.items.map((p, i) => (
                <ProductCard key={p.id} p={p} priority={i < 3} />
              ))}
            </div>
          )}

          {result.pages > 1 && (
            <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-2">
              <PageLink href={qs({ page: String(page - 1) })} disabled={page <= 1} label="Previous page">
                <ChevronLeft size={18} aria-hidden />
              </PageLink>
              {Array.from({ length: result.pages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === result.pages || Math.abs(n - page) <= 1)
                .map((n, i, arr) => (
                  <span key={n} className="flex items-center gap-2">
                    {i > 0 && n - arr[i - 1] > 1 && <span className="text-muted">…</span>}
                    <Link
                      href={qs({ page: String(n) })}
                      aria-current={n === page ? "page" : undefined}
                      className={`flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-bold ${
                        n === page ? "bg-ink text-white" : "hover:bg-mist"
                      }`}
                    >
                      {n}
                    </Link>
                  </span>
                ))}
              <PageLink href={qs({ page: String(page + 1) })} disabled={page >= result.pages} label="Next page">
                <ChevronRight size={18} aria-hidden />
              </PageLink>
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled)
    return (
      <span aria-disabled className="flex h-10 w-10 items-center justify-center rounded-full text-muted/50">
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-mist">
      {children}
    </Link>
  );
}

export function ListingSkeleton() {
  return (
    <div className="container-x pb-24">
      <div className="h-14 animate-pulse border-y border-line" />
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:ml-[17.5rem] lg:gap-x-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/5] rounded-[var(--radius-card)] bg-mist" />
            <div className="mt-4 h-4 w-3/4 rounded bg-mist" />
          </div>
        ))}
      </div>
    </div>
  );
}
