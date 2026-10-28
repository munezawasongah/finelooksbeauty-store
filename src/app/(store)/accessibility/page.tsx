import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/store/PageHero";
import { RichText } from "@/components/store/RichText";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: "Accessibility",
  description: "Our commitment to an accessible shopping experience.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <>
      <PageHero eyebrow="For everyone" title="Accessibility" crumbs={[{ name: "Home", href: "/" }, { name: "Accessibility" }]} />
      <div className="container-x pb-24">
        <div className="max-w-3xl">
          <Suspense fallback={null}>
            <Body />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Body() {
  const { policies, store } = await getSettings(["policies", "store"]);
  return (
    <>
      <RichText text={policies.accessibility} />
      <p className="mt-6 text-ink-soft">
        Call <a className="font-bold text-iris-700" href={`tel:+1${store.phone.replace(/\D/g, "")}`}>{store.phone}</a> or email{" "}
        <a className="font-bold text-iris-700" href={`mailto:${store.email}`}>{store.email}</a>.
      </p>
    </>
  );
}
