/**
 * Calendar maths in the workspace's time zone.
 *
 * The API stores and returns absolute instants (UTC). Everything a person sees —
 * which day a post sits on, what time it shows — is that instant rendered in the
 * workspace time zone, so the calendar looks the same for every teammate.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const getFormatter = (timeZone: string) => {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = partsFormatter(timeZone);
  formatterCache.set(timeZone, formatter);
  return formatter;
};

/** The wall-clock reading of an instant in a time zone. */
export const zonedParts = (date: Date, timeZone: string): ZonedParts & { second: number } => {
  const parts = getFormatter(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Midnight can format as hour 24 in some locales' hourCycle.
  const hour = value("hour") % 24;
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour,
    minute: value("minute"),
    second: value("second"),
  };
};

/** How far the zone is from UTC at that instant, in milliseconds. */
const offsetAt = (date: Date, timeZone: string) => {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
};

/**
 * The instant at which the zone's clock reads these parts. Resolved twice so
 * daylight-saving changes land on the right side of the shift.
 */
export const instantFromZoned = (parts: ZonedParts, timeZone: string): Date => {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const firstGuess = naive - offsetAt(new Date(naive), timeZone);
  return new Date(naive - offsetAt(new Date(firstGuess), timeZone));
};

/** "2026-09-20" for the day an instant falls on in the zone. */
export const dayKey = (date: Date, timeZone: string) => {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/** "09:30" for an instant in the zone. */
export const timeKey = (date: Date, timeZone: string) => {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const parseDayKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
};

/** Combines a "2026-09-20" day and a "09:30" time in the zone into an instant. */
export const instantFromDayAndTime = (dayKeyValue: string, time: string, timeZone: string) => {
  const { year, month, day } = parseDayKey(dayKeyValue);
  const [hour, minute] = time.split(":").map(Number);
  return instantFromZoned({ year, month, day, hour: hour || 0, minute: minute || 0 }, timeZone);
};

/** Noon avoids daylight-saving edges when a day is used as a reference point. */
export const middayInstant = (dayKeyValue: string, timeZone: string) =>
  instantFromDayAndTime(dayKeyValue, "12:00", timeZone);

export const todayKey = (timeZone: string, now = new Date()) => dayKey(now, timeZone);

export const addDaysToKey = (key: string, days: number) => {
  const { year, month, day } = parseDayKey(key);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
};

export const addMonthsToKey = (key: string, months: number) => {
  const { year, month, day } = parseDayKey(key);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
};

/** Monday-first week start for a day key. */
export const startOfWeekKey = (key: string) => {
  const { year, month, day } = parseDayKey(key);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = (date.getUTCDay() + 6) % 7;
  return addDaysToKey(key, -weekday);
};

export const startOfMonthKey = (key: string) => `${key.slice(0, 7)}-01`;

export const daysInMonth = (key: string) => {
  const { year, month } = parseDayKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

export const isSameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

/** The 6×7 grid of day keys covering a month, Monday first. */
export const monthGridKeys = (monthAnchor: string) => {
  const start = startOfWeekKey(startOfMonthKey(monthAnchor));
  return Array.from({ length: 42 }, (_, index) => addDaysToKey(start, index));
};

export const weekKeys = (anchor: string) => {
  const start = startOfWeekKey(anchor);
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(start, index));
};

/** Formats a day key like "20 Sep" or "Saturday, 20 September". */
export const formatDayKey = (
  key: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) => {
  const { year, month, day } = parseDayKey(key);
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
};

export const formatMonthTitle = (key: string) =>
  formatDayKey(key, { month: "long", year: "numeric" });

/** Formats an instant's time in the workspace zone, e.g. "09:30". */
export const formatTimeInZone = (date: string | Date, timeZone: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(date),
  );

/** The zone's current offset, written like "GMT+2", for labelling the calendar. */
export const zoneLabel = (timeZone: string, now = new Date()) => {
  const name = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(now)
    .find((part) => part.type === "timeZoneName")?.value;
  return name ?? timeZone;
};

export const WEEKDAY_LABELS = (() => {
  // 2024-01-01 was a Monday, so this yields Monday-first short names.
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
})();
