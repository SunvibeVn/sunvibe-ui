import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { BrokerageAgreementCreated } from "../types";

// Edges only: the router the dialog moves with, and the create call, so no request leaves the test.
const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  createAgreement: vi.fn(),
}));

import { createAgreement } from "../services/agreement-api";

import { AgreementDraftDialog } from "./agreement-draft-dialog";

// jsdom has the dialog element but not its methods (see bulk-assign-dialog.test.tsx).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

const m = en.BrokerageAgreement;

const created = (agreementId: string): ApiResult<BrokerageAgreementCreated> => ({
  ok: true,
  status: 201,
  replayed: false,
  data: { agreementId },
});
const http = (
  status: number,
  code: string,
  extra: { fields?: string[]; correlationId?: string } = {},
): ApiResult<BrokerageAgreementCreated> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderDialog() {
  const props = { onClose: vi.fn(), onRefused: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementDraftDialog leadId="L1" unitId="U1" unitCode="P101" {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const startField = (): HTMLInputElement => screen.getByLabelText(m.draft.startDate) as HTMLInputElement;
const endField = (): HTMLInputElement => screen.getByLabelText(m.draft.endDate) as HTMLInputElement;
const submitButton = (): HTMLButtonElement => screen.getByRole("button", { name: m.draft.submit }) as HTMLButtonElement;
/** The footer's "Cancel", not the corner close button that carries the same name. */
const cancelButton = (): HTMLElement => {
  const button = screen.getAllByRole("button", { name: m.draft.cancel }).find((found) => found.textContent === m.draft.cancel);
  if (button === undefined) throw new Error("no Cancel button");
  return button;
};

function enter(startDate: string, endDate: string) {
  fireEvent.change(startField(), { target: { value: startDate } });
  fireEvent.change(endField(), { target: { value: endDate } });
}

describe("AgreementDraftDialog (brokerage-agreement E05-S2, spec section 6)", () => {
  beforeEach(() => {
    vi.mocked(createAgreement).mockReset();
    router.push.mockReset();
  });

  it("agreementDraftDialog_shows_unitCodeAndLongTermRental: the unit, long-term rental, two date fields from 2000 to 2099 and the hint", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: m.draft.title })).toBeTruthy();
    expect(screen.getByText("Unit: P101")).toBeTruthy();
    expect(screen.getByText("Transaction type: Long-term rental")).toBeTruthy();
    for (const field of [startField(), endField()]) {
      expect(field.type).toBe("date");
      expect(field.min).toBe("2000-01-01");
      expect(field.max).toBe("2099-12-31");
    }
    expect(screen.getByText(m.draft.periodHint)).toBeTruthy();
  });

  it("agreementDraftDialog_clientChecks_refuseAndSendNothing: a period the server would refuse is refused here, and nothing is sent", async () => {
    vi.mocked(createAgreement).mockResolvedValue(http(409, "AGREEMENT_EXISTS"));
    renderDialog();

    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getAllByText(m.draft.errors.required)).toHaveLength(2));
    expect(startField().getAttribute("aria-invalid")).toBe("true");
    expect(endField().getAttribute("aria-invalid")).toBe("true");

    enter("2027-01-02", "2027-01-01");
    fireEvent.click(submitButton());
    expect(await screen.findByText(m.draft.errors.endBeforeStart)).toBeTruthy();

    enter("2028-02-29", "2029-03-01");
    fireEvent.click(submitButton());
    expect(await screen.findByText(m.draft.errors.tooLong)).toBeTruthy();

    enter("1999-12-31", "2000-06-01");
    fireEvent.click(submitButton());
    expect(await screen.findByText(m.draft.errors.outOfRange)).toBeTruthy();
    expect(createAgreement).not.toHaveBeenCalled();

    enter("2028-02-29", "2029-02-28");
    fireEvent.click(submitButton());
    await waitFor(() => expect(createAgreement).toHaveBeenCalledTimes(1));
    expect(createAgreement).toHaveBeenCalledWith({
      leadId: "L1",
      unitId: "U1",
      transactionType: "LONG_TERM_RENT",
      startDate: "2028-02-29",
      endDate: "2029-02-28",
    });
  });

  it("agreementDraftDialog_doubleClick_sendsOneRequest: a double click sends one request, and the button stays disabled while it runs", async () => {
    let answer: (result: ApiResult<BrokerageAgreementCreated>) => void = () => undefined;
    vi.mocked(createAgreement).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderDialog();
    enter("2027-01-01", "2027-12-31");

    // What a browser sends on a double click: two clicks, then the dblclick.
    fireEvent.click(submitButton());
    fireEvent.click(submitButton());
    fireEvent.dblClick(submitButton());

    await waitFor(() => expect(createAgreement).toHaveBeenCalledTimes(1));
    expect(submitButton().disabled).toBe(true);

    answer(created("A1"));
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(createAgreement).toHaveBeenCalledTimes(1);
  });

  it("agreementDraftDialog_created_movesToTheAgreementPage: a 201 moves to the new agreement's page", async () => {
    vi.mocked(createAgreement).mockResolvedValue(created("A1"));
    renderDialog();
    enter("2027-01-01", "2027-12-31");

    fireEvent.click(submitButton());

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(router.push).toHaveBeenCalledWith("/workspace/brokerage-agreements/A1");
  });

  it("agreementDraftDialog_refusal_showsItsTextKeepsValuesAndRereads: each refusal says why, keeps the dates and asks for a new read", async () => {
    vi.mocked(createAgreement).mockResolvedValueOnce(
      http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.UNIT", "reasonGroups.NEW_GROUP"], correlationId: "c-1" }),
    );
    const props = renderDialog();
    enter("2027-01-01", "2027-12-31");

    fireEvent.click(submitButton());

    expect(await screen.findByText(m.draft.errors.notEligible)).toBeTruthy();
    expect(screen.getByText(m.eligibility.reasons.UNIT)).toBeTruthy();
    expect(screen.getByText(m.eligibility.reasons.OTHER)).toBeTruthy();
    expect(startField().value).toBe("2027-01-01");
    expect(endField().value).toBe("2027-12-31");
    expect(props.onRefused).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();

    for (const [answer, text] of [
      [http(409, "AGREEMENT_EXISTS"), m.draft.errors.exists],
      [http(403, "AGREEMENT_NOT_ASSIGNEE"), m.draft.errors.notAssignee],
      [http(404, "NOT_FOUND"), m.draft.errors.notFound],
      [http(409, "CONCURRENT_MODIFICATION"), m.draft.errors.conflict],
    ] as const) {
      vi.mocked(createAgreement).mockResolvedValueOnce(answer);
      fireEvent.click(submitButton());
      expect(await screen.findByText(text)).toBeTruthy();
      expect(startField().value).toBe("2027-01-01");
      expect(endField().value).toBe("2027-12-31");
    }
    expect(props.onRefused).toHaveBeenCalledTimes(5);
    expect(createAgreement).toHaveBeenCalledTimes(5);
  });

  it("agreementDraftDialog_serverValidation_failedTextKeepsValues: a 400 the checks missed says the draft failed and marks the field it names", async () => {
    vi.mocked(createAgreement).mockResolvedValue(http(400, "VALIDATION_FAILED", { fields: ["endDate"], correlationId: "c-3" }));
    const props = renderDialog();
    enter("2027-01-01", "2027-12-31");

    fireEvent.click(submitButton());

    expect(await screen.findByText(m.draft.errors.failed)).toBeTruthy();
    expect(screen.getByText("Support code: c-3")).toBeTruthy();
    expect(endField().getAttribute("aria-invalid")).toBe("true");
    expect(startField().getAttribute("aria-invalid")).toBeNull();
    expect(startField().value).toBe("2027-01-01");
    expect(endField().value).toBe("2027-12-31");
    expect(props.onRefused).not.toHaveBeenCalled();
  });

  it("agreementDraftDialog_failure_showsSupportCode: any other failure says the draft failed, with its support code", async () => {
    vi.mocked(createAgreement).mockResolvedValue(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }));
    const props = renderDialog();
    enter("2027-01-01", "2027-12-31");

    fireEvent.click(submitButton());

    expect(await screen.findByText(m.draft.errors.failed)).toBeTruthy();
    expect(screen.getByText("Support code: c-9")).toBeTruthy();
    expect(props.onRefused).not.toHaveBeenCalled();
  });

  it("agreementDraftDialog_cancel_closes: Cancel closes the dialog and sends nothing", () => {
    const props = renderDialog();
    enter("2027-01-01", "2027-12-31");

    fireEvent.click(cancelButton());

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(createAgreement).not.toHaveBeenCalled();
  });
});
