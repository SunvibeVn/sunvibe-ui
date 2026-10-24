"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import type { SurveyListState } from "../lib/survey-list-url-state";
import { listSurveyors } from "../services/surveys-api";
import type { Surveyor } from "../types";

type SurveyorsLoad = { state: "loading" } | { state: "ready"; list: Surveyor[] } | { state: "error" };

type SurveyFiltersProps = {
  state: SurveyListState;
  onSurveyor(surveyor: string | null): void;
};

/**
 * The Surveyor filter of "All Surveys" (spec 6.5): the staff who can hold leads. A surveyor in the URL who is not on
 * the list (no longer takes leads) stays selectable as "Other staff member". Not shown on "My Surveys".
 */
export function SurveyFilters({ state, onSurveyor }: SurveyFiltersProps) {
  const t = useTranslations("Surveys");
  const id = useId();
  const [surveyors, setSurveyors] = useState<SurveyorsLoad>({ state: "loading" });
  const [round, setRound] = useState(0);
  const all = state.scope === "all";

  useEffect(() => {
    if (!all) return;
    let cancelled = false;
    void listSurveyors().then((result) => {
      if (cancelled) return;
      setSurveyors(result.ok ? { state: "ready", list: result.data ?? [] } : { state: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [all, round]);

  if (!all) return null;
  const list = surveyors.state === "ready" ? surveyors.list : [];
  const selected = state.surveyor ?? "";
  const known = selected === "" || list.some((person) => person.userId === selected);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full max-w-xs">
        <FormField id={id} label={t("filters.surveyor")}>
          <Select
            id={id}
            value={selected}
            disabled={surveyors.state === "loading"}
            onChange={(event) => onSurveyor(event.target.value === "" ? null : event.target.value)}
          >
            <option value="">{t("filters.allSurveyors")}</option>
            {!known && <option value={selected}>{t("filters.other")}</option>}
            {list.map((person) =>
              person.userId ? (
                <option key={person.userId} value={person.userId}>
                  {person.fullName?.trim() || t("unknown")}
                </option>
              ) : null,
            )}
          </Select>
        </FormField>
      </div>
      {surveyors.state === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
          <span>{t("filters.loadFailed")}</span>
          <Button
            variant="ghost"
            className="px-3 py-1"
            onClick={() => {
              setSurveyors({ state: "loading" });
              setRound((count) => count + 1);
            }}
          >
            {t("errors.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
