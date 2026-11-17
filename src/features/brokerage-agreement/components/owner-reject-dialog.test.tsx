import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the rejection call, so no request leaves the test.
vi.mock("../services/owner-agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/owner-agreement-api")>()),
  rejectVersion: vi.fn(),
}));

import { rejectVersion } from "../services/owner-agreement-api";

import { OwnerRejectDialog } from "./owner-reject-dialog";

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

const o = en.BrokerageAgreement.owner;
const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderDialog() {
  const props = { onClose: vi.fn(), onDeclined: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <OwnerRejectDialog agreementId="A1" versionNo={1} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Decline version 1" });
const reasonField = () => within(dialog()).getByLabelText(/^Reason/) as HTMLTextAreaElement;
const declineButton = () => within(dialog()).getByRole("button", { name: o.declineDialog.submit }) as HTMLButtonElement;
const keepButton = () => within(dialog()).getByRole("button", { name: o.declineDialog.keep }) as HTMLButtonElement;

/** Declines once the last answer has ended, and waits until this one has ended too. */
async function declineOnce(answer: ApiResult<undefined>) {
  vi.mocked(rejectVersion).mockResolvedValueOnce(answer);
  const before = vi.mocked(rejectVersion).mock.calls.length;
  await waitFor(() => expect(declineButton().disabled).toBe(false));
  fireEvent.click(declineButton());
  await waitFor(() => expect(rejectVersion).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(declineButton().disabled).toBe(false));
}

describe("OwnerRejectDialog (brokerage-agreement E05-S5, S5-D7, UO-3)", () => {
  beforeEach(() => {
    vi.mocked(rejectVersion).mockReset();
  });

  it("ownerRejectDialog_decline_sendsReasonThenReads: Decline sends the version and the reason once on a double click, and a 204 hands back so the page reads again", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(rejectVersion).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    fireEvent.change(reasonField(), { target: { value: "The rent is too low." } });
    const formElement = declineButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(declineButton());
    fireEvent.dblClick(declineButton());

    await waitFor(() => expect(rejectVersion).toHaveBeenCalledTimes(1));
    expect(vi.mocked(rejectVersion).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { versionNo: 1, reason: "The rent is too low." }]);
    expect(keepButton().disabled).toBe(true);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onDeclined).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(rejectVersion).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("ownerRejectDialog_noReason_sentAsNull: no reason given sends null", async () => {
    vi.mocked(rejectVersion).mockResolvedValueOnce(NO_CONTENT);
    const props = renderDialog();

    fireEvent.click(declineButton());
    await waitFor(() => expect(props.onDeclined).toHaveBeenCalledTimes(1));
    expect(vi.mocked(rejectVersion).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { versionNo: 1, reason: null }]);
    // Declined: the dialog sends nothing more while the page reads again.
    expect(declineButton().disabled).toBe(true);
  });

  it("ownerRejectDialog_keepIt_noRequest: Keep it closes the dialog and sends nothing", () => {
    const props = renderDialog();

    fireEvent.change(reasonField(), { target: { value: "Not now." } });
    fireEvent.click(keepButton());

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(rejectVersion).not.toHaveBeenCalled();
  });

  it("ownerRejectDialog_reasonField_maxLength500: the reason is optional and holds at most 500 UTF-16 units; the server's refusals show their texts", async () => {
    const props = renderDialog();

    expect(reasonField().maxLength).toBe(500);
    expect(within(dialog()).getByText("(optional)")).toBeTruthy();
    // An emoji is two UTF-16 units, as the server counts them.
    expect(`${"a".repeat(498)}😀`).toHaveLength(500);

    await declineOnce(http(400, "VALIDATION_FAILED", { fields: ["reason"] }));
    expect(within(dialog()).getByText(o.errors.badReason)).toBeTruthy();
    expect(reasonField().getAttribute("aria-invalid")).toBe("true");

    await declineOnce(http(429, "RATE_LIMITED"));
    expect(within(dialog()).getByRole("alert").textContent).toBe(o.errors.tooMany);
    await declineOnce(http(409, "CONCURRENT_MODIFICATION"));
    expect(within(dialog()).getByRole("alert").textContent).toBe(o.errors.concurrent);
    await declineOnce(http(500, "INTERNAL_ERROR", { correlationId: "c-9" }));
    expect(within(dialog()).getByRole("alert").textContent).toBe(`${o.errors.failed}Support code: c-9`);
    expect(screen.queryByText("server text")).toBeNull();

    await declineOnce(http(409, "AGREEMENT_NOT_AWAITING_OWNER"));
    await declineOnce(http(404, "NOT_FOUND"));
    expect(props.onReload).toHaveBeenCalledTimes(2);
    expect(props.onDeclined).not.toHaveBeenCalled();
  });
});
