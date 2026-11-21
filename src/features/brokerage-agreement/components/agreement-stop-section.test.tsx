import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the four stop calls, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  suspendAgreement: vi.fn(),
  releaseAgreementSuspension: vi.fn(),
  terminateAgreement: vi.fn(),
  cancelAgreement: vi.fn(),
}));

import type { StopModel } from "../lib/stop-model";
import { cancelAgreement, releaseAgreementSuspension, suspendAgreement, terminateAgreement } from "../services/agreement-api";

import { AgreementStopSection } from "./agreement-stop-section";

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

const http = (status: number, code: string, extra: { fields?: string[]; correlationId?: string } = {}): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: (extra.fields ?? []).map((field) => ({ field, message: "server text" })),
  ...(extra.correlationId === undefined ? {} : { correlationId: extra.correlationId }),
});

const ALL_ACTIONS: StopModel["actions"] = {
  suspend: true,
  release: true,
  cancel: true,
  terminateTypes: ["OWNER_WITHDREW", "UNIT_LET", "SUNVIBE_TERMINATED"],
};
const NO_ACTIONS: StopModel["actions"] = { suspend: false, release: false, cancel: false, terminateTypes: [] };

function renderSection(model: StopModel, dataVersion: number | null = 7) {
  const props = { onDone: vi.fn(), onChanged: vi.fn(), onReload: vi.fn() };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <AgreementStopSection agreementId="A1" dataVersion={dataVersion} model={model} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...props, view };
}

const section = () => screen.getByRole("region", { name: "Agreement state" });
const buttonsOf = (element: HTMLElement) => within(element).queryAllByRole("button").map((button) => button.textContent);
const dialog = () => screen.getByRole("dialog");

/** Each dialog of the section: the button that opens it, how it is filled, its submit button and its call. */
const DIALOGS = [
  {
    name: "suspension",
    open: "Suspend",
    fill: () => fireEvent.change(within(dialog()).getByLabelText("Reason"), { target: { value: "COMPLAINT" } }),
    submit: "Suspend",
    call: () => vi.mocked(suspendAgreement),
    code: "AGREEMENT_ALREADY_SUSPENDED",
    refusal: http(409, "AGREEMENT_ALREADY_SUSPENDED"),
  },
  {
    name: "release",
    open: "Lift the suspension",
    fill: () => fireEvent.change(within(dialog()).getByLabelText("Reason for lifting it"), { target: { value: "Checked." } }),
    submit: "Lift",
    call: () => vi.mocked(releaseAgreementSuspension),
    code: "AGREEMENT_RELEASER_NOT_INDEPENDENT",
    refusal: http(403, "AGREEMENT_RELEASER_NOT_INDEPENDENT"),
  },
  {
    name: "termination",
    open: "End the agreement",
    fill: () => {
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Sunvibe's decision" }));
      fireEvent.change(within(dialog()).getByLabelText("Reason for Sunvibe's decision"), { target: { value: "Fraud." } });
    },
    submit: "End the agreement",
    call: () => vi.mocked(terminateAgreement),
    code: "AGREEMENT_TERMINATION_NOT_ALLOWED",
    refusal: http(403, "AGREEMENT_TERMINATION_NOT_ALLOWED"),
  },
  {
    name: "cancellation",
    open: "Cancel the agreement",
    fill: () => undefined,
    submit: "Cancel the agreement",
    call: () => vi.mocked(cancelAgreement),
    code: "AGREEMENT_TOOK_EFFECT",
    refusal: http(409, "AGREEMENT_TOOK_EFFECT"),
  },
] as const;

/** Opens the dialog through its section button, fills it and submits it once against `answer`; waits for the call. */
async function submitThrough(entry: (typeof DIALOGS)[number], answer: ApiResult<undefined>) {
  entry.call().mockResolvedValueOnce(answer);
  const before = entry.call().mock.calls.length;
  fireEvent.click(within(section()).getByRole("button", { name: entry.open }));
  entry.fill();
  fireEvent.click(within(dialog()).getByRole("button", { name: entry.submit }));
  await waitFor(() => expect(entry.call()).toHaveBeenCalledTimes(before + 1));
}

describe("AgreementStopSection (brokerage-agreement E05-S8, spec section 6, UF-1 to UF-4)", () => {
  beforeEach(() => {
    for (const entry of DIALOGS) entry.call().mockReset();
  });

  it("agreementStopSection_buttons_exactlyTheActions: one button per action of the model, End the agreement for any termination type, none when the model has none", () => {
    const all = renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS });
    expect(within(section()).getByRole("heading", { level: 2, name: "Agreement state" })).toBeTruthy();
    expect(buttonsOf(section())).toEqual(["Suspend", "Lift the suspension", "End the agreement", "Cancel the agreement"]);
    all.view.unmount();

    const one = renderSection({ lines: [], earlier: false, actions: { ...NO_ACTIONS, terminateTypes: ["UNIT_LET"] } });
    expect(buttonsOf(section())).toEqual(["End the agreement"]);
    one.view.unmount();

    const none = renderSection({
      lines: [{ phrase: { key: "stop.cancelled", values: { time: "2026-12-01 10:00" } }, note: null }],
      earlier: false,
      actions: NO_ACTIONS,
    });
    expect(buttonsOf(section())).toEqual([]);
    none.view.unmount();

    // Without the data version the page read, the two commands that send it are not offered.
    renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS }, null);
    expect(buttonsOf(section())).toEqual(["Suspend", "End the agreement"]);
    expect(suspendAgreement).not.toHaveBeenCalled();
  });

  it("agreementStopSection_lines_renderedAsText: each line, its note and the earlier line are shown as text; markup in a private text stays characters", () => {
    renderSection({
      lines: [
        { phrase: { key: "stop.sunvibe", values: { time: "2027-04-02 10:00", note: "<b>x</b>" } }, note: null },
        {
          phrase: { key: "stop.suspendedSince", values: { time: "2027-03-01 10:00", reason: { key: "stop.reasons.COMPLAINT" } } },
          note: "<b>x</b> & <i>y</i>",
        },
      ],
      earlier: true,
      actions: NO_ACTIONS,
    });

    expect(within(section()).getByText("Ended on 2027-04-02 10:00 by Sunvibe: <b>x</b>.")).toBeTruthy();
    expect(within(section()).getByText("Suspended since 2027-03-01 10:00: a complaint.")).toBeTruthy();
    expect(within(section()).getByText("Note: <b>x</b> & <i>y</i>")).toBeTruthy();
    expect(within(section()).getByText("Earlier suspensions are in the history.")).toBeTruthy();
    expect(section().querySelector("b, i")).toBeNull();
  });

  it("stopDialogs_refused_closeAndReportTheCode: a 403 or 409 code of its command closes each dialog and hands its code to the page, which reads again", async () => {
    for (const entry of DIALOGS) {
      const props = renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS });
      await submitThrough(entry, entry.refusal);

      await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
      expect(props.onChanged).toHaveBeenCalledWith(entry.code);
      expect(props.onDone).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      props.view.unmount();
    }
  });

  it("stopDialogs_concurrent_reloadButton: CONCURRENT_MODIFICATION keeps each dialog open with Something changed at the same time and a Reload that reads the page again", async () => {
    for (const entry of DIALOGS) {
      const props = renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS });
      await submitThrough(entry, http(409, "CONCURRENT_MODIFICATION"));

      const alert = await within(dialog()).findByRole("alert");
      expect(alert.textContent).toContain("Something changed at the same time.");
      fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
      expect(props.onReload).toHaveBeenCalledTimes(1);
      expect(props.onChanged).not.toHaveBeenCalled();
      props.view.unmount();
    }
  });

  it("stopDialogs_notFound_unavailableLine: a 404 keeps each dialog open with This agreement is not available; a 500 shows the failure with its support code", async () => {
    for (const entry of DIALOGS) {
      const props = renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS });
      await submitThrough(entry, http(404, "NOT_FOUND"));

      expect((await within(dialog()).findByRole("alert")).textContent).toBe("This agreement is not available.");
      expect(props.onDone).not.toHaveBeenCalled();
      expect(props.onChanged).not.toHaveBeenCalled();
      props.view.unmount();
    }

    const props = renderSection({ lines: [], earlier: false, actions: ALL_ACTIONS });
    await submitThrough(DIALOGS[0], http(500, "INTERNAL_ERROR", { correlationId: "c-9" }));
    expect((await within(dialog()).findByRole("alert")).textContent).toBe("The change could not be saved.Support code: c-9");
    props.view.unmount();
  });
});
