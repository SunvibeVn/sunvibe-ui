export type Province = { code: string; name: string };

/** WARD (Phường), COMMUNE (Xã) or SPECIAL_ZONE (Đặc khu). */
export type WardType = "WARD" | "COMMUNE" | "SPECIAL_ZONE";

export type Ward = { code: string; name: string; type: WardType };

export type CatalogResult<T> =
  | { status: "ready"; items: T[] }
  | { status: "empty" }
  /** `correlationId` is set on a 5xx only, for "Mã hỗ trợ". */
  | { status: "failed"; correlationId?: string };

/** What the selects report to the form on every change. */
export type CatalogSelectionChange = {
  provinceCode: string;
  wardCode: string;
  wardType?: WardType;
  /** Name of the chosen ward, for copy such as the special-zone notice. */
  wardName?: string;
  /** True when the map pin no longer fits the selection and must be removed. */
  clearPin: boolean;
};
