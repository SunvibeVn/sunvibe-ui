import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { OwnerConfirmationItem } from "../types";

import {
  closesDetails,
  codeProblem,
  confirmationItems,
  FORM_IDLE,
  formStateAfter,
  formText,
  passwordProblem,
  phraseProblem,
  runConfirmation,
} from "./confirmation-flow";

const t = createTranslator({ locale: "en", messages: en, namespace: "InventoryIntake" });

const http = (status: number, code: string, fields: string[] = []): ApiResult<undefined> => ({
  ok: false,
  kind: "http",
  status,
  code,
  fieldErrors: fields.map((field) => ({ field, message: "x" })),
  correlationId: "c-1",
});

const run = (answer: ApiResult<undefined>, isCurrent = true) => runConfirmation({ send: async () => answer, isCurrent: () => isCurrent });

const snapshot = { leadCode: "R-1", wardName: "Hải Châu", assetType: "HOUSE" as const, address: "12 Lê Lợi", parts: [{ code: "WHOLE", location: null }] };

describe("the list of the account page", () => {
  it("beforeCode_onlyRequestAndEndDate: a pending request shows that it exists and when it ends, and nothing else", () => {
    const pending: OwnerConfirmationItem = { requestId: "Q1", status: "PENDING", expiresAt: "2026-11-13T00:00:00Z" };
    expect(confirmationItems({ items: [pending] })).toEqual([{ kind: "pending", requestId: "Q1", expiresAt: "2026-11-13T00:00:00Z" }]);
  });

  it("beforeCode_onlyRequestAndEndDate: drops any details a pending item might carry", () => {
    const leaky: OwnerConfirmationItem = { requestId: "Q1", status: "PENDING", expiresAt: "x", details: snapshot, checkOpen: true };
    expect(JSON.stringify(confirmationItems({ items: [leaky] }))).not.toContain("Lê Lợi");
    expect(confirmationItems({ items: [leaky] })[0]).not.toHaveProperty("asksForPhrase");
  });

  it("confirmed_asksForPhraseWhileCheckOpen: a confirmed item shows its snapshot, and asks for the phrase only while a check is open", () => {
    const confirmed: OwnerConfirmationItem = { requestId: "Q1", status: "CONFIRMED", expiresAt: "x", details: snapshot, checkOpen: true };
    expect(confirmationItems({ items: [confirmed] })).toEqual([
      { kind: "confirmed", requestId: "Q1", expiresAt: "x", details: snapshot, asksForPhrase: true },
    ]);
    expect(confirmationItems({ items: [{ ...confirmed, checkOpen: false }] })[0]).toMatchObject({ asksForPhrase: false });
    expect(confirmationItems({ items: [{ ...confirmed, checkOpen: undefined }] })[0]).toMatchObject({ asksForPhrase: false });
  });

  it("noStepHoldsPhraseToShow: no view of the page has a phrase to show, only the question of asking for one", () => {
    const item = { requestId: "Q1", status: "CONFIRMED", details: snapshot, checkOpen: true, phrase: "AB12CD" } as OwnerConfirmationItem;
    const shown = JSON.stringify(confirmationItems({ items: [item] }));
    expect(shown).not.toContain("AB12CD");
    expect(shown).not.toContain('"phrase"');
  });

  it("noStepHoldsPhraseToShow: no text of the account page has a place for a phrase or a code", () => {
    expect(JSON.stringify(en.InventoryIntake.account)).not.toMatch(/\{(phrase|code)\}/);
  });

  it("reads an empty list, and skips an item with no id", () => {
    expect(confirmationItems({})).toEqual([]);
    expect(confirmationItems({ items: [{ status: "PENDING" }] })).toEqual([]);
  });
});

describe("runConfirmation", () => {
  it("wrongPassword_message: a wrong password is a field problem with its own words, and keeps the page", async () => {
    await expect(run(http(400, "VALIDATION_FAILED", ["currentPassword"]))).resolves.toEqual({
      kind: "password",
      key: "account.problems.wrongPassword",
    });
    expect(t("account.problems.wrongPassword")).toBe("That password isn't right.");
  });

  it("locked_message: a locked account says so", async () => {
    await expect(run(http(423, "ACCOUNT_LOCKED"))).resolves.toEqual({
      kind: "message",
      message: { key: "account.errors.locked", correlationId: "c-1" },
      reload: false,
    });
    expect(t("account.errors.locked")).toBe("Your account is locked for a while. Try again later.");
  });

  it("lateAnswerAfterAccountChange_dropped: an answer for another account shows nothing, whatever it says", async () => {
    await expect(run({ ok: true, data: undefined, status: 204, replayed: false }, false)).resolves.toEqual({ kind: "dropped" });
    await expect(run(http(400, "CONFIRMATION_INVALID"), false)).resolves.toEqual({ kind: "dropped" });
    await expect(run(http(423, "ACCOUNT_LOCKED"), false)).resolves.toEqual({ kind: "dropped" });
  });

  it("gives one answer for a bad code, an ended request and a voided one", async () => {
    await expect(run(http(400, "CONFIRMATION_INVALID"))).resolves.toEqual({
      kind: "message",
      message: { key: "account.errors.invalid", correlationId: "c-1" },
      reload: false,
    });
  });

  it("reads the list again after a conflict (the contract's 409 on confirm, decline, check and withdrawal)", async () => {
    await expect(run(http(409, "CONCURRENT_MODIFICATION"))).resolves.toEqual({
      kind: "message",
      message: { key: "account.errors.stale", correlationId: "c-1" },
      reload: true,
    });
  });

  it("reads the list again after a 404: the request is gone for this account", async () => {
    await expect(run(http(404, "NOT_FOUND"))).resolves.toMatchObject({ message: { key: "account.errors.gone" }, reload: true });
  });

  it("asks to wait after a rate limit", async () => {
    await expect(run(http(429, "RATE_LIMITED"))).resolves.toMatchObject({ message: { key: "account.errors.rateLimited" }, reload: false });
  });

  it("reads the list again after a 5xx or a lost answer: the command may have committed", async () => {
    await expect(run(http(500, "INTERNAL_ERROR"))).resolves.toMatchObject({ message: { key: "account.errors.retry" }, reload: true });
    await expect(run({ ok: false, kind: "network" })).resolves.toMatchObject({ message: { key: "account.errors.retry" }, reload: true });
  });

  it("leaves the session states to the session screens", async () => {
    await expect(run({ ok: false, kind: "signed-out" })).resolves.toEqual({ kind: "session" });
    await expect(run({ ok: false, kind: "unavailable" })).resolves.toEqual({ kind: "session" });
  });

  it("answers the data of a success", async () => {
    await expect(run({ ok: true, data: undefined, status: 204, replayed: false })).resolves.toEqual({ kind: "done", data: undefined });
  });
});

describe("the fields of the account page", () => {
  it("wants a code, a phrase and a password", () => {
    expect(codeProblem(" ")).toBe("required");
    expect(codeProblem("abcd2345")).toBeNull();
    expect(codeProblem("a".repeat(33))).toBe("invalid");
    expect(phraseProblem("")).toBe("required");
    expect(phraseProblem("ab12cd")).toBeNull();
    expect(passwordProblem("")).toBe("required");
    expect(passwordProblem("secret")).toBeNull();
  });
});

describe("formStateAfter", () => {
  it("shows a message that keeps the form", () => {
    const message = { key: "account.errors.invalid" as const };
    expect(formStateAfter({ kind: "message", message, reload: false })).toEqual({ ...FORM_IDLE, message });
  });

  it("wrongPassword_message: puts the words under the password field", () => {
    expect(formStateAfter({ kind: "password", key: "account.problems.wrongPassword" })).toEqual({
      ...FORM_IDLE,
      passwordProblem: "account.problems.wrongPassword",
    });
  });

  it("lateAnswerAfterAccountChange_dropped: shows nothing for a dropped answer, a session state or a success", () => {
    expect(formStateAfter({ kind: "dropped" })).toEqual(FORM_IDLE);
    expect(formStateAfter({ kind: "session" })).toEqual(FORM_IDLE);
    expect(formStateAfter({ kind: "done", data: undefined })).toEqual(FORM_IDLE);
  });
});

describe("closesDetails", () => {
  it("a refused code after its details means the request ended: its address does not stay on screen", () => {
    expect(closesDetails({ kind: "message", message: { key: "account.errors.invalid" }, reload: false })).toBe(true);
  });

  it("a list that moved closes them too", () => {
    expect(closesDetails({ kind: "message", message: { key: "account.errors.stale" }, reload: true })).toBe(true);
  });

  it("a wrong password, a lock or a limit keep them", () => {
    expect(closesDetails({ kind: "password", key: "account.problems.wrongPassword" })).toBe(false);
    expect(closesDetails({ kind: "message", message: { key: "account.errors.locked" }, reload: false })).toBe(false);
    expect(closesDetails({ kind: "message", message: { key: "account.errors.rateLimited" }, reload: false })).toBe(false);
  });
});

describe("formText", () => {
  it("reads a text field, and gives an empty text for anything else", () => {
    const data = new FormData();
    data.set("code", "ABCD");
    data.set("file", new Blob(["x"]));
    expect(formText(data, "code")).toBe("ABCD");
    expect(formText(data, "file")).toBe("");
    expect(formText(data, "none")).toBe("");
  });
});
