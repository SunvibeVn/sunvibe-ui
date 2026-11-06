"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { ownerFormOffer } from "../../lib/checklist/field-offers";
import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";

import { useChecklistPage } from "./checklist-context";
import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { SpaceSections } from "./space-sections";
import { UnsourcedReminder } from "./unsourced-reminder";
import { usePanel } from "./use-panel";

const OCCUPANCY = ["VACANT", "OCCUPIED", "UNDER_RENOVATION", "SUSPENDED"] as const;

function threeYearsAfter(today: string): string {
  return `${String(Number(today.slice(0, 4)) + 3).padStart(4, "0")}${today.slice(4)}`;
}

/**
 * G4 Condition and availability (survey-checklist spec 6.2, BR-17): per space occupancy, dates and the area checks
 * ("Inspected" or "Not entered or only partly entered" with what was not reached); in PARTS the shared kitchen and
 * bathroom; in WHOLE "Use the owner's form" on available-from when the submission holds a date.
 */
export function ConditionPanel() {
  const t = useTranslations("OwnerLeads");
  const page = useChecklistPage();
  const panel = usePanel("condition");
  const parts = page.ctx.scope === "PARTS";
  const formDate = ownerFormOffer("availableFrom", page.ctx.scope, page.view.ownerForm);
  const late = threeYearsAfter(page.rules.today);
  return (
    <GroupPanel panel={panel} no={4}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <UnsourcedReminder />
          {parts && (
            <>
              <FieldControl panel={panel} unitKey={unitKey.field("condition", "sharedKitchen")} field="sharedKitchen" na kind={{ kind: "areaCheck" }} problems={problems} />
              <FieldControl panel={panel} unitKey={unitKey.field("condition", "sharedBathroom")} field="sharedBathroom" na kind={{ kind: "areaCheck" }} problems={problems} />
            </>
          )}
          <SpaceSections>
            {(spaceId) => (
              <>
                <FieldControl
                  panel={panel}
                  unitKey={unitKey.spaceField("condition", spaceId, "occupancy")}
                  field="occupancy"
                  kind={{ kind: "enum", options: OCCUPANCY.map((value) => ({ value, label: t(`checklist.values.occupancy.${value}`) })) }}
                  problems={problems}
                />
                <FieldControl
                  panel={panel}
                  unitKey={unitKey.spaceField("condition", spaceId, "expectedVacantFrom")}
                  field="expectedVacantFrom"
                  sourced="terms"
                  kind={{ kind: "date", max: late }}
                  problems={problems}
                />
                <FieldControl
                  panel={panel}
                  unitKey={unitKey.spaceField("condition", spaceId, "availableFrom")}
                  field="availableFrom"
                  sourced="terms"
                  unconfirmed
                  ownerFormAllowed={formDate !== null}
                  kind={{ kind: "date", max: late }}
                  problems={problems}
                  aids={
                    formDate !== null && (
                      <Button
                        variant="secondary"
                        className="px-3 py-1"
                        onClick={() =>
                          panel.setUnit(unitKey.spaceField("condition", spaceId, "availableFrom"), {
                            state: "VALUE",
                            value: formDate,
                            naReason: null,
                            source: "OWNER_FORM",
                            confirmedOn: null,
                            receivedByUserId: null,
                            relayBasis: null,
                          })
                        }
                      >
                        {t("checklist.identification.useOwnerForm")}
                      </Button>
                    )
                  }
                />
                <FieldControl panel={panel} unitKey={unitKey.spaceField("condition", spaceId, "mainSpace")} field="mainSpace" kind={{ kind: "areaCheck" }} problems={problems} />
                <FieldControl panel={panel} unitKey={unitKey.spaceField("condition", spaceId, "kitchen")} field="kitchen" na kind={{ kind: "areaCheck" }} problems={problems} />
                <FieldControl panel={panel} unitKey={unitKey.spaceField("condition", spaceId, "bathroom")} field="bathroom" na kind={{ kind: "areaCheck" }} problems={problems} />
              </>
            )}
          </SpaceSections>
        </div>
      )}
    </GroupPanel>
  );
}
