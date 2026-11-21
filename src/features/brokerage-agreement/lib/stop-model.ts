import type {
  BrokerageAgreementDetail,
  BrokerageAgreementSuspension,
  BrokerageAgreementTermination,
  StopAction,
  TerminationType,
} from "../types";

import { calendarDateText, vietnamTimeText } from "./date-text";
import { channelText, introducedText, suspensionReasonText } from "./stop-text";
import type { Phrase } from "./version-terms-model";

/** The stops the viewer may take now (a hint from the server, which decides): one button each, the types in order. */
export type StopActions = { suspend: boolean; release: boolean; cancel: boolean; terminateTypes: TerminationType[] };

/** One state line, and its note line when the record holds a note that is not blank. Private values (BR-17). */
export type StopLine = { phrase: Phrase; note: string | null };

/**
 * The stop section of the staff page (brokerage-agreement E05-S8, spec section 6, S8-D11): its state lines (the end,
 * then each suspension record, newest first), whether older records exist ("Earlier suspensions are in the history."),
 * and the viewer's buttons.
 */
export type StopModel = { lines: StopLine[]; earlier: boolean; actions: StopActions };

const present = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/** A note as the page shows it: none when absent, empty or blank (a blank note is stored as null, S8-D5, S8-D6). */
const noteOf = (note: string | null | undefined): string | null => (present(note) ? note : null);

/** A free text that ends a sentence of the page, which adds its own full stop: one final full stop of the text dropped. */
const sentenceEnd = (text: string): string => text.trimEnd().replace(/\.$/, "");

/** The termination types of the termination actions, in the order of the answer's actions (S8-D11). */
const TERMINATION_ACTIONS: readonly (readonly [StopAction, TerminationType])[] = [
  ["TERMINATE_OWNER_WITHDREW", "OWNER_WITHDREW"],
  ["TERMINATE_UNIT_LET", "UNIT_LET"],
  ["TERMINATE_SUNVIBE", "SUNVIBE_TERMINATED"],
];

function actionsOf(codes: readonly string[]): StopActions {
  const has = (action: StopAction) => codes.includes(action);
  return {
    suspend: has("SUSPEND"),
    release: has("RELEASE_SUSPENSION"),
    cancel: has("CANCEL"),
    terminateTypes: TERMINATION_ACTIONS.filter(([action]) => has(action)).map(([, type]) => type),
  };
}

const hasAction = (actions: StopActions) => actions.suspend || actions.release || actions.cancel || actions.terminateTypes.length > 0;

const endedOn = (time: string): StopLine => ({ phrase: { key: "stop.endedOn", values: { time: vietnamTimeText(time) } }, note: null });

/**
 * The termination line (S8-D5): the owner withdrew, told by which channel on which date; the unit is let, reported on
 * which date, and whether Sunvibe introduced the tenant; or Sunvibe's decision with its note. The first two carry the
 * note on a line of its own. A type this UI does not know, or a value the answer leaves out, reads the plain ended line,
 * never a text with an empty value; without any time, no line.
 */
function terminationLine(termination: BrokerageAgreementTermination, endedAt: string | null | undefined): StopLine | null {
  const time = present(termination.terminatedAt) ? termination.terminatedAt : present(endedAt) ? endedAt : null;
  if (time === null) return null;
  const at = vietnamTimeText(time);
  const { type, reportedOn, channel, introducedBySunvibe, note } = termination;
  if (type === "OWNER_WITHDREW" && present(reportedOn) && present(channel)) {
    return {
      phrase: { key: "stop.ownerWithdrew", values: { time: at, channel: { key: channelText(channel) }, date: calendarDateText(reportedOn) } },
      note: noteOf(note),
    };
  }
  if (type === "UNIT_LET" && present(reportedOn) && present(introducedBySunvibe)) {
    return {
      phrase: {
        key: "stop.unitLet",
        values: { time: at, date: calendarDateText(reportedOn), introduced: { key: introducedText(introducedBySunvibe) } },
      },
      note: noteOf(note),
    };
  }
  if (type === "SUNVIBE_TERMINATED" && present(note)) {
    return { phrase: { key: "stop.sunvibe", values: { time: at, note: sentenceEnd(note) } }, note: null };
  }
  return endedOn(time);
}

/**
 * The end date an expired agreement names (E05S8-P12): the end date of its EFFECTIVE version with the highest number,
 * the version that counts; null without one, so no line.
 */
function expiryDate(detail: BrokerageAgreementDetail): string | null {
  const counting = (detail.versions ?? [])
    .filter((version) => version.status === "EFFECTIVE" && present(version.endDate))
    .reduce<{ versionNo: number; endDate: string } | null>((latest, version) => {
      const versionNo = version.versionNo ?? 0;
      return latest === null || versionNo > latest.versionNo ? { versionNo, endDate: version.endDate ?? "" } : latest;
    }, null);
  return counting?.endDate ?? null;
}

/** How the agreement ended: terminated, expired or cancelled; null while it has not ended or when no line can be read. */
function endLine(detail: BrokerageAgreementDetail): StopLine | null {
  const { status, endedAt, termination } = detail;
  if (termination !== null && termination !== undefined) return terminationLine(termination, endedAt);
  if (status === "EXPIRED") {
    const date = expiryDate(detail);
    return date === null ? null : { phrase: { key: "stop.expired", values: { date: calendarDateText(date) } }, note: null };
  }
  if (status === "CANCELLED" && present(endedAt)) {
    return { phrase: { key: "stop.cancelled", values: { time: vietnamTimeText(endedAt) } }, note: null };
  }
  if (status === "TERMINATED" && present(endedAt)) return endedOn(endedAt);
  return null;
}

/** The agreement states in which an open suspension record stayed open because the agreement ended (S8-D6). */
const ENDED_WHILE_SUSPENDED: ReadonlySet<string> = new Set(["TERMINATED", "EXPIRED"]);

/**
 * The line of one suspension record (S8-D6's rule of the records): a closed record from its time to its release, with
 * the release reason; an open record of an agreement that ended suspended until the agreement ended (nothing was
 * lifted); any other open record since its time. A record without its time is not shown.
 */
function suspensionLine(record: BrokerageAgreementSuspension, status: string | undefined): StopLine | null {
  if (!present(record.suspendedAt)) return null;
  const time = vietnamTimeText(record.suspendedAt);
  const reason: Phrase = { key: suspensionReasonText(record.reasonType) };
  const note = noteOf(record.note);
  if (present(record.releasedAt)) {
    const to = vietnamTimeText(record.releasedAt);
    return present(record.releaseReason)
      ? { phrase: { key: "stop.suspendedFromTo", values: { from: time, to, reason, releaseReason: sentenceEnd(record.releaseReason) } }, note }
      : { phrase: { key: "stop.suspendedFromToNoReason", values: { from: time, to, reason } }, note };
  }
  if (status !== undefined && ENDED_WHILE_SUSPENDED.has(status)) {
    return { phrase: { key: "stop.suspendedUntilEnd", values: { time, reason } }, note };
  }
  return { phrase: { key: "stop.suspendedSince", values: { time, reason } }, note };
}

/**
 * Turns the detail into the stop section's model (brokerage-agreement E05-S8, spec section 6, S8-D11), or null when the
 * answer holds no known action, no end and no suspension record, so the page shows no section and its model no key.
 * The page shows what the server answers and compares no clock (S5-D19 (5)): an absent `viewerStopActions` reads as no
 * action, an absent `suspensions` as none, an absent `moreSuspensions` as false; an action code this UI does not know is
 * ignored. Times read in Vietnam time, dates as calendar dates.
 */
export function stopModel(detail: BrokerageAgreementDetail): StopModel | null {
  const actions = actionsOf(detail.viewerStopActions ?? []);
  const suspensions = detail.suspensions ?? [];
  const ended = present(detail.endedAt) || (detail.termination !== null && detail.termination !== undefined);
  if (!hasAction(actions) && !ended && suspensions.length === 0) return null;
  const end = endLine(detail);
  const records = suspensions
    .map((record) => suspensionLine(record, detail.status))
    .filter((line): line is StopLine => line !== null);
  return {
    lines: end === null ? records : [end, ...records],
    earlier: detail.moreSuspensions === true,
    actions,
  };
}
