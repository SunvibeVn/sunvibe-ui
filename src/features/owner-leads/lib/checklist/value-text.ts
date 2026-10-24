import { formatDate } from "@/lib/format/vietnam-time";

import type { OwnerLeadsTranslate } from "../history-activity-text";
import { propertyTypeLabelKey } from "../labels";

// One unit's value as text, for the read-only Edit, the compare view of a 409, the preview and the snapshot view
// (survey-checklist spec 6.2). Terms and available-from read "Not confirmed" while unknown (BR-16).

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

/** Fields whose unknown reads "Not confirmed" (spec 6.2). */
const TERMS = new Set([
  "monthlyRent",
  "deposit",
  "paymentPeriodMonths",
  "minimumTermMonths",
  "electricity",
  "water",
  "internet",
  "parking",
  "serviceFee",
  "otherFees",
  "spaceFees",
  "houseRules",
  "pets",
  "handoverMaintenance",
  "availableFrom",
]);
const AREA_CHECKS = new Set(["mainSpace", "kitchen", "bathroom", "sharedKitchen", "sharedBathroom"]);
const PLAIN_TEXT = new Set([
  "accessRoute",
  "sharedAreas",
  "floor",
  "privateAreas",
  "egress",
  "houseRules",
  "handoverMaintenance",
  "differenceNote",
  "otherPartsNote",
  "generalNote",
  "layoutNote",
]);
const COUNTS = new Set(["totalFloors", "bedrooms", "privateBathrooms"]);
const CHARGES = new Set(["electricity", "water", "internet", "parking", "serviceFee"]);

type Json = Record<string, unknown>;

/** A whole VND amount as `5.000.000 ₫`; an int64 string stays exact. */
export function vnd(amount: unknown): string {
  if (typeof amount === "string" && /^\d+$/.test(amount)) return VND.format(BigInt(amount));
  return typeof amount === "number" ? VND.format(amount) : "";
}

const withNote = (t: OwnerLeadsTranslate, value: string, note: unknown) =>
  typeof note === "string" && note.trim() !== "" ? t("checklist.values.withNote", { value, note }) : value;

function feesText(list: unknown, t: OwnerLeadsTranslate): string {
  const fees = Array.isArray(list) ? (list as Json[]) : [];
  if (fees.length === 0) return t("checklist.values.noFees");
  return fees
    .map((fee) =>
      t("checklist.values.fee", {
        name: String(fee.name ?? ""),
        amount: vnd((fee.amount as Json | null)?.amount),
        unit: fee.chargeUnit ? t(`checklist.values.chargeUnit.${fee.chargeUnit as "PER_MONTH"}`) : "",
      }),
    )
    .join("; ");
}

/** The text of a recorded value of `field`. */
export function valueText(field: string, value: unknown, t: OwnerLeadsTranslate): string {
  const v = (value ?? {}) as Json;
  if (field === "observedAddress") {
    const pin =
      typeof v.latitude === "number" && typeof v.longitude === "number"
        ? ` (${t("checklist.values.pin", { lat: v.latitude, lng: v.longitude })})`
        : "";
    return `${String(v.addressText ?? "")}${pin}`;
  }
  if (field === "propertyType") {
    const key = propertyTypeLabelKey(value as string);
    return key === null ? String(value ?? "") : t(key);
  }
  if (field === "rentalScope") return value ? t(`checklist.values.scope.${value as "WHOLE"}`) : t("checklist.values.scope.none");
  if (field === "fit") return withNote(t, t(`checklist.values.fit.${v.assessment as "IN_SCOPE"}`), v.reason);
  if (PLAIN_TEXT.has(field)) return String(value ?? "");
  if (COUNTS.has(field)) return String(value ?? "");
  if (field === "area") return `${String(value ?? "")} m2`;
  if (field === "sharedBathroomUse") return t(`checklist.values.yesNo.${value as "YES"}`);
  if (field === "actualAccess") return withNote(t, t(`checklist.values.extent.${v.extent as "ENTERED_ALL"}`), v.note);
  if (field === "occupancy") return t(`checklist.values.occupancy.${value as "VACANT"}`);
  if (field === "availableFrom" || field === "expectedVacantFrom") return formatDate(String(value ?? ""));
  if (AREA_CHECKS.has(field)) {
    if (v.result === "NOT_ENTERED") {
      return withNote(t, t("checklist.values.notEnteredLine", { reason: String(v.notEnteredReason ?? "") }), v.note);
    }
    const label = t("checklist.values.areaCheck.INSPECTED");
    return v.noneObserved === true
      ? t("checklist.values.withNote", { value: label, note: t("checklist.fields.nothingSeen") })
      : withNote(t, label, v.note);
  }
  if (field === "accessRestrictions") {
    return v.noneObserved === true ? t("checklist.values.noneObserved") : String(v.note ?? "");
  }
  if (field === "furnishing") return t(`checklist.values.furnishing.${value as "BASIC"}`);
  if (field === "monthlyRent") return vnd(v.amount);
  if (field === "deposit") {
    if (v.basis === "MONTHS") {
      return v.months === 0 ? t("checklist.values.noDeposit") : t("checklist.values.months", { count: Number(v.months ?? 0) });
    }
    const amount = (v.amount as Json | null)?.amount;
    return amount === 0 ? t("checklist.values.noDeposit") : vnd(amount);
  }
  if (field === "paymentPeriodMonths" || field === "minimumTermMonths") {
    return t("checklist.values.months", { count: Number(value ?? 0) });
  }
  if (CHARGES.has(field)) {
    const basis = t(`checklist.values.chargeBasis.${v.basis as "AMOUNT"}`);
    const amount =
      v.basis === "AMOUNT"
        ? `${vnd((v.amount as Json | null)?.amount)} ${v.chargeUnit ? t(`checklist.values.chargeUnit.${v.chargeUnit as "PER_MONTH"}`) : ""}`.trim()
        : basis;
    return withNote(t, amount, v.note);
  }
  if (field === "otherFees" || field === "spaceFees") return feesText(value, t);
  if (field === "pets") return withNote(t, t(`checklist.values.pets.${v.policy as "ALLOWED"}`), v.note);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * The text of a unit: a plain value (scope, notes) as it is; a wrapper by its state, "Not applicable: <reason>" or
 * its value. Null or blank reads "Not checked".
 */
export function unitText(field: string, unit: unknown, t: OwnerLeadsTranslate): string {
  const unknown = t(TERMS.has(field) ? "checklist.states.UNCONFIRMED" : "checklist.states.UNKNOWN");
  if (unit === null || unit === undefined || (typeof unit === "string" && unit.trim() === "")) return unknown;
  if (typeof unit !== "object") return valueText(field, unit, t);
  const wrapper = unit as { state?: string; value?: unknown; naReason?: string | null };
  if (wrapper.state === undefined) return valueText(field, unit, t);
  if (wrapper.state === "NOT_APPLICABLE") return withNote(t, t("checklist.states.NOT_APPLICABLE"), wrapper.naReason);
  if (wrapper.state !== "VALUE") return unknown;
  return valueText(field, wrapper.value, t);
}
