import { describe, expect, it } from "vitest";

import { freshnessRecordSchema } from "./freshness-record.schema";

/** A complete contact: still available, both answers yes, no note. */
const VALID = { channel: "CALL", outcome: "AVAILABLE", termsStillApply: true, unitUnchanged: true, note: "" };
const EMOJI = "😀";

/** The problem codes the schema answers at `field` for `values`, in its order. */
function codesAt(values: Record<string, unknown>, field: string): string[] {
  const result = freshnessRecordSchema.safeParse(values);
  if (result.success) return [];
  return result.error.issues.filter((issue) => issue.path[0] === field).map((issue) => issue.message);
}

const accepted = (values: Record<string, unknown>) => freshnessRecordSchema.safeParse(values).success;
const noteCodes = (note: string) => codesAt({ ...VALID, note }, "note");

describe("freshness record schema (listing-publish E06-S3, E06S3-D4, D10, E06S3-P13 (4))", () => {
  it("freshnessRecordSchema_presence_channelAndResultRequired: no channel and no result each give their field's problem", () => {
    expect([codesAt({ ...VALID, channel: null }, "channel"), codesAt({ ...VALID, outcome: null }, "outcome")]).toEqual([
      ["channel"],
      ["outcome"],
    ]);
  });

  it("freshnessRecordSchema_closedValues_unknownRefused: a channel or a result outside its codes is refused", () => {
    expect([codesAt({ ...VALID, channel: "FAX" }, "channel"), codesAt({ ...VALID, outcome: "MAYBE" }, "outcome")]).toEqual([
      ["channel"],
      ["outcome"],
    ]);
  });

  it("freshnessRecordSchema_available_bothAnswersRequiredOthersNone: still available needs both answers, a No being an answer; the other results need none", () => {
    expect([
      codesAt({ ...VALID, termsStillApply: null }, "termsStillApply"),
      codesAt({ ...VALID, unitUnchanged: null }, "unitUnchanged"),
    ]).toEqual([["answer"], ["answer"]]);
    expect(accepted({ ...VALID, termsStillApply: true, unitUnchanged: false })).toBe(true);
    expect(
      ["NOT_AVAILABLE", "UNREACHABLE"].map((outcome) => accepted({ ...VALID, outcome, termsStillApply: null, unitUnchanged: null })),
    ).toEqual([true, true]);
  });

  it("freshnessRecordSchema_note_edgeBoundInUtf16Units: above 2,000 UTF-16 units is refused before any normalization", () => {
    expect([noteCodes(`${" ".repeat(1999)}ab`), noteCodes(`${" ".repeat(1501)}${EMOJI.repeat(250)}`)]).toEqual([
      ["noteTooLong"],
      ["noteTooLong"],
    ]);
    expect(noteCodes(`${" ".repeat(1998)}ab`)).toEqual([]);
    expect(noteCodes(`${" ".repeat(1500)}${EMOJI.repeat(250)}`)).toEqual([]);
  });

  it("freshnessRecordSchema_note_storableRuleMirrorsServer: the note normalized as the server does, at most 500 code points, no Cc but LF and no Cf", () => {
    expect([
      noteCodes("a".repeat(501)),
      noteCodes(EMOJI.repeat(501)),
      noteCodes("a\u0000b"),
      noteCodes("a​b"),
      noteCodes("﻿a"),
    ]).toEqual([["noteTooLong"], ["noteTooLong"], ["noteCharacters"], ["noteCharacters"], ["noteCharacters"]]);
    expect(noteCodes("a".repeat(500))).toEqual([]);
    expect(noteCodes(EMOJI.repeat(500))).toEqual([]);
    expect(noteCodes(`  ${"a".repeat(500)} \n `)).toEqual([]);
    expect(noteCodes("a\r\nb")).toEqual([]);
    expect(noteCodes("é".repeat(500))).toEqual([]);
    expect(noteCodes("\u001Fa\u001F")).toEqual([]);
  });
});
