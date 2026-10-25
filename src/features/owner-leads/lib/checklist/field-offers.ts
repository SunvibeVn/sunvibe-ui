import type { ChecklistObservedLocation, ChecklistOwnerForm, ChecklistVisit } from "@/features/surveys";

import type { RentalScope } from "./group-input";

// Input aids of the checklist (survey-checklist spec 6.2, A-18, A-27, BR-19, BR-21): the owner's own submitted values
// and the lead address can be copied into a field; editing a copied owner's form value clears its source.

export type OwnerFormField = "address" | "monthlyRent" | "availableFrom";

type OwnerFormValue = {
  address: ChecklistObservedLocation;
  monthlyRent: { amount: number; currency: string; unit: string };
  availableFrom: string;
};

/**
 * The submitted value "Use the owner's form" copies, or null when it is not offered: the address in any scope; the
 * rent and the available-from date only in WHOLE scope (a part's value was never collected) and only when the
 * submission holds one. `ownerForm` is null for any lead that is not `WEB` (A-27).
 */
export function ownerFormOffer<F extends OwnerFormField>(
  field: F,
  scope: RentalScope | null,
  ownerForm: ChecklistOwnerForm | null | undefined,
): OwnerFormValue[F] | null {
  if (!ownerForm) return null;
  if (field === "address") {
    if (!ownerForm.addressDetail || !ownerForm.provinceCode || !ownerForm.wardCode) return null;
    return {
      addressText: ownerForm.addressDetail,
      provinceCode: ownerForm.provinceCode,
      wardCode: ownerForm.wardCode,
      latitude: ownerForm.latitude ?? null,
      longitude: ownerForm.longitude ?? null,
    } as OwnerFormValue[F];
  }
  if (scope !== "WHOLE") return null;
  if (field === "monthlyRent") {
    const price = ownerForm.monthlyAskingPrice;
    return price && price.unit === "MONTH" ? ({ ...price } as OwnerFormValue[F]) : null;
  }
  return (ownerForm.availableFrom ?? null) as OwnerFormValue[F] | null;
}

type SourcedUnit = { source?: string | null; confirmedOn?: string | null; receivedByUserId?: string | null; relayBasis?: string | null };

/** After the user edits a value copied from the owner's form, the source must be chosen again (spec 4.6, A-18). */
export function afterEdit<U extends SourcedUnit>(unit: U): U {
  return unit.source === "OWNER_FORM" ? { ...unit, source: null, confirmedOn: null, receivedByUserId: null, relayBasis: null } : unit;
}

/**
 * "Use the lead address" (BR-19 input aid; never the meeting place): the lead's place as an observed address, with
 * the source OWNER_FORM for a `WEB` lead (the submitted address is the lead address) and none otherwise.
 */
export function leadAddressOffer(
  visit: Pick<ChecklistVisit, "leadLocation">,
  ownerForm: ChecklistOwnerForm | null | undefined,
): { value: ChecklistObservedLocation; source: "OWNER_FORM" | null } | null {
  const place = visit.leadLocation;
  if (!place?.addressText || !place.provinceCode || !place.wardCode) return null;
  return {
    value: {
      addressText: place.addressText,
      provinceCode: place.provinceCode,
      wardCode: place.wardCode,
      latitude: place.latitude ?? null,
      longitude: place.longitude ?? null,
    },
    source: ownerForm ? "OWNER_FORM" : null,
  };
}
