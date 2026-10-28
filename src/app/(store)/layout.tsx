import { Suspense } from "react";
import { HeaderClient } from "@/components/store/HeaderClient";
import { Footer } from "@/components/store/Footer";
import { HeaderStatic } from "@/components/store/HeaderStatic";
import { listCategories } from "@/server/catalog";
import { cartCount } from "@/server/cart";
import { getCustomer } from "@/server/auth/session";
import { DEFAULT_COMMERCE, getSettings } from "@/server/settings";

async function Announcement() {
  const { commerce } = await getSettings(["commerce"]);
  return <AnnouncementBar text={commerce.announcement} />;
}

function AnnouncementBar({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="bg-ink text-white">
      <p className="container-x py-2.5 text-center text-[0.72rem] font-semibold tracking-[0.08em] sm:text-xs">{text}</p>
    </div>
  );
}

async function Header() {
  const [cats, count, customer] = await Promise.all([listCategories(), cartCount(), getCustomer()]);
  const top = cats.filter((c) => !c.parentId).map((c) => ({ slug: c.slug, name: c.name }));
  return <HeaderClient categories={top} cartCount={count} signedIn={Boolean(customer)} />;
}

async function SiteFooter() {
  const [{ store }, cats] = await Promise.all([getSettings(["store"]), listCategories()]);
  return <Footer store={store} categories={cats.filter((c) => !c.parentId)} year={new Date().getFullYear()} />;
}

export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Suspense fallback={<AnnouncementBar text={DEFAULT_COMMERCE.announcement} />}>
        <Announcement />
      </Suspense>
      <Suspense fallback={<HeaderStatic />}>
        <Header />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Suspense fallback={<footer className="mt-auto min-h-[36rem] bg-ink" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
