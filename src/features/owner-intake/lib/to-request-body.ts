import type { FormValues, OwnerIntakeRequestBody, PriceUnit } from "../types/form";

import { CONSENT_NOTICE_VERSION } from "./consent";
import { roundCoordinate } from "./geo";

/** Price unit derived from the intent; the owner never picks it (BR-4). */
export const PRICE_UNIT_BY_INTENT = {
  SHORT_TERM_RENT: "NIGHT",
  LONG_TERM_RENT: "MONTH",
  SALE: "TOTAL",
} as const satisfies Record<OwnerIntakeRequestBody["intent"], PriceUnit>;

/** Trimmed text, or undefined when blank so the field is left out of the body. */
function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Leaves out the keys whose value is undefined. */
function compact<T extends object>(body: T): T {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)) as T;
}

/**
 * Builds the POST body from validated form values (call validateOwnerIntake first). Always from the controlled
 * state, never from FormData: disabled selects drop out of FormData.
 */
export function toRequestBody(values: FormValues): OwnerIntakeRequestBody {
  const { intent } = values;
  if (intent === "") throw new Error("toRequestBody needs validated values: intent is empty");

  const amount = optional(values.askingPrice.amount);
  const { latitude, longitude } = values;
  // Both or neither, and none for a SPECIAL_ZONE ward; rounded to 6 decimals (handoff 2.5).
  const pin =
    latitude !== undefined && longitude !== undefined && values.wardType !== "SPECIAL_ZONE"
      ? { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
      : undefined;

  return compact({
    contactName: values.contactName.trim(),
    phone: values.phone,
    email: optional(values.email),
    intent,
    provinceCode: values.provinceCode,
    wardCode: values.wardCode,
    addressDetail: values.addressDetail,
    latitude: pin?.latitude,
    longitude: pin?.longitude,
    propertyType: values.propertyType === "" ? undefined : values.propertyType,
    askingPrice:
      amount === undefined ? undefined : { amount: Number(amount), currency: "VND" as const, unit: PRICE_UNIT_BY_INTENT[intent] },
    availableFrom: optional(values.availableFrom),
    notes: optional(values.notes),
    preferredCallbackTime: optional(values.preferredCallbackTime),
    consent: { accepted: values.consent.accepted, noticeVersion: CONSENT_NOTICE_VERSION },
  });
}
