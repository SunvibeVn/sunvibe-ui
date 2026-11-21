import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the cancellation call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  cancelAgreement: vi.fn(),
}));

import { cancelAgreement } from "../services/agreement-api";

import { CancellationDialog } from "./cancellation-dialog";

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
      <CancellationDialog agreementId="A1" dataVersion={3} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Cancel the agreement" });
const cancelButton = () => within(dialog()).getByRole("button", { name: "Cancel the agreement" }) as HTMLButtonElement;
const keepButton = () => within(dialog()).getByRole("button", { name: "Keep it" }) as HTMLButtonElement;

describe("CancellationDialog (brokerage-agreement E05-S8, S8-D7, UF-4)", () => {
  beforeEach(() => {
    vi.mocked(cancelAgreement).mockReset();
  });

  it("cancellationDialog_confirmOnce_sendsDataVersionAndCallsDone: the confirmation text; one request with the page's data version on a double click; a 204 hands back once; Keep it closes with no request", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(cancelAgreement).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    expect(within(dialog()).getByText("Cancel this agreement? It never took effect; this cannot be undone.")).toBeTruthy();
    const formElement = cancelButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.dblClick(cancelButton());

    await waitFor(() => expect(cancelAgreement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(cancelAgreement).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { expectedDataVersion: 3 }]);
    expect(keepButton().disabled).toBe(true);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(cancelAgreement).toHaveBeenCalledTimes(1);
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("cancellationDialog_keepIt_noRequest: Keep it closes with no request", () => {
    const props = renderDialog();
    fireEvent.click(keepButton());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(cancelAgreement).not.toHaveBeenCalled();
  });

  it("cancellationDialog_tookEffect_closesAndReportsTheCode: AGREEMENT_TOOK_EFFECT hands its code to the page once, which closes the dialog and reads again; the dialog keeps no sentence of its own", async () => {
    vi.mocked(cancelAgreement).mockResolvedValueOnce({ ok: false, kind: "http", status: 409, code: "AGREEMENT_TOOK_EFFECT", fieldErrors: [] });
    const props = renderDialog();

    fireEvent.click(cancelButton());

    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
    expect(props.onChanged).toHaveBeenCalledWith("AGREEMENT_TOOK_EFFECT");
    expect(props.onDone).not.toHaveBeenCalled();
    expect(within(dialog()).queryByRole("alert")).toBeNull();
    expect(within(dialog()).queryByText("This agreement has taken effect: end it instead.")).toBeNull();
  });
});
