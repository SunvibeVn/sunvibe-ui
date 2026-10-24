import type { PriceUnit } from "../types";

import { type OwnerLeadsKey, priceUnitLabelKey } from "./labels";

// The Vietnam time helpers live in `@/lib/format/vietnam-time`; re-exported for this feature's own files.
export { formatDate, formatDateTime, instantToLocalInput, localInputToInstant } from "@/lib/format/vietnam-time";

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

/**
 * `3.500.000 ₫/month`: `Intl` VND amount followed by the unit suffix. `label` reads an `OwnerLeads` key (pass the
 * component's `t`): the suffix is `PRICE_UNIT_LABEL[unit]` ("/night", "/month", " (sale price)").
 */
export function formatPrice(
  price: { amount: number | string; unit: PriceUnit | string },
  label: (key: OwnerLeadsKey) => string,
): string {
  const { amount } = price;
  // An int64 string above 2^53 stays exact as a bigint.
  const value = typeof amount === "string" && /^-?\d+$/.test(amount) ? BigInt(amount) : Number(amount);
  // A unit this UI does not know gives the amount alone, never a raw code or "undefined".
  const unitKey = priceUnitLabelKey(price.unit);
  return `${VND.format(value)}${unitKey === null ? "" : label(unitKey)}`;
}
