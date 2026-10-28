import type { SocialKey, SocialLink } from "@/lib/social";

/** Platform marks drawn as simple single-colour glyphs (currentColor). */
export function SocialIcon({ name, size = 20 }: { name: SocialKey; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;
  switch (name) {
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 22v-8.2h2.75l.42-3.2H13.5V8.56c0-.93.26-1.56 1.59-1.56h1.7V4.14A22.6 22.6 0 0 0 14.31 4C11.86 4 10.2 5.49 10.2 8.24v2.36H7.43v3.2h2.77V22h3.3Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5.2" />
          <circle cx="12" cy="12" r="4.1" />
          <circle cx="17.35" cy="6.65" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common} fill="currentColor">
          <path
            fillRule="evenodd"
            d="M22.54 7.13a2.8 2.8 0 0 0-1.97-1.98C18.83 4.68 12 4.68 12 4.68s-6.83 0-8.57.47a2.8 2.8 0 0 0-1.97 1.98A29.1 29.1 0 0 0 1 12a29.1 29.1 0 0 0 .46 4.87 2.8 2.8 0 0 0 1.97 1.98c1.74.47 8.57.47 8.57.47s6.83 0 8.57-.47a2.8 2.8 0 0 0 1.97-1.98A29.1 29.1 0 0 0 23 12a29.1 29.1 0 0 0-.46-4.87ZM9.8 15.1V8.9l5.7 3.1-5.7 3.1Z"
          />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.6c.27 0 .53.04.78.12V9.77a5.73 5.73 0 0 0-.78-.05 5.66 5.66 0 1 0 5.68 5.68V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.3 4.3 0 0 1-3.24-1.48Z" />
        </svg>
      );
  }
}

/**
 * Links to the store's pages. Plain https links: on phones the OS opens them in the
 * installed app; on computers they open in a new tab.
 *
 * variant "dark"  – round icon buttons for dark backgrounds (footer, menus)
 * variant "light" – round icon buttons for light backgrounds
 * variant "list"  – icon + platform + @handle rows (Visit page)
 */
export function SocialLinks({
  links,
  variant = "dark",
  storeName = "Fine Looks",
  className = "",
}: {
  links: SocialLink[];
  variant?: "dark" | "light" | "list";
  storeName?: string;
  className?: string;
}) {
  if (!links.length) return null;
  if (variant === "list") {
    return (
      <ul className={`grid gap-2 sm:grid-cols-2 ${className}`}>
        {links.map((l) => (
          <li key={l.key}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${storeName} on ${l.label} (opens in a new tab)`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition-colors hover:border-iris-300 hover:bg-mist"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-iris-600 text-white">
                <SocialIcon name={l.key} size={19} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{l.label}</span>
                <span className="block truncate text-xs text-muted">{l.handle || `Visit our ${l.label} page`}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }
  const tone =
    variant === "dark"
      ? "border-white/20 text-white hover:border-orchid-400 hover:bg-orchid-500"
      : "border-line text-ink hover:border-iris-600 hover:bg-iris-600 hover:text-white";
  return (
    <ul className={`flex flex-wrap gap-2.5 ${className}`}>
      {links.map((l) => (
        <li key={l.key}>
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${storeName} on ${l.label} (opens in a new tab)`}
            title={l.handle ? `${l.label} · ${l.handle}` : l.label}
            className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${tone}`}
          >
            <SocialIcon name={l.key} size={19} />
          </a>
        </li>
      ))}
    </ul>
  );
}
