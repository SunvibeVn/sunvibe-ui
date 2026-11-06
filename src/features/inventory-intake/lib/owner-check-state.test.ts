import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import type { IntakeBlock, OwnerCheckContext, OwnerCheckStarted } from "../types";

import {
  basisKey,
  canStartCheck,
  checkBasisProblem,
  NO_PHRASE,
  phraseIssued,
  phraseMsLeft,
  readsOwnerCheck,
  refusalRows,
  runOwnerCheck,
  signalRows,
} from "./owner-check-state";

const MANAGER = { assignee: false, manager: true };
const SALE = { assignee: true, manager: false };
const required: IntakeBlock = { ownerState: "CONFIRMED", ownerCheck: "REQUIRED" };

describe("who reads the owner check", () => {
  it("ownerCheck_contextOnlyForManager: a manager reads it while a proof waits for or has its check", () => {
    expect(readsOwnerCheck(required, MANAGER)).toBe(true);
    expect(readsOwnerCheck({ ...required, ownerCheck: "DONE" }, MANAGER)).toBe(true);
  });

  it("ownerCheck_contextOnlyForManager: the assignee and a Sale never call it", () => {
    expect(readsOwnerCheck(required, SALE)).toBe(false);
    expect(readsOwnerCheck(required, { assignee: true, manager: true })).toBe(false);
    expect(readsOwnerCheck(required, { assignee: false, manager: false })).toBe(false);
  });

  it("ownerCheck_contextOnlyForManager: nothing to read with no proof", () => {
    expect(readsOwnerCheck({ ownerCheck: "NONE" }, MANAGER)).toBe(false);
    expect(readsOwnerCheck({}, MANAGER)).toBe(false);
  });

  it("only a check still required can start or be refused", () => {
    expect(canStartCheck(required)).toBe(true);
    expect(canStartCheck({ ...required, ownerCheck: "DONE" })).toBe(false);
  });
});

describe("the phrase", () => {
  it("ownerCheck_startShowsPhraseOnceWithScriptMeaning: holds the phrase of the answer, once", () => {
    expect(phraseIssued({ phrase: "AB12CD", expiresAt: "2026-11-06T02:10:00Z" })).toEqual({
      kind: "shown",
      phrase: "AB12CD",
      expiresAt: "2026-11-06T02:10:00Z",
    });
    expect(phraseIssued({})).toEqual(NO_PHRASE);
    expect(JSON.stringify(NO_PHRASE)).not.toContain("AB12CD");
  });

  it("ownerCheck_startShowsPhraseOnceWithScriptMeaning: the screen shows the English meaning of the call script, and nothing Vietnamese", () => {
    const script = en.InventoryIntake.ownerCheckPanel.script;
    expect(script).toBe(
      "Please enter this code yourself on your Sunvibe account page. Don't give it to anyone, including the Sale. If you have no account or can't find where to enter it, tell me.",
    );
    expect(en.InventoryIntake.ownerCheckPanel.scriptNote).toBe("Say this in Vietnamese, from the script managers hold. Never ask for anything back.");
  });
});

describe("how long a phrase shows", () => {
  it("counts down to its end, and a phrase with no end shows until it is dismissed", () => {
    const now = Date.parse("2026-11-06T02:00:00Z");
    expect(phraseMsLeft("2026-11-06T02:10:00Z", now)).toBe(600_000);
    expect(phraseMsLeft(null, now)).toBeNull();
    expect(phraseMsLeft("not a date", now)).toBeNull();
  });

  it("shows for a minute at least: a fast clock must not take away the only showing of a phrase", () => {
    const now = Date.parse("2026-11-06T02:00:00Z");
    expect(phraseMsLeft("2026-11-06T01:59:00Z", now)).toBe(60_000);
    expect(phraseMsLeft("2026-11-06T02:00:30Z", now)).toBe(60_000);
  });
});

describe("the basis", () => {
  it("ownerCheck_otherOwnersOnPhone_basisPrompt: asks why the manager goes on when another owner sits on this phone", () => {
    expect(basisKey({ signals: { otherOwnersOnPhone: 1 } })).toBe("ownerCheckPanel.basisOtherOwners");
    expect(basisKey({ signals: { otherOwnersOnPhone: 0 } })).toBe("ownerCheckPanel.basisHint");
    expect(basisKey({})).toBe("ownerCheckPanel.basisHint");
  });

  it("ownerCheck_refusalNeedsBasis: a start and a refusal both want a basis of 1..2000 with no phone", () => {
    expect(checkBasisProblem("")).toBe("required");
    expect(checkBasisProblem("Called, the person confirmed")).toBeNull();
    expect(checkBasisProblem("a".repeat(2001))).toBe("tooLong");
    expect(checkBasisProblem("Called 0901234567")).toBe("phone");
  });
});

describe("what the manager reads", () => {
  const context: OwnerCheckContext = {
    signals: { accountProofs: 1, accountRefusals: 2, creatorProofs: 3, creatorRefusals: 4, otherOpenLeadsOfPhone: 5, otherOwnersOnPhone: 6 },
    refusals: [{ checkedAt: "2026-11-01T02:00:00Z", basis: "A stranger answered" }],
  };

  it("ownerCheck_showsSignalsAndRefusals: lists every signal with its count", () => {
    expect(signalRows(context)).toEqual([
      { key: "ownerCheckPanel.signals.accountProofs", value: 1 },
      { key: "ownerCheckPanel.signals.accountRefusals", value: 2 },
      { key: "ownerCheckPanel.signals.creatorProofs", value: 3 },
      { key: "ownerCheckPanel.signals.creatorRefusals", value: 4 },
      { key: "ownerCheckPanel.signals.otherOpenLeadsOfPhone", value: 5 },
      { key: "ownerCheckPanel.signals.otherOwnersOnPhone", value: 6 },
    ]);
  });

  it("ownerCheck_showsSignalsAndRefusals: reads a missing signal as zero", () => {
    expect(signalRows({}).every((row) => row.value === 0)).toBe(true);
  });

  it("ownerCheck_showsSignalsAndRefusals: lists the lead's refusals for the next checker", () => {
    expect(refusalRows(context)).toEqual([{ checkedAt: "2026-11-01T02:00:00Z", basis: "A stranger answered" }]);
    expect(refusalRows({})).toEqual([]);
  });
});

describe("runOwnerCheck", () => {
  const stale: ApiResult<OwnerCheckStarted> = {
    ok: false,
    kind: "http",
    status: 409,
    code: "CONCURRENT_MODIFICATION",
    fieldErrors: [],
  };

  it("ownerCheck_staleProof_reloads: a stale proof forgets the context and reads the block", async () => {
    const order: string[] = [];
    const step = await runOwnerCheck({
      send: async () => {
        order.push("send");
        return stale;
      },
      forget: () => order.push("forget"),
      reload: async () => {
        order.push("reload");
      },
    });
    expect(step).toMatchObject({ kind: "message", message: { key: "errors.stale" } });
    expect(order).toEqual(["send", "forget", "reload"]);
  });

  it("keeps the context when a basis is refused", async () => {
    const order: string[] = [];
    await runOwnerCheck({
      send: async () => ({ ok: false, kind: "http", status: 400, code: "VALIDATION_FAILED", fieldErrors: [{ field: "basis", message: "x" }] }),
      forget: () => order.push("forget"),
      reload: async () => {
        order.push("reload");
      },
    });
    expect(order).toEqual([]);
  });

  it("answers the data of a start", async () => {
    const step = await runOwnerCheck({
      send: async () => ({ ok: true, data: { phrase: "AB12CD" }, status: 200, replayed: false }),
      forget: () => undefined,
      reload: async () => undefined,
    });
    expect(step).toEqual({ kind: "done", data: { phrase: "AB12CD" } });
  });
});
