import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the send call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  submitDraft: vi.fn(),
}));

import { submitDraft } from "../services/agreement-api";

import { DraftSendDialog } from "./draft-send-dialog";

// jsdom has the dialog element but not its methods (see agreement-draft-dialog.test.tsx).
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

const s = en.BrokerageAgreement.send;
const AGREEMENT_ID = "01JF000000000000000000000A";

const sent: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderDialog() {
  const props = { onClose: vi.fn(), onSent: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <DraftSendDialog agreementId={AGREEMENT_ID} versionNo={2} dataVersion={7} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const sendButton = () => screen.getByRole("button", { name: s.submit }) as HTMLButtonElement;
const keepEditing = () => screen.getByRole("button", { name: s.keepEditing }) as HTMLButtonElement;

/** Clicks "Send" once the last send has ended, and waits until this one has sent and ended too. */
async function sendOnce() {
  const before = vi.mocked(submitDraft).mock.calls.length;
  await waitFor(() => expect(sendButton().disabled).toBe(false));
  fireEvent.click(sendButton());
  await waitFor(() => expect(submitDraft).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(sendButton().disabled).toBe(false));
}

describe("DraftSendDialog (brokerage-agreement E05-S4, S4-D14, UF-3, UF-4)", () => {
  beforeEach(() => {
    vi.mocked(submitDraft).mockReset();
  });

  it("draftSendDialog_send_onePostWithTheDataVersion: the dialog says what sending does; a double click sends one POST with the data version it was given, and a 204 hands back", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(submitDraft).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    const dialog = screen.getByRole("dialog", { name: s.title });
    expect(
      within(dialog).getByText(
        "Version 2 goes to the owner of this unit. After sending, it can no longer be edited. The owner gets an email that asks them to sign in and read it.",
      ),
    ).toBeTruthy();

    // Two submits before the dialog renders again, then what a browser sends on a double click.
    const formElement = sendButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    fireEvent.dblClick(sendButton());

    await waitFor(() => expect(submitDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitDraft).mock.calls[0]?.slice(0, 2)).toEqual([AGREEMENT_ID, { expectedDataVersion: 7 }]);
    expect(sendButton().disabled).toBe(true);

    answer(sent);
    await waitFor(() => expect(props.onSent).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(submitDraft).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("draftSendDialog_refusal_staysOpenWithItsText: each refusal shows its text by code in the dialog, which stays open", async () => {
    const props = renderDialog();
    const alertText = () => screen.getByRole("alert").textContent;

    vi.mocked(submitDraft).mockResolvedValueOnce(
      http(409, "AGREEMENT_VERSION_INCOMPLETE", {
        fields: ["feePolicy.formula", "feePolicy.dueDays", "feePolicy.renewal", "feePolicy.earlyLeaseEnd", "feePolicy.protectionDays"],
      }),
    );
    await sendOnce();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(s.errors.incomplete)).toBeTruthy();
    expect(Array.from(alert.querySelectorAll("li")).map((line) => line.textContent)).toEqual([
      "How the fee is set",
      "Payment due",
      "Lease renewed with the same tenant",
      "If the lease ends early",
      "Protection period",
    ]);
    await waitFor(() => expect(document.activeElement?.textContent).toContain(s.errors.incomplete));

    vi.mocked(submitDraft).mockResolvedValueOnce(
      http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS", "reasonGroups.OWNER"] }),
    );
    await sendOnce();
    expect(alertText()).toBe(
      `${s.errors.notEligible}${en.BrokerageAgreement.eligibility.reasons.BASIS}${en.BrokerageAgreement.eligibility.reasons.OWNER}`,
    );

    for (const [answer, text] of [
      [http(409, "AGREEMENT_NOT_DRAFT"), s.errors.notDraft],
      [http(409, "AGREEMENT_SENDING_NOT_AVAILABLE"), s.errors.sendingOff],
      [http(403, "AGREEMENT_NOT_ASSIGNEE"), s.errors.notAssignee],
      [http(404, "NOT_FOUND"), s.errors.notFound],
      [http(403, "FORBIDDEN"), s.errors.notFound],
    ] as const) {
      vi.mocked(submitDraft).mockResolvedValueOnce(answer);
      await sendOnce();
      expect(alertText()).toBe(text);
      expect(screen.queryByRole("button", { name: s.reload })).toBeNull();
    }

    vi.mocked(submitDraft).mockResolvedValueOnce(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }));
    await sendOnce();
    expect(alertText()).toBe(`${s.errors.failed}Support code: c-9`);

    vi.mocked(submitDraft).mockResolvedValueOnce(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }));
    await sendOnce();
    expect(within(screen.getByRole("alert")).getByText(s.errors.stale)).toBeTruthy();
    expect(screen.queryByText("server text")).toBeNull();
    expect(screen.getByRole("dialog", { name: s.title })).toBeTruthy();
    expect(props.onSent).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: s.reload }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
  });

  it("draftSendDialog_sending_keepEditingDisabled: Keep editing is disabled while the send runs, and closes the dialog otherwise", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(submitDraft).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    fireEvent.click(sendButton());
    await waitFor(() => expect(keepEditing().disabled).toBe(true));
    fireEvent.click(keepEditing());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(props.onClose).not.toHaveBeenCalled();

    answer(http(409, "AGREEMENT_NOT_DRAFT"));
    await screen.findByText(s.errors.notDraft);
    expect(keepEditing().disabled).toBe(false);
    fireEvent.click(keepEditing());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
