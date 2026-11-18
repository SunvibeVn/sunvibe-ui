import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { advertisingModel } from "../lib/advertising-model";
import type { BrokerageAgreementAdvertising } from "../types";

import { AdvertisingPanel } from "./advertising-panel";

const a = en.BrokerageAgreement.advertising;
const OTHER = en.BrokerageAgreement.eligibility.reasons.OTHER;

function renderPanel(answer: BrokerageAgreementAdvertising) {
  const { unmount } = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AdvertisingPanel model={advertisingModel(answer)} />
    </NextIntlClientProvider>,
  );
  return { panel: screen.getByRole("region", { name: a.title }), unmount };
}

/** The panel's lines below its heading, as the reader sees them. */
const linesOf = (panel: HTMLElement) => Array.from(panel.querySelectorAll("p")).map((line) => line.textContent);

describe("AdvertisingPanel (brokerage-agreement E05-S6, S6-D7, UF-3)", () => {
  it("advertisingPanel_render_eachGroupLineAndAllowedLine: an allowed answer names its end date and photos; a refused one lists each group's line in order", () => {
    const allowed = renderPanel({
      allowed: true,
      reasonGroups: [],
      endDate: "2027-12-31",
      photoConsent: { interior: true, exterior: false },
    });
    expect(within(allowed.panel).getByRole("heading", { name: a.title })).toBeTruthy();
    expect(linesOf(allowed.panel)).toEqual([
      "Sunvibe may advertise this unit until the end of 31 Dec 2027.",
      a.photos.interior,
    ]);
    allowed.unmount();

    const refused = renderPanel({
      allowed: false,
      reasonGroups: ["NOT_STARTED", "SUSPENDED", "ENDED", "NO_AGREEMENT", "NOT_IN_EFFECT", "BASIS", "PROPERTY", "UNIT", "OWNER"],
      endDate: "2027-12-31",
      pendingVersion: { startDate: "2027-01-01", startsAt: "2026-12-31T17:00:00Z" },
    });
    expect(linesOf(refused.panel)).toEqual([
      a.notAllowed,
      "Advertising starts on 1 Jan 2027.",
      a.reasons.SUSPENDED,
      "The agreement's period ended on 31 Dec 2027.",
      a.reasons.NO_AGREEMENT,
      a.reasons.NOT_IN_EFFECT,
      en.BrokerageAgreement.eligibility.reasons.BASIS,
      en.BrokerageAgreement.eligibility.reasons.PROPERTY,
      en.BrokerageAgreement.eligibility.reasons.UNIT,
      en.BrokerageAgreement.eligibility.reasons.OWNER,
    ]);
    expect(within(refused.panel).queryByText(/^Sunvibe may advertise/)).toBeNull();
    refused.unmount();
  });

  it("advertisingPanel_unknownOrNoGroup_anotherReason: an unknown group, and an answer without allowed or not allowed with no group, show another reason", () => {
    for (const answer of [{ allowed: false, reasonGroups: ["NEW_GROUP"] }, {}, { allowed: false }, { allowed: false, reasonGroups: [] }] as BrokerageAgreementAdvertising[]) {
      const { panel, unmount } = renderPanel(answer);
      expect(linesOf(panel)).toEqual([a.notAllowed, OTHER]);
      unmount();
    }
  });
});
