import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import type { StoreInfo } from "@/server/settings";
import { Logo } from "./Logo";
import { NewsletterForm } from "./NewsletterForm";

export function Footer({
  store,
  categories,
  year,
}: {
  store: StoreInfo;
  categories: { slug: string; name: string }[];
  year: number;
}) {
  const tel = store.phone.replace(/\D/g, "");

  return (
    <footer className="mt-auto bg-ink text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-iris-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 h-[28rem] w-[28rem] rounded-full bg-orchid-500/20 blur-3xl" />

        <div className="container-x relative grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-20">
          <div>
            <Logo tone="light" />
            <p className="mt-6 max-w-md font-display text-3xl leading-tight text-white sm:text-4xl">
              Beauty news, restocks and offers, <em className="accent text-orchid-300">sister to sister.</em>
            </p>
            <p className="mt-3 max-w-md text-sm text-white/65">
              One or two emails a month. Unsubscribe any time. Read our{" "}
              <Link href="/policies/privacy" className="underline underline-offset-4">
                privacy policy
              </Link>
              .
            </p>
            <div className="mt-6 max-w-md">
              <NewsletterForm />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol title="Shop">
              <FooterLink href="/shop">All products</FooterLink>
              {categories.slice(0, 6).map((c) => (
                <FooterLink key={c.slug} href={`/${c.slug}`}>
                  {c.name}
                </FooterLink>
              ))}
            </FooterCol>
            <FooterCol title="Help">
              <FooterLink href="/track">Track an order</FooterLink>
              <FooterLink href="/policies/shipping">Shipping &amp; pickup</FooterLink>
              <FooterLink href="/policies/returns">Returns</FooterLink>
              <FooterLink href="/account">Your account</FooterLink>
              <FooterLink href="/accessibility">Accessibility</FooterLink>
            </FooterCol>
            <FooterCol title="Visit">
              <li className="flex gap-2 text-sm text-white/75">
                <MapPin size={16} className="mt-0.5 shrink-0 text-orchid-300" aria-hidden />
                <span>
                  {store.streetAddress && (
                    <>
                      {store.streetAddress}
                      <br />
                    </>
                  )}
                  {store.city}, {store.state} {store.zip}
                  {store.directionsNote && (
                    <>
                      <br />
                      <span className="text-white/55">{store.directionsNote}</span>
                    </>
                  )}
                </span>
              </li>
              <li>
                <a href={`tel:+1${tel}`} className="flex items-center gap-2 text-sm text-white/75 hover:text-white">
                  <Phone size={16} className="text-orchid-300" aria-hidden /> {store.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${store.email}`}
                  className="flex items-center gap-2 break-all text-sm text-white/75 hover:text-white"
                >
                  <Mail size={16} className="shrink-0 text-orchid-300" aria-hidden /> {store.email}
                </a>
              </li>
              <FooterLink href="/visit">Hours &amp; directions</FooterLink>
            </FooterCol>
          </div>
        </div>

        <div className="container-x relative">
          <p
            aria-hidden
            className="select-none overflow-hidden whitespace-nowrap text-center font-script text-[17vw] leading-[0.9] text-white/[0.05] lg:text-[11rem]"
            style={{ fontFamily: "var(--font-script)" }}
          >
            {store.tagline}
          </p>
        </div>

        <div className="relative border-t border-white/10">
          <div className="container-x flex flex-col gap-4 py-6 text-xs text-white/55 md:flex-row md:items-center md:justify-between">
            <p>
              © {year} {store.legalName}. All rights reserved.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link href="/policies/privacy" className="hover:text-white">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/policies/terms" className="hover:text-white">
                  Terms of sale
                </Link>
              </li>
              <li>
                <Link href="/policies/shipping" className="hover:text-white">
                  Shipping
                </Link>
              </li>
              <li>
                <Link href="/policies/returns" className="hover:text-white">
                  Returns
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 font-sans text-[0.7rem] font-bold tracking-[0.2em] text-orchid-300 uppercase">{title}</h2>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-white/75 transition-colors hover:text-white">
        {children}
      </Link>
    </li>
  );
}
