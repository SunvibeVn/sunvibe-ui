import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementDetail, BrokerageAgreementSurveyTerms } from "../types";

// The edge only: the agreement calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  getAgreement: vi.fn(),
  getSurveyTerms: vi.fn(),
  updateDraft: vi.fn(),
}));

import { getAgreement, getSurveyTerms, updateDraft } from "../services/agreement-api";

import { AgreementDetailView } from "./agreement-detail-view";

const m = en.BrokerageAgreement;
const AGREEMENT_ID = "01JF000000000000000000000A";

const DRAFT_VERSION = {
  versionNo: 1,
  status: "DRAFT",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  createdAt: "2026-11-20T03:15:00Z",
  advertisingScope: "SUNVIBE_CHANNELS",
  photoConsent: null,
  exteriorPhotoConsent: false,
  terms: { monthlyRent: null, deposit: null, minimumTermMonths: null, paymentPeriodMonths: null, mandatoryFees: null },
} as const satisfies NonNullable<BrokerageAgreementDetail["versions"]>[number];

/** The detail the assigned Sale reads: a drafting agreement with version 1 DRAFT, data version 0. */
const DETAIL: BrokerageAgreementDetail = {
  agreementId: AGREEMENT_ID,
  status: "DRAFTING",
  transactionType: "LONG_TERM_RENT",
  unitId: "01JE000000000000000000000U",
  unitCode: "P101",
  basisLeadId: "01JE2EHEAD0000000000000015",
  createdAt: "2026-11-20T03:15:00Z",
  dataVersion: 0,
  viewerIsAssignedSale: true,
  versions: [DRAFT_VERSION],
};

const answered = (data: BrokerageAgreementDetail): ApiResult<BrokerageAgreementDetail> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});
const EMPTY_PROPOSAL: ApiResult<BrokerageAgreementSurveyTerms> = {
  ok: true,
  status: 200,
  replayed: false,
  data: { terms: {}, sources: [] },
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDetailView agreementId={AGREEMENT_ID} />
    </NextIntlClientProvider>,
  );
}

const editButton = () => screen.queryByRole("button", { name: m.edit.open });
const editForm = () => screen.queryByRole("heading", { name: m.edit.title });

describe("AgreementDetailView, editing the draft (brokerage-agreement E05-S3, S3-D18, UD-3, UD-5)", () => {
  beforeEach(() => {
    vi.mocked(getAgreement).mockReset();
    vi.mocked(getSurveyTerms).mockReset();
    vi.mocked(updateDraft).mockReset();
    vi.mocked(getSurveyTerms).mockResolvedValue(EMPTY_PROPOSAL);
  });

  it("agreementDetailEdit_assignedSaleDraft_editButtonOpensTheForm: the assigned Sale opens the form and the survey reference in place of the draft", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered(DETAIL));
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: m.edit.open }));

    expect(editForm()).toBeTruthy();
    expect(screen.getByRole("region", { name: m.survey.title })).toBeTruthy();
    expect(editButton()).toBeNull();
    expect(screen.queryByText(m.terms.proposed)).toBeNull();
    await waitFor(() => expect(getSurveyTerms).toHaveBeenCalledWith(AGREEMENT_ID));
    expect(getAgreement).toHaveBeenCalledTimes(1);
  });

  it("agreementDetailEdit_managerOrNotDraft_noEditButton: a manager, a version past its draft and a cancelled agreement offer no edit", async () => {
    const answers: BrokerageAgreementDetail[] = [
      { ...DETAIL, viewerIsAssignedSale: false },
      { ...DETAIL, versions: [{ ...DRAFT_VERSION, status: "AWAITING_OWNER" }] },
      { ...DETAIL, status: "CANCELLED", versions: [{ ...DRAFT_VERSION, status: "CANCELLED" }] },
    ];
    for (const answer of answers) {
      vi.mocked(getAgreement).mockResolvedValue(answered(answer));
      const { unmount } = renderView();

      await screen.findByRole("heading", { level: 1, name: m.detail.title });
      expect(screen.getByText(m.terms.notAnswered)).toBeTruthy();
      expect(editButton()).toBeNull();

      unmount();
      vi.mocked(getAgreement).mockReset();
    }
  });

  it("agreementDetailEdit_saved_leavesEditModeAndReadsAgain: a saved draft leaves edit mode and reads the agreement once more", async () => {
    vi.mocked(getAgreement).mockResolvedValueOnce(answered(DETAIL));
    vi.mocked(updateDraft).mockResolvedValue({ ok: true, status: 204, replayed: false, data: undefined });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: m.edit.open }));

    vi.mocked(getAgreement).mockResolvedValueOnce(
      answered({
        ...DETAIL,
        dataVersion: 1,
        versions: [{ ...DRAFT_VERSION, terms: { ...DRAFT_VERSION.terms, monthlyRent: { amount: 8000000, currency: "VND", unit: "MONTH" } } }],
      }),
    );
    fireEvent.change(screen.getByLabelText(m.edit.monthlyRent), { target: { value: "8000000" } });
    fireEvent.click(screen.getByRole("button", { name: m.edit.save }));

    expect(await screen.findByText("8,000,000 VND per month")).toBeTruthy();
    expect(editForm()).toBeNull();
    expect(getAgreement).toHaveBeenCalledTimes(2);
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateDraft).mock.calls[0]?.[1].expectedDataVersion).toBe(0);
    expect(editButton()).toBeTruthy();
  });

  it("agreementDetailEdit_cancel_leavesEditModeWithoutReading: Cancel leaves edit mode and reads nothing", async () => {
    vi.mocked(getAgreement).mockResolvedValue(answered(DETAIL));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: m.edit.open }));
    fireEvent.change(screen.getByLabelText(m.edit.monthlyRent), { target: { value: "8000000" } });

    fireEvent.click(screen.getByRole("button", { name: m.edit.cancel }));

    expect(editForm()).toBeNull();
    expect(editButton()).toBeTruthy();
    expect(screen.getByText(m.terms.proposed)).toBeTruthy();
    expect(getAgreement).toHaveBeenCalledTimes(1);
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("agreementDetailEdit_otherVersions_keepTheirPanels: in edit mode the other versions keep their read-only content", async () => {
    vi.mocked(getAgreement).mockResolvedValue(
      answered({
        ...DETAIL,
        versions: [
          {
            ...DRAFT_VERSION,
            versionNo: 1,
            status: "OWNER_REJECTED",
            photoConsent: true,
            terms: { ...DRAFT_VERSION.terms, minimumTermMonths: 6 },
          },
          { ...DRAFT_VERSION, versionNo: 2 },
        ],
      }),
    );
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: m.edit.open }));

    const versions = screen.getByRole("region", { name: m.detail.versions });
    const [first, second] = within(versions)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.closest("li") as HTMLElement);
    expect(within(first as HTMLElement).getByText("Version 1")).toBeTruthy();
    expect(within(first as HTMLElement).getByText("6 months")).toBeTruthy();
    expect(within(first as HTMLElement).getByText(m.terms.yes)).toBeTruthy();
    expect(within(first as HTMLElement).queryByRole("heading", { name: m.edit.title })).toBeNull();
    expect(within(second as HTMLElement).getByText("Version 2")).toBeTruthy();
    expect(within(second as HTMLElement).getByRole("heading", { name: m.edit.title })).toBeTruthy();
    expect(within(second as HTMLElement).queryByText(m.terms.proposed)).toBeNull();
  });
});
