/** The school's billing timezone. Override for a different deployment locale. */
export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE ?? "America/Toronto";

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function formatParts(date: Date): Record<string, number> {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(
    formatted
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function timeZoneOffsetMs(date: Date): number {
  const parts = formatParts(date);
  const displayedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return displayedAsUtc - date.getTime();
}

/** Convert a wall-clock time in the business timezone to an absolute Date. */
export function businessDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const wallClockUtc = Date.UTC(year, month, day, hour, minute, second);
  let timestamp = wallClockUtc;
  // Re-evaluate after applying the offset so DST transitions use the correct one.
  for (let i = 0; i < 3; i++) {
    timestamp = wallClockUtc - timeZoneOffsetMs(new Date(timestamp));
  }
  return new Date(timestamp);
}

export function businessDateParts(date = new Date()): DateParts {
  const parts = formatParts(date);
  return { year: parts.year, month: parts.month - 1, day: parts.day };
}

export function businessMonthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: businessDateTime(year, month, 1),
    end: businessDateTime(year, month + 1, 1),
  };
}

export function currentBusinessMonthRange(now = new Date()): { start: Date; end: Date; year: number; month: number } {
  const { year, month } = businessDateParts(now);
  const range = businessMonthRange(year, month);
  return { ...range, year, month };
}

export function nextBusinessMonth(now = new Date()): { year: number; month: number } {
  const { year, month } = businessDateParts(now);
  const next = new Date(Date.UTC(year, month + 1, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
}

export function daysUntilNextBusinessMonth(now = new Date()): number {
  const { year, month } = nextBusinessMonth(now);
  const today = businessDateParts(now);
  const todayStart = businessDateTime(today.year, today.month, today.day);
  const nextStart = businessDateTime(year, month, 1);
  return Math.round((nextStart.getTime() - todayStart.getTime()) / 86_400_000);
}

/** Stable `YYYY-MM` key for a year/month, e.g. `2026-01`. Used for dedupe keys. */
export function monthPeriodKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Format a date in the business timezone (for emails and other readouts). */
export function formatBusinessDate(date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: BUSINESS_TIME_ZONE }).format(date);
}

/** Format a time in the business timezone (for emails and other readouts). */
export function formatBusinessTime(date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    ...(opts ?? { hour: "numeric", minute: "2-digit" }),
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

/** Human label for a year/month, e.g. `January 2026`. */
export function monthPeriodLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleString("en-US", { month: "long", year: "numeric" });
}
