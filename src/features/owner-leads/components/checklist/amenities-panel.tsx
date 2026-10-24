"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { ChecklistAmenityCode, ChecklistInput, ChecklistOtherItemInput } from "@/features/surveys";

import { newOtherItem } from "../../lib/checklist/entries";
import { fieldAnchor, spaceCodes } from "../../lib/checklist/readiness-view";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import { unitKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { ItemControl } from "./item-control";
import { SpaceSections } from "./space-sections";
import { type Panel, usePanel } from "./use-panel";

const CODES: readonly ChecklistAmenityCode[] = [
  "AIR_CONDITIONER",
  "WATER_HEATER",
  "WASHING_MACHINE",
  "REFRIGERATOR",
  "BED",
  "WARDROBE",
  "DESK",
  "KITCHEN_EQUIPMENT",
  "INTERNET",
  "ELEVATOR",
  "MOTORBIKE_PARKING",
  "CAR_PARKING",
  "BALCONY",
  "WINDOW",
  "SECURITY",
  "CCTV",
  "POOL",
  "GARDEN",
];

const blankItem = (code: ChecklistAmenityCode) => ({
  code,
  presence: "YES" as const,
  source: "OBSERVED_ON_SITE" as const,
  confirmedOn: null,
  receivedByUserId: null,
  relayBasis: null,
});

/**
 * The catalogue items of one placement (shared, or one space): ticking a code records it, unticking removes it. The
 * code at its placement is the item's identity (A-29): ticking a code again after its removal is the same item coming
 * back, so the server may ask for a correction then (its 400 opens the box).
 */
function ItemList({ panel, keyOf, problems, title }: { panel: Panel; keyOf: (code: ChecklistAmenityCode) => string; problems: ChecklistProblems; title: string }) {
  const t = useTranslations("OwnerLeads");
  const id = useId();
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3" disabled={panel.locked}>
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      <ul className="space-y-2">
        {CODES.map((code) => {
          const key = keyOf(code);
          const ticked = panel.units.has(key);
          return (
            <li key={code} className={ticked ? "space-y-2 rounded-lg bg-slate-50 p-2" : ""}>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800">
                <input
                  id={`${id}-${code}`}
                  type="checkbox"
                  className="h-4 w-4 accent-violet-600"
                  checked={ticked}
                  onChange={(event) => panel.setUnit(key, event.target.checked ? (panel.storedUnits.get(key) ?? blankItem(code)) : null)}
                />
                {t(`checklist.values.items.${code}`)}
              </label>
              {ticked && <ItemControl panel={panel} unitKey={key} problems={problems} />}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

function OtherItem({ panel, item, problems }: { panel: Panel; item: ChecklistOtherItemInput; problems: ChecklistProblems }) {
  const t = useTranslations("OwnerLeads");
  const { ctx, view } = useChecklistPage();
  const id = useId();
  const key = unitKey.otherItem(item.itemId);
  const rel = problemsUnder(problems, unitPath("amenities", panel.input as never, key));
  const codes = spaceCodes(view);
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SurveyTextField
          id={`${id}-label`}
          label={t("checklist.fields.otherItemLabel")}
          required
          value={item.label}
          onChange={(label) => panel.setUnit(key, { ...item, label })}
          error={rel.label === undefined ? undefined : checklistProblemText(t, rel.label, "text", 100)}
        />
        <FormField id={`${id}-where`} label={t("checklist.fields.otherItemSpace")}>
          <Select
            id={`${id}-where`}
            value={item.spaceId ?? ""}
            onChange={(event) => panel.setUnit(key, { ...item, spaceId: event.target.value === "" ? null : event.target.value })}
          >
            <option value="">{t("checklist.fields.wholeProperty")}</option>
            {ctx.spaces.map((spaceId) => (
              <option key={spaceId} value={spaceId}>
                {codes.get(spaceId) ?? spaceId}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <ItemControl panel={panel} unitKey={key} problems={problems} />
      <Button variant="ghost" className="px-3 py-1" onClick={() => panel.setUnit(key, null)}>
        {t("checklist.amenities.removeOther")}
      </Button>
    </div>
  );
}

/**
 * G6 Amenities and furniture (survey-checklist spec 4.6, BR-11 G6, BR-28): an inventory that never blocks; shared
 * items, per space the furnishing and items, and other items keyed by their own client id (a new one always gets a
 * new id, A-23, A-29).
 */
export function AmenitiesPanel() {
  const t = useTranslations("OwnerLeads");
  const panel = usePanel("amenities");
  const input = panel.input as ChecklistInput["amenities"];
  return (
    <GroupPanel panel={panel} no={6}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <p className="text-xs text-slate-600">{t("checklist.amenities.notListed")}</p>
          <div id={fieldAnchor("amenities", null, "sharedItems")}>
            <ItemList panel={panel} keyOf={unitKey.sharedItem} problems={problems} title={t("checklist.fields.sharedItems")} />
          </div>
          <SpaceSections>
            {(spaceId) => (
              <>
                <FieldControl
                  panel={panel}
                  unitKey={unitKey.spaceField("amenities", spaceId, "furnishing")}
                  field="furnishing"
                  sourced="amenity"
                  kind={{
                    kind: "enum",
                    options: (["FULLY_FURNISHED", "BASIC", "UNFURNISHED"] as const).map((value) => ({ value, label: t(`checklist.values.furnishing.${value}`) })),
                  }}
                  problems={problems}
                />
                <ItemList panel={panel} keyOf={(code) => unitKey.spaceItem(spaceId, code)} problems={problems} title={t("checklist.fields.spaceItems")} />
              </>
            )}
          </SpaceSections>
          <fieldset id={fieldAnchor("amenities", null, "otherItems")} className="space-y-3 rounded-lg border border-slate-200 p-3" disabled={panel.locked}>
            <legend className="px-1 text-sm font-semibold text-slate-800">{t("checklist.fields.otherItems")}</legend>
            {input.otherItems.map((item) => (
              <OtherItem key={item.itemId} panel={panel} item={item} problems={problems} />
            ))}
            {input.otherItems.length < 20 && (
              <Button
                variant="secondary"
                onClick={() => {
                  const added = newOtherItem();
                  panel.setUnit(unitKey.otherItem(added.itemId), added, true);
                }}
              >
                {t("checklist.amenities.addOther")}
              </Button>
            )}
          </fieldset>
        </div>
      )}
    </GroupPanel>
  );
}
