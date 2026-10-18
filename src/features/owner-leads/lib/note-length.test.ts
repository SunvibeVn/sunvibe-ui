import { describe, expect, it } from "vitest";

import { NOTE_MAX, noteProblem, utf16Length } from "./note-length";

describe("utf16Length (counter in UTF-16 units, as the intake form and the server)", () => {
  it("counts an emoji as two units", () => {
    expect(utf16Length("😀a")).toBe(3);
  });

  it("counts plain and combined Vietnamese letters by their code units", () => {
    expect(utf16Length("")).toBe(0);
    expect(utf16Length("Chào")).toBe(4);
    expect(utf16Length("é")).toBe(2);
  });
});

describe("noteProblem (note 1..2000)", () => {
  it("accepts 1 and exactly 2000 units", () => {
    expect(NOTE_MAX).toBe(2000);
    expect(noteProblem("a")).toBeNull();
    expect(noteProblem("a".repeat(2000))).toBeNull();
  });

  it("rejects an empty or blank note", () => {
    expect(noteProblem("")).toBe("required");
    expect(noteProblem(" \n\t ")).toBe("required");
  });

  it("rejects 2001 units, counting an emoji as two", () => {
    expect(noteProblem("a".repeat(2001))).toBe("tooLong");
    expect(noteProblem("😀".repeat(1000))).toBeNull();
    expect(noteProblem("😀".repeat(1000) + "a")).toBe("tooLong");
  });
});
