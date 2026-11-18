import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the new-draft call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  openDraft: vi.fn(),
}));

import { openDraft } from "../services/agreement-api";

import { DraftOpenNotice } from "./draft-open-notice";

const n = en.BrokerageAgreement.newDraft;
const AGREEMENT_ID = "01JF000000000000000000000A";

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderNotice() {
  const props = { onOpened: vi.fn(), onNotAllowed: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <DraftOpenNotice agreementId={AGREEMENT_ID} dataVersion={4} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const openButton = () => screen.getByRole("button", { name: n.open }) as HTMLButtonElement;

/** Clicks "Open a new draft" once the last request has ended, and waits until this one has ended too. */
async function openOnce(answer: ApiResult<undefined>) {
  vi.mocked(openDraft).mockResolvedValueOnce(answer);
  const before = vi.mocked(openDraft).mock.calls.length;
  await waitFor(() => expect(openButton().disabled).toBe(false));
  fireEvent.click(openButton());
  await waitFor(() => expect(openDraft).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(openButton().disabled).toBe(false));
}

describe("DraftOpenNotice (brokerage-agreement E05-S5, S5-D10, UF-1)", () => {
  beforeEach(() => {
    vi.mocked(openDraft).mockReset();
  });

  it("draftOpenNotice_open_onePostWithTheDataVersion: the notice says why; a double click sends one POST with the data version it was given, and a 204 hands back", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(openDraft).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderNotice();

    expect(screen.getByText(n.notice)).toBeTruthy();
    const formElement = openButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(openButton());
    fireEvent.dblClick(openButton());

    await waitFor(() => expect(openDraft).toHaveBeenCalledTimes(1));
    expect(vi.mocked(openDraft).mock.calls[0]?.slice(0, 2)).toEqual([AGREEMENT_ID, { expectedDataVersion: 4 }]);
    expect(openButton().disabled).toBe(true);

    answer({ ok: true, status: 204, replayed: false, data: undefined });
    await waitFor(() => expect(props.onOpened).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(openDraft).toHaveBeenCalledTimes(1);
  });

  it("draftOpenNotice_refusals_texts: a pending version hands back so the page reloads; the other refusals show their texts by code", async () => {
    const props = renderNotice();
    const alertText = () => screen.getByRole("alert").textContent;

    await openOnce(http(409, "AGREEMENT_NEW_DRAFT_NOT_ALLOWED"));
    expect(props.onNotAllowed).toHaveBeenCalledTimes(1);

    await openOnce(http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS"] }));
    expect(alertText()).toBe(`${n.errors.notEligible}${en.BrokerageAgreement.eligibility.reasons.BASIS}`);
    for (const [answer, text] of [
      [http(403, "AGREEMENT_NOT_ASSIGNEE"), n.errors.notAssignee],
      [http(404, "NOT_FOUND"), n.errors.notFound],
      [http(500, "INTERNAL_ERROR", { correlationId: "c-9" }), `${n.errors.failed}Support code: c-9`],
    ] as const) {
      await openOnce(answer);
      expect(alertText()).toBe(text);
    }

    await openOnce(http(409, "CONCURRENT_MODIFICATION", { fields: ["expectedDataVersion"] }));
    expect(screen.getByRole("alert").textContent).toContain(n.errors.stale);
    expect(screen.queryByText("server text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: n.reload }));
    expect(props.onReload).toHaveBeenCalledTimes(1);
    expect(props.onOpened).not.toHaveBeenCalled();
  });
});
