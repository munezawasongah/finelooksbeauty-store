import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/store/PageHero";
import { RichText } from "@/components/store/RichText";
import { getSettings, type PolicyPages } from "@/server/settings";

const PAGES: Record<string, { key: keyof PolicyPages; title: string; accent: string; description: string }> = {
  privacy: { key: "privacy", title: "Privacy", accent: "policy", description: "How we collect, use and protect your information." },
  terms: { key: "terms", title: "Terms of", accent: "sale", description: "The terms that apply to orders placed on this website." },
  shipping: { key: "shipping", title: "Shipping &", accent: "pickup", description: "Delivery options, timing and in-store pickup." },
  returns: { key: "returns", title: "Returns", accent: "policy", description: "What can be returned and how." },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((page) => ({ page }));
}

export async function generateMetadata({ params }: PageProps<"/policies/[page]">): Promise<Metadata> {
  const { page } = await params;
  const p = PAGES[page];
  if (!p) return {};
  return { title: `${p.title} ${p.accent}`, description: p.description, alternates: { canonical: `/policies/${page}` } };
}

export default async function PolicyPage({ params }: PageProps<"/policies/[page]">) {
  const { page } = await params;
  const p = PAGES[page];
  if (!p) notFound();
  return (
    <>
      <PageHero
        eyebrow="Customer care"
        title={p.title}
        accent={p.accent}
        description={p.description}
        crumbs={[{ name: "Home", href: "/" }, { name: `${p.title} ${p.accent}` }]}
      />
      <div className="container-x pb-24">
        <div className="max-w-3xl">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-mist" />}>
            <Body pageKey={p.key} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Body({ pageKey }: { pageKey: keyof PolicyPages }) {
  const { policies, commerce } = await getSettings(["policies", "commerce"]);
  const text = String(policies[pageKey]).replace(/the returns window shown on product pages/g, `${commerce.returnsWindowDays} days`);
  return (
    <>
      <RichText text={text} />
      {policies.updatedOn && <p className="mt-10 text-sm text-muted">Last updated {policies.updatedOn}</p>}
    </>
  );
}
