import type { BrokerageAgreementAdvertising } from "../types";

import { calendarDateText } from "./date-text";
import { reasonText } from "./reason-text";
import type { Phrase } from "./version-terms-model";

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/**
 * The line of one group that stops Sunvibe from advertising the unit now (brokerage-agreement US-4 AC-1, S6-D7, spec
 * section 6). The agreement's own groups read their lines: not in effect yet, not started (with the start of the
 * activated version as a calendar date, so no browser zone shifts the day), suspended, ended (with its end date when
 * known: an agreement past its end date still reads "Active" in its header until E05-S8 stores the end, S6-D20), no
 * agreement. The condition groups BASIS, PROPERTY, UNIT, OWNER, and a group this UI does not know, read E05-S1's lines.
 */
export function advertisingReasonText(group: string, answer: BrokerageAgreementAdvertising): Phrase {
  switch (group) {
    case "NOT_STARTED": {
      const startDate = answer.pendingVersion?.startDate;
      return present(startDate)
        ? { key: "advertising.reasons.NOT_STARTED", values: { date: calendarDateText(startDate) } }
        : { key: "advertising.notStartedUndated" };
    }
    case "ENDED":
      return present(answer.endDate)
        ? { key: "advertising.endedOn", values: { date: calendarDateText(answer.endDate) } }
        : { key: "advertising.reasons.ENDED" };
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
