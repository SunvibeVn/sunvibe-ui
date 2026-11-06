import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";

import { codeIssued, NO_CODE, ownerEmailProblem, ownerStateKey } from "./owner-code-state";

const t = createTranslator({ locale: "en", messages: en, namespace: "InventoryIntake" });

describe("the confirmation code", () => {
  it("ownerCode_shownOnceThenCleared: holds the code of the answer, and clearing leaves nothing of it", () => {
    const shown = codeIssued({ requestId: "R1", code: "ABCD2345", expiresAt: "2026-11-13T00:00:00Z" });
    expect(shown).toEqual({ kind: "shown", code: "ABCD2345", expiresAt: "2026-11-13T00:00:00Z" });
    expect(NO_CODE).toEqual({ kind: "none" });
    expect(JSON.stringify(NO_CODE)).not.toContain("ABCD2345");
  });

  it("ownerCode_shownOnceThenCleared: an answer with no code shows nothing", () => {
    expect(codeIssued({ requestId: "R1" })).toEqual(NO_CODE);
    expect(codeIssued({ requestId: "R1", code: "" })).toEqual(NO_CODE);
  });

  it("ownerCode_shownOnceThenCleared: keeps nothing else of the answer", () => {
    expect(codeIssued({ requestId: "R1", code: "ABCD2345", expiresAt: "x" })).not.toHaveProperty("requestId");
  });
});

describe("what the owner step says", () => {
  it("owner_neverSaysMatched: each owner state has one fixed text, and a decline or void reads as waiting", () => {
    expect(ownerStateKey("NONE")).toBe("owner.state.NONE");
    expect(ownerStateKey("WAITING")).toBe("owner.state.WAITING");
    expect(ownerStateKey("CONFIRMED")).toBe("owner.state.CONFIRMED");
    expect(ownerStateKey(undefined)).toBe("owner.state.NONE");
  });

  it("owner_neverSaysMatched: no owner text speaks of a match, an account found or a refusal", () => {
    const texts = Object.values(en.InventoryIntake.owner).flatMap((value) =>
      typeof value === "string" ? [value] : Object.values(value),
    );
    expect(texts.length).toBeGreaterThan(5);
    for (const text of texts) expect(text).not.toMatch(/match|found|exists|no account|declin|refus|void|reject/i);
  });

  it("owner_neverSaysMatched: the words after a request are the same for any email", () => {
    expect(t("owner.codeTitle")).toBe("Read this code to the owner by phone");
    expect(t("owner.codeOnce")).toBe("It is shown once. Staff give this code and never ask for it back.");
  });
});

describe("the owner email", () => {
  it("asks for an email and checks only its shape; the server answers the same for any address", () => {
    expect(ownerEmailProblem("")).toBe("required");
    expect(ownerEmailProblem("   ")).toBe("required");
    expect(ownerEmailProblem("no-at-sign")).toBe("invalid");
    expect(ownerEmailProblem("a@b")).toBeNull();
    expect(ownerEmailProblem(" owner@example.com ")).toBeNull();
    expect(ownerEmailProblem(`${"a".repeat(320)}@b.vn`)).toBe("invalid");
  });
});
