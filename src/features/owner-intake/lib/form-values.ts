import type { CatalogSelectionChange } from "../types/catalog";
import type { FormValues } from "../types/form";

export const EMPTY_FORM_VALUES: FormValues = {
  contactName: "",
  phone: "",
  email: "",
  intent: "",
  provinceCode: "",
  wardCode: "",
  addressDetail: "",
  propertyType: "",
  askingPrice: { amount: "" },
  availableFrom: "",
  notes: "",
  preferredCallbackTime: "",
  consent: { accepted: false },
};

/** Applies a CatalogSelects change: new codes and ward type, and drops the pin when it no longer fits. */
export function applyCatalogChange(values: FormValues, change: CatalogSelectionChange): FormValues {
  const next: FormValues = {
    ...values,
    provinceCode: change.provinceCode,
    wardCode: change.wardCode,
    wardType: change.wardType,
  };
  if (change.clearPin) {
    next.latitude = undefined;
    next.longitude = undefined;
  }
  return next;
}
