import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the refusal call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  refuseActivation: vi.fn(),
}));

import { refuseActivation } from "../services/agreement-api";

import { ActivationRefusalDialog } from "./activation-refusal-dialog";

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

const act_ = en.BrokerageAgreement.activation;
const r = act_.refusal;
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
  const props = { onClose: vi.fn(), onRefused: vi.fn(), onChanged: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ActivationRefusalDialog agreementId="A1" versionNo={2} dataVersion={7} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "Refuse activation of version 2" });
const choice = (label: string) => within(dialog()).getByRole("radio", { name: label }) as HTMLInputElement;
const noteField = () => within(dialog()).getByLabelText(/^Note/) as HTMLTextAreaElement;
const refuseButton = () => within(dialog()).getByRole("button", { name: r.submit }) as HTMLButtonElement;
const keepButton = () => within(dialog()).getByRole("button", { name: r.keep }) as HTMLButtonElement;

/** Refuses once the last answer has ended, and waits until this one has ended too. */
async function refuseOnce(answer: ApiResult<undefined>) {
  vi.mocked(refuseActivation).mockResolvedValueOnce(answer);
  const before = vi.mocked(refuseActivation).mock.calls.length;
  await waitFor(() => expect(refuseButton().disabled).toBe(false));
  fireEvent.click(refuseButton());
  await waitFor(() => expect(refuseActivation).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(refuseButton().disabled).toBe(false));
}

describe("ActivationRefusalDialog (brokerage-agreement E05-S6, S6-D4, UF-2)", () => {
  beforeEach(() => {
    vi.mocked(refuseActivation).mockReset();
  });

  it("activationRefusalDialog_refuse_sendsTypeAndNoteOnceThenReads: a choice and a note go once on a double click; a 204 hands back so the page reads again; a blank note goes as null", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(refuseActivation).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    expect(within(dialog()).getByRole("group", { name: r.reason })).toBeTruthy();
    fireEvent.click(choice(r.SIGNER_NOT_OWNER));
    fireEvent.change(noteField(), { target: { value: "The signature is not the owner's." } });
    const formElement = refuseButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(refuseButton());
    fireEvent.dblClick(refuseButton());

    await waitFor(() => expect(refuseActivation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(refuseActivation).mock.calls[0]?.slice(0, 2)).toEqual([
      "A1",
      { expectedDataVersion: 7, versionNo: 2, reasonType: "SIGNER_NOT_OWNER", note: "The signature is not the owner's." },
    ]);
    expect(keepButton().disabled).toBe(true);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onRefused).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(refuseActivation).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("activationRefusalDialog_blankNote_sentAsNull: with no note the request carries null", async () => {
    vi.mocked(refuseActivation).mockResolvedValueOnce(NO_CONTENT);
    const props = renderDialog();

    fireEvent.click(choice(r.DOCUMENT_DIFFERS));
    fireEvent.change(noteField(), { target: { value: "   " } });
    fireEvent.click(refuseButton());

    await waitFor(() => expect(props.onRefused).toHaveBeenCalledTimes(1));
    expect(vi.mocked(refuseActivation).mock.calls[0]?.slice(0, 2)).toEqual([
      "A1",
      { expectedDataVersion: 7, versionNo: 2, reasonType: "DOCUMENT_DIFFERS", note: null },
    ]);
  });

  it("activationRefusalDialog_keepIt_noRequest: Refuse waits for a choice, with none picked by default; Keep it closes with no request", () => {
    const props = renderDialog();

    expect(choice(r.DOCUMENT_DIFFERS).checked).toBe(false);
    expect(choice(r.SIGNER_NOT_OWNER).checked).toBe(false);
    expect(refuseButton().disabled).toBe(true);
    expect(noteField().maxLength).toBe(500);
    expect(within(dialog()).getByText("(optional)")).toBeTruthy();

    fireEvent.change(noteField(), { target: { value: "Not now." } });
    fireEvent.click(keepButton());

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(refuseActivation).not.toHaveBeenCalled();
  });

  it("activationRefusalDialog_refusals_texts: each refusal shows its text by code, the note's on the note; a changed state hands back; no text holds the typed note", async () => {
    const props = renderDialog();
    const alertText = () => within(dialog()).getByRole("alert").textContent;
    fireEvent.click(choice(r.DOCUMENT_DIFFERS));
    fireEvent.change(noteField(), { target: { value: "Rent differs on page 2." } });

    for (const [answer, text] of [
      [http(403, "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT"), act_.errors.notIndependent],
      [http(404, "NOT_FOUND"), act_.errors.notFound],
      [http(403, "FORBIDDEN"), act_.errors.notFound],
      [http(500, "INTERNAL_ERROR", { correlationId: "c-9" }), `${r.errors.failed}Support code: c-9`],
    ] as const) {
      await refuseOnce(answer);
      expect(alertText()).toBe(text);
    }

    await refuseOnce(http(400, "VALIDATION_FAILED", { fields: ["note"] }));
    expect(within(dialog()).getByText(r.errors.badNote)).toBeTruthy();
    expect(noteField().getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog()).queryByRole("alert")).toBeNull();

    await refuseOnce(http(409, "CONCURRENT_MODIFICATION"));
    expect(alertText()).toContain(act_.errors.concurrent);
    fireEvent.click(within(dialog()).getByRole("button", { name: act_.reload }));
    expect(props.onReload).toHaveBeenCalledTimes(1);

    await refuseOnce(http(409, "AGREEMENT_NOT_AWAITING_ACTIVATION"));
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.onRefused).not.toHaveBeenCalled();

    // Every text but the note field itself (a controlled textarea mirrors its value into its own text).
    const copy = dialog().cloneNode(true) as HTMLElement;
    for (const note of Array.from(copy.querySelectorAll("textarea"))) note.remove();
    const shown = copy.textContent ?? "";
    for (const typed of ["server text", "Rent differs on page 2."]) expect(shown).not.toContain(typed);
  });
});
