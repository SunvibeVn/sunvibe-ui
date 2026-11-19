import type { BrokerageAgreementAdvertising } from "../types";

import { calendarDateText } from "./date-text";
import { reasonText } from "./reason-text";
import type { Phrase } from "./version-terms-model";

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/** The agreement states whose period itself ended, so the ENDED line may name the period's end date (S8-D16). */
const PERIOD_ENDED_STATES: ReadonlySet<string> = new Set(["ACTIVE", "SUSPENDED", "EXPIRED"]);

/**
 * The ENDED line (brokerage-agreement S6-D20, S8-D16). Without the agreement's state (not given), today's line: the
 * period's end date when known. With it, the dated line only when the period itself ended (`ACTIVE` read past its end,
 * `SUSPENDED`, `EXPIRED`); a terminated or cancelled agreement, a row without a state and a state this UI does not know
 * read that the agreement has ended, since its period did not end then.
 */
function endedLine(answer: BrokerageAgreementAdvertising, state: string | null | undefined): Phrase {
  const dated = state === undefined || (state !== null && PERIOD_ENDED_STATES.has(state));
  return dated && present(answer.endDate)
    ? { key: "advertising.endedOn", values: { date: calendarDateText(answer.endDate) } }
    : { key: "advertising.reasons.ENDED" };
}

/**
 * The line of one group that stops Sunvibe from advertising the unit now (brokerage-agreement US-4 AC-1, S6-D7, spec
 * section 6). The agreement's own groups read their lines: not in effect yet, not started (with the start of the
 * activated version as a calendar date, so no browser zone shifts the day), suspended, ended (by the agreement's `state`
 * when given, E05-S8 S8-D16), no agreement. The condition groups BASIS, PROPERTY, UNIT, OWNER, and a group this UI does
 * not know, read E05-S1's lines.
 */
export function advertisingReasonText(group: string, answer: BrokerageAgreementAdvertising, state?: string | null): Phrase {
  switch (group) {
    case "NOT_STARTED": {
      const startDate = answer.pendingVersion?.startDate;
      return present(startDate)
        ? { key: "advertising.reasons.NOT_STARTED", values: { date: calendarDateText(startDate) } }
        : { key: "advertising.notStartedUndated" };
    }
    case "ENDED":
      return endedLine(answer, state);
    case "NO_AGREEMENT":
      return { key: "advertising.reasons.NO_AGREEMENT" };
    case "NOT_IN_EFFECT":
      return { key: "advertising.reasons.NOT_IN_EFFECT" };
    case "SUSPENDED":
      return { key: "advertising.reasons.SUSPENDED" };
    default:
      return { key: reasonText(group) };
  }
}
