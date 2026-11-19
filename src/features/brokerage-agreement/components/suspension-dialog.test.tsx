import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the suspension call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  suspendAgreement: vi.fn(),
}));

import { suspendAgreement } from "../services/agreement-api";

import { SuspensionDialog } from "./suspension-dialog";

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

const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };

function renderDialog() {
  const props = { onClose: vi.fn(), onDone: vi.fn(), onChanged: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <SuspensionDialog agreementId="A1" {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Suspend the agreement" });
const reasonField = () => within(dialog()).getByLabelText("Reason") as HTMLSelectElement;
const noteField = () => within(dialog()).getByLabelText(/^Note/) as HTMLTextAreaElement;
const suspendButton = () => within(dialog()).getByRole("button", { name: "Suspend" }) as HTMLButtonElement;
const keepButton = () => within(dialog()).getByRole("button", { name: "Keep it" }) as HTMLButtonElement;

describe("SuspensionDialog (brokerage-agreement E05-S8, S8-D6, UF-3)", () => {
  beforeEach(() => {
    vi.mocked(suspendAgreement).mockReset();
  });

  it("suspensionDialog_reasonAndNote_onePostPerClick: the four reasons with none chosen; the checks before any request; the reason and the note go once on a double click; a 204 hands back", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(suspendAgreement).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    expect(Array.from(reasonField().options).map((option) => option.textContent)).toEqual([
      "Choose a reason",
      "A complaint",
      "Suspected fraud",
      "A dispute",
      "A check is needed",
    ]);
    expect(reasonField().value).toBe("");
    expect(within(dialog()).getByText("(optional)")).toBeTruthy();

    // No reason, and a note one character over the bound: both errors, the focus on the first, no request.
    fireEvent.change(noteField(), { target: { value: ` ${"a".repeat(499)} ` } });
    fireEvent.click(suspendButton());
    expect(await within(dialog()).findByText("Choose a reason.")).toBeTruthy();
    expect(within(dialog()).getByText("Enter at most 500 characters.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(reasonField()));
    expect(suspendAgreement).not.toHaveBeenCalled();

    fireEvent.change(reasonField(), { target: { value: "COMPLAINT" } });
    fireEvent.change(noteField(), { target: { value: "Tenant reported a different price." } });
    const formElement = suspendButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(suspendButton());
    fireEvent.dblClick(suspendButton());

    await waitFor(() => expect(suspendAgreement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(suspendAgreement).mock.calls[0]?.slice(0, 2)).toEqual([
      "A1",
      { reasonType: "COMPLAINT", note: "Tenant reported a different price." },
    ]);
    expect(keepButton().disabled).toBe(true);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(suspendAgreement).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("suspensionDialog_keepIt_noRequest: Keep it closes with no request; a blank note goes as null", async () => {
    const props = renderDialog();
    fireEvent.click(keepButton());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(suspendAgreement).not.toHaveBeenCalled();

    vi.mocked(suspendAgreement).mockResolvedValueOnce(NO_CONTENT);
    fireEvent.change(reasonField(), { target: { value: "NEEDS_CHECK" } });
    fireEvent.change(noteField(), { target: { value: "   " } });
    fireEvent.click(suspendButton());
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    expect(vi.mocked(suspendAgreement).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { reasonType: "NEEDS_CHECK", note: null }]);
  });
});
