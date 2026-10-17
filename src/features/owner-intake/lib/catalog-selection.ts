import type { CatalogSelectionChange, Province, Ward } from "../types/catalog";

export type CatalogSelection = { provinceCode: string; wardCode: string };

/** The province to preselect when the catalog has exactly one and none is chosen yet. */
export function defaultProvinceCode(provinceCode: string, provinces: Province[]): string | undefined {
  return provinceCode === "" && provinces.length === 1 ? provinces[0].code : undefined;
}

/** A new province clears the ward; a chosen ward cannot belong to another province, so the pin goes too. */
export function changeProvince(selection: CatalogSelection, provinceCode: string): CatalogSelectionChange | null {
  if (provinceCode === selection.provinceCode) return null;
  return { provinceCode, wardCode: "", wardType: undefined, clearPin: selection.wardCode !== "" };
}

/** Reports the ward type; a special zone takes no coordinates, so its pin is cleared (handoff section 4). */
export function changeWard(provinceCode: string, wards: Ward[], wardCode: string): CatalogSelectionChange {
  const ward = wards.find((candidate) => candidate.code === wardCode);
  if (!ward) return { provinceCode, wardCode: "", wardType: undefined, clearPin: false };
  return { provinceCode, wardCode: ward.code, wardType: ward.type, clearPin: ward.type === "SPECIAL_ZONE" };
}

/** After a ward list loads: drops a ward (and its pin) that the new list makes invalid. */
export function reconcileWard(selection: CatalogSelection, wards: Ward[]): CatalogSelectionChange | null {
  if (selection.wardCode === "" || wards.some((ward) => ward.code === selection.wardCode)) return null;
  return { provinceCode: selection.provinceCode, wardCode: "", wardType: undefined, clearPin: true };
}
