import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the release call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  releaseAgreementSuspension: vi.fn(),
}));

import { releaseAgreementSuspension } from "../services/agreement-api";

import { SuspensionReleaseDialog } from "./suspension-release-dialog";

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
      <SuspensionReleaseDialog agreementId="A1" dataVersion={7} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Lift the suspension" });
const reasonField = () => within(dialog()).getByLabelText("Reason for lifting it") as HTMLTextAreaElement;
const liftButton = () => within(dialog()).getByRole("button", { name: "Lift" }) as HTMLButtonElement;

describe("SuspensionReleaseDialog (brokerage-agreement E05-S8, S8-D6, E05S8-P5, UF-3)", () => {
  beforeEach(() => {
    vi.mocked(releaseAgreementSuspension).mockReset();
  });

  it("suspensionReleaseDialog_reasonRequired_sendsDataVersion: a blank reason, one of 501 characters as typed and one of 499 letters between two spaces each show the field's error and post nothing; one of 500 goes with the page's data version", async () => {
    vi.mocked(releaseAgreementSuspension).mockResolvedValueOnce(NO_CONTENT);
    const props = renderDialog();

    for (const reason of ["", "   ", "a".repeat(501), ` ${"a".repeat(499)} `]) {
      fireEvent.change(reasonField(), { target: { value: reason } });
      fireEvent.click(liftButton());
      expect(await within(dialog()).findByText("Enter a reason (at most 500 characters).")).toBeTruthy();
      expect(reasonField().getAttribute("aria-invalid")).toBe("true");
      await waitFor(() => expect(document.activeElement).toBe(reasonField()));
    }
    expect(releaseAgreementSuspension).not.toHaveBeenCalled();

    const reason = "a".repeat(500);
    fireEvent.change(reasonField(), { target: { value: reason } });
    fireEvent.click(liftButton());

    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    expect(releaseAgreementSuspension).toHaveBeenCalledTimes(1);
    expect(vi.mocked(releaseAgreementSuspension).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { expectedDataVersion: 7, reason }]);
  });
});
