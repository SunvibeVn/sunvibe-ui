import { describe, expect, it } from "vitest";

import { cleanText, textProblem } from "./intake-text";

describe("textProblem", () => {
  it("wants text, within its limit", () => {
    expect(textProblem("  ", 10)).toBe("required");
    expect(textProblem("ok", 10)).toBeNull();
    expect(textProblem(`  ${"a".repeat(10)}  `, 10)).toBeNull();
    expect(textProblem("a".repeat(11), 10)).toBe("tooLong");
  });

  it("refuses a phone number, as the server does", () => {
    expect(textProblem("Call 0901 234 567", 100)).toBe("phone");
  });

  it("refuses U+0000, which the database cannot store", () => {
    expect(textProblem("a\u0000b", 10)).toBe("invalid");
  });
});

describe("cleanText", () => {
  it("is the text as the server keeps it", () => {
    expect(cleanText("  é  ")).toBe("é");
  });
});
