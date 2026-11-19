import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail, BrokerageAgreementSuspension, BrokerageAgreementVersion } from "../types";

import { type StopModel, stopModel } from "./stop-model";
import { phraseText, type Translate } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

const EFFECTIVE: BrokerageAgreementVersion = { versionNo: 2, status: "EFFECTIVE", startDate: "2027-01-01", endDate: "2027-12-31" };

const DETAIL: BrokerageAgreementDetail = {
  agreementId: "A1",
  status: "ACTIVE",
  transactionType: "LONG_TERM_RENT",
  dataVersion: 9,
  versions: [{ versionNo: 1, status: "LAPSED", startDate: "2026-12-01", endDate: "2027-11-30" }, EFFECTIVE],
};

const OPEN: BrokerageAgreementSuspension = {
  reasonType: "COMPLAINT",
  note: "Tenant reported a different price.",
  suspendedAt: "2027-03-01T03:00:00Z",
  releasedAt: null,
  releaseReason: null,
};

const CLOSED: BrokerageAgreementSuspension = {
  reasonType: "NEEDS_CHECK",
  note: null,
  suspendedAt: "2027-02-01T03:00:00Z",
  releasedAt: "2027-02-03T09:30:00Z",
  releaseReason: "The price was checked with the owner.",
};

function modelOf(detail: BrokerageAgreementDetail): StopModel {
  const model = stopModel(detail);
  if (model === null) throw new Error("expected a stop model");
  return model;
}

/** Each line as the reader sees it: its text, then its note line when it has one. */
const textOf = (model: StopModel) =>
  model.lines.flatMap((line) => [phraseText(t, line.phrase), ...(line.note === null ? [] : [t("stop.note", { note: line.note })])]);

const NO_ACTIONS = { suspend: false, release: false, cancel: false, terminateTypes: [] };

describe("stopModel (brokerage-agreement E05-S8, spec section 6, S8-D6, S8-D11, UF-1)", () => {
  it("stopModel_noStopData_null: an answer with no action, no end and no suspension has no stop model", () => {
    expect(stopModel(DETAIL)).toBeNull();
    expect(
      stopModel({ ...DETAIL, viewerStopActions: [], endedAt: null, termination: null, suspensions: [], moreSuspensions: false }),
    ).toBeNull();
    // A code this UI does not know is ignored, so it alone gives no model.
    expect(stopModel({ ...DETAIL, viewerStopActions: ["SOMETHING_NEW" as never] })).toBeNull();
  });

  it("stopModel_actions_fromViewerStopActions: the buttons are exactly the actions the answer gives, the termination types in their order", () => {
    expect(modelOf({ ...DETAIL, viewerStopActions: ["SUSPEND", "TERMINATE_OWNER_WITHDREW", "TERMINATE_SUNVIBE"] }).actions).toEqual({
      suspend: true,
      release: false,
      cancel: false,
      terminateTypes: ["OWNER_WITHDREW", "SUNVIBE_TERMINATED"],
    });
    expect(
      modelOf({
        ...DETAIL,
        status: "DRAFTING",
        viewerStopActions: ["CANCEL", "TERMINATE_OWNER_WITHDREW", "TERMINATE_UNIT_LET", "SOMETHING_NEW" as never],
      }),
    ).toEqual({
      lines: [],
      earlier: false,
      actions: { suspend: false, release: false, cancel: true, terminateTypes: ["OWNER_WITHDREW", "UNIT_LET"] },
    });
    expect(modelOf({ ...DETAIL, status: "SUSPENDED", viewerStopActions: ["RELEASE_SUSPENSION"], suspensions: [OPEN] }).actions).toEqual({
      ...NO_ACTIONS,
      release: true,
    });
    // An ended agreement: no action.
    expect(modelOf({ ...DETAIL, status: "CANCELLED", endedAt: "2026-12-01T03:00:00Z" }).actions).toEqual(NO_ACTIONS);
  });

  it("stopModel_suspensionRecords_linesByStateAndRecord: the open record of a suspended agreement since its time, of an ended one until the agreement ended; each closed record from and to with the release reason; newest first, each with its note", () => {
    const suspended = modelOf({ ...DETAIL, status: "SUSPENDED", suspensions: [OPEN, CLOSED] });
    expect(textOf(suspended)).toEqual([
      "Suspended since 2027-03-01 10:00: a complaint.",
      "Note: Tenant reported a different price.",
      "Suspended 2027-02-01 10:00 to 2027-02-03 16:30: a check is needed. Lifted: The price was checked with the owner.",
    ]);

    for (const status of ["TERMINATED", "EXPIRED"] as const) {
      const ended = modelOf({ ...DETAIL, status, endedAt: "2027-12-31T17:00:00Z", suspensions: [OPEN] });
      expect(textOf(ended)).toContain("Suspended 2027-03-01 10:00 until the agreement ended: a complaint.");
    }

    // A reason type this UI does not know reads another reason; a record without its time is not shown.
    const odd = modelOf({
      ...DETAIL,
      status: "SUSPENDED",
      suspensions: [{ ...OPEN, reasonType: "SOMETHING_NEW" as never, note: null }, { ...CLOSED, suspendedAt: undefined }],
    });
    expect(textOf(odd)).toEqual(["Suspended since 2027-03-01 10:00: another reason."]);
  });

  it("stopModel_termination_linePerType: each termination type reads its line with its values, the note under the first two", () => {
    const terminated = (termination: BrokerageAgreementDetail["termination"]) =>
      textOf(modelOf({ ...DETAIL, status: "TERMINATED", endedAt: "2027-04-02T03:00:00Z", termination }));

    expect(
      terminated({ type: "OWNER_WITHDREW", reportedOn: "2027-04-01", channel: "PHONE_CALL", introducedBySunvibe: null, note: "Sold.", terminatedAt: "2027-04-02T03:00:00Z" }),
    ).toEqual(["Ended on 2027-04-02 10:00: the owner withdrew (told by a phone call on 1 Apr 2027).", "Note: Sold."]);
    expect(
      terminated({ type: "UNIT_LET", reportedOn: "2027-04-01", channel: null, introducedBySunvibe: "UNKNOWN", note: null, terminatedAt: "2027-04-02T03:00:00Z" }),
    ).toEqual(["Ended on 2027-04-02 10:00: the unit is let (reported on 1 Apr 2027; tenant introduced by Sunvibe: not known)."]);
    expect(
      terminated({ type: "UNIT_LET", reportedOn: "2027-04-01", introducedBySunvibe: "YES", note: "Lease signed.", terminatedAt: "2027-04-02T03:00:00Z" }),
    ).toEqual([
      "Ended on 2027-04-02 10:00: the unit is let (reported on 1 Apr 2027; tenant introduced by Sunvibe: yes).",
      "Note: Lease signed.",
    ]);
    expect(
      terminated({ type: "SUNVIBE_TERMINATED", reportedOn: null, note: "Repeated complaints", terminatedAt: "2027-04-02T03:00:00Z" }),
    ).toEqual(["Ended on 2027-04-02 10:00 by Sunvibe: Repeated complaints."]);
    // A note that ends with its own full stop reads one, not two.
    expect(terminated({ type: "SUNVIBE_TERMINATED", note: "Repeated complaints.", terminatedAt: "2027-04-02T03:00:00Z" })).toEqual([
      "Ended on 2027-04-02 10:00 by Sunvibe: Repeated complaints.",
    ]);
    // A type this UI does not know, or a value the answer leaves out: the plain ended line, never an empty value.
    expect(terminated({ type: "SOMETHING_NEW" as never, terminatedAt: "2027-04-02T03:00:00Z" })).toEqual(["Ended on 2027-04-02 10:00."]);
    expect(terminated({ type: "OWNER_WITHDREW", channel: "EMAIL", terminatedAt: "2027-04-02T03:00:00Z" })).toEqual([
      "Ended on 2027-04-02 10:00.",
    ]);
    // The termination's time, else the end's.
    expect(terminated({ type: "SUNVIBE_TERMINATED", note: "Fraud" })).toEqual(["Ended on 2027-04-02 10:00 by Sunvibe: Fraud."]);
  });

  it("stopModel_expiredAndCancelled_lines: an expired agreement names the end date of its EFFECTIVE version with the highest number, none without one; a cancelled one its time", () => {
    const expired = modelOf({
      ...DETAIL,
      status: "EXPIRED",
      endedAt: "2027-12-31T17:00:00Z",
      versions: [{ ...EFFECTIVE, versionNo: 1, endDate: "2027-06-30" }, { ...EFFECTIVE, versionNo: 3, endDate: "2028-01-31" }, { versionNo: 4, status: "CANCELLED", endDate: "2028-12-31" }],
    });
    expect(textOf(expired)).toEqual(["Expired at the end of 31 Jan 2028."]);
    expect(textOf(modelOf({ ...DETAIL, status: "EXPIRED", endedAt: "2027-12-31T17:00:00Z", versions: [{ versionNo: 1, status: "CANCELLED" }] }))).toEqual([]);

    expect(textOf(modelOf({ ...DETAIL, status: "CANCELLED", endedAt: "2026-12-01T03:00:00Z" }))).toEqual(["Cancelled on 2026-12-01 10:00."]);
    // Terminated with no termination record: the plain ended line.
    expect(textOf(modelOf({ ...DETAIL, status: "TERMINATED", endedAt: "2026-12-01T03:00:00Z" }))).toEqual(["Ended on 2026-12-01 10:00."]);
  });

  it("stopModel_moreSuspensions_earlierLine: older records than those shown read the earlier-suspensions line after the records", () => {
    const model = modelOf({ ...DETAIL, status: "ACTIVE", suspensions: [CLOSED], moreSuspensions: true });
    expect(model.earlier).toBe(true);
    expect(t("stop.earlier")).toBe("Earlier suspensions are in the history.");
    expect(modelOf({ ...DETAIL, suspensions: [CLOSED] }).earlier).toBe(false);
  });

  it("stopModel_blankNote_noNoteLine: a note of spaces only, empty or absent shows no note line", () => {
    for (const note of ["   ", "", null, undefined]) {
      const model = modelOf({ ...DETAIL, status: "SUSPENDED", suspensions: [{ ...OPEN, note }] });
      expect(model.lines.map((line) => line.note)).toEqual([null]);
      const terminated = modelOf({
        ...DETAIL,
        status: "TERMINATED",
        endedAt: "2027-04-02T03:00:00Z",
        termination: { type: "UNIT_LET", reportedOn: "2027-04-01", introducedBySunvibe: "NO", note, terminatedAt: "2027-04-02T03:00:00Z" },
      });
      expect(terminated.lines.map((line) => line.note)).toEqual([null]);
    }
  });
});
