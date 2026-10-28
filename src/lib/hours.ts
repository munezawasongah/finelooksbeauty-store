/**
 * Opening hours. Times are Eastern (the store is in Garner, NC). A day can carry a
 * "summer" closing time that applies while US daylight saving time is in force
 * (second Sunday of March to first Sunday of November); e.g. Fridays close at
 * 4:30 PM in winter and 7 PM in summer.
 */

export type DayHours = { day: string; open: string | null; close: string | null; summerClose?: string | null };

export const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const TZ = "America/New_York";

/** Wall-clock parts of `date` in Eastern Time. */
function eastern(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    // "GMT-4" during daylight saving time, "GMT-5" otherwise
    summer: get("timeZoneName") === "GMT-4",
  };
}

export function isSummerHours(date = new Date()) {
  return eastern(date).summer;
}

export function to12h(t: string | null | undefined, full = false) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m || full ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

function mins(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Hours that apply on `date`'s season, Sunday first. */
export function hoursFor(hours: DayHours[], date = new Date()) {
  const summer = isSummerHours(date);
  return WEEK.map((day) => {
    const h = hours.find((x) => x.day === day);
    if (!h || !h.open || !h.close) return { day, open: null, close: null, seasonal: Boolean(h?.summerClose) };
    const close = summer && h.summerClose ? h.summerClose : h.close;
    return { day, open: h.open, close, seasonal: Boolean(h.summerClose && h.summerClose !== h.close) };
  });
}

/** "Open now · closes 7 PM" / "Closed now · opens Sunday 9:30 AM". */
export function openStatus(hours: DayHours[], now = new Date()): { open: boolean; label: string } | null {
  if (!hours.some((h) => h.open && h.close)) return null;
  const week = hoursFor(hours, now);
  const e = eastern(now);
  const todayIdx = WEEK.indexOf(e.weekday as (typeof WEEK)[number]);
  const today = week[todayIdx];
  if (today.open && today.close && e.minutes >= mins(today.open) && e.minutes < mins(today.close)) {
    return { open: true, label: `Open now · closes ${to12h(today.close)}` };
  }
  for (let i = 0; i < 8; i++) {
    const d = week[(todayIdx + i) % 7];
    if (!d.open) continue;
    if (i === 0 && e.minutes >= mins(d.open)) continue;
    const when = i === 0 ? "today" : i === 1 ? "tomorrow" : d.day;
    return { open: false, label: `Closed now · opens ${when} ${to12h(d.open)}` };
  }
  return { open: false, label: "Closed now" };
}

export type HoursLine = {
  /** "Sunday – Thursday", "Friday", "Saturday" */
  days: string;
  /** Short form for tight spaces: "Sun – Thu" */
  short: string;
  /** "9:30 AM – 7:00 PM" or "Closed" */
  time: string;
  season?: "winter" | "summer";
  /** True when this line's season is the one in force today. */
  current: boolean;
  /** Weekdays covered, for highlighting today. */
  covers: string[];
};

/**
 * Hours written the way the shop door shows them, Sunday first:
 *   Sunday – Thursday   9:30 AM – 7:00 PM
 *   Friday              9:30 AM – 4:30 PM (Winter hours)
 *   Friday              9:30 AM – 7:00 PM (Summer hours)
 *   Saturday            Closed
 */
export function hoursLines(hours: DayHours[], date = new Date()): HoursLine[] {
  const summer = isSummerHours(date);
  const byDay = WEEK.map((day) => hours.find((h) => h.day === day) ?? { day, open: null, close: null });
  const key = (h: DayHours) => (h.open && h.close ? `${h.open}|${h.close}|${h.summerClose && h.summerClose !== h.close ? h.summerClose : ""}` : "closed");
  const time = (open: string, close: string) => `${to12h(open, true)} – ${to12h(close, true)}`;
  const lines: HoursLine[] = [];
  let start = 0;
  for (let i = 1; i <= byDay.length; i++) {
    if (i < byDay.length && key(byDay[i]) === key(byDay[start])) continue;
    const group = byDay.slice(start, i);
    const first = group[0];
    const days = group.length === 1 ? first.day : `${first.day} – ${group[group.length - 1].day}`;
    const short = group.length === 1 ? first.day.slice(0, 3) : `${first.day.slice(0, 3)} – ${group[group.length - 1].day.slice(0, 3)}`;
    const covers = group.map((g) => g.day);
    if (!first.open || !first.close) {
      lines.push({ days, short, time: "Closed", current: true, covers });
    } else if (first.summerClose && first.summerClose !== first.close) {
      lines.push({ days, short, time: time(first.open, first.close), season: "winter", current: !summer, covers });
      lines.push({ days, short, time: time(first.open, first.summerClose), season: "summer", current: summer, covers });
    } else {
      lines.push({ days, short, time: time(first.open, first.close), current: true, covers });
    }
    start = i;
  }
  return lines;
}
