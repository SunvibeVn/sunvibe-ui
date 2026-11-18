import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { ActivationModel } from "../lib/activation-model";

// The edge only: the activation and refusal calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  activate: vi.fn(),
  refuseActivation: vi.fn(),
}));

import { activate, refuseActivation } from "../services/agreement-api";

import { ActivationForm } from "./activation-form";

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
const STATEMENT_TEXT = "I compared every term of version 2 with the signed document.\nThe owner signed it in person.";

const MODEL: Extract<ActivationModel, { kind: "decide" }> = {
  kind: "decide",
  versionNo: 2,
  confirmedAt: "2026-11-17T03:15:00Z",
  activateBy: "2026-12-01T03:15:00Z",
  statementVersion: "brokerage-activation-2026-11",
  statementText: STATEMENT_TEXT,
  freeFee: null,
};

const NO_CONTENT: ApiResult<undefined> = { ok: true, status: 204, replayed: false, data: undefined };
const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

function renderForm(model: Extract<ActivationModel, { kind: "decide" }> = MODEL) {
  const props = { onDecided: vi.fn(), onChanged: vi.fn(), onReload: vi.fn() };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <ActivationForm agreementId="A1" dataVersion={7} model={model} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...props, ...view };
}

const section = () => screen.getByRole("region", { name: act_.title });
const field = (label: string) => within(section()).getByLabelText(label) as HTMLInputElement;
const statementBox = () => within(section()).getByRole("checkbox", { name: act_.statementBox }) as HTMLInputElement;
const activateButton = () => within(section()).getByRole("button", { name: act_.activate }) as HTMLButtonElement;

/** Types the document's four values and ticks the statement. */
function fill(values: { number?: string; signedOn?: string; name?: string; title?: string } = {}) {
  fireEvent.change(field(act_.documentNumber), { target: { value: values.number ?? "HDMG-2026/014" } });
  fireEvent.change(field(act_.signedOn), { target: { value: values.signedOn ?? "2026-11-16" } });
  fireEvent.change(field(act_.signatoryName), { target: { value: values.name ?? "Nguyen Van A" } });
  fireEvent.change(field(act_.signatoryTitle), { target: { value: values.title ?? "Director" } });
  if (!statementBox().checked) fireEvent.click(statementBox());
}

/** Activates once the last request has ended, and waits until this one has ended too. */
async function activateOnce(answer: ApiResult<undefined>) {
  vi.mocked(activate).mockResolvedValueOnce(answer);
  const before = vi.mocked(activate).mock.calls.length;
  await waitFor(() => expect(activateButton().disabled).toBe(false));
  fireEvent.click(activateButton());
  await waitFor(() => expect(activate).toHaveBeenCalledTimes(before + 1));
  await waitFor(() => expect(activateButton().disabled).toBe(false));
}

describe("ActivationForm (brokerage-agreement E05-S6, S6-D1, S6-D3, S6-D22, UF-1)", () => {
  beforeEach(() => {
    vi.mocked(activate).mockReset();
    vi.mocked(refuseActivation).mockReset();
  });

  it("activationForm_render_confirmedLineFieldsAndStatement: the confirmed line with its deadline, the four fields, the statement and its box; Activate stays disabled until it is ticked", () => {
    renderForm();

    expect(within(section()).getByRole("heading", { name: act_.title })).toBeTruthy();
    expect(within(section()).getByText(/^The owner confirmed version 2 on /).textContent).toMatch(
      /^The owner confirmed version 2 on Nov 17, 2026.*10:15.*\. Activate it by Dec 1, 2026.*10:15.*\.$/,
    );
    for (const label of [act_.documentNumber, act_.signatoryName, act_.signatoryTitle]) {
      expect(field(label).value).toBe("");
      expect(field(label).type).toBe("text");
    }
    expect(field(act_.signedOn).type).toBe("date");
    expect(within(section()).getByText(/^I compared every term of version 2/).textContent).toBe(STATEMENT_TEXT);
    expect(statementBox().checked).toBe(false);
    expect(activateButton().disabled).toBe(true);
    expect(within(section()).queryByText(/^Check against the signed document/)).toBeNull();

    fireEvent.click(statementBox());
    expect(activateButton().disabled).toBe(false);

    fireEvent.click(within(section()).getByRole("button", { name: act_.refuse }));
    expect(screen.getByRole("dialog", { name: "Refuse activation of version 2" })).toBeTruthy();
    expect(refuseActivation).not.toHaveBeenCalled();
  });

  it("activationForm_freeFee_checkLineRenderedAsText: a free fee shows the check line above the fields, its reason as text only", () => {
    const first = renderForm({ ...MODEL, freeFee: { reason: "First unit with Sunvibe" } });
    const line = within(section()).getByText(/^Check against the signed document/);
    expect(line.textContent).toBe(
      "Check against the signed document: the brokerage fee of version 2 is free of charge. Reason: First unit with Sunvibe.",
    );
    // Above the fields.
    expect(line.compareDocumentPosition(field(act_.documentNumber)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();

    const markup = renderForm({ ...MODEL, freeFee: { reason: "<b>x</b>" } });
    expect(within(section()).getByText(/^Check against the signed document/).textContent).toContain("Reason: <b>x</b>.");
    expect(markup.container.querySelector("b")).toBeNull();
    markup.unmount();

    renderForm({ ...MODEL, freeFee: { reason: null } });
    expect(within(section()).getByText(/^Check against the signed document/).textContent).toBe(act_.freeFeeNoReason.replace("{number}", "2"));
  });

  it("activationForm_activate_oneRequestOnDoubleClick: a double click sends one request with the statement version, the data version and the trimmed values; a 204 hands back once", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(activate).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderForm();
    fill({ number: "  HDMG-2026/014  ", name: " Nguyen Van A ", title: "Director  " });

    const formElement = activateButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(activateButton());
    fireEvent.dblClick(activateButton());

    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    expect(vi.mocked(activate).mock.calls[0]?.slice(0, 2)).toEqual([
      "A1",
      {
        expectedDataVersion: 7,
        versionNo: 2,
        statementVersion: "brokerage-activation-2026-11",
        documentNumber: "HDMG-2026/014",
        signedOn: "2026-11-16",
        sunvibeSignatoryName: "Nguyen Van A",
        sunvibeSignatoryTitle: "Director",
      },
    ]);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onDecided).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("activationForm_refusals_texts: client checks block the request; each refusal shows its text by code, a field's on the field; a changed state hands back; no text holds a typed value", async () => {
    const props = renderForm();
    const alertText = () => within(section()).getByRole("alert").textContent;

    // The browser's checks: nothing is sent while one fails.
    fireEvent.click(statementBox());
    fireEvent.change(field(act_.signatoryTitle), { target: { value: "t".repeat(101) } });
    fireEvent.click(activateButton());
    await waitFor(() => expect(within(section()).getByText(act_.errors.documentNumber)).toBeTruthy());
    for (const text of [act_.errors.signedOn, act_.errors.signatoryName, act_.errors.signatoryTitle]) {
      expect(within(section()).getByText(text)).toBeTruthy();
    }
    expect(field(act_.documentNumber).getAttribute("aria-invalid")).toBe("true");
    expect(activate).not.toHaveBeenCalled();

    fill();
    for (const [answer, text] of [
      [http(403, "AGREEMENT_ACTIVATOR_NOT_INDEPENDENT"), act_.errors.notIndependent],
      [http(409, "AGREEMENT_VERSION_PERIOD_ENDED"), act_.errors.periodEnded],
      [http(409, "AGREEMENT_NOT_ELIGIBLE", { fields: ["reasonGroups.BASIS"] }), `${act_.errors.notEligible}${en.BrokerageAgreement.eligibility.reasons.BASIS}`],
      [http(404, "NOT_FOUND"), act_.errors.notFound],
      [http(403, "FORBIDDEN"), act_.errors.notFound],
      [http(500, "INTERNAL_ERROR", { correlationId: "c-9" }), `${act_.errors.failed}Support code: c-9`],
      [http(400, "MALFORMED_REQUEST", { correlationId: "c-8" }), `${act_.errors.failed}Support code: c-8`],
    ] as const) {
      await activateOnce(answer);
      expect(alertText()).toBe(text);
    }

    await activateOnce(http(400, "VALIDATION_FAILED", { fields: ["sunvibeSignatoryName", "signedOn"] }));
    expect(within(section()).getByText(act_.errors.characters)).toBeTruthy();
    expect(field(act_.signatoryName).getAttribute("aria-invalid")).toBe("true");
    expect(within(section()).getByText(act_.errors.signedOn)).toBeTruthy();
    expect(field(act_.signedOn).getAttribute("aria-invalid")).toBe("true");
    expect(within(section()).queryByRole("alert")).toBeNull();

    await activateOnce(http(409, "CONCURRENT_MODIFICATION"));
    expect(alertText()).toContain(act_.errors.concurrent);
    fireEvent.click(within(section()).getByRole("button", { name: act_.reload }));
    expect(props.onReload).toHaveBeenCalledTimes(1);

    await activateOnce(http(409, "AGREEMENT_NOT_AWAITING_ACTIVATION"));
    await activateOnce(http(409, "AGREEMENT_STATEMENT_OUTDATED"));
    expect(props.onChanged).toHaveBeenCalledTimes(2);
    expect(props.onDecided).not.toHaveBeenCalled();

    // The page shows no server text and no value the manager typed outside the fields (brokerage-agreement BR-17).
    const shown = section().textContent ?? "";
    for (const typed of ["server text", "HDMG-2026/014", "Nguyen Van A", "Director"]) expect(shown).not.toContain(typed);
  });
});
