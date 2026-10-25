"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import type { ChecklistSource } from "@/features/surveys";

import { afterEdit } from "../../lib/checklist/field-offers";
import { fieldAnchor } from "../../lib/checklist/readiness-view";
import { needsRelayBasis, receiverOptions } from "../../lib/checklist/receiver-options";
import { problemsUnder, unitPath } from "../../lib/checklist/unit-path";
import { spaceIdOfKey } from "../../lib/checklist/units";
import type { ChecklistProblems } from "../../schemas/checklist";
import { SurveyTextField } from "../survey/survey-text-field";

import { useChecklistPage } from "./checklist-context";
import { checklistProblemText } from "./checklist-copy";
import { Provenance } from "./provenance";
import type { Panel } from "./use-panel";
import { type ValueKind, ValueEditor } from "./value-editor";

/** The source families of spec 4.6. */
export type SourceFamily = "location" | "area" | "count" | "terms" | "amenity";

const SOURCES: Record<SourceFamily, readonly ChecklistSource[]> = {
  location: ["OBSERVED_ON_SITE", "OWNER_STATED", "OWNER_FORM"],
  area: ["MEASURED", "ESTIMATED", "OWNER_STATED"],
  count: ["OBSERVED_ON_SITE", "OWNER_STATED"],
  terms: ["OBSERVED_ON_SITE", "OWNER_STATED", "OWNER_FORM"],
  amenity: ["OBSERVED_ON_SITE", "OWNER_STATED"],
};

type Wrapper = {
  state: "UNKNOWN" | "VALUE" | "NOT_APPLICABLE";
  value: unknown;
  naReason: string | null;
  source?: string | null;
  confirmedOn?: string | null;
  receivedByUserId?: string | null;
  relayBasis?: string | null;
};

type FieldControlProps = {
  panel: Panel;
  unitKey: string;
  /** The catalogue field (label, anchor, value text). */
  field: string;
  label?: string;
  kind: ValueKind;
  /** NOT_APPLICABLE allowed (spec 4.6 "N/A yes"). */
  na?: boolean;
  sourced?: SourceFamily;
  /** OWNER_FORM is offered (A-18: address in any scope; rent and available-from in WHOLE with a submitted value). */
  ownerFormAllowed?: boolean;
  /** UNKNOWN reads "Not confirmed" (G8 and available-from, BR-16). */
  unconfirmed?: boolean;
  problems: ChecklistProblems;
  /** Input aids beside the field ("Use the owner's form", "Use the lead address"). */
  aids?: ReactNode;
  /** Only a value (a charge override or space fees: null or a term in state VALUE, spec 4.6): no state choice. */
  valueOnly?: boolean;
  /** A value input of its own (the G1 address with ward and pin) instead of the editor of `kind`. */
  renderValue?: (value: unknown, onChange: (value: unknown) => void, problems: ChecklistProblems) => ReactNode;
};

/**
 * One field of a group (survey-checklist spec 6.2): the state choice, the value input, the source choice for sourced
 * fields with "Owner said" date, receiver (from `leadStaff`, "Me" first, nothing preselected) and "How it reached you"
 * exactly when the user creates or changes a statement naming someone else (W16-45), the stored provenance and the
 * messages on its JSON paths.
 */
export function FieldControl({
  panel,
  unitKey,
  field,
  label,
  kind,
  na,
  sourced,
  ownerFormAllowed,
  unconfirmed,
  problems,
  aids,
  renderValue,
  valueOnly = false,
}: FieldControlProps) {
  const t = useTranslations("OwnerLeads");
  const { view, userId, rules } = useChecklistPage();
  const baseId = useId();
  const unit = (panel.units.get(unitKey) ?? { state: "UNKNOWN", value: null, naReason: null }) as Wrapper;
  const stored = panel.storedUnits.get(unitKey);
  const rel = problemsUnder(problems, unitPath(panel.group, panel.input as never, unitKey));
  const error = (path: string, fieldKind: "text" | "date" = "text", max?: number) =>
    rel[path] === undefined ? undefined : checklistProblemText(t, rel[path], fieldKind, max);
  const title = label ?? t(`checklist.fields.${field}` as "checklist.fields.area");
  const anchor = fieldAnchor(panel.group, spaceIdOfKey(unitKey), field);
  const set = (next: Wrapper) => panel.setUnit(unitKey, next);
  const disabled = panel.locked;

  const setState = (state: Wrapper["state"]) => {
    const next: Wrapper = { ...unit, state, value: state === "VALUE" ? unit.value : null, naReason: state === "NOT_APPLICABLE" ? (unit.naReason ?? "") : null };
    if (sourced && state !== "VALUE") Object.assign(next, { source: null, confirmedOn: null, receivedByUserId: null, relayBasis: null });
    set(next);
  };
  const states: Wrapper["state"][] = na ? ["VALUE", "UNKNOWN", "NOT_APPLICABLE"] : ["VALUE", "UNKNOWN"];
  const stateLabel = (state: Wrapper["state"]) =>
    state === "UNKNOWN" && unconfirmed ? t("checklist.states.UNCONFIRMED") : t(`checklist.states.${state}`);
  const sources = sourced ? SOURCES[sourced].filter((source) => source !== "OWNER_FORM" || ownerFormAllowed) : [];
  const relayNeeded = needsRelayBasis(stored, unit, userId);
  const options = receiverOptions(view.leadStaff ?? [], userId);

  return (
    <fieldset id={anchor} className="scroll-mt-36 md:scroll-mt-20 space-y-3 rounded-lg border border-slate-200 p-3" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      <div role="radiogroup" aria-label={`${title}: ${t("checklist.states.label")}`} className={valueOnly ? "hidden" : "flex flex-wrap gap-2"}>
        {states.map((state) => (
          <label
            key={state}
            className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              unit.state === state ? "border-violet-600 bg-violet-50 text-violet-800" : "border-slate-300 text-slate-700"
            }`}
          >
            <input
              type="radio"
              className="accent-violet-600"
              name={`${baseId}-state`}
              checked={unit.state === state}
              onChange={() => setState(state)}
            />
            {stateLabel(state)}
          </label>
        ))}
      </div>
      {error("state") !== undefined && <p className="text-sm text-rose-600">{error("state")}</p>}
      {aids}
      {unit.state === "VALUE" && renderValue !== undefined && renderValue(unit.value, (value) => set(afterEdit({ ...unit, value })), problemsUnder(rel, "value"))}
      {unit.state === "VALUE" && renderValue === undefined && (
        <ValueEditor
          id={`${baseId}-value`}
          label={title}
          kind={kind}
          value={unit.value}
          onChange={(value) => set(afterEdit({ ...unit, value }))}
          problems={problemsUnder(rel, "value")}
          disabled={disabled}
        />
      )}
      {unit.state === "VALUE" && rel.value !== undefined && kind.kind !== "text" && kind.kind !== "integer" && kind.kind !== "area" && kind.kind !== "date" && kind.kind !== "enum" && (
        <p className="text-sm text-rose-600">{error("value")}</p>
      )}
      {unit.state === "NOT_APPLICABLE" && (
        <SurveyTextField
          id={`${baseId}-na`}
          label={t("checklist.states.naReason")}
          rows={2}
          required
          value={unit.naReason ?? ""}
          onChange={(naReason) => set({ ...unit, naReason })}
          error={error("naReason", "text", 500)}
        />
      )}
      {sourced && unit.state === "VALUE" && (
        <div className="space-y-3">
          <FormField id={`${baseId}-source`} label={t("checklist.sources.label")} required error={error("source")}>
            <Select
              id={`${baseId}-source`}
              value={unit.source ?? ""}
              invalid={error("source") !== undefined}
              aria-describedby={describedBy(`${baseId}-source`, error("source"))}
              onChange={(event) => {
                const source = event.target.value === "" ? null : event.target.value;
                set({
                  ...unit,
                  source,
                  confirmedOn: source === "OWNER_STATED" ? (unit.confirmedOn ?? null) : null,
                  receivedByUserId: source === "OWNER_STATED" ? (unit.receivedByUserId ?? null) : null,
                  relayBasis: source === "OWNER_STATED" ? (unit.relayBasis ?? null) : null,
                });
              }}
            >
              <option value="">{t("checklist.panel.choose")}</option>
              {sources.map((source) => (
                <option key={source} value={source}>
                  {t(`checklist.sources.${source}`)}
                </option>
              ))}
            </Select>
          </FormField>
          {unit.source === "OWNER_STATED" && (
            <div className="space-y-3 rounded-lg bg-slate-50 p-3">
              <SurveyTextField
                id={`${baseId}-said`}
                type="date"
                max={rules.today}
                required
                label={t("checklist.receiver.confirmedOn")}
                value={unit.confirmedOn ?? ""}
                onChange={(confirmedOn) => set({ ...unit, confirmedOn: confirmedOn === "" ? null : confirmedOn })}
                error={error("confirmedOn", "date")}
              />
              <FormField
                id={`${baseId}-receiver`}
                label={t("checklist.receiver.label")}
                required
                error={error("receivedByUserId") ?? (relayNeeded ? undefined : error("relayBasis", "text", 500))}
                hint={
                  <span className="block space-y-1">
                    <span className="block">{t("checklist.receiver.notListed")}</span>
                    <span className="block">{t("checklist.receiver.nobodyListed")}</span>
                  </span>
                }
              >
                <Select
                  id={`${baseId}-receiver`}
                  value={unit.receivedByUserId ?? ""}
                  invalid={error("receivedByUserId") !== undefined}
                  aria-describedby={describedBy(`${baseId}-receiver`, error("receivedByUserId"), true)}
                  onChange={(event) =>
                    set({
                      ...unit,
                      receivedByUserId: event.target.value === "" ? null : event.target.value,
                      relayBasis: event.target.value === userId ? null : (unit.relayBasis ?? null),
                    })
                  }
                >
                  <option value="">{t("checklist.receiver.placeholder")}</option>
                  {options.map((option) => (
                    <option key={option.userId} value={option.userId}>
                      {option.me ? t("checklist.receiver.me") : option.name?.trim() || t("survey.unknownPerson")}
                    </option>
                  ))}
                </Select>
              </FormField>
              {relayNeeded && (
                <SurveyTextField
                  id={`${baseId}-relay`}
                  label={t("checklist.receiver.relay")}
                  rows={2}
                  required
                  value={unit.relayBasis ?? ""}
                  onChange={(relayBasis) => set({ ...unit, relayBasis })}
                  error={error("relayBasis", "text", 500)}
                />
              )}
            </div>
          )}
        </div>
      )}
      <Provenance
        unit={{
          state: (stored as Wrapper | undefined)?.state,
          source: (stored as Wrapper | undefined)?.source ?? null,
          relayBasis: (stored as Wrapper | undefined)?.relayBasis ?? null,
        }}
        meta={panel.metas.get(unitKey)}
      />
    </fieldset>
  );
}
