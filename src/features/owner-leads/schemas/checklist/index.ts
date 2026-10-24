import { z } from "zod";

import type { ChecklistGroupPath, ChecklistInput } from "@/features/surveys";

import { basisDateProblem, cleanText, isIsoDate, optionalText, requiredText, type SurveyProblem } from "../survey/survey-text";

// The checks of template LONG_TERM_RENT v1 the page runs before a save (survey-checklist spec 4.6, A-6, A-7, A-11,
// A-18, D-1), so a refusal shows at its field first; the server stays the authority (TemplateV1Rules). Problems are
// keyed by the server's JSON path (`content.spaces.1.code`), so a server 400 and a page check land on the same field.

/** What is wrong with one checklist field; `server` for a path the server refused (its text is never shown). */
export type ChecklistProblem = SurveyProblem | "codeChars" | "duplicate" | "tooMany" | "server";

/** JSON path (from `content.`) -> its first problem; `{}` when the body is fine. */
export type ChecklistProblems = Record<string, ChecklistProblem>;

/**
 * What the date and receiver rules need: today and the visit's arrival date (Vietnam), who is typing, and the JSON
 * paths of the units the save leaves as stored: an unchanged statement keeps its receiver and relay basis (A-18).
 */
export type ChecklistRules = {
  today: string;
  arrivalDate: string;
  viewerUserId: string;
  unchangedPaths?: ReadonlySet<string>;
};

/** A space code: 1..20 of `[A-Za-z0-9 ._/-]` (spec 4.6), so "Phòng 101" is refused with the allowed characters. */
export const spaceCodeSchema = z
  .string()
  .refine((value) => cleanText(value) !== "", { error: "required" })
  .refine((value) => cleanText(value).length <= 20, { error: "tooLong" })
  .refine((value) => /^[A-Za-z0-9 ._/-]*$/.test(cleanText(value)), { error: "codeChars" });

const MIN_DATE = "2000-01-01";
const MONEY_MAX = 999_999_999_999_999;

function threeYearsAfter(today: string): string {
  const [year, rest] = [Number(today.slice(0, 4)), today.slice(4)];
  return `${String(year + 3).padStart(4, "0")}${rest}`;
}

type Json = Record<string, unknown>;

/** Collects the first problem per path. */
class Checker {
  readonly problems: ChecklistProblems = {};
  constructor(readonly rules: ChecklistRules) {}

  add(path: string, problem: ChecklistProblem): void {
    if (this.problems[path] === undefined) this.problems[path] = problem;
  }

  text(path: string, value: unknown, max: number, required: boolean): void {
    if (value === null || value === undefined) {
      if (required) this.add(path, "required");
      return;
    }
    const result = (required ? requiredText(max) : optionalText(max)).safeParse(String(value));
    if (!result.success) this.add(path, result.error.issues[0].message as ChecklistProblem);
  }

  integer(path: string, value: unknown, min: number, max: number): void {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) this.add(path, "invalid");
  }

  date(path: string, value: unknown, min: string, max: string): void {
    if (typeof value !== "string" || value === "") return this.add(path, "required");
    if (!isIsoDate(value)) return this.add(path, "invalid");
    if (value < min) return this.add(path, "tooEarly");
    if (value > max) this.add(path, "tooLate");
  }

  /** The owner-statement part of a sourced unit or item: date, receiver and relay basis (A-7, A-18). */
  statement(path: string, unit: Json): void {
    if (unit.source !== "OWNER_STATED") return;
    this.date(`${path}.confirmedOn`, unit.confirmedOn, MIN_DATE, this.rules.today);
    this.receiver(path, unit.receivedByUserId, unit.relayBasis);
  }

  /** A receiver from the lead's staff, and "How it reached you" exactly when it is someone else (A-18). */
  receiver(path: string, receiver: unknown, relay: unknown): void {
    if (this.rules.unchangedPaths?.has(path)) return;
    if (typeof receiver !== "string" || receiver === "") {
      this.add(`${path}.receivedByUserId`, "required");
      return;
    }
    if (receiver === this.rules.viewerUserId) {
      if (typeof relay === "string" && cleanText(relay) !== "") this.add(`${path}.relayBasis`, "notAllowed");
      return;
    }
    this.text(`${path}.relayBasis`, relay ?? null, 500, true);
  }

  /**
   * A field wrapper: the value exactly with VALUE (checked by `value`), a reason with NOT_APPLICABLE where allowed,
   * and on a sourced field the source with VALUE and the statement rules.
   */
  wrapper(
    path: string,
    raw: unknown,
    options: { na?: boolean; sourced?: boolean; value?: (path: string, value: unknown) => void },
  ): void {
    if (raw === null || raw === undefined) return;
    const unit = raw as Json;
    if (unit.state === "VALUE") {
      if (unit.value === null || unit.value === undefined) this.add(`${path}.value`, "required");
      else options.value?.(`${path}.value`, unit.value);
      if (options.sourced) {
        if (!unit.source) this.add(`${path}.source`, "required");
        else this.statement(path, unit);
      }
    } else if (unit.state === "NOT_APPLICABLE") {
      if (!options.na) this.add(`${path}.state`, "notAllowed");
      else this.text(`${path}.naReason`, unit.naReason ?? null, 500, true);
    }
  }
}

const textValue = (c: Checker, max: number) => (path: string, value: unknown) => c.text(path, value, max, true);

function money(c: Checker, path: string, value: unknown, min: number): void {
  const amount = (value as Json | null)?.amount;
  if (value === null || value === undefined) return c.add(path, "required");
  c.integer(`${path}.amount`, amount, min, MONEY_MAX);
}

function charge(c: Checker, path: string, value: unknown): void {
  const v = value as Json;
  if (v.basis === "AMOUNT") {
    money(c, `${path}.amount`, v.amount ?? null, 0);
    if (!v.chargeUnit) c.add(`${path}.chargeUnit`, "required");
  }
  c.text(`${path}.note`, v.note ?? null, 200, false);
}

function fees(c: Checker, path: string, value: unknown): void {
  const list = value as Json[];
  if (list.length > 10) c.add(path, "tooMany");
  list.forEach((fee, index) => {
    c.text(`${path}.${index}.name`, fee.name ?? null, 100, true);
    money(c, `${path}.${index}.amount`, fee.amount ?? null, 0);
    if (!fee.chargeUnit) c.add(`${path}.${index}.chargeUnit`, "required");
  });
}

function areaCheck(c: Checker, path: string, value: unknown): void {
  const v = value as Json;
  if (v.result === "INSPECTED") {
    if (typeof v.noneObserved !== "boolean") c.add(`${path}.noneObserved`, "required");
    c.text(`${path}.note`, v.note ?? null, 1000, v.noneObserved === false);
    if (v.notEnteredReason) c.add(`${path}.notEnteredReason`, "notAllowed");
  } else if (v.result === "NOT_ENTERED") {
    c.text(`${path}.notEnteredReason`, v.notEnteredReason ?? null, 500, true);
    c.text(`${path}.note`, v.note ?? null, 1000, false);
  } else {
    c.add(`${path}.result`, "required");
  }
}

function amenityItem(c: Checker, path: string, item: Json): void {
  if (!item.source) c.add(`${path}.source`, "required");
  c.statement(path, item);
}

type GroupCheck = (c: Checker, input: Json) => void;

const CHECKS: Record<ChecklistGroupPath, GroupCheck> = {
  identification: (c, input) => {
    c.wrapper("content.observedAddress", input.observedAddress, {
      sourced: true,
      value: (path, value) => {
        const v = value as Json;
        c.text(`${path}.addressText`, v.addressText ?? null, 255, true);
        if (!v.provinceCode) c.add(`${path}.provinceCode`, "required");
        if (!v.wardCode) c.add(`${path}.wardCode`, "required");
      },
    });
    c.text("content.differenceNote", input.differenceNote ?? null, 500, false);
    c.wrapper("content.fit", input.fit, {
      value: (path, value) => {
        const v = value as Json;
        if (!v.assessment) c.add(`${path}.assessment`, "required");
        c.text(`${path}.reason`, v.reason ?? null, 1000, true);
      },
    });
    c.wrapper("content.propertyType", input.propertyType, {});
    const spaces = (input.spaces ?? []) as Json[];
    if (spaces.length > 50 || (input.rentalScope === "WHOLE" && spaces.length > 1)) c.add("content.spaces", "tooMany");
    const codes = new Set<string>();
    spaces.forEach((space, index) => {
      const path = `content.spaces.${index}`;
      const code = spaceCodeSchema.safeParse(String(space.code ?? ""));
      if (!code.success) c.add(`${path}.code`, code.error.issues[0].message as ChecklistProblem);
      else {
        const key = cleanText(String(space.code)).toLowerCase();
        if (codes.has(key)) c.add(`${path}.code`, "duplicate");
        codes.add(key);
      }
      c.text(`${path}.location`, space.location ?? null, 200, true);
      c.text(`${path}.description`, space.description ?? null, 500, false);
    });
    c.text("content.otherPartsNote", input.otherPartsNote ?? null, 1000, false);
    c.text("content.generalNote", input.generalNote ?? null, 2000, false);
  },
  parts: (c, input) => {
    c.wrapper("content.accessRoute", input.accessRoute, { value: textValue(c, 1000) });
    c.wrapper("content.sharedAreas", input.sharedAreas, { na: true, value: textValue(c, 1000) });
    c.wrapper("content.totalFloors", input.totalFloors, { sourced: true, value: (path, v) => c.integer(path, v, 1, 200) });
    ((input.spaces ?? []) as Json[]).forEach((space, index) => {
      const path = `content.spaces.${index}`;
      c.wrapper(`${path}.floor`, space.floor, { value: textValue(c, 50) });
      c.wrapper(`${path}.privateAreas`, space.privateAreas, { value: textValue(c, 1000) });
      c.wrapper(`${path}.actualAccess`, space.actualAccess, {
        value: (valuePath, value) => {
          const v = value as Json;
          if (!v.extent) c.add(`${valuePath}.extent`, "required");
          c.text(`${valuePath}.note`, v.note ?? null, 500, v.extent === "ENTERED_PART");
        },
      });
    });
  },
  dimensions: (c, input) => {
    ((input.spaces ?? []) as Json[]).forEach((space, index) => {
      const path = `content.spaces.${index}`;
      c.wrapper(`${path}.area`, space.area, {
        sourced: true,
        value: (valuePath, v) => {
          const tenths = typeof v === "number" ? v * 10 : Number.NaN;
          if (!(tenths >= 1 && tenths <= 999_999) || Math.abs(tenths - Math.round(tenths)) > 1e-9) c.add(valuePath, "invalid");
        },
      });
      c.wrapper(`${path}.bedrooms`, space.bedrooms, { sourced: true, value: (p, v) => c.integer(p, v, 0, 50) });
      c.wrapper(`${path}.privateBathrooms`, space.privateBathrooms, { sourced: true, value: (p, v) => c.integer(p, v, 0, 50) });
      c.wrapper(`${path}.sharedBathroomUse`, space.sharedBathroomUse, { sourced: true });
      c.text(`${path}.layoutNote`, space.layoutNote ?? null, 1000, false);
    });
  },
  condition: (c, input) => {
    const late = threeYearsAfter(c.rules.today);
    c.wrapper("content.sharedKitchen", input.sharedKitchen, { na: true, value: (p, v) => areaCheck(c, p, v) });
    c.wrapper("content.sharedBathroom", input.sharedBathroom, { na: true, value: (p, v) => areaCheck(c, p, v) });
    ((input.spaces ?? []) as Json[]).forEach((space, index) => {
      const path = `content.spaces.${index}`;
      c.wrapper(`${path}.occupancy`, space.occupancy, {});
      c.wrapper(`${path}.expectedVacantFrom`, space.expectedVacantFrom, { sourced: true, value: (p, v) => c.date(p, v, MIN_DATE, late) });
      c.wrapper(`${path}.availableFrom`, space.availableFrom, { sourced: true, value: (p, v) => c.date(p, v, MIN_DATE, late) });
      c.wrapper(`${path}.mainSpace`, space.mainSpace, { value: (p, v) => areaCheck(c, p, v) });
      c.wrapper(`${path}.kitchen`, space.kitchen, { na: true, value: (p, v) => areaCheck(c, p, v) });
      c.wrapper(`${path}.bathroom`, space.bathroom, { na: true, value: (p, v) => areaCheck(c, p, v) });
    });
  },
  safety: (c, input) => {
    c.wrapper("content.egress", input.egress, { value: textValue(c, 1000) });
    c.wrapper("content.accessRestrictions", input.accessRestrictions, {
      value: (path, value) => {
        const v = value as Json;
        if (typeof v.noneObserved !== "boolean") c.add(`${path}.noneObserved`, "required");
        c.text(`${path}.note`, v.note ?? null, 1000, v.noneObserved === false);
      },
    });
    const hazards = input.hazards as { state?: string; value?: Json[] | null } | undefined;
    const list = hazards?.state === "VALUE" ? (hazards.value ?? []) : [];
    if (list.length > 30) c.add("content.hazards.value", "tooMany");
    list.forEach((hazard, index) => {
      const path = `content.hazards.value.${index}`;
      c.text(`${path}.description`, hazard.description ?? null, 500, true);
      if (!hazard.severity) c.add(`${path}.severity`, "required");
      c.text(`${path}.statusNote`, hazard.statusNote ?? null, 500, hazard.status !== "OPEN");
      if (hazard.status === "OWNER_REPORTED_FIXED") {
        c.date(`${path}.ownerReportedOn`, hazard.ownerReportedOn, MIN_DATE, c.rules.today);
        c.receiver(path, hazard.receivedByUserId, hazard.relayBasis);
      }
    });
  },
  amenities: (c, input) => {
    ((input.sharedItems ?? []) as Json[]).forEach((item, index) => amenityItem(c, `content.sharedItems.${index}`, item));
    ((input.spaces ?? []) as Json[]).forEach((space, index) => {
      const path = `content.spaces.${index}`;
      c.wrapper(`${path}.furnishing`, space.furnishing, { sourced: true });
      ((space.items ?? []) as Json[]).forEach((item, itemIndex) => amenityItem(c, `${path}.items.${itemIndex}`, item));
    });
    const others = (input.otherItems ?? []) as Json[];
    if (others.length > 20) c.add("content.otherItems", "tooMany");
    others.forEach((item, index) => {
      c.text(`content.otherItems.${index}.label`, item.label ?? null, 100, true);
      amenityItem(c, `content.otherItems.${index}`, item);
    });
  },
  terms: (c, input) => {
    const common = (input.common ?? {}) as Json;
    for (const field of ["electricity", "water", "internet", "parking", "serviceFee"]) {
      c.wrapper(`content.common.${field}`, common[field], { sourced: true, value: (p, v) => charge(c, p, v) });
    }
    c.wrapper("content.common.otherFees", common.otherFees, { sourced: true, value: (p, v) => fees(c, p, v) });
    c.wrapper("content.common.houseRules", common.houseRules, { sourced: true, value: textValue(c, 2000) });
    c.wrapper("content.common.handoverMaintenance", common.handoverMaintenance, { sourced: true, value: textValue(c, 2000) });
    c.wrapper("content.common.pets", common.pets, {
      sourced: true,
      value: (path, value) => {
        const v = value as Json;
        if (!v.policy) c.add(`${path}.policy`, "required");
        c.text(`${path}.note`, v.note ?? null, 500, v.policy === "CONDITIONAL");
      },
    });
    ((input.spaces ?? []) as Json[]).forEach((space, index) => {
      const path = `content.spaces.${index}`;
      c.wrapper(`${path}.monthlyRent`, space.monthlyRent, { sourced: true, value: (p, v) => money(c, p, v, 1) });
      c.wrapper(`${path}.deposit`, space.deposit, {
        sourced: true,
        value: (valuePath, value) => {
          const v = value as Json;
          if (v.basis === "MONTHS") c.integer(`${valuePath}.months`, v.months, 0, 12);
          else if (v.basis === "AMOUNT") money(c, `${valuePath}.amount`, v.amount ?? null, 0);
          else c.add(`${valuePath}.basis`, "required");
        },
      });
      c.wrapper(`${path}.paymentPeriodMonths`, space.paymentPeriodMonths, { sourced: true, value: (p, v) => c.integer(p, v, 1, 12) });
      c.wrapper(`${path}.minimumTermMonths`, space.minimumTermMonths, { sourced: true, value: (p, v) => c.integer(p, v, 1, 120) });
      const overrides = (space.chargeOverrides ?? {}) as Json;
      for (const [field, term] of Object.entries(overrides)) {
        c.wrapper(`${path}.chargeOverrides.${field}`, term, { sourced: true, value: (p, v) => charge(c, p, v) });
      }
      c.wrapper(`${path}.spaceFees`, space.spaceFees, { sourced: true, value: (p, v) => fees(c, p, v) });
    });
  },
};

/** The page's checks of one group body; `{}` when it may be sent. */
export function checkGroupInput<G extends ChecklistGroupPath>(
  group: G,
  input: ChecklistInput[G],
  rules: ChecklistRules,
): ChecklistProblems {
  const checker = new Checker(rules);
  CHECKS[group](checker, input as unknown as Json);
  return checker.problems;
}

/** A correction, takeover or intake: a reason and a basis dated from the visit's arrival to today (A-7, BR-22). */
export type BasisForm = { reason: string; basis: { confirmedOn: string; text: string } };

/** Problems by `reason`, `basis.confirmedOn`, `basis.text`. */
export function checkCorrection(form: BasisForm, rules: Pick<ChecklistRules, "today" | "arrivalDate">): ChecklistProblems {
  const checker = new Checker({ ...rules, viewerUserId: "" });
  checker.text("reason", form.reason, 500, true);
  const dateProblem = basisDateProblem(form.basis.confirmedOn, rules.today, rules.arrivalDate);
  if (dateProblem !== null) checker.add("basis.confirmedOn", dateProblem);
  checker.text("basis.text", form.basis.text, 500, true);
  return checker.problems;
}
