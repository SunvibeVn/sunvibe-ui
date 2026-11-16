import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDraftRequest, BrokerageAgreementSurveyTerms, BrokerageAgreementVersion } from "../types";

// Edges only: the save and the survey reference calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  updateDraft: vi.fn(),
  getSurveyTerms: vi.fn(),
}));

import { getSurveyTerms, updateDraft } from "../services/agreement-api";

import { DraftEditForm } from "./draft-edit-form";

const m = en.BrokerageAgreement;
const e = m.edit;
const AGREEMENT_ID = "01JF000000000000000000000A";

/** A draft as E05-S2 created it: the period only. */
const BARE: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "DRAFT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  advertisingScope: "SUNVIBE_CHANNELS",
  photoConsent: null,
  exteriorPhotoConsent: false,
  terms: { monthlyRent: null, deposit: null, minimumTermMonths: null, paymentPeriodMonths: null, mandatoryFees: null },
};

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
    { field: "minimumTermMonths", source: "OWNER_STATED", date: "2026-11-10" },
    { field: "paymentPeriodMonths", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
    { field: "mandatoryFees[0]", source: "OBSERVED_ON_SITE", date: "2026-11-09" },
  ],
};
const EMPTY_PROPOSAL: BrokerageAgreementSurveyTerms = { terms: {}, sources: [] };

const saved: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderForm(version: BrokerageAgreementVersion = BARE) {
  const props = { onSaved: vi.fn(), onCancel: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <DraftEditForm agreementId={AGREEMENT_ID} dataVersion={4} version={version} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const fields = (label: string) => screen.getAllByLabelText(label) as HTMLInputElement[];
const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const saveButton = () => screen.getByRole("button", { name: e.save }) as HTMLButtonElement;
const cancelButton = () => screen.getByRole("button", { name: e.cancel }) as HTMLButtonElement;
const addFee = () => screen.getByRole("button", { name: e.addFee }) as HTMLButtonElement;
/** The body of the n-th save. */
const sent = (call = 0) => vi.mocked(updateDraft).mock.calls[call]?.[1] as BrokerageAgreementDraftRequest;

/** Clicks "Save the draft" once the last save has ended, and waits until this one has sent and ended too. */
async function saveOnce() {
  const before = vi.mocked(updateDraft).mock.calls.length;
  await waitFor(() => expect(saveButton().disabled).toBe(false));
  fireEvent.click(saveButton());
  await waitFor(() => expect(updateDraft).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(saveButton().disabled).toBe(false));
}

describe("DraftEditForm (brokerage-agreement E05-S3, spec section 6, UD-4 to UD-6)", () => {
  beforeEach(() => {
    vi.mocked(updateDraft).mockReset();
    vi.mocked(getSurveyTerms).mockReset();
    vi.mocked(getSurveyTerms).mockResolvedValue({ ok: true, status: 200, replayed: false, data: EMPTY_PROPOSAL });
  });

  it("draftEditForm_shows_fieldsOfTheDraft: the type as text, the period, the advertising statement and every field", async () => {
    renderForm();

    expect(screen.getByRole("heading", { name: e.title })).toBeTruthy();
    expect(screen.getByText(e.transactionType)).toBeTruthy();
    expect(screen.getByText("Long-term rental")).toBeTruthy();
    expect(field(m.draft.startDate).value).toBe("2027-01-01");
    expect(field(m.draft.endDate).value).toBe("2027-12-31");
    expect(field(m.draft.startDate).type).toBe("date");
    expect(screen.getByText(m.draft.periodHint)).toBeTruthy();
    expect(screen.getByText(m.terms.advertisingScope.SUNVIBE_CHANNELS)).toBeTruthy();
    expect(field(e.interior).value).toBe("unanswered");
    expect(field(e.monthlyRent).getAttribute("inputmode")).toBe("numeric");
    for (const label of [e.deposit, e.minimumTerm, e.paymentPeriod, e.fees]) expect(field(label)).toBeTruthy();
    expect(await screen.findByText(m.survey.empty)).toBeTruthy();
  });

  it("draftEditForm_clientProblems_textsAndNoRequest: each value the server would refuse shows its text, and nothing is sent", async () => {
    vi.mocked(updateDraft).mockResolvedValue(saved);
    renderForm();

    type(field(e.monthlyRent), "0");
    type(field(e.deposit), "MONTHS");
    type(field(e.depositValue), "13");
    type(field(e.minimumTerm), "0");
    type(field(e.paymentPeriod), "13");
    type(field(e.fees), "list");
    type(field(e.feeName), "");
    type(field(e.feeAmount), "0");
    fireEvent.click(addFee());
    type(fields(e.feeName)[1] as HTMLInputElement, "x".repeat(101));
    fireEvent.click(saveButton());

    // The rent's and a fee amount's problems read the same text: the rent, the first fee (0) and the second (empty).
    expect(e.errors.feeAmount).toBe(e.errors.amount);
    expect(await screen.findAllByText(e.errors.amount)).toHaveLength(3);
    expect(screen.getByText(e.errors.depositMonths)).toBeTruthy();
    expect(screen.getByText(e.errors.minimumTerm)).toBeTruthy();
    expect(screen.getByText(e.errors.paymentPeriod)).toBeTruthy();
    expect(screen.getAllByText(e.errors.feeName)).toHaveLength(2);
    expect(screen.getAllByText(e.errors.feeUnit)).toHaveLength(2);
    expect(field(e.monthlyRent).getAttribute("aria-invalid")).toBe("true");
    expect(fields(e.feeAmount).map((input) => input.getAttribute("aria-invalid"))).toEqual(["true", "true"]);
    // Focus moves to the first field in error.
    await waitFor(() => expect(document.activeElement).toBe(field(e.monthlyRent)));

    type(field(e.monthlyRent), "8000000");
    type(field(e.depositValue), "2");
    type(field(e.minimumTerm), "121");
    type(field(e.paymentPeriod), "12");
    type(field(e.fees), "none");
    type(field(m.draft.endDate), "2026-12-31");
    fireEvent.click(saveButton());
    // Wait for a text only this round shows: the minimum term's text is still on screen from the first round.
    expect(await screen.findByText(m.draft.errors.endBeforeStart)).toBeTruthy();
    expect(screen.getByText(e.errors.minimumTerm)).toBeTruthy();
    expect(screen.queryByText(e.errors.amount)).toBeNull();
    expect(screen.queryByText(e.errors.depositMonths)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(field(m.draft.endDate)));

    type(field(m.draft.endDate), "2028-01-02");
    fireEvent.click(saveButton());
    expect(await screen.findByText(m.draft.errors.tooLong)).toBeTruthy();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("draftEditForm_exterior_disabledAndClearedUnlessYes: the exterior checkbox works only beside Yes for the interior", async () => {
    vi.mocked(updateDraft).mockResolvedValue(saved);
    renderForm({ ...BARE, photoConsent: true, exteriorPhotoConsent: true });

    const exterior = () => field(e.exterior);
    expect(exterior().type).toBe("checkbox");
    expect(exterior().checked).toBe(true);
    expect(exterior().disabled).toBe(false);

    type(field(e.interior), "no");
    expect(exterior().checked).toBe(false);
    expect(exterior().disabled).toBe(true);

    type(field(e.interior), "yes");
    expect(exterior().checked).toBe(false);
    expect(exterior().disabled).toBe(false);
    fireEvent.click(exterior());
    expect(exterior().checked).toBe(true);

    type(field(e.interior), "unanswered");
    expect(exterior().checked).toBe(false);
    expect(exterior().disabled).toBe(true);

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateDraft).toHaveBeenCalledTimes(1));
    expect([sent().photoConsent, sent().exteriorPhotoConsent]).toEqual([null, false]);
  });

  it("draftEditForm_feeList_threeStatesAndTwentyCap: not stated sends null, none [], a list its rows; Add a fee stops at twenty", async () => {
    vi.mocked(updateDraft).mockResolvedValue(http(409, "AGREEMENT_NOT_DRAFT"));
    renderForm();

    await saveOnce();
    expect(sent(0).terms.mandatoryFees).toBeNull();

    type(field(e.fees), "none");
    await saveOnce();
    expect(sent(1).terms.mandatoryFees).toEqual([]);

    type(field(e.fees), "list");
    type(field(e.feeName), "Water");
    type(field(e.feeBasis), "PROVIDER_TARIFF");
    expect(screen.queryByLabelText(e.feeAmount)).toBeNull();
    fireEvent.click(addFee());
    type(fields(e.feeName)[1] as HTMLInputElement, "Electricity");
    type(fields(e.feeAmount)[0] as HTMLInputElement, "3500");
    type(fields(e.feeUnit)[0] as HTMLInputElement, "PER_KWH");
    await saveOnce();
    expect(sent(2).terms.mandatoryFees).toEqual([
      { name: "Water", basis: "PROVIDER_TARIFF", amount: null, currency: null, chargeUnit: null },
      { name: "Electricity", basis: "AMOUNT", amount: 3500, currency: "VND", chargeUnit: "PER_KWH" },
    ]);

    fireEvent.click(screen.getAllByRole("button", { name: e.removeFee })[0] as HTMLElement);
    expect(fields(e.feeName).map((input) => input.value)).toEqual(["Electricity"]);
    for (let count = 1; count < 20; count += 1) fireEvent.click(addFee());
    expect(fields(e.feeName)).toHaveLength(20);
    expect(addFee().disabled).toBe(true);
  });

  it("draftEditForm_useSurveyValues_fromTheSurveyNoteUntilChanged: the survey values fill the parts they hold, with a note until the part changes", async () => {
    vi.mocked(getSurveyTerms).mockResolvedValue({ ok: true, status: 200, replayed: false, data: PROPOSAL });
    renderForm();
    type(field(e.deposit), "AMOUNT");
    type(field(e.depositValue), "5000000");

    fireEvent.click(await screen.findByRole("button", { name: m.survey.use }));

    expect(field(e.monthlyRent).value).toBe("8000000");
    expect(field(e.minimumTerm).value).toBe("12");
    expect(field(e.paymentPeriod).value).toBe("1");
    expect(field(e.depositValue).value).toBe("5000000");
    expect(field(e.feeName).value).toBe("Electricity");
    expect(screen.getAllByText("From the survey: Said by the owner, 10 Nov 2026")).toHaveLength(2);
    expect(screen.getAllByText("From the survey: Seen on site, 9 Nov 2026")).toHaveLength(2);

    type(field(e.monthlyRent), "8500000");
    expect(screen.getAllByText("From the survey: Said by the owner, 10 Nov 2026")).toHaveLength(1);
    type(field(e.feeName), "Electricity (meter)");
    expect(screen.getAllByText("From the survey: Seen on site, 9 Nov 2026")).toHaveLength(1);
  });

  it("draftEditForm_save_onePutWithDataVersion: a double click sends one PUT with the page's data version, and a 204 hands back", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(updateDraft).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderForm();
    type(field(e.monthlyRent), "999999999999999");

    // Two submits before the page renders again (the button is not disabled yet), then what a browser sends on a
    // double click: two clicks, then the dblclick.
    const formElement = saveButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(saveButton());
    fireEvent.click(saveButton());
    fireEvent.dblClick(saveButton());

    await waitFor(() => expect(updateDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateDraft).mock.calls[0]?.[0]).toBe(AGREEMENT_ID);
    expect(sent().expectedDataVersion).toBe(4);
    expect(sent().terms.monthlyRent).toEqual({ amount: 999999999999999, currency: "VND", unit: "MONTH" });
    expect(saveButton().disabled).toBe(true);

    answer(saved);
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    // A submit queued behind the first would run now.
    await act(async () => undefined);
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("draftEditForm_refusals_textByCodeKeepsValues: each refusal says why by its code, and the typed values stay", async () => {
    const props = renderForm();
    type(field(e.monthlyRent), "8000000");
    type(field(e.minimumTerm), "12");

    vi.mocked(updateDraft).mockResolvedValueOnce(
      http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS", "reasonGroups.NEW_GROUP"], correlationId: "c-1" }),
    );
    await saveOnce();
    expect(screen.getByText(e.errors.notEligible)).toBeTruthy();
    expect(screen.getByText(m.eligibility.reasons.BASIS)).toBeTruthy();
    expect(screen.getByText(m.eligibility.reasons.OTHER)).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toContain(e.errors.notEligible));

    for (const [answer, text] of [
      [http(409, "AGREEMENT_NOT_DRAFT"), e.errors.notDraft],
      [http(403, "AGREEMENT_NOT_ASSIGNEE"), e.errors.notAssignee],
      [http(404, "NOT_FOUND"), e.errors.notFound],
      [http(403, "FORBIDDEN"), e.errors.notFound],
    ] as const) {
      vi.mocked(updateDraft).mockResolvedValueOnce(answer);
      await saveOnce();
      expect(screen.getByRole("alert").textContent).toBe(text);
      expect(field(e.monthlyRent).value).toBe("8000000");
      expect(field(e.minimumTerm).value).toBe("12");
    }

    vi.mocked(updateDraft).mockResolvedValueOnce(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }));
    await saveOnce();
    expect(screen.getByText(e.errors.failed)).toBeTruthy();
    expect(screen.getByText("Support code: c-9")).toBeTruthy();

    vi.mocked(updateDraft).mockResolvedValueOnce(
      http(400, "VALIDATION_FAILED", { fields: ["terms.minimumTermMonths"], correlationId: "c-3" }),
    );
    await saveOnce();
    expect(screen.getByText("Support code: c-3")).toBeTruthy();
    expect(screen.getByText(e.errors.failed)).toBeTruthy();
    expect(field(e.minimumTerm).getAttribute("aria-invalid")).toBe("true");
    expect(field(e.monthlyRent).value).toBe("8000000");
    expect(screen.queryByText("server text")).toBeNull();
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(props.onReload).not.toHaveBeenCalled();
  });

  it("draftEditForm_stale_reloadCallsBack: a draft changed meanwhile says so, and Reload reads the agreement again", async () => {
    vi.mocked(updateDraft).mockResolvedValue(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }));
    const props = renderForm();
    type(field(e.monthlyRent), "8000000");

    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(e.errors.stale)).toBeTruthy();
    expect(field(e.monthlyRent).value).toBe("8000000");
    fireEvent.click(within(alert).getByRole("button", { name: e.reload }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("draftEditForm_saving_cancelDisabled: Cancel is disabled while the save runs, and leaves edit mode otherwise", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(updateDraft).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderForm();

    fireEvent.click(saveButton());
    await waitFor(() => expect(cancelButton().disabled).toBe(true));
    fireEvent.click(cancelButton());
    expect(props.onCancel).not.toHaveBeenCalled();

    answer(http(409, "AGREEMENT_NOT_DRAFT"));
    await screen.findByText(e.errors.notDraft);
    expect(cancelButton().disabled).toBe(false);
    fireEvent.click(cancelButton());
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("draftEditForm_surveyReadFails_formStaysUsable: a failed survey read shows its error, and the form still saves", async () => {
    vi.mocked(getSurveyTerms).mockResolvedValue({
      ok: false,
      kind: "http",
      status: 500,
      code: "INTERNAL_ERROR",
      fieldErrors: [],
      correlationId: "c-4",
    });
    vi.mocked(updateDraft).mockResolvedValue(saved);
    const props = renderForm();

    expect(await screen.findByText(m.survey.loadFailed)).toBeTruthy();
    type(field(e.monthlyRent), "7000000");
    fireEvent.click(saveButton());

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    expect(sent().terms.monthlyRent?.amount).toBe(7000000);
  });
});
