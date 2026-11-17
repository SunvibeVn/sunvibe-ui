const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// UTC on both sides: the day of the string is the day shown, whatever the browser's time zone.
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * A calendar date of an agreement (`yyyy-mm-dd`, Vietnam time on the server) as day, short month and year: "1 Jan
 * 2027". Read from the three numbers of the string, so no time zone shifts the day; another shape is returned as it is.
 */
export function calendarDateText(date: string): string {
  const match = CALENDAR_DATE.exec(date);
  if (match === null) return date;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return DAY_MONTH_YEAR.format(utc);
}

/** An instant of the API (ISO 8601, UTC, up to microseconds); its fraction beyond milliseconds is dropped. */
const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?\d*(Z|[+-]\d{2}:\d{2})$/;

// Vietnam time on every browser: the owner reads the time Sunvibe's terms are set in (brokerage-agreement S5-D19 (5)).
const VIETNAM_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * An instant (an answer's deadline or time, brokerage-agreement E05-S5) as `yyyy-MM-dd HH:mm` in Vietnam time, whatever
 * the browser's time zone: "2026-11-24T17:30:00Z" reads "2026-11-25 00:30". Only formatted, never compared with the
 * browser's clock; another shape is returned as it is.
 */
export function vietnamTimeText(instant: string): string {
  const match = INSTANT.exec(instant);
  if (match === null) return instant;
  const time = new Date(`${match[1]}${match[2] ?? ""}${match[3]}`);
  if (Number.isNaN(time.getTime())) return instant;
  const parts = VIETNAM_TIME.formatToParts(time);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
