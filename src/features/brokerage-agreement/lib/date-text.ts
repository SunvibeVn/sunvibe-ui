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
