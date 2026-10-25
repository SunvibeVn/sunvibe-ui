"use client";

import { useTranslations } from "next-intl";

import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";

import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { NoteField } from "./note-field";
import { SpaceSections } from "./space-sections";
import { usePanel } from "./use-panel";

/** G3 Size and layout (survey-checklist spec 4.6): per space area, bedrooms, bathrooms, shared bathroom, layout note. */
export function DimensionsPanel() {
  const t = useTranslations("OwnerLeads");
  const panel = usePanel("dimensions");
  const yesNo = (["YES", "NO"] as const).map((value) => ({ value, label: t(`checklist.values.yesNo.${value}`) }));
  return (
    <GroupPanel panel={panel} no={3}>
      {(problems: ChecklistProblems) => (
        <SpaceSections>
          {(spaceId) => (
            <>
              <FieldControl panel={panel} unitKey={unitKey.spaceField("dimensions", spaceId, "area")} field="area" sourced="area" kind={{ kind: "area" }} problems={problems} />
              <FieldControl panel={panel} unitKey={unitKey.spaceField("dimensions", spaceId, "bedrooms")} field="bedrooms" sourced="count" kind={{ kind: "integer", min: 0, max: 50 }} problems={problems} />
              <FieldControl
                panel={panel}
                unitKey={unitKey.spaceField("dimensions", spaceId, "privateBathrooms")}
                field="privateBathrooms"
                sourced="count"
                kind={{ kind: "integer", min: 0, max: 50 }}
                problems={problems}
              />
              <FieldControl
                panel={panel}
                unitKey={unitKey.spaceField("dimensions", spaceId, "sharedBathroomUse")}
                field="sharedBathroomUse"
                sourced="count"
                kind={{ kind: "enum", options: yesNo }}
                problems={problems}
              />
              <NoteField panel={panel} unitKey={unitKey.spaceField("dimensions", spaceId, "layoutNote")} field="layoutNote" max={1000} rows={2} problems={problems} />
            </>
          )}
        </SpaceSections>
      )}
    </GroupPanel>
  );
}
