import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";

import { versionContent } from "../lib/version-terms-model";
import type { BrokerageAgreementVersion } from "../types";

import { VersionTermsPanel } from "./version-terms-panel";

/** The version of spec section 4's example. */
const FULL: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "DRAFT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  advertisingScope: "SUNVIBE_CHANNELS",
  photoConsent: true,
  exteriorPhotoConsent: false,
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: { basis: "MONTHS", months: 2, amount: null, currency: null },
    minimumTermMonths: 12,
    paymentPeriodMonths: 1,
    mandatoryFees: [
      { name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" },
      { name: "Water", basis: "PROVIDER_TARIFF", amount: null, currency: null, chargeUnit: null },
    ],
  },
};

function renderPanel(version: BrokerageAgreementVersion) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <VersionTermsPanel content={versionContent(version)} />
    </NextIntlClientProvider>,
  );
}

/** The `<dd>` beside the `<dt>` whose text is `label`. */
const valueOf = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("VersionTermsPanel (brokerage-agreement E05-S3, spec section 6, UD-2)", () => {
  it("versionTermsPanel_content_advertisingConsentAndTerms: the proposed line, the advertising statement, both consents and every term", () => {
    renderPanel(FULL);

    expect(screen.getByText("Proposed terms: not confirmed by the owner yet.")).toBeTruthy();
    expect(valueOf("Advertising")).toBe(
      "Sunvibe may advertise this unit on sunvibe.vn and by staff sending the listing link to customers, from the start date to the end date. Outside channels such as social networks, classified sites or other platforms are not included.",
    );
    expect(screen.getByText("Public photos")).toBeTruthy();
    expect(valueOf("Interior and common areas")).toBe("Yes");
    expect(valueOf("Exterior (front, entrance, street view)")).toBe("No");
    expect(screen.getByText("Rental terms")).toBeTruthy();
    expect(valueOf("Monthly rent")).toBe("8,000,000 VND per month");
    expect(valueOf("Deposit")).toBe("2 months' rent");
    expect(valueOf("Minimum term")).toBe("12 months");
    expect(valueOf("Pay every")).toBe("1 month");
    expect(screen.getByText("Electricity: 3,500 VND per kWh")).toBeTruthy();
    expect(screen.getByText("Water: provider's rate")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("versionTermsPanel_feeStates_noneNotStatedOrLines: fees read not stated, none besides the rent, or one line each", () => {
    const notStated = renderPanel({ ...FULL, terms: { ...FULL.terms, mandatoryFees: null } });
    expect(valueOf("Mandatory fees")).toBe("Not stated yet");
    notStated.unmount();

    const none = renderPanel({ ...FULL, terms: { ...FULL.terms, mandatoryFees: [] } });
    expect(valueOf("Mandatory fees")).toBe("No mandatory fee besides the rent");
    none.unmount();

    renderPanel(FULL);
    const fees = screen.getByText("Mandatory fees", { selector: "dt" }).nextElementSibling as HTMLElement;
    expect(Array.from(fees.querySelectorAll("li")).map((line) => line.textContent)).toEqual([
      "Electricity: 3,500 VND per kWh",
      "Water: provider's rate",
    ]);
  });

  it("versionTermsPanel_notDraft_noProposedLineAndNotEntered: a version past its draft has no proposed line; a missing value reads not entered", () => {
    renderPanel({ versionNo: 2, status: "AWAITING_OWNER", startDate: "2027-01-01", endDate: "2027-12-31" });

    expect(screen.queryByText("Proposed terms: not confirmed by the owner yet.")).toBeNull();
    expect(screen.queryByText("Advertising", { selector: "dt" })).toBeNull();
    expect(valueOf("Interior and common areas")).toBe("Not answered yet");
    expect(valueOf("Monthly rent")).toBe("Not entered yet");
    expect(valueOf("Mandatory fees")).toBe("Not stated yet");
  });

  it("versionTermsPanel_repeatsNoPageText: no element of the panel holds as its own text a text the page already shows", () => {
    const { container } = renderPanel(FULL);

    const own = Array.from(container.querySelectorAll("*")).map((element) => element.textContent?.trim());
    for (const pageText of ["Drafting", "Draft", "Long-term rental", "Version 1", "1 Jan 2027", "31 Dec 2027"]) {
      expect(own).not.toContain(pageText);
    }
  });
});
