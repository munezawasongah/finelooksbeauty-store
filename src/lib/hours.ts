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

export function to12h(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
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

/** Compact lines for small spaces: "Sun–Thu 9:30 AM–7 PM", "Fri 9:30 AM–4:30 PM", "Sat Closed". */
export function hoursSummary(hours: DayHours[], date = new Date()) {
  const week = hoursFor(hours, date);
  const label = (d: (typeof week)[number]) => (d.open && d.close ? `${to12h(d.open)}–${to12h(d.close)}` : "Closed");
  const out: { days: string; time: string }[] = [];
  let start = 0;
  for (let i = 1; i <= week.length; i++) {
    if (i < week.length && label(week[i]) === label(week[start])) continue;
    const a = week[start].day.slice(0, 3);
    const b = week[i - 1].day.slice(0, 3);
    out.push({ days: start === i - 1 ? a : `${a}–${b}`, time: label(week[start]) });
    start = i;
  }
  return out;
}
