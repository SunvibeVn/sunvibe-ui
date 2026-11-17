import { describe, expect, it } from "vitest";

import { canTickMore, confirmBody, EMPTY_CONFIRM_VALUES, isTicked, MAX_TICKED, tick, untick } from "./owner-confirm-form";

const STATEMENT_VERSION = "brokerage-agreement-2026-11";

describe("the owner's confirm form (brokerage-agreement E05-S5, S5-D5, spec section 6)", () => {
  it("ownerConfirmForm_tick_atMostTwenty: at most 20 versions can be ticked, each once, and unticking frees a place", () => {
    let values = EMPTY_CONFIRM_VALUES;
    for (let index = 1; index <= 21; index += 1) values = tick(values, { agreementId: `A${index}`, versionNo: 1 });

    expect(MAX_TICKED).toBe(20);
    expect(values.ticked).toHaveLength(20);
    expect(isTicked(values, { agreementId: "A20", versionNo: 1 })).toBe(true);
    expect(isTicked(values, { agreementId: "A21", versionNo: 1 })).toBe(false);
    expect(canTickMore(values)).toBe(false);

    expect(tick(values, { agreementId: "A1", versionNo: 1 }).ticked).toHaveLength(20);
    const freed = untick(values, { agreementId: "A3", versionNo: 1 });
    expect(freed.ticked).toHaveLength(19);
    expect(canTickMore(freed)).toBe(true);
    expect(isTicked(freed, { agreementId: "A3", versionNo: 1 })).toBe(false);
    // One version per agreement: ticking another version of a ticked agreement takes its place.
    const replaced = tick(freed, { agreementId: "A1", versionNo: 2 });
    expect(replaced.ticked.filter((key) => key.agreementId === "A1")).toEqual([{ agreementId: "A1", versionNo: 2 }]);
  });

  it("ownerConfirmForm_body_itemsAndPassword: one body with the password, the statement version read and every ticked version, in tick order", () => {
    const values = {
      ...tick(tick(EMPTY_CONFIRM_VALUES, { agreementId: "A2", versionNo: 1 }), { agreementId: "A1", versionNo: 2 }),
      password: " pass word ",
    };

    expect(confirmBody(values, STATEMENT_VERSION)).toEqual({
      currentPassword: " pass word ",
      statementVersion: STATEMENT_VERSION,
      versions: [
        { agreementId: "A2", versionNo: 1 },
        { agreementId: "A1", versionNo: 2 },
      ],
    });
  });

  it("ownerConfirmForm_noTickOrPassword_nothingToSend: without a ticked version, a password or a statement version there is nothing to send", () => {
    const ticked = tick(EMPTY_CONFIRM_VALUES, { agreementId: "A1", versionNo: 1 });

    expect(confirmBody({ ...EMPTY_CONFIRM_VALUES, password: "secret" }, STATEMENT_VERSION)).toBeNull();
    expect(confirmBody({ ...ticked, password: "" }, STATEMENT_VERSION)).toBeNull();
    expect(confirmBody({ ...ticked, password: "secret" }, null)).toBeNull();
    expect(confirmBody({ ...ticked, password: "secret" }, STATEMENT_VERSION)).not.toBeNull();
  });
});
