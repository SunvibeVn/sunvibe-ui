import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementSurveyTerms } from "../types";

// The edge only: the survey reference call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getSurveyTerms: vi.fn(),
}));

import { getSurveyTerms } from "../services/agreement-api";

import { SurveyTermsPanel } from "./survey-terms-panel";

const s = en.BrokerageAgreement.survey;
const AGREEMENT_ID = "01JF000000000000000000000A";

/** The answer of the spec's example, with a minimum term. */
const PROPOSAL: BrokerageAgreementSurveyTerms = {
  terms: {
    monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" },
    deposit: null,
    minimumTermMonths: 12,
    paymentPeriodMonths: 1,
    mandatoryFees: [{ name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" }],
  },
  sources: [
    { field: "monthlyRent", source: "OWNER_STATED", date: "2026-11-10" },
    { field: "minimumTermMonths", source: null, date: "2026-11-09" },
    { field: "paymentPeriodMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
    { field: "mandatoryFees[0]", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
  ],
};
const EMPTY: BrokerageAgreementSurveyTerms = {
  terms: { monthlyRent: null, deposit: null, minimumTermMonths: null, paymentPeriodMonths: null, mandatoryFees: null },
  sources: [],
};

const answered = (data: BrokerageAgreementSurveyTerms): ApiResult<BrokerageAgreementSurveyTerms> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});
const failed = (correlationId: string): ApiResult<BrokerageAgreementSurveyTerms> => ({
  ok: false,
  kind: "http",
  status: 500,
  code: "INTERNAL_ERROR",
  fieldErrors: [],
  correlationId,
});

function renderPanel(onUse = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <SurveyTermsPanel agreementId={AGREEMENT_ID} onUse={onUse} />
    </NextIntlClientProvider>,
  );
  return onUse;
}

const panel = () => screen.getByRole("region", { name: s.title });

describe("SurveyTermsPanel (brokerage-agreement E05-S3, S3-D11 to S3-D13, UD-6)", () => {
  beforeEach(() => {
    vi.mocked(getSurveyTerms).mockReset();
  });

  it("surveyTermsPanel_values_sourceTextAndDate: loading, then each value with its source text and date", async () => {
    let answer: (result: ApiResult<BrokerageAgreementSurveyTerms>) => void = () => undefined;
    vi.mocked(getSurveyTerms).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPanel();

    expect(within(panel()).getByText(s.loading)).toBeTruthy();
    answer(answered(PROPOSAL));

    expect(await within(panel()).findByText("8,000,000 VND per month")).toBeTruthy();
    expect(within(panel()).queryByText(s.loading)).toBeNull();
    expect(within(panel()).getByText("Said by the owner")).toBeTruthy();
    expect(within(panel()).getByText("10 Nov 2026")).toBeTruthy();
    expect(within(panel()).getAllByText("Seen on site")).toHaveLength(2);
    expect(within(panel()).getByText("Source not recorded")).toBeTruthy();
    expect(within(panel()).getByText("12 months")).toBeTruthy();
    expect(within(panel()).getByText("Electricity: 3,500 VND per kWh")).toBeTruthy();
    expect(within(panel()).getByRole("button", { name: s.use })).toBeTruthy();
    expect(getSurveyTerms).toHaveBeenCalledWith(AGREEMENT_ID);
  });

  it("surveyTermsPanel_empty_noUseButton: an empty proposal says the survey holds no value, and offers nothing to use", async () => {
    vi.mocked(getSurveyTerms).mockResolvedValue(answered(EMPTY));
    renderPanel();

    expect(await within(panel()).findByText(s.empty)).toBeTruthy();
    expect(within(panel()).queryByRole("button", { name: s.use })).toBeNull();
  });

  it("surveyTermsPanel_failedRead_errorAndRetry: a failed read says so with its support code, and Try again reads again", async () => {
    vi.mocked(getSurveyTerms).mockResolvedValueOnce(failed("c-5"));
    renderPanel();

    expect(await within(panel()).findByText(s.loadFailed)).toBeTruthy();
    expect(within(panel()).getByText("Support code: c-5")).toBeTruthy();
    expect(within(panel()).queryByRole("button", { name: s.use })).toBeNull();

    vi.mocked(getSurveyTerms).mockResolvedValueOnce(answered(PROPOSAL));
    fireEvent.click(within(panel()).getByRole("button", { name: s.retry }));

    expect(await within(panel()).findByText("8,000,000 VND per month")).toBeTruthy();
    expect(within(panel()).queryByText(s.loadFailed)).toBeNull();
    expect(getSurveyTerms).toHaveBeenCalledTimes(2);
  });

  it("surveyTermsPanel_use_givesTheProposal: Use the survey values hands the proposal to the form", async () => {
    vi.mocked(getSurveyTerms).mockResolvedValue(answered(PROPOSAL));
    const onUse = renderPanel();

    fireEvent.click(await within(panel()).findByRole("button", { name: s.use }));

    await waitFor(() => expect(onUse).toHaveBeenCalledTimes(1));
    expect(onUse).toHaveBeenCalledWith(PROPOSAL);
  });
});
