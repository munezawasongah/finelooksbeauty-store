import { hoursLines, openStatus, type DayHours } from "@/lib/hours";

/** "Open now · closes 7 PM" pill. */
export function OpenNow({ hours, tone = "light" }: { hours: DayHours[]; tone?: "light" | "dark" }) {
  const s = openStatus(hours);
  if (!s) return null;
  const dot = s.open ? "bg-emerald-400" : "bg-rose-400";
  const cls =
    tone === "dark"
      ? "bg-white/12 text-white ring-1 ring-white/20"
      : s.open
        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
        : "bg-rose-50 text-rose-800 ring-1 ring-rose-200";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${cls}`}>
      <span className={`relative flex h-2 w-2`}>
        {s.open && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      {s.label}
    </span>
  );
}

/**
 * Opening hours as they read on the shop door:
 * Sunday – Thursday, Friday (Winter hours), Friday (Summer hours), Saturday.
 * Today's line is marked; the season not in force is shown softer.
 */
export function HoursTable({ hours, tone = "light" }: { hours: DayHours[]; tone?: "light" | "dark" }) {
  if (!hours.some((h) => h.open && h.close)) {
    return <p className={tone === "dark" ? "text-white/80" : "text-ink-soft"}>Call the store for today&apos;s hours.</p>;
  }
  const lines = hoursLines(hours);
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date());
  const dark = tone === "dark";
  return (
    <ul className="space-y-1.5">
      {lines.map((l) => {
        const isToday = l.covers.includes(today) && l.current;
        return (
          <li
            key={`${l.days}-${l.season ?? ""}`}
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${
              isToday ? (dark ? "font-bold text-white" : "font-bold text-ink") : !l.current ? (dark ? "text-white/55" : "text-muted") : ""
            }`}
          >
            <span className={isToday ? "" : "font-semibold"}>
              {l.days}
              {isToday && (
                <span className={`ml-2 rounded-full px-1.5 py-px align-middle text-[0.6rem] tracking-wide uppercase ${dark ? "bg-white/15" : "bg-iris-50 text-iris-700"}`}>
                  Today
                </span>
              )}
            </span>
            <span className={isToday ? "" : dark ? "text-white/80" : "text-ink-soft"}>
              {l.time}
              {l.season && <span className="ml-1 text-[0.8em]">({l.season === "winter" ? "Winter hours" : "Summer hours"})</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
