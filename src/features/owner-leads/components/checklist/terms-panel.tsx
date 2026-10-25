"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { ownerFormOffer } from "../../lib/checklist/field-offers";
import { CHARGES, unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";

import { useChecklistPage } from "./checklist-context";
import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { SpaceSections } from "./space-sections";
import { type Panel, usePanel } from "./use-panel";

const VALUE_TERM = { state: "VALUE", value: null, naReason: null, source: null, confirmedOn: null, receivedByUserId: null, relayBasis: null };

/** "Different for this space": a charge override or the space's own fees, null (the common value applies) or a term. */
function SpaceOnly({ panel, unitKey: key, label, children }: { panel: Panel; unitKey: string; label: string; children: ReactNode }) {
  const on = panel.units.get(key) !== null && panel.units.get(key) !== undefined;
  return (
    <div className="space-y-2">
      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800">
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-600"
          checked={on}
          disabled={panel.locked}
          onChange={(event) => panel.setUnit(key, event.target.checked ? (panel.storedUnits.get(key) ?? VALUE_TERM) : null)}
        />
        {label}
      </label>
      {on && children}
    </div>
  );
}

/**
 * G8 Rental terms (survey-checklist spec 6.2, 4.6, BR-5, D-1): common values that apply to every space as the source
 * said; per space the rent, deposit and periods, and in PARTS a "Different for this space" override per charge and the
 * space's own fees; in WHOLE "Use the owner's form" on the rent with a submitted monthly price. Terms as offered or
 * seen, never agreed lease terms. The correction box works here as in every group.
 */
export function TermsPanel() {
  const t = useTranslations("OwnerLeads");
  const page = useChecklistPage();
  const panel = usePanel("terms");
  const parts = page.ctx.scope === "PARTS";
  const formRent = ownerFormOffer("monthlyRent", page.ctx.scope, page.view.ownerForm);
  const term = (key: string, field: string, kind: Parameters<typeof FieldControl>[0]["kind"], problems: ChecklistProblems) => (
    <FieldControl panel={panel} unitKey={key} field={field} sourced="terms" unconfirmed kind={kind} problems={problems} />
  );
  return (
    <GroupPanel panel={panel} no={8}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("checklist.terms.notAgreed")}</p>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">{t("checklist.terms.common")}</h3>
            {CHARGES.map((charge) => (
              <div key={charge}>{term(unitKey.commonTerm(charge), charge, { kind: "charge" }, problems)}</div>
            ))}
            {term(unitKey.commonTerm("otherFees"), "otherFees", { kind: "fees" }, problems)}
            {term(unitKey.commonTerm("houseRules"), "houseRules", { kind: "text", max: 2000, rows: 3 }, problems)}
            {term(unitKey.commonTerm("pets"), "pets", { kind: "pets" }, problems)}
            {term(unitKey.commonTerm("handoverMaintenance"), "handoverMaintenance", { kind: "text", max: 2000, rows: 3 }, problems)}
          </section>
          <SpaceSections>
            {(spaceId) => (
              <>
                <FieldControl
                  panel={panel}
                  unitKey={unitKey.spaceField("terms", spaceId, "monthlyRent")}
                  field="monthlyRent"
                  sourced="terms"
                  unconfirmed
                  ownerFormAllowed={formRent !== null}
                  kind={{ kind: "rent" }}
                  problems={problems}
                  aids={
                    formRent !== null && (
                      <Button
                        variant="secondary"
                        className="px-3 py-1"
                        onClick={() =>
                          panel.setUnit(unitKey.spaceField("terms", spaceId, "monthlyRent"), {
                            ...VALUE_TERM,
                            value: formRent,
                            source: "OWNER_FORM",
                          })
                        }
                      >
                        {t("checklist.identification.useOwnerForm")}
                      </Button>
                    )
                  }
                />
                {term(unitKey.spaceField("terms", spaceId, "deposit"), "deposit", { kind: "deposit" }, problems)}
                {term(unitKey.spaceField("terms", spaceId, "paymentPeriodMonths"), "paymentPeriodMonths", { kind: "integer", min: 1, max: 12 }, problems)}
                {term(unitKey.spaceField("terms", spaceId, "minimumTermMonths"), "minimumTermMonths", { kind: "integer", min: 1, max: 120 }, problems)}
                {parts && (
                  <div className="space-y-3 rounded-lg border border-dashed border-slate-300 p-3">
                    {CHARGES.map((charge) => (
                      <SpaceOnly
                        key={charge}
                        panel={panel}
                        unitKey={unitKey.override(spaceId, charge)}
                        label={`${t(`checklist.fields.${charge}`)}: ${t("checklist.terms.override")}`}
                      >
                        <FieldControl panel={panel} unitKey={unitKey.override(spaceId, charge)} field={charge} sourced="terms" valueOnly kind={{ kind: "charge" }} problems={problems} />
                      </SpaceOnly>
                    ))}
                    <SpaceOnly panel={panel} unitKey={unitKey.spaceField("terms", spaceId, "spaceFees")} label={t("checklist.fields.spaceFees")}>
                      <FieldControl
                        panel={panel}
                        unitKey={unitKey.spaceField("terms", spaceId, "spaceFees")}
                        field="spaceFees"
                        sourced="terms"
                        valueOnly
                        kind={{ kind: "fees" }}
                        problems={problems}
                      />
                    </SpaceOnly>
                  </div>
                )}
              </>
            )}
          </SpaceSections>
        </div>
      )}
    </GroupPanel>
  );
}
