/**
 * Wall-clock arithmetic in IANA time zones without a date library. Days are
 * `YYYY-MM-DD` strings and times `HH:mm`, both on the workspace's own clock.
 */

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string) => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

export interface LocalParts {
  day: string;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

const rawParts = (date: Date, timeZone: string) => {
  const parts = formatterFor(timeZone).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: Math.max(0, WEEKDAY_NAMES.indexOf(value("weekday"))),
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

export const localParts = (date: Date, timeZone: string): LocalParts => {
  const parts = rawParts(date, timeZone);
  return {
    day: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    weekday: parts.weekday,
    hour: parts.hour,
    minute: parts.minute,
  };
};

/** How far the zone's clock is ahead of UTC at that instant. */
const offsetMs = (date: Date, timeZone: string) => {
  const parts = rawParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** The instant a wall-clock day and time happen in a zone. Times in a DST gap move forward. */
export const zonedTimeToUtc = (day: string, time: string, timeZone: string): Date => {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  const first = offsetMs(new Date(guess), timeZone);
  let instant = guess - first;
  const second = offsetMs(new Date(instant), timeZone);
  if (second !== first) instant = guess - second;
  return new Date(instant);
};

export const addDays = (day: string, days: number): string => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
};

/** 0 = Sunday, for a calendar day (independent of any zone). */
export const weekdayOf = (day: string): number => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
};

/** The Monday on or before a day. */
export const mondayOf = (day: string): string => addDays(day, -((weekdayOf(day) + 6) % 7));

export const isValidTimeZone = (timeZone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/** "Thu, Sep 17, 09:00 (Europe/London)", for audit messages people read. */
export const formatInZone = (date: Date, timeZone: string) => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${formatted} (${timeZone})`;
};
