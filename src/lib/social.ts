/**
 * The store's social media pages. Staff can paste a full link or just the @handle in
 * Settings; it is stored as the platform's canonical https URL. Normal https links are
 * what phones hand over to the installed Facebook / Instagram / YouTube / TikTok app,
 * so a tap opens the page straight in the app (or the website when the app isn't installed).
 */

export type SocialKey = "facebook" | "instagram" | "youtube" | "tiktok";

type Platform = {
  key: SocialKey;
  label: string;
  hosts: string[];
  /** Canonical page URL for a bare handle. */
  fromHandle: (handle: string) => string;
  example: string;
};

export const SOCIAL_PLATFORMS: Platform[] = [
  {
    key: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me"],
    fromHandle: (h) => `https://www.facebook.com/${h}`,
    example: "https://www.facebook.com/finelookshairandbeauty",
  },
  {
    key: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    fromHandle: (h) => `https://www.instagram.com/${h}/`,
    example: "@finelookshairandbeauty",
  },
  {
    key: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    fromHandle: (h) => `https://www.youtube.com/@${h}`,
    example: "@finelookshairandbeauty",
  },
  {
    key: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    fromHandle: (h) => `https://www.tiktok.com/@${h}`,
    example: "@finelookshairandbeauty",
  },
];

/**
 * Turn what staff typed into a clean page URL for that platform.
 * Accepts "@name", "name", "instagram.com/name", "https://www.instagram.com/name/?igsh=…".
 */
export function normalizeSocial(key: SocialKey, raw: string): { ok: true; url: string } | { ok: false; message: string } {
  const p = SOCIAL_PLATFORMS.find((x) => x.key === key)!;
  const input = raw.trim();
  if (!input) return { ok: true, url: "" };

  // a link has a scheme, a slash, or is a bare platform domain; anything else (even "fine.looks") is a handle
  const allHosts = SOCIAL_PLATFORMS.flatMap((x) => x.hosts);
  const bareHost = input.toLowerCase().replace(/^(www\.|m\.)/, "");
  const looksLikeUrl = /^https?:\/\//i.test(input) || input.includes("/") || allHosts.includes(bareHost);
  if (!looksLikeUrl) {
    const handle = input.replace(/^@+/, "");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(handle)) {
      return { ok: false, message: `${p.label}: enter the page link or the @handle, for example ${p.example}.` };
    }
    return { ok: true, url: p.fromHandle(handle) };
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, message: `${p.label}: that link doesn't look right. Copy it from the browser's address bar.` };
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|web\.|mobile\.)/, "");
  if (!p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, message: `${p.label}: the link must be a ${p.hosts[0]} address.` };
  }
  // drop tracking/share parameters; Facebook keeps ?id= for numeric profile pages
  const keep = new URLSearchParams();
  if (key === "facebook" && url.searchParams.get("id")) keep.set("id", url.searchParams.get("id")!);
  const path = url.pathname.replace(/\/{2,}/g, "/");
  if (path === "/" && !keep.toString()) {
    return { ok: false, message: `${p.label}: that's the ${p.label} home page. Open the store's own page and copy its link.` };
  }
  const canonicalHost = key === "youtube" && host === "youtu.be" ? "youtu.be" : `www.${p.hosts[0]}`;
  const q = keep.toString();
  return { ok: true, url: `https://${canonicalHost}${path}${q ? `?${q}` : ""}` };
}

/** The handle to show next to the icon, e.g. "@finelooks". */
export function socialHandle(url: string) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean);
    // numeric Facebook profiles and YouTube channel IDs have no readable handle
    if (!seg.length || seg[0] === "profile.php" || seg[0] === "channel") return "";
    const name = seg[0] === "c" || seg[0] === "user" || seg[0] === "pages" ? seg[1] ?? "" : seg[0];
    if (!name) return "";
    return name.startsWith("@") ? name : `@${name}`;
  } catch {
    return "";
  }
}

export type SocialLink = { key: SocialKey; label: string; href: string; handle: string };

export function socialLinks(store: Partial<Record<SocialKey, string>>): SocialLink[] {
  return SOCIAL_PLATFORMS.filter((p) => store[p.key]).map((p) => ({
    key: p.key,
    label: p.label,
    href: store[p.key]!,
    handle: socialHandle(store[p.key]!),
  }));
}

/** Where an icon goes before the store's page link has been entered: a search for the store on that platform. */
const SEARCH: Record<SocialKey, (q: string) => string> = {
  facebook: (q) => `https://www.facebook.com/search/pages/?q=${q}`,
  instagram: (q) => `https://www.instagram.com/explore/search/keyword/?q=${q}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${q}`,
  tiktok: (q) => `https://www.tiktok.com/search/user?q=${q}`,
};

/** All four platforms, always: the store's page when set, otherwise a search for the store. */
export function socialLinksAll(store: Partial<Record<SocialKey, string>> & { legalName?: string; name?: string }): SocialLink[] {
  const q = encodeURIComponent(store.legalName || store.name || "Fine Looks Hair and Beauty Store");
  return SOCIAL_PLATFORMS.map((p) => {
    const url = store[p.key];
    return url
      ? { key: p.key, label: p.label, href: url, handle: socialHandle(url) }
      : { key: p.key, label: p.label, href: SEARCH[p.key](q), handle: "" };
  });
}
