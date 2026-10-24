"use client";

import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";

import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { SpaceSections } from "./space-sections";
import { UnsourcedReminder } from "./unsourced-reminder";
import { usePanel } from "./use-panel";

/** G2 Private and shared parts (survey-checklist spec 4.6): way in, shared areas, floors; per space floor, areas, access. */
export function PartsPanel() {
  const panel = usePanel("parts");
  return (
    <GroupPanel panel={panel} no={2}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <UnsourcedReminder />
          <FieldControl panel={panel} unitKey={unitKey.field("parts", "accessRoute")} field="accessRoute" kind={{ kind: "text", max: 1000, rows: 2 }} problems={problems} />
          <FieldControl panel={panel} unitKey={unitKey.field("parts", "sharedAreas")} field="sharedAreas" na kind={{ kind: "text", max: 1000, rows: 2 }} problems={problems} />
          <FieldControl panel={panel} unitKey={unitKey.field("parts", "totalFloors")} field="totalFloors" sourced="count" kind={{ kind: "integer", min: 1, max: 200 }} problems={problems} />
          <SpaceSections>
            {(spaceId) => (
              <>
                <FieldControl panel={panel} unitKey={unitKey.spaceField("parts", spaceId, "floor")} field="floor" kind={{ kind: "text", max: 50 }} problems={problems} />
                <FieldControl panel={panel} unitKey={unitKey.spaceField("parts", spaceId, "privateAreas")} field="privateAreas" kind={{ kind: "text", max: 1000, rows: 2 }} problems={problems} />
                <FieldControl panel={panel} unitKey={unitKey.spaceField("parts", spaceId, "actualAccess")} field="actualAccess" kind={{ kind: "actualAccess" }} problems={problems} />
              </>
            )}
          </SpaceSections>
        </div>
      )}
    </GroupPanel>
  );
}
