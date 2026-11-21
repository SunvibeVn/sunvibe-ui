import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementOwnerItem, BrokerageAgreementVersion } from "../types";

import { ownerAgreementsModel } from "./owner-agreements-model";
import { phraseText, type Translate } from "./version-terms-model";

const t = createTranslator({ locale: "en", messages: en, namespace: "BrokerageAgreement" }) as unknown as Translate;

const VERSION: BrokerageAgreementVersion = {
  versionNo: 2,
  status: "EFFECTIVE",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  sentAt: "2026-11-17T03:15:00Z",
  answerBy: "2026-11-24T03:15:00Z",
  ownerAnsweredAt: "2026-11-18T01:00:00Z",
  activateBy: "2026-12-02T01:00:00Z",
};

const ITEM: BrokerageAgreementOwnerItem = {
  agreementId: "A1",
  status: "ACTIVE",
  transactionType: "LONG_TERM_RENT",
  unitCode: "P101",
  versions: [VERSION],
  statement: null,
};

/** The state text of the one version of an item in `status`. */
function stateText(status: BrokerageAgreementOwnerItem["status"], version: BrokerageAgreementVersion): string {
  const model = ownerAgreementsModel({ ok: true, status: 200, replayed: false, data: { items: [{ ...ITEM, status, versions: [version] }] } });
  if (model.kind !== "list") throw new Error(`expected a list, got ${model.kind}`);
  const state = model.items[0]?.versions[0]?.state;
  if (state === undefined) throw new Error("no version");
  return phraseText(t, state);
}

describe("ownerAgreementsModel, suspended and ended agreements (brokerage-agreement E05-S8, S8-D16, UF-5)", () => {
  it("ownerAgreementsModel_suspendedOrEnded_phrasesByItemState: a paused, expired or ended agreement reads its phrase by the item's state, never a staff reason", () => {
    expect(stateText("SUSPENDED", { ...VERSION, status: "ACTIVATED" })).toBe("Sunvibe has paused advertising of this unit.");
    expect(stateText("SUSPENDED", VERSION)).toBe("Sunvibe has paused advertising of this unit.");
    expect(stateText("EXPIRED", VERSION)).toBe("Ended on 31 Dec 2027.");
    expect(stateText("TERMINATED", VERSION)).toBe("Ended.");
    expect(stateText("TERMINATED", { ...VERSION, status: "CANCELLED" })).toBe("Ended.");
    expect(stateText("EXPIRED", { ...VERSION, status: "CANCELLED" })).toBe("Ended.");
    // An expired version without its end date: no empty date, the plain ended text.
    expect(stateText("EXPIRED", { ...VERSION, endDate: "" })).toBe("Ended.");
    // Every other pair keeps today's phrase.
    expect(stateText("ACTIVE", VERSION)).toBe("In effect until 31 Dec 2027.");
    expect(stateText("ACTIVE", { ...VERSION, status: "ACTIVATED" })).toBe("Signed and activated. It takes effect on 1 Jan 2027.");
    expect(stateText("SUSPENDED", { ...VERSION, status: "LAPSED" })).toBe("Sunvibe did not activate it in time.");
    expect(stateText("TERMINATED", { ...VERSION, status: "OWNER_REJECTED" })).toBe("You declined it on 2026-11-18 08:00");
    expect(stateText(undefined, VERSION)).toBe("In effect until 31 Dec 2027.");
  });

  it("ownerAgreementsModel_cancelledAgreement_keepsWithdrawn: a cancelled version of a cancelled agreement still reads Withdrawn by Sunvibe", () => {
    expect(stateText("CANCELLED", { ...VERSION, status: "CANCELLED" })).toBe("Withdrawn by Sunvibe");
    expect(stateText("DRAFTING", { ...VERSION, status: "CANCELLED" })).toBe("Withdrawn by Sunvibe");
    expect(stateText(undefined, { ...VERSION, status: "CANCELLED" })).toBe("Withdrawn by Sunvibe");
  });
});
