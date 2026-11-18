import type { BrokerageAgreementCreateRequest } from "../types";

/** The two dates of the draft dialog: the `yyyy-mm-dd` value of an `<input type="date">`, `""` when empty. */
export type DraftForm = { startDate: string; endDate: string };
export type DraftField = "startDate" | "endDate";
export type DraftProblem = "required" | "outOfRange" | "endBeforeStart" | "tooLong";
export type DraftProblems = Partial<Record<DraftField, DraftProblem>>;

/** The technical bounds of an agreement date (brokerage-agreement BR-6, as the server checks them). */
export const EARLIEST_DATE = "2000-01-01";
export const LATEST_DATE = "2099-12-31";

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number) => String(value).padStart(width, "0");

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The latest end date of a period that starts on `startDate` (brokerage-agreement BR-6): the same day one year later,
 * clamped to that month's last day as Java's `plusMonths(12)` does, so only 29 February moves (to 28 February). It is
 * computed on the three numbers of the string, so no time zone can shift the day. Another shape is returned as it is.
 */
export function latestEndDate(startDate: string): string {
  const match = CALENDAR_DATE.exec(startDate);
  if (match === null) return startDate;
  const year = Number(match[1]) + 1;
  const month = Number(match[2]);
  const day = Math.min(Number(match[3]), daysInMonth(year, month));
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The first check a date fails on its own: empty, or not a calendar date from 2000 to 2099. */
function dateProblem(date: string): DraftProblem | undefined {
  if (date === "") return "required";
  if (!CALENDAR_DATE.test(date) || date < EARLIEST_DATE || date > LATEST_DATE) return "outOfRange";
  return undefined;
}

/**
 * The checks of the draft period that mirror the server's (brokerage-agreement BR-6, S2-D6): both dates required, from
 * 2000 to 2099; once both pass, the end is not before the start and at most 12 months after it. `yyyy-mm-dd` strings
 * compare as text. No rule about today: the dates are checked again at activation.
 */
export function draftProblems(form: DraftForm): DraftProblems {
  const problems: DraftProblems = {};
  const start = dateProblem(form.startDate);
  const end = dateProblem(form.endDate);
  if (start !== undefined) problems.startDate = start;
  if (end !== undefined) problems.endDate = end;
  if (start === undefined && end === undefined) {
    if (form.endDate < form.startDate) problems.endDate = "endBeforeStart";
    else if (form.endDate > latestEndDate(form.startDate)) problems.endDate = "tooLong";
  }
  return problems;
}

/** The draft request for one unit of the lead's basis: long-term rental is the only transaction type now (BR-1). */
export function draftBody(form: DraftForm, leadId: string, unitId: string): BrokerageAgreementCreateRequest {
  return { leadId, unitId, transactionType: "LONG_TERM_RENT", startDate: form.startDate, endDate: form.endDate };
}
