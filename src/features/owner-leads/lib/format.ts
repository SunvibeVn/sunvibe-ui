import type { PriceUnit } from "../types";

import { type OwnerLeadsKey, priceUnitLabelKey } from "./labels";

/** Vietnam has no daylight saving time: UTC+7 all year. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const TIME_ZONE = "Asia/Ho_Chi_Minh";

const DATE_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const VND = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** `dd/MM/yyyy HH:mm` in Vietnam time (BR-5, independent of the machine time zone); "" when unreadable. */
export function formatDateTime(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const part = Object.fromEntries(DATE_TIME_PARTS.formatToParts(time).map((p) => [p.type, p.value]));
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}`;
}

/** `dd/MM/yyyy` for a date without time (`yyyy-MM-dd`); not shifted by any time zone. "" when unreadable. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

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

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converts the value of an `<input type="datetime-local">` (read as Vietnam time) to an ISO instant, e.g.
 * `2026-10-18T09:05` -> `2026-10-18T02:05:00.000Z`. Throws `RangeError` for an empty, malformed or impossible
 * value: the form checks emptiness first, an empty field means "keep the current next action".
 */
export function localInputToInstant(value: string): string {
  const match = LOCAL_INPUT.exec(value);
  if (!match) throw new RangeError(`Not a datetime-local value: ${value}`);
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    throw new RangeError(`Not a real date and time: ${value}`);
  }
  return new Date(wall - VIETNAM_OFFSET_MS).toISOString();
}

/** The `datetime-local` value (`yyyy-MM-ddTHH:mm`, Vietnam time) of an ISO instant; "" when unreadable. */
export function instantToLocalInput(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const wall = new Date(time + VIETNAM_OFFSET_MS);
  return (
    `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
  );
}
