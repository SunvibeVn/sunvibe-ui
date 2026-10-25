"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ChecklistInput, ChecklistObservedLocation } from "@/features/surveys";

import { newClientId } from "../../lib/checklist/client-id";
import { leadAddressOffer, ownerFormOffer } from "../../lib/checklist/field-offers";
import { fieldAnchor } from "../../lib/checklist/readiness-view";
import { scopeSwitchWarning } from "../../lib/checklist/scope-switch";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import { unitKey } from "../../lib/checklist/units";
import type { Place } from "../../lib/survey/appointment-view";
import type { ChecklistProblems } from "../../schemas/checklist";
import type { SurveyProblem } from "../../schemas/survey/survey-text";
import { PlaceFields } from "../survey/place-fields";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { FieldControl } from "./field-control";
import { GroupPanel } from "./group-panel";
import { NoteField } from "./note-field";
import { Provenance } from "./provenance";
import { UnsourcedReminder } from "./unsourced-reminder";
import { type Panel, usePanel } from "./use-panel";

type Space = ChecklistInput["identification"]["spaces"][number];
const PROPERTY_TYPES = ["HOUSE", "WHOLE_BUILDING", "VILLA", "HOMESTAY", "CONDOTEL", "APARTMENT"] as const;
const AID = "px-3 py-1";

const asSurveyProblem = (problem: string | undefined): SurveyProblem | undefined =>
  problem === undefined ? undefined : (["required", "tooLong", "phone"].includes(problem) ? problem : "invalid") as SurveyProblem;

/**
 * G1 Identification (survey-checklist spec 6.2, W16-30): the address seen with ward and map pin, "Use the lead
 * address" and "Use the owner's form" by the source rule, both difference flags with the note, type, fit, scope with
 * the switch warning, and the spaces (add, rename, remove with the warning). A save that removes a space or switches
 * the scope locks every panel and then rebases every panel's draft on the new content.
 */
export function IdentificationPanel() {
  const t = useTranslations("OwnerLeads");
  const page = useChecklistPage();
  const panel = usePanel("identification");
  const scopeId = useId();
  const input = panel.input as ChecklistInput["identification"];
  const stored = panel.stored as ChecklistInput["identification"];
  const visit = page.view.visit;
  const content = panel.content;
  const leadPlace: Place = {
    addressText: visit?.leadLocation?.addressText ?? "",
    wardCode: visit?.leadLocation?.wardCode ?? "",
    latitude: visit?.leadLocation?.latitude ?? null,
    longitude: visit?.leadLocation?.longitude ?? null,
  };
  const lead = leadAddressOffer(visit ?? {}, page.view.ownerForm);
  const form = ownerFormOffer("address", input.rentalScope, page.view.ownerForm);
  const warning = scopeSwitchWarning(stored.rentalScope, input.rentalScope);
  const removed = stored.spaces.filter((space) => !input.spaces.some((entry) => entry.spaceId === space.spaceId));
  const fill = (value: ChecklistObservedLocation, source: string | null) =>
    panel.setUnit(unitKey.field("identification", "observedAddress"), {
      state: "VALUE",
      value,
      naReason: null,
      source,
      confirmedOn: null,
      receivedByUserId: null,
      relayBasis: null,
    });

  return (
    <GroupPanel panel={panel} no={1}>
      {(problems: ChecklistProblems) => (
        <div className="space-y-4">
          <UnsourcedReminder />
          <FieldControl
            panel={panel}
            unitKey={unitKey.field("identification", "observedAddress")}
            field="observedAddress"
            kind={{ kind: "text", max: 255 }}
            sourced="location"
            ownerFormAllowed={form !== null}
            problems={problems}
            aids={
              <div className="flex flex-wrap gap-2">
                {lead !== null && (
                  <Button variant="secondary" className={AID} onClick={() => fill(lead.value, lead.source)}>
                    {t("checklist.identification.useLeadAddress")}
                  </Button>
                )}
                {form !== null && (
                  <Button variant="secondary" className={AID} onClick={() => fill(form, "OWNER_FORM")}>
                    {t("checklist.identification.useOwnerForm")}
                  </Button>
                )}
              </div>
            }
            renderValue={(value, onChange, rel) => {
              const location = (value ?? {}) as Partial<ChecklistObservedLocation>;
              return (
                <PlaceFields
                  place={{
                    addressText: location.addressText ?? "",
                    wardCode: location.wardCode ?? "",
                    latitude: location.latitude ?? null,
                    longitude: location.longitude ?? null,
                  }}
                  leadPlace={leadPlace}
                  leadAction={false}
                  addressLabel={t("checklist.fields.addressText")}
                  addressProblem={asSurveyProblem(rel.addressText)}
                  wardProblem={asSurveyProblem(rel.wardCode ?? rel.provinceCode)}
                  readOnly={panel.locked}
                  onChange={(place) =>
                    onChange({
                      addressText: place.addressText,
                      provinceCode: location.provinceCode ?? visit?.leadLocation?.provinceCode ?? "48",
                      wardCode: place.wardCode,
                      latitude: place.latitude,
                      longitude: place.longitude,
                    })
                  }
                />
              );
            }}
          />
          {content?.difference?.fromLead === true && <Alert tone="info">{t("checklist.identification.fromLead")}</Alert>}
          {content?.difference?.fromMeetingPlace === true && (
            <Alert tone="info">{t("checklist.identification.fromMeetingPlace")}</Alert>
          )}
          <NoteField panel={panel} unitKey={unitKey.field("identification", "differenceNote")} field="differenceNote" max={500} rows={2} problems={problems} />
          <FieldControl
            panel={panel}
            unitKey={unitKey.field("identification", "propertyType")}
            field="propertyType"
            kind={{ kind: "enum", options: PROPERTY_TYPES.map((value) => ({ value, label: t(`propertyType.${value}`) })) }}
            problems={problems}
          />
          <FieldControl panel={panel} unitKey={unitKey.field("identification", "fit")} field="fit" kind={{ kind: "fit" }} problems={problems} />

          <fieldset
            id={fieldAnchor("identification", null, "rentalScope")}
            className="scroll-mt-36 md:scroll-mt-20 space-y-2 rounded-lg border border-slate-200 p-3"
            disabled={panel.locked}
          >
            <legend className="px-1 text-sm font-semibold text-slate-800">{t("checklist.fields.rentalScope")}</legend>
            <div className="flex flex-wrap gap-2">
              {(["WHOLE", "PARTS"] as const).map((scope) => (
                <label
                  key={scope}
                  className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                    input.rentalScope === scope ? "border-violet-600 bg-violet-50 text-violet-800" : "border-slate-300 text-slate-700"
                  }`}
                >
                  <input
                    type="radio"
                    className="accent-violet-600"
                    name={`${scopeId}-scope`}
                    checked={input.rentalScope === scope}
                    onChange={() => panel.setUnit(unitKey.field("identification", "rentalScope"), scope)}
                  />
                  {t(`checklist.values.scope.${scope}`)}
                </label>
              ))}
            </div>
            {warning !== null && <Alert tone="info">{t(`checklist.identification.${warning}`)}</Alert>}
            <Provenance unit={{ state: stored.rentalScope ? "VALUE" : "UNKNOWN" }} meta={panel.metas.get(unitKey.field("identification", "rentalScope"))} />
          </fieldset>

          <fieldset id={fieldAnchor("identification", null, "spaces")} className="scroll-mt-36 md:scroll-mt-20 space-y-3 rounded-lg border border-slate-200 p-3" disabled={panel.locked}>
            <legend className="px-1 text-sm font-semibold text-slate-800">{t("checklist.fields.spaces")}</legend>
            {input.spaces.map((space) => (
              <SpaceEditor key={space.spaceId} space={space} isStored={stored.spaces.some((entry) => entry.spaceId === space.spaceId)} panel={panel} problems={problems} />
            ))}
            {removed.map((space) => (
              <div key={space.spaceId} className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                <span>{t("checklist.identification.removeWarning", { code: space.code })}</span>
                <Button variant="ghost" className={AID} onClick={() => panel.setUnit(unitKey.space(space.spaceId), space)}>
                  {t("checklist.identification.keepSpace", { code: space.code })}
                </Button>
              </div>
            ))}
            {problemsUnder(problems, "content.spaces")[""] !== undefined && (
              <p className="text-sm text-rose-600">{checklistProblemText(t, problemsUnder(problems, "content.spaces")[""])}</p>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                const spaceId = newClientId();
                panel.setUnit(unitKey.space(spaceId), { spaceId, code: "", location: "", description: null }, true);
              }}
            >
              {t("checklist.identification.addSpace")}
            </Button>
          </fieldset>

          <NoteField panel={panel} unitKey={unitKey.field("identification", "otherPartsNote")} field="otherPartsNote" max={1000} problems={problems} />
          <NoteField panel={panel} unitKey={unitKey.field("identification", "generalNote")} field="generalNote" max={2000} problems={problems} />
        </div>
      )}
    </GroupPanel>
  );
}

function SpaceEditor({
  space,
  isStored,
  panel,
  problems,
}: {
  space: Space;
  isStored: boolean;
  panel: Panel<"identification">;
  problems: ChecklistProblems;
}) {
  const t = useTranslations("OwnerLeads");
  const id = useId();
  const key = unitKey.space(space.spaceId);
  const rel = problemsUnder(problems, unitPath("identification", panel.input, key));
  const error = (path: string, max: number) => (rel[path] === undefined ? undefined : checklistProblemText(t, rel[path], "text", max));
  const set = (patch: Partial<Space>) => panel.setUnit(key, { ...space, ...patch });
  const code = space.code.trim() || t("checklist.identification.newSpace");
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SurveyTextField
          id={`${id}-code`}
          label={t("checklist.fields.spaceCode")}
          required
          hint={t("checklist.fields.spaceCodeHint")}
          value={space.code}
          onChange={(next) => set({ code: next })}
          error={error("code", 20)}
        />
        <SurveyTextField
          id={`${id}-location`}
          label={t("checklist.fields.spaceLocation")}
          required
          value={space.location}
          onChange={(next) => set({ location: next })}
          error={error("location", 200)}
        />
      </div>
      <SurveyTextField
        id={`${id}-description`}
        label={t("checklist.fields.spaceDescription")}
        optional
        rows={2}
        value={space.description ?? ""}
        onChange={(next) => set({ description: next.trim() === "" ? null : next })}
        error={error("description", 500)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className={AID} onClick={() => panel.setUnit(key, null)}>
          {t("checklist.identification.removeSpace", { code })}
        </Button>
        {isStored && <span className="text-xs text-slate-600">{t("checklist.identification.removeWarning", { code })}</span>}
      </div>
      {isStored && <Provenance unit={{ state: "VALUE" }} meta={panel.metas.get(key)} />}
    </div>
  );
}
