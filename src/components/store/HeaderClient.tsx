"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, Search, ShoppingBag, User, X, MapPin } from "lucide-react";
import { Logo } from "./Logo";
import { SocialLinks } from "./SocialLinks";
import type { SocialLink } from "@/lib/social";

export type NavCategory = { slug: string; name: string };

export function HeaderClient({
  categories,
  cartCount,
  signedIn,
  social = [],
  storeName,
}: {
  categories: NavCategory[];
  cartCount: number;
  signedIn: boolean;
  social?: SocialLink[];
  storeName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setSearchOpen(false);
  }

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nav = categories.slice(0, 5);

  return (
    <>
    <header
      className={`sticky top-0 z-40 border-b bg-white/90 backdrop-blur-xl transition-[box-shadow,border-color] ${
        scrolled ? "border-line shadow-[0_8px_30px_-18px_rgba(30,20,51,0.35)]" : "border-transparent"
      }`}
    >
      <div className="container-x flex h-[4.5rem] items-center gap-4 lg:h-20">
        <button
          type="button"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-mist lg:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={22} aria-hidden />
        </button>

        <div className="flex flex-1 justify-center lg:flex-none lg:justify-start">
          <Logo size="sm" />
        </div>

        <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            <li>
              <NavLink href="/shop" active={pathname === "/shop"}>
                Shop all
              </NavLink>
            </li>
            {nav.map((c) => (
              <li key={c.slug}>
                <NavLink href={`/${c.slug}`} active={pathname.startsWith(`/${c.slug}`)}>
                  {c.name}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink href="/visit" active={pathname === "/visit"}>
                Visit us
              </NavLink>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-mist"
          >
            <Search size={20} aria-hidden />
          </button>
          <Link
            href={signedIn ? "/account" : "/account/login"}
            aria-label={signedIn ? "Your account" : "Sign in"}
            className="hidden h-11 w-11 items-center justify-center rounded-full hover:bg-mist sm:flex"
          >
            <User size={20} aria-hidden />
          </Link>
          <Link
            href="/cart"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            className="relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-mist"
          >
            <ShoppingBag size={20} aria-hidden />
            {cartCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orchid-500 px-1 text-[0.65rem] font-bold text-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Search panel */}
      <div
        className={`overflow-hidden border-t border-line bg-white transition-[max-height,opacity] duration-300 ${
          searchOpen ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <form
          role="search"
          className="container-x flex items-center gap-3 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            const q = searchRef.current?.value.trim();
            if (q) router.push(`/shop?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search size={20} className="text-muted" aria-hidden />
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <input
            ref={searchRef}
            id="site-search"
            name="q"
            type="search"
            placeholder="Search wigs, bundles, edge control, SKU…"
            className="flex-1 bg-transparent py-2 text-lg outline-none placeholder:text-muted/70"
            tabIndex={searchOpen ? 0 : -1}
          />
          <button type="submit" className="btn btn-primary btn-sm" tabIndex={searchOpen ? 0 : -1}>
            Search
          </button>
        </form>
      </div>

    </header>
      {/* Mobile drawer */}
    <div
      className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Logo size="sm" />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-mist"
            tabIndex={open ? 0 : -1}
          >
            <X size={22} aria-hidden />
          </button>
        </div>
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
          <ul className="space-y-1">
            {[{ slug: "shop", name: "Shop all" }, ...categories].map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/${c.slug}`}
                  tabIndex={open ? 0 : -1}
                  className="flex items-center justify-between rounded-xl px-3 py-3 font-display text-2xl text-ink hover:bg-mist"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-8 space-y-2 border-t border-line pt-6 text-sm font-semibold">
            <Link href="/visit" tabIndex={open ? 0 : -1} className="flex items-center gap-2 py-2 text-ink-soft">
              <MapPin size={16} aria-hidden /> Visit the store
            </Link>
            <Link
              href={signedIn ? "/account" : "/account/login"}
              tabIndex={open ? 0 : -1}
              className="flex items-center gap-2 py-2 text-ink-soft"
            >
              <User size={16} aria-hidden /> {signedIn ? "Your account" : "Sign in / Create account"}
            </Link>
            <Link href="/track" tabIndex={open ? 0 : -1} className="flex items-center gap-2 py-2 text-ink-soft">
              <ShoppingBag size={16} aria-hidden /> Track an order
            </Link>
          </div>
          {social.length > 0 && open && (
            <div className="mt-8 border-t border-line pt-6">
              <p className="mb-3 text-[0.7rem] font-bold tracking-[0.2em] text-iris-600 uppercase">Follow us</p>
              <SocialLinks links={social} variant="light" storeName={storeName} />
            </div>
          )}
        </nav>
      </div>
    </div>
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative rounded-full px-3.5 py-2 text-[0.88rem] font-semibold transition-colors ${
        active ? "text-iris-700" : "text-ink-soft hover:text-ink"
      }`}
    >
      {children}
      <span
        className={`absolute inset-x-3.5 -bottom-0.5 h-[2px] origin-left rounded-full bg-orchid-500 transition-transform ${
          active ? "scale-x-100" : "scale-x-0"
        }`}
      />
    </Link>
  );
}
