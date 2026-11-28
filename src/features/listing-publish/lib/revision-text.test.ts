import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import type { ApiResult } from "@/features/auth/client";
import en from "@/i18n/messages/en.json";

import {
  answerKey,
  answerOf,
  assetTypeKey,
  chargeUnitKey,
  FEATURE_NAMES,
  featureLabelKey,
  optionLabelKey,
  phraseText,
  problemSentence,
  problemsOf,
  type RevisionAnswer,
  REVISION_ANSWERS,
  sourceKey,
  wholeVnd,
} from "./revision-text";

const t = createTranslator({ locale: "en", messages: en, namespace: "ListingPublish" });

/** An HTTP refusal with the given entries' fields (each with a fixed message the UI never shows). */
function refused(status: number, code: string | null, fields: string[] = []): ApiResult<unknown> {
  const fieldErrors = fields.map((field) => ({ field, message: "Fixed server message." }));
  return code === null ? { ok: false, kind: "http", status, fieldErrors } : { ok: false, kind: "http", status, code, fieldErrors };
}

/** The text at a dotted path below `ListingPublish`, or undefined when there is none. */
function textAt(key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (typeof node !== "object" || node === null || !Object.hasOwn(node, part)) return undefined;
    return (node as Record<string, unknown>)[part];
  }, en.ListingPublish);
}

describe("revision texts (listing-publish E06-S2, spec section 6)", () => {
  it("answerOf_eachRowOfTheTable_itsAnswer: every row of the answer table, the unknown code and the 500 included, reads its sentence", () => {
    const rows: { result: ApiResult<unknown>; command: "save" | "other"; answer: RevisionAnswer; sentence: string }[] = [
      {
        result: refused(400, "VALIDATION_FAILED", ["title"]),
        command: "save",
        answer: "validationTitle",
        sentence: "The title is too long, holds a line break or holds a character that cannot be saved.",
      },
      {
        result: refused(400, "VALIDATION_FAILED", ["description"]),
        command: "save",
        answer: "validationDescription",
        sentence: "The description is too long or holds a character that cannot be saved.",
      },
      {
        result: refused(400, "VALIDATION_FAILED", ["features.furnishing"]),
        command: "save",
        answer: "validationOther",
        sentence: "This could not be saved. Reload the page and try again.",
      },
      {
        result: refused(400, "MALFORMED_REQUEST"),
        command: "other",
        answer: "validationOther",
        sentence: "This could not be saved. Reload the page and try again.",
      },
      {
        result: refused(403, "FORBIDDEN"),
        command: "other",
        answer: "forbidden",
        sentence: "Only the Sale in charge of this listing can change it.",
      },
      {
        result: refused(404, "NOT_FOUND"),
        command: "save",
        answer: "notFound",
        sentence: "This listing or revision is no longer available to you.",
      },
      { result: refused(409, "LISTING_ARCHIVED"), command: "other", answer: "archived", sentence: "This listing is archived." },
      {
        result: refused(409, "CONCURRENT_MODIFICATION"),
        command: "save",
        answer: "concurrent",
        sentence: "Someone changed this listing. It has been reloaded.",
      },
      {
        result: refused(409, "REVISION_NOT_DRAFT"),
        command: "other",
        answer: "notDraft",
        sentence: "This revision is no longer a draft.",
      },
      {
        result: refused(409, "REVISION_NOT_PENDING"),
        command: "other",
        answer: "notPending",
        sentence: "This revision is no longer waiting for review.",
      },
      {
        result: refused(409, "OPEN_REVISION_EXISTS"),
        command: "other",
        answer: "openExists",
        sentence: "A draft or a submitted revision is already open.",
      },
      {
        result: refused(409, "TERMS_SOURCE_ABSENT"),
        command: "other",
        answer: "termsAbsent",
        sentence: "These terms are no longer available. Choose again.",
      },
      {
        result: refused(422, "REVISION_NOT_SUBMITTABLE", ["title.TOO_SHORT"]),
        command: "other",
        answer: "notSubmittable",
        sentence: "This revision cannot be submitted yet:",
      },
      { result: refused(500, "INTERNAL_ERROR"), command: "other", answer: "failed", sentence: "Something went wrong. Try again." },
      { result: { ok: false, kind: "network" }, command: "save", answer: "failed", sentence: "Something went wrong. Try again." },
      { result: refused(409, "LISTING_EXISTS"), command: "other", answer: "failed", sentence: "Something went wrong. Try again." },
      { result: refused(409, null), command: "other", answer: "failed", sentence: "Something went wrong. Try again." },
      { result: refused(422, "VALIDATION_FAILED"), command: "other", answer: "failed", sentence: "Something went wrong. Try again." },
      { result: refused(429, "RATE_LIMITED"), command: "other", answer: "failed", sentence: "Something went wrong. Try again." },
    ];

    for (const { result, command, answer, sentence } of rows) {
      expect(answerOf(result, command)).toBe(answer);
      expect(t(answerKey(answer))).toBe(sentence);
    }
    // The title and description entries are a save's: another command's 400 reads the general sentence.
    expect(answerOf(refused(400, "VALIDATION_FAILED", ["title"]), "other")).toBe("validationOther");
    expect(answerOf(refused(400, "VALIDATION_FAILED", ["description"]), "other")).toBe("validationOther");
    // A save answering both entries reads the title's sentence, in the form's order.
    expect(answerOf(refused(400, "VALIDATION_FAILED", ["description", "title"]), "save")).toBe("validationTitle");
    // A 409 code inherited from Object.prototype is not a code of the table.
    expect(answerOf(refused(409, "toString"), "other")).toBe("failed");
  });

  it("answerOf_sessionAnswers_null: a success and the session answers show nothing", () => {
    expect(answerOf({ ok: true, status: 200, replayed: false, data: {} }, "save")).toBeNull();
    expect(answerOf({ ok: true, status: 201, replayed: false, data: {} }, "other")).toBeNull();
    expect(answerOf({ ok: false, kind: "signed-out" }, "save")).toBeNull();
    expect(answerOf({ ok: false, kind: "unavailable" }, "other")).toBeNull();
    expect(answerOf({ ok: false, kind: "unavailable", retryAfterSeconds: 30 }, "other")).toBeNull();
  });

  it("problemsOf_entries_partAndRule: each 422 entry's field '<part>.<rule>' gives its part and rule, in order; an unknown form is kept", () => {
    const fieldErrors = [
      "title.TOO_SHORT",
      "description.REQUIRED",
      "terms.REQUIRED",
      "title.PHONE_NUMBER",
      "description.FORBIDDEN_WORD",
      "photos.TOO_FEW",
      "title",
    ].map((field) => ({ field, message: "Fixed server message." }));

    expect(problemsOf(fieldErrors)).toEqual([
      { part: "TITLE", rule: "TOO_SHORT" },
      { part: "DESCRIPTION", rule: "REQUIRED" },
      { part: "TERMS", rule: "REQUIRED" },
      { part: "TITLE", rule: "PHONE_NUMBER" },
      { part: "DESCRIPTION", rule: "FORBIDDEN_WORD" },
      { part: "photos", rule: "TOO_FEW" },
      { part: "TITLE", rule: "" },
    ]);
    expect(problemsOf([])).toEqual([]);
  });

  it("problemSentence_everyPartAndRule_itsKey: the sentence of every part and rule of spec section 6, word for word", () => {
    const sentences: [string, string, string][] = [
      ["TITLE", "REQUIRED", "Add a title."],
      ["TITLE", "TOO_SHORT", "The title needs at least 15 characters."],
      ["TITLE", "TOO_LONG", "The title can have at most 90 characters."],
      ["DESCRIPTION", "REQUIRED", "Add a description."],
      ["DESCRIPTION", "TOO_SHORT", "The description needs at least 100 characters."],
      ["DESCRIPTION", "TOO_LONG", "The description can have at most 3,000 characters."],
      ["TERMS", "REQUIRED", "Take a terms snapshot."],
      ["TITLE", "PHONE_NUMBER", "The title holds what reads as a phone number."],
      ["DESCRIPTION", "PHONE_NUMBER", "The description holds what reads as a phone number."],
      ["TITLE", "EMAIL", "The title holds an e-mail address."],
      ["DESCRIPTION", "EMAIL", "The description holds an e-mail address."],
      ["TITLE", "LINK", "The title holds a link or a web address."],
      ["DESCRIPTION", "LINK", "The description holds a link or a web address."],
      ["TITLE", "SOCIAL_HANDLE", "The title holds a social network or chat account."],
      ["DESCRIPTION", "SOCIAL_HANDLE", "The description holds a social network or chat account."],
      ["TITLE", "FORBIDDEN_WORD", "The title holds a claim a listing may not make."],
      ["DESCRIPTION", "FORBIDDEN_WORD", "The description holds a claim a listing may not make."],
    ];
    for (const [part, rule, sentence] of sentences) {
      expect(phraseText(t, problemSentence({ part, rule }))).toBe(sentence);
    }
  });

  it("problemSentence_unknown_unknownSentence: an unknown part or rule, or a rule its part does not have, reads the unknown sentence", () => {
    const unknown = "This revision breaks a rule this page does not know yet.";
    for (const [part, rule] of [
      ["PHOTOS", "TOO_FEW"],
      ["photos", "REQUIRED"],
      ["TITLE", "NEW_RULE"],
      ["TITLE", ""],
      ["TERMS", "TOO_SHORT"],
      ["TERMS", "PHONE_NUMBER"],
      ["DESCRIPTION", "toString"],
      ["toString", "REQUIRED"],
    ] as const) {
      expect(phraseText(t, problemSentence({ part, rule }))).toBe(unknown);
    }
  });

  it("problemsOf_feeNameEntry_partRuleAndPosition: 'feeName.<n>.<RULE>' reads as FEE_NAME with the fee's position; every other entry keeps exactly its part and rule (PB-23, E-20)", () => {
    const fieldErrors = ["title.PHONE_NUMBER", "feeName.2.PHONE_NUMBER", "feeName.20.FORBIDDEN_WORD", "terms.REQUIRED"].map((field) => ({
      field,
      message: "Fixed server message.",
    }));

    const problems = problemsOf(fieldErrors);
    expect(problems).toEqual([
      { part: "TITLE", rule: "PHONE_NUMBER" },
      { part: "FEE_NAME", rule: "PHONE_NUMBER", position: 2 },
      { part: "FEE_NAME", rule: "FORBIDDEN_WORD", position: 20 },
      { part: "TERMS", rule: "REQUIRED" },
    ]);
    expect(problems[0]).not.toHaveProperty("position");
    expect(problems[3]).not.toHaveProperty("position");
    expect(phraseText(t, problemSentence(problems[1] as (typeof problems)[number]))).toBe(
      "Fee 2 of the terms snapshot holds what reads as a phone number. Fee names come from the agreement version: correct the name there in a new version, then take the snapshot again.",
    );
  });

  it("problemsOf_feeNameMalformed_keptAsItCame: a fee entry without a canonical position is kept as it came and reads the unknown sentence", () => {
    const unknown = "This revision breaks a rule this page does not know yet.";
    for (const field of ["feeName.0.EMAIL", "feeName.02.EMAIL", "feeName.x.EMAIL", "feeName.2", "feeName..EMAIL"]) {
      const problems = problemsOf([{ field }]);
      expect(problems).toHaveLength(1);
      expect(problems[0]?.part).not.toBe("FEE_NAME");
      expect(phraseText(t, problemSentence(problems[0] as (typeof problems)[number]))).toBe(unknown);
    }
  });

  it("problemSentence_feeName_eachMachineRuleWithPosition: each machine rule of a fee name has its sentence with the fee's position, the rule and the remedy, word for word", () => {
    const remedy = "Fee names come from the agreement version: correct the name there in a new version, then take the snapshot again.";
    const sentences: [string, string][] = [
      ["PHONE_NUMBER", "what reads as a phone number"],
      ["EMAIL", "an e-mail address"],
      ["LINK", "a link or a web address"],
      ["SOCIAL_HANDLE", "a social network or chat account"],
      ["FORBIDDEN_WORD", "a claim a listing may not make"],
    ];
    for (const [rule, phrase] of sentences) {
      const sentence = problemSentence({ part: "FEE_NAME", rule, position: 7 });
      expect(sentence).toEqual({ key: `revision.problems.FEE_NAME.${rule}`, values: { position: 7 } });
      expect(typeof textAt(sentence.key)).toBe("string");
      expect(phraseText(t, sentence)).toBe(`Fee 7 of the terms snapshot holds ${phrase}. ${remedy}`);
    }
  });

  it("problemSentence_feeNameWithoutPositionOrLengthRule_unknownSentence: a FEE_NAME problem without a position, or with a rule that is not a machine rule, reads the unknown sentence", () => {
    const unknown = "This revision breaks a rule this page does not know yet.";
    for (const problem of [
      { part: "FEE_NAME", rule: "PHONE_NUMBER" },
      { part: "FEE_NAME", rule: "EMAIL", position: null },
      { part: "FEE_NAME", rule: "REQUIRED", position: 2 },
      { part: "FEE_NAME", rule: "TOO_LONG", position: 2 },
      { part: "FEE_NAME", rule: "NEW_RULE", position: 2 },
      { part: "FEE_NAME", rule: "toString", position: 2 },
    ]) {
      expect(phraseText(t, problemSentence(problem))).toBe(unknown);
    }
    // A position on another part changes nothing.
    expect(phraseText(t, problemSentence({ part: "TITLE", rule: "PHONE_NUMBER", position: 2 }))).toBe(
      "The title holds what reads as a phone number.",
    );
  });

  it("wholeVnd_amount_groupedWithoutDecimals: a whole amount of VND reads with comma groups and no decimals", () => {
    expect(wholeVnd(0)).toBe("0");
    expect(wholeVnd(3500)).toBe("3,500");
    expect(wholeVnd(8000000)).toBe("8,000,000");
    expect(wholeVnd(999999999999999)).toBe("999,999,999,999,999");
  });

  it("revisionText_everyKey_inEnJson: every key the module can answer has an English text under ListingPublish", () => {
    const unknown = ["NEW_CODE", "", "toString"];
    const keys: string[] = [
      ...REVISION_ANSWERS.map(answerKey),
      ...FEATURE_NAMES.map(featureLabelKey),
      ...["FULL", "BASIC", "NONE", "PRIVATE", "SHARED", "ALLOWED", "NOT_ALLOWED", null, ...unknown].map(optionLabelKey),
      ...["HOUSE", "WHOLE_BUILDING", "VILLA", "HOMESTAY", "CONDOTEL", "APARTMENT", ...unknown].map(assetTypeKey),
      ...["PER_MONTH", "PER_KWH", "PER_M3", "PER_PERSON_PER_MONTH", "PER_VEHICLE_PER_MONTH", "ONE_OFF", ...unknown].map(chargeUnitKey),
      ...["IN_EFFECT", "PENDING_START", ...unknown].map(sourceKey),
    ];
    expect(keys.filter((key) => typeof textAt(key) !== "string")).toEqual([]);
    expect(REVISION_ANSWERS).toHaveLength(13);

    expect(FEATURE_NAMES.map((name) => t(featureLabelKey(name)))).toEqual([
      "Furniture",
      "Air conditioner",
      "Water heater",
      "Fridge",
      "Washing machine",
      "Kitchen",
      "Balcony",
      "Elevator",
      "Motorbike parking",
      "Car parking",
      "Internet",
      "Pets",
      "Landlord does not live here",
    ]);
    expect(["FULL", "BASIC", "NONE", "PRIVATE", "SHARED", "ALLOWED", "NOT_ALLOWED", null].map((code) => t(optionLabelKey(code)))).toEqual([
      "Fully furnished",
      "Basic furniture",
      "No furniture",
      "Private",
      "Shared",
      "Allowed",
      "Not allowed",
      "Not stated",
    ]);
    expect(["HOUSE", "WHOLE_BUILDING", "VILLA", "HOMESTAY", "CONDOTEL", "APARTMENT", "BOAT"].map((code) => t(assetTypeKey(code)))).toEqual([
      "House",
      "Whole building",
      "Villa",
      "Homestay",
      "Condotel",
      "Apartment",
      "Another type",
    ]);
    expect(
      ["PER_MONTH", "PER_KWH", "PER_M3", "PER_PERSON_PER_MONTH", "PER_VEHICLE_PER_MONTH", "ONE_OFF"].map((code) => t(chargeUnitKey(code))),
    ).toEqual(["per month", "per kWh", "per m³", "per person per month", "per vehicle per month", "one-off"]);
    expect(t(sourceKey("IN_EFFECT"))).toBe("Terms in effect");
    expect(t(sourceKey("PENDING_START"), { date: "Dec 1, 2026" })).toBe("Terms of the version starting Dec 1, 2026");
  });
});
