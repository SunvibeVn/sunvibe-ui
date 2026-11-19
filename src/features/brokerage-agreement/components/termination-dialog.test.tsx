import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

// The edge only: the termination call, so no request leaves the test.
vi.mock("../services/agreement-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/agreement-api")>()),
  terminateAgreement: vi.fn(),
}));

import { vietnamToday } from "../lib/termination-form";
import { terminateAgreement } from "../services/agreement-api";
import type { TerminationType } from "../types";

import { TerminationDialog } from "./termination-dialog";

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

function renderDialog(types: TerminationType[] = ["OWNER_WITHDREW", "UNIT_LET", "SUNVIBE_TERMINATED"]) {
  const props = { onClose: vi.fn(), onDone: vi.fn(), onChanged: vi.fn(), onReload: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="Asia/Ho_Chi_Minh">
      <TerminationDialog agreementId="A1" types={types} {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const dialog = () => screen.getByRole("dialog", { name: "End the agreement" });
const radios = () => within(dialog()).queryAllByRole("radio").map((radio) => radio.closest("label")?.textContent);
const choose = (label: string) => fireEvent.click(within(dialog()).getByRole("radio", { name: label }));
const field = (label: string | RegExp) => within(dialog()).queryByLabelText(label) as HTMLInputElement | null;
const endButton = () => within(dialog()).getByRole("button", { name: "End the agreement" }) as HTMLButtonElement;
const keepButton = () => within(dialog()).getByRole("button", { name: "Keep it" }) as HTMLButtonElement;

describe("TerminationDialog (brokerage-agreement E05-S8, S8-D5, E05S8-P10, UF-2)", () => {
  beforeEach(() => {
    vi.mocked(terminateAgreement).mockReset();
  });

  it("terminationDialog_allowedTypesOnly_fieldsOfTheChosen: only the allowed types, none chosen; each type shows its own fields; the date starts at today in Vietnam and goes no later; the body holds exactly the chosen type's fields", async () => {
    vi.mocked(terminateAgreement).mockResolvedValueOnce(NO_CONTENT);
    const props = renderDialog(["OWNER_WITHDREW", "UNIT_LET"]);
    const today = vietnamToday(new Date());

    expect(within(dialog()).getByRole("group", { name: "How did it end?" })).toBeTruthy();
    expect(radios()).toEqual(["The owner withdrew", "The unit is let"]);
    expect(within(dialog()).queryAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
    expect(field("Reported on")).toBeNull();

    choose("The owner withdrew");
    expect(field("Reported on")?.value).toBe(today);
    expect(field("Reported on")?.max).toBe(today);
    expect(field("Reported on")?.min).toBe("2000-01-01");
    expect(Array.from((field("How the owner said it") as unknown as HTMLSelectElement).options).map((option) => option.textContent)).toEqual([
      "Choose how",
      "Phone call",
      "In person",
      "Message",
      "Email",
      "Other",
    ]);
    expect(field(/^Note/)).toBeTruthy();
    expect(field("Tenant introduced by Sunvibe")).toBeNull();
    expect(field("Reason for Sunvibe's decision")).toBeNull();

    choose("The unit is let");
    expect(field("How the owner said it")).toBeNull();
    const introduced = field("Tenant introduced by Sunvibe") as unknown as HTMLSelectElement;
    expect(Array.from(introduced.options).map((option) => option.textContent)).toEqual(["Choose an answer", "Yes", "No", "Not known"]);
    fireEvent.change(introduced, { target: { value: "UNKNOWN" } });
    fireEvent.click(endButton());

    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    expect(vi.mocked(terminateAgreement).mock.calls[0]?.slice(0, 2)).toStrictEqual([
      "A1",
      { type: "UNIT_LET", reportedOn: today, introducedBySunvibe: "UNKNOWN", note: null },
    ]);

    // Sunvibe's decision, when allowed: its required note only.
    renderDialog(["SUNVIBE_TERMINATED"]);
    const dialogs = screen.getAllByRole("dialog", { name: "End the agreement" });
    const last = dialogs[dialogs.length - 1] as HTMLElement;
    fireEvent.click(within(last).getByRole("radio", { name: "Sunvibe's decision" }));
    expect(within(last).queryByLabelText("Reported on")).toBeNull();
    expect(within(last).getByLabelText("Reason for Sunvibe's decision")).toBeTruthy();
  });

  it("terminationDialog_doubleClick_onePost: one request per click while it runs, Keep it disabled meanwhile, a 204 hands back once", async () => {
    let answer: (result: ApiResult<undefined>) => void = () => undefined;
    vi.mocked(terminateAgreement).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const props = renderDialog();

    choose("Sunvibe's decision");
    fireEvent.change(field("Reason for Sunvibe's decision") as HTMLElement, { target: { value: "Repeated complaints." } });
    const formElement = endButton().closest("form") as HTMLFormElement;
    act(() => {
      fireEvent.submit(formElement);
      fireEvent.submit(formElement);
    });
    fireEvent.click(endButton());
    fireEvent.dblClick(endButton());

    await waitFor(() => expect(terminateAgreement).toHaveBeenCalledTimes(1));
    expect(vi.mocked(terminateAgreement).mock.calls[0]?.slice(0, 2)).toStrictEqual([
      "A1",
      { type: "SUNVIBE_TERMINATED", note: "Repeated complaints." },
    ]);
    expect(keepButton().disabled).toBe(true);

    answer(NO_CONTENT);
    await waitFor(() => expect(props.onDone).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(terminateAgreement).toHaveBeenCalledTimes(1);
  });

  it("terminationDialog_fieldError_focusAndMessage: a check that fails shows its message on the field and moves the focus to the first field in error; a field the server refuses does the same", async () => {
    renderDialog();

    fireEvent.click(endButton());
    expect(await within(dialog()).findByText("Choose how the agreement ended.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog()).getByRole("radio", { name: "The owner withdrew" })));

    choose("The owner withdrew");
    fireEvent.change(field("Reported on") as HTMLElement, { target: { value: "" } });
    fireEvent.click(endButton());
    expect(await within(dialog()).findByText("Enter a date from 1 Jan 2000 to today.")).toBeTruthy();
    expect(within(dialog()).getByText("Choose how the owner said it.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field("Reported on")));
    expect(field("Reported on")?.getAttribute("aria-describedby")).toBeTruthy();
    expect(terminateAgreement).not.toHaveBeenCalled();

    vi.mocked(terminateAgreement).mockResolvedValueOnce({
      ok: false,
      kind: "http",
      status: 400,
      code: "VALIDATION_FAILED",
      fieldErrors: [{ field: "note", message: "server text" }],
    });
    fireEvent.change(field("Reported on") as HTMLElement, { target: { value: "2026-01-15" } });
    fireEvent.change(field("How the owner said it") as HTMLElement, { target: { value: "EMAIL" } });
    fireEvent.change(field(/^Note/) as HTMLElement, { target: { value: "Bad‮text" } });
    fireEvent.click(endButton());
    expect(await within(dialog()).findByText("This text cannot be saved. Remove special characters.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field(/^Note/)));
    expect(within(dialog()).queryByText("server text")).toBeNull();
  });
});
