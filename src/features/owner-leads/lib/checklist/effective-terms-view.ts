import type { ChecklistEffectiveCharge, ChecklistView } from "@/features/surveys";

import { spaceCodes } from "./readiness-view";
import { CHARGES, type Charge } from "./units";

// The effective G8 values per space (survey-checklist spec 4.7, W16-11): each charge is the space's override, else the
// common value, with its origin; the fees are the common list plus the space's own list.

export type EffectiveCharge = { charge: Charge; term: ChecklistEffectiveCharge["term"] | null; origin: "COMMON" | "SPACE" };

export type EffectiveTerms = {
  spaceId: string;
  spaceCode: string | null;
  charges: EffectiveCharge[];
  fees: { common: unknown; space: unknown };
};

export function effectiveTermsBySpace(view: ChecklistView): EffectiveTerms[] {
  const codes = spaceCodes(view);
  return (view.effectiveTerms ?? []).map((entry) => ({
    spaceId: entry.spaceId ?? "",
    spaceCode: codes.get(entry.spaceId ?? "") ?? null,
    charges: CHARGES.map((charge) => ({
      charge,
      term: entry[charge]?.term ?? null,
      origin: entry[charge]?.origin ?? "COMMON",
    })),
    fees: { common: entry.fees?.common ?? null, space: entry.fees?.space ?? null },
  }));
}
