import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult, SessionSnapshot } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// A signed-in session is given, so the page shows (the session screens have their own tests); the edge is the owner
// calls, so no request leaves the test.
vi.mock("@/features/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/client")>()),
  RequireSession: ({ children }: { children: ReactNode }) => children,
  useSession: (): SessionSnapshot => ({ status: "signed-in", user: { userId: "U1" } }) as unknown as SessionSnapshot,
}));

vi.mock("../services/owner-agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/owner-agreement-api")>()),
  listMine: vi.fn(),
  confirmVersions: vi.fn(),
  rejectVersion: vi.fn(),
}));

import { listMine, rejectVersion } from "../services/owner-agreement-api";
import type { BrokerageAgreementOwnerItem, BrokerageAgreementOwnerList, BrokerageAgreementVersion } from "../types";

import { OwnerAgreementsView } from "./owner-agreements-view";

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

const SENT_V1: BrokerageAgreementVersion = {
  versionNo: 1,
  status: "AWAITING_OWNER",
  startDate: "2027-01-01",
  endDate: "2027-12-31",
  sentAt: "2026-11-17T03:15:00Z",
  answerBy: "2026-11-24T03:15:00Z",
  ownerAnsweredAt: null,
  ownerRejectionReason: null,
};

const ITEM: BrokerageAgreementOwnerItem = {
  agreementId: "A1",
  status: "AWAITING_CONFIRMATION",
  transactionType: "LONG_TERM_RENT",
  unitCode: "P101",
  unitLocation: null,
  street: null,
  wardName: null,
  versions: [SENT_V1],
  statement: { version: "brokerage-agreement-2026-11", text: "Version 1 of the brokerage agreement for unit P101." },
};

const ok = (data: BrokerageAgreementOwnerList): ApiResult<BrokerageAgreementOwnerList> => ({
  ok: true,
  status: 200,
  replayed: false,
  data,
});

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <OwnerAgreementsView />
    </NextIntlClientProvider>,
  );
}

describe("OwnerAgreementsView (brokerage-agreement E05-S5, S5-D17, UO-1, UO-3)", () => {
  beforeEach(() => {
    vi.mocked(listMine).mockReset();
    vi.mocked(rejectVersion).mockReset();
  });

  it("ownerAgreementsView_states_loadingEmptyErrorAndMore: loading while the read runs, an error with its support code and Try again, the empty text, and the more line", async () => {
    let answer: (result: ApiResult<BrokerageAgreementOwnerList>) => void = () => undefined;
    vi.mocked(listMine).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    renderView();

    expect(screen.getByRole("heading", { level: 1, name: o.title })).toBeTruthy();
    expect(within(screen.getByRole("status")).getByText(o.loading)).toBeTruthy();

    answer({ ok: false, kind: "http", status: 500, code: "INTERNAL_ERROR", fieldErrors: [], correlationId: "c-1" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(`${o.loadFailed}Support code: c-1`);

    vi.mocked(listMine).mockResolvedValueOnce(ok({ items: [], more: false }));
    fireEvent.click(screen.getByRole("button", { name: o.retry }));
    expect(await screen.findByText(o.empty)).toBeTruthy();
    expect(listMine).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();

    vi.mocked(listMine).mockResolvedValueOnce(ok({ items: [ITEM], more: true }));
    renderView();
    expect(await screen.findByText(o.more)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Unit P101" })).toBeTruthy();
  });

  it("ownerAgreementsView_declined_readsAgain: Decline sends the reason, then the page reads again and the version reads declined; a version gone meanwhile reloads with its notice", async () => {
    const declined: BrokerageAgreementOwnerItem = {
      ...ITEM,
      status: "DRAFTING",
      versions: [{ ...SENT_V1, status: "OWNER_REJECTED", ownerAnsweredAt: "2026-11-18T01:00:00Z", ownerRejectionReason: "Too low." }],
      statement: null,
    };
    vi.mocked(listMine).mockResolvedValueOnce(ok({ items: [ITEM], more: false })).mockResolvedValueOnce(ok({ items: [declined], more: false }));
    vi.mocked(rejectVersion).mockResolvedValueOnce({ ok: true, status: 204, replayed: false, data: undefined });
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: o.decline }));
    const dialog = screen.getByRole("dialog", { name: "Decline version 1" });
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: "Too low." } });
    fireEvent.click(within(dialog).getByRole("button", { name: o.declineDialog.submit }));

    expect(await screen.findByText("You declined it on 2026-11-18 08:00")).toBeTruthy();
    expect(screen.getByText("Your reason: Too low.")).toBeTruthy();
    expect(vi.mocked(rejectVersion).mock.calls[0]?.slice(0, 2)).toEqual(["A1", { versionNo: 1, reason: "Too low." }]);
    expect(listMine).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: o.decline })).toBeNull();
    expect(screen.queryByText(o.errors.reload)).toBeNull();

    // A version no longer waiting: the dialog closes, the page says it reloaded and reads again.
    vi.mocked(listMine).mockResolvedValueOnce(ok({ items: [ITEM], more: false })).mockResolvedValueOnce(ok({ items: [declined], more: false }));
    vi.mocked(rejectVersion).mockResolvedValueOnce({
      ok: false,
      kind: "http",
      status: 409,
      code: "AGREEMENT_NOT_AWAITING_OWNER",
      fieldErrors: [],
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: o.decline }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: o.declineDialog.submit }));
    expect(await screen.findByText(o.errors.reload)).toBeTruthy();
    await waitFor(() => expect(listMine).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
