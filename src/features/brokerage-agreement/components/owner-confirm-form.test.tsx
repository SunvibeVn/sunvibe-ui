import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { confirmVersions, listMine } from "../services/owner-agreement-api";
import type { BrokerageAgreementOwnerItem } from "../types";

import { OwnerAgreementsView } from "./owner-agreements-view";
import { OwnerConfirmForm } from "./owner-confirm-form";

const o = en.BrokerageAgreement.owner;
const STATEMENT_VERSION = "brokerage-agreement-2026-11";

const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const http = (status: number, code: string | undefined, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  ...(code === undefined ? {} : { code }),
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const UNITS: Record<string, string | null> = { A1: "P101", A2: null };

function renderForm() {
  const props = { onConfirmed: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <OwnerConfirmForm
        ticked={[
          { agreementId: "A1", versionNo: 1 },
          { agreementId: "A2", versionNo: 2 },
        ]}
        statementVersion={STATEMENT_VERSION}
        unitCodeOf={(agreementId) => UNITS[agreementId] ?? null}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return props;
}

const passwordField = () => screen.getByLabelText(o.password) as HTMLInputElement;
const confirmButton = (count = 2) => screen.getByRole("button", { name: `Confirm the selected versions (${count})` }) as HTMLButtonElement;

/**
 * Types the password and confirms once the last answer has ended, and waits until this one has ended too and `shown`
 * holds. The form clears the password in the action's `finally`, before React shows the answer the action returns, so an
 * empty field alone does not mean the answer is on screen.
 */
async function confirmOnce(answer: ApiResult<undefined>, shown: () => void = () => undefined) {
  vi.mocked(confirmVersions).mockResolvedValueOnce(answer);
  const before = vi.mocked(confirmVersions).mock.calls.length;
  fireEvent.change(passwordField(), { target: { value: "secret-1" } });
  await waitFor(() => expect(confirmButton().disabled).toBe(false));
  fireEvent.click(confirmButton());
  await waitFor(() => expect(confirmVersions).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(passwordField().value).toBe(""));
  await waitFor(shown);
}

describe("OwnerConfirmForm (brokerage-agreement E05-S5, S5-D4, S5-D5, UO-2)", () => {
  beforeEach(() => {
    vi.mocked(confirmVersions).mockReset();
    vi.mocked(listMine).mockReset();
  });

  it("ownerConfirmForm_confirm_oneRequestOnDoubleClick: two ticked versions and the password go in one request, once on a double click, and a 204 hands back", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(confirmVersions).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderForm();

    expect(passwordField().type).toBe("password");
    expect(passwordField().autocomplete).toBe("current-password");
    expect(passwordField().maxLength).toBe(256);
    expect(confirmButton().disabled).toBe(true);
    fireEvent.change(passwordField(), { target: { value: "secret-1" } });

    const formElement = confirmButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(confirmButton());
    fireEvent.dblClick(confirmButton());

    await waitFor(() => expect(confirmVersions).toHaveBeenCalledTimes(1));
    expect(vi.mocked(confirmVersions).mock.calls[0]?.[0]).toEqual({
      currentPassword: "secret-1",
      statementVersion: STATEMENT_VERSION,
      versions: [
        { agreementId: "A1", versionNo: 1 },
        { agreementId: "A2", versionNo: 2 },
      ],
    });

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onConfirmed).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(confirmVersions).toHaveBeenCalledTimes(1);
    expect(passwordField().value).toBe("");
  });

  it("ownerConfirmForm_afterAnswer_passwordCleared: the password field is empty after every answer, a wrong one marked on the field", async () => {
    renderForm();

    await confirmOnce(http(400, "VALIDATION_FAILED", { fields: ["currentPassword"] }), () =>
      expect(passwordField().getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByText(o.errors.wrongPassword)).toBeTruthy();

    await confirmOnce(http(409, "CONCURRENT_MODIFICATION"), () => expect(screen.getByText(o.errors.concurrent)).toBeTruthy());
    expect(screen.queryByText(o.errors.wrongPassword)).toBeNull();

    await confirmOnce(http(500, "INTERNAL_ERROR"), () => expect(screen.getByText(o.errors.failed)).toBeTruthy());
    expect(screen.queryByText("secret-1")).toBeNull();
  });

  it("ownerConfirmForm_refusals_texts: each refusal shows its text by code, and the eligibility lines per item", async () => {
    const props = renderForm();
    const alertText = () => screen.getByRole("alert").textContent;

    for (const [answer, text] of [
      [http(423, "ACCOUNT_LOCKED"), o.errors.locked],
      [http(429, "RATE_LIMITED"), o.errors.tooMany],
      [http(409, "CONCURRENT_MODIFICATION"), o.errors.concurrent],
      [http(500, "INTERNAL_ERROR", { correlationId: "c-9" }), `${o.errors.failed}Support code: c-9`],
      [http(400, "MALFORMED_REQUEST"), o.errors.failed],
    ] as const) {
      await confirmOnce(answer, () => expect(alertText()).toBe(text));
    }

    await confirmOnce(
      http(409, "AGREEMENT_NOT_ELIGIBLE", {
        fields: ["versions[0].reasonGroups.BASIS", "versions[0].reasonGroups.OWNER", "versions[1].reasonGroups.UNIT"],
      }),
      () => expect(within(screen.getByRole("alert")).getByText("Version 1 of unit P101 cannot be confirmed now:")).toBeTruthy(),
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Version 1 of unit P101 cannot be confirmed now:")).toBeTruthy();
    expect(within(alert).getByText(o.reasons.BASIS)).toBeTruthy();
    expect(within(alert).getByText(o.reasons.OWNER)).toBeTruthy();
    expect(within(alert).getByText("Version 2 of a unit with no code cannot be confirmed now:")).toBeTruthy();
    expect(within(alert).getByText(o.reasons.UNIT)).toBeTruthy();
    expect(within(alert).getByText(o.errors.contact)).toBeTruthy();
    expect(screen.queryByText("server text")).toBeNull();
    expect(props.onReload).not.toHaveBeenCalled();
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("ownerConfirmForm_outOfDate_handsBack: a version gone, no longer waiting, or a changed statement hands back so the page says it reloaded", async () => {
    const props = renderForm();

    for (const answer of [
      http(404, "NOT_FOUND"),
      http(409, "AGREEMENT_NOT_AWAITING_OWNER", { fields: ["versions[1]"] }),
      http(409, "AGREEMENT_STATEMENT_OUTDATED"),
    ]) {
      const calls = props.onReload.mock.calls.length;
      await confirmOnce(answer);
      expect(props.onReload).toHaveBeenCalledTimes(calls + 1);
    }
    expect(props.onConfirmed).not.toHaveBeenCalled();
  });

  it("ownerConfirmForm_twentyTicked_moreBoxesDisabled: at most 20 versions can be ticked; the other boxes are disabled until one is unticked", async () => {
    const items: BrokerageAgreementOwnerItem[] = Array.from({ length: 21 }, (_, index) => ({
      agreementId: `A${String(index + 1).padStart(2, "0")}`,
      status: "AWAITING_CONFIRMATION",
      transactionType: "LONG_TERM_RENT",
      unitCode: `P${index + 101}`,
      versions: [
        { versionNo: 1, status: "AWAITING_OWNER", startDate: "2027-01-01", endDate: "2027-12-31", answerBy: "2026-11-24T03:15:00Z" },
      ],
      statement: { version: STATEMENT_VERSION, text: `Version 1 of the brokerage agreement for unit P${index + 101}.` },
    }));
    vi.mocked(listMine).mockResolvedValue({ ok: true, status: 200, replayed: false, data: { items, more: false } });
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
        <OwnerAgreementsView />
      </NextIntlClientProvider>,
    );

    const boxes = (await screen.findAllByRole("checkbox")) as HTMLInputElement[];
    expect(boxes).toHaveLength(21);
    expect(screen.queryByLabelText(o.password)).toBeNull();
    for (const box of boxes.slice(0, 20)) fireEvent.click(box);

    expect(confirmButton(20)).toBeTruthy();
    expect(boxes[20]?.disabled).toBe(true);
    expect(boxes.slice(0, 20).every((box) => box.checked && !box.disabled)).toBe(true);

    fireEvent.click(boxes[3] as HTMLInputElement);
    expect(boxes[20]?.disabled).toBe(false);
    expect(confirmButton(19)).toBeTruthy();
  });
});
