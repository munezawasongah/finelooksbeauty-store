import { hoursFor, isSummerHours, openStatus, to12h, WEEK, type DayHours } from "@/lib/hours";

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

/** Weekly table, Sunday first, today highlighted, with the seasonal Friday note. */
export function HoursTable({ hours, tone = "light" }: { hours: DayHours[]; tone?: "light" | "dark" }) {
  if (!hours.some((h) => h.open && h.close)) {
    return <p className={tone === "dark" ? "text-white/80" : "text-ink-soft"}>Call the store for today&apos;s hours.</p>;
  }
  const week = hoursFor(hours);
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long" }).format(new Date());
  const summer = isSummerHours();
  const seasonal = hours.filter((h) => h.summerClose && h.open && h.close && h.summerClose !== h.close);
  const muted = tone === "dark" ? "text-white/70" : "text-ink-soft";
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {WEEK.map((day) => {
          const d = week.find((w) => w.day === day)!;
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`contents ${isToday ? (tone === "dark" ? "font-bold text-white" : "font-bold text-ink") : ""}`}
            >
              <dt className={isToday ? "" : "font-semibold"}>
                {day}
                {isToday && (
                  <span className={`ml-2 rounded-full px-1.5 py-px text-[0.6rem] tracking-wide uppercase ${tone === "dark" ? "bg-white/15" : "bg-iris-50 text-iris-700"}`}>
                    Today
                  </span>
                )}
              </dt>
              <dd className={isToday ? "" : muted}>
                {d.open && d.close ? `${to12h(d.open)} – ${to12h(d.close)}` : "Closed"}
                {d.seasonal && <sup className="ml-0.5">*</sup>}
              </dd>
            </div>
          );
        })}
      </dl>
      {seasonal.length > 0 && (
        <p className={`mt-3 text-xs ${muted}`}>
          *{" "}
          {seasonal
            .map((h) => `${h.day}s: ${to12h(h.open)} – ${to12h(h.close)} in winter, until ${to12h(h.summerClose)} in summer`)
            .join(". ")}
          . {summer ? "Summer hours are on now." : "Winter hours are on now."}
        </p>
      )}
    </div>
  );
}
