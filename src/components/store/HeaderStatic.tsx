import Link from "next/link";
import { Menu, Moon, Search, ShoppingBag, Sun, User } from "lucide-react";
import { Logo } from "./Logo";

/** Static stand-in for the header while live data (nav, cart count) streams in. Same size, no hooks. */
export function HeaderStatic() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-white/90 backdrop-blur-xl">
      <div className="container-x flex h-[4.5rem] items-center gap-4 lg:h-20">
        <span className="-ml-2 flex h-11 w-11 items-center justify-center lg:hidden" aria-hidden>
          <Menu size={22} />
        </span>
        <div className="flex flex-1 justify-center lg:flex-none lg:justify-start">
          <Logo size="sm" />
        </div>
        <nav aria-label="Main" className="hidden flex-1 justify-center lg:flex">
          <Link href="/shop" className="rounded-full px-3.5 py-2 text-[0.88rem] font-semibold text-ink-soft">
            Shop all
          </Link>
        </nav>
        <div className="flex items-center gap-0.5 text-ink">
          <Link href="/shop" aria-label="Search" className="flex h-11 w-11 items-center justify-center">
            <Search size={20} aria-hidden />
          </Link>
          <span className="flex h-11 w-11 items-center justify-center" aria-hidden>
            <Moon size={20} className="theme-icon-moon" />
            <Sun size={20} className="theme-icon-sun" />
          </span>
          <Link href="/account" aria-label="Account" className="hidden h-11 w-11 items-center justify-center sm:flex">
            <User size={20} aria-hidden />
          </Link>
          <Link href="/cart" aria-label="Cart" className="flex h-11 w-11 items-center justify-center">
            <ShoppingBag size={20} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
