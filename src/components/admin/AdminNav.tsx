"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Boxes,
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  Menu,
  Plug,
  ScrollText,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  UserCog,
  X,
  ExternalLink,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

const ICONS = {
  dashboard: LayoutDashboard,
  orders: ShoppingBag,
  products: ClipboardList,
  categories: FolderTree,
  inventory: Boxes,
  customers: Users,
  discounts: Tag,
  integrations: Plug,
  alerts: Bell,
  staff: UserCog,
  settings: Settings,
  audit: ScrollText,
};

export function AdminNav({ items, user, children }: { items: NavItem[]; user: { name: string; role: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const nav = (
    <nav aria-label="Admin" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white"
            }`}
          >
            <Icon size={18} aria-hidden />
            <span className="flex-1">{it.label}</span>
            {it.badge ? (
              <span className="rounded-full bg-orchid-500 px-2 py-0.5 text-[0.65rem] font-bold text-white">{it.badge}</span>
            ) : null}
          </Link>
        );
      })}
      <a href="/" target="_blank" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/50 hover:text-white">
        <ExternalLink size={18} aria-hidden /> View store
      </a>
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
        <Image src="/brand/emblem.png" alt="" width={32} height={32} />
      </span>
      <span>
        <span className="block text-xl leading-none text-orchid-200" style={{ fontFamily: "var(--font-script)" }}>
          Fine Looks
        </span>
        <span className="text-[0.6rem] font-bold tracking-[0.25em] text-iris-200 uppercase">Dashboard</span>
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f5fc] lg:grid lg:grid-cols-[15.5rem_1fr]">
      <div className="hidden bg-ink lg:block">
      <aside className="sticky top-0 flex h-screen flex-col">
        {brand}
        {nav}
        <div className="border-t border-white/10 px-5 py-4 text-xs text-white/50">
          <p className="font-semibold text-white/80">{user.name}</p>
          <p className="capitalize">{user.role}</p>
        </div>
      </aside>
      </div>

      <div className="flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        {brand}
        <button onClick={() => setOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-white">
          <Menu size={22} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button onClick={() => setOpen(false)} aria-label="Close navigation" className="p-2 text-white">
                <X size={22} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
