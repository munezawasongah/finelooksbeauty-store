/** Shared formatting helpers (safe for client and server). U.S. conventions, Eastern Time. */

export const STORE_TZ = "America/New_York";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(cents: number | null | undefined): string {
  return usd.format((cents ?? 0) / 100);
}

export function dateET(value: Date | string | null | undefined, withTime = false): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STORE_TZ,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
  }).format(d);
}

export function formatPhoneUS(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length !== 10) return raw ?? "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function variantLabel(options: Record<string, string> | null | undefined): string {
  if (!options) return "";
  return Object.values(options).filter(Boolean).join(" / ");
}

export const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const ZIP_RE = /^\d{5}(-\d{4})?$/;

/** Convert an Eastern Time wall-clock date/time ("2026-11-27", "23:59:59") to a UTC Date, DST-aware. */
export function easternToUtc(ymd: string, hms = "00:00:00"): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hms);
  if (!m || !t) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], +(t[3] ?? 0));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (wall - guess));
}
