const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatCompactNumber = (value: number) => compactNumber.format(value);

/** Relative change in percent, or null when there is nothing to compare against. */
export const percentChange = (value: number, previous: number): number | null =>
  previous === 0 ? null : ((value - previous) / previous) * 100;

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "in 3 hours", "yesterday", "just now". */
export const formatRelativeTime = (date: string | Date, now = new Date()) => {
  const seconds = (new Date(date).getTime() - now.getTime()) / 1000;
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "just now";
};

/** "Tue, Sep 16, 9:00 AM" in the given IANA time zone (e.g. the workspace's). */
export const formatDateTime = (date: string | Date, timeZone?: string) => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(date));
  }
};

/** "Sep 16" for a YYYY-MM-DD day (read as local noon, so it never shifts a day). */
export const formatShortDay = (day: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(`${day}T12:00:00`),
  );

export const getGreeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
