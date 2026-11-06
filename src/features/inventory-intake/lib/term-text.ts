import type { IntakeTermValue } from "../types";

import { codeText } from "./code-text";

const WHOLE_NUMBER = new Intl.NumberFormat("en-US");

/** An unconfirmed term as the survey recorded it (ADR-006 keeps money as amount, currency and unit); null for no value. */
export function termValueText(value: IntakeTermValue | null | undefined): string | null {
  if (!value) return null;
  if (typeof value.amount === "number") {
    const money = [WHOLE_NUMBER.format(value.amount), value.currency].filter(Boolean).join(" ");
    return value.unit ? `${money} / ${codeText(value.unit)}` : money;
  }
  return value.text ? codeText(value.text) : null;
}
