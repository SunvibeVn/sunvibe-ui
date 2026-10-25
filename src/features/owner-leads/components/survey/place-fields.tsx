"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { type MapPinLabels, MapPinPicker } from "@/components/map/map-pin-picker";
import { Button } from "@/components/ui/button";
import { describedBy, FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

import { type Place, placeDiffersFromLead } from "../../lib/survey/appointment-view";
import { ADDRESS_MAX, type SurveyProblem } from "../../schemas/survey/survey-text";
import { listWards } from "../../services/owner-leads-api";
import type { Ward } from "../../types";

import { problemText } from "./survey-copy";
import { SurveyTextField } from "./survey-text-field";

type WardsLoad = { state: "loading" } | { state: "ready"; wards: Ward[] } | { state: "error" };

type PlaceFieldsProps = {
  place: Place;
  /** The lead's place: "Use the lead address" and the "differs" notice compare with it (A-16). */
  leadPlace: Place;
  onChange: (place: Place) => void;
  addressProblem?: SurveyProblem;
  wardProblem?: SurveyProblem;
  /** While the dialog saves: the map is not a form control, so the disabled fieldset does not lock it. */
  readOnly?: boolean;
  /** The address label; the meeting address of the survey dialogs by default. */
  addressLabel?: string;
  /** The "differs from the lead address" notice with "Use the lead address" (the checklist offers its own aid). */
  leadAction?: boolean;
};

/**
 * The meeting place of a survey dialog (spec 6.2): address, ward of the catalog, an optional map pin (none for a
 * special-zone ward) and "Use the lead address". The map loads only when the dialog shows it.
 */
export function PlaceFields({
  place,
  leadPlace,
  onChange,
  addressProblem,
  wardProblem,
  readOnly = false,
  addressLabel,
  leadAction = true,
}: PlaceFieldsProps) {
  const t = useTranslations("OwnerLeads");
  const addressId = useId();
  const wardId = useId();
  const pinId = useId();
  const [wards, setWards] = useState<WardsLoad>({ state: "loading" });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void listWards().then((result) => {
      if (cancelled) return;
      setWards(result.ok ? { state: "ready", wards: result.data ?? [] } : { state: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [round]);

  const list = wards.state === "ready" ? wards.wards : [];
  const ward = list.find((entry) => entry.code === place.wardCode);
  const specialZone = ward?.type === "SPECIAL_ZONE";
  const pin = place.latitude !== null && place.longitude !== null ? { latitude: place.latitude, longitude: place.longitude } : undefined;
  const wardError = wardProblem === undefined ? undefined : problemText(t, wardProblem);

  const labels: MapPinLabels = {
    label: t("survey.form.map.label"),
    hint: t("survey.form.map.hint"),
    loading: t("survey.form.map.loading"),
    failed: t("survey.form.map.failed"),
    specialZone: t("survey.form.map.specialZone", { name: ward?.name ?? "" }),
    clear: t("survey.form.map.clear"),
    locate: t("survey.form.map.locate"),
    locating: t("survey.form.map.locating"),
    pinOutOfArea: t("survey.form.map.pinOutOfArea"),
    outOfArea: t("survey.form.map.outOfArea"),
    denied: t("survey.form.map.denied"),
    locationFailed: t("survey.form.map.locationFailed"),
    unsupported: t("survey.form.map.unsupported"),
  };

  return (
    <div className="space-y-4">
      <SurveyTextField
        id={addressId}
        label={addressLabel ?? t("survey.form.address")}
        required
        value={place.addressText}
        onChange={(addressText) => onChange({ ...place, addressText })}
        error={addressProblem === undefined ? undefined : problemText(t, addressProblem, "text", ADDRESS_MAX)}
      />
      <FormField id={wardId} label={t("survey.form.ward")} required error={wardError}>
        <Select
          id={wardId}
          value={place.wardCode}
          invalid={wardError !== undefined}
          aria-describedby={describedBy(wardId, wardError)}
          aria-required
          disabled={wards.state !== "ready"}
          onChange={(event) => {
            const next = list.find((entry) => entry.code === event.target.value);
            // A special-zone ward takes no pin (intake rules, A-15).
            const keepPin = next?.type !== "SPECIAL_ZONE";
            onChange({
              ...place,
              wardCode: event.target.value,
              latitude: keepPin ? place.latitude : null,
              longitude: keepPin ? place.longitude : null,
            });
          }}
        >
          <option value="">{wards.state === "loading" ? t("survey.loadingWards") : t("survey.form.wardPlaceholder")}</option>
          {/* The current ward stays selectable while the catalog loads or when it is missing from it. */}
          {ward === undefined && place.wardCode !== "" && <option value={place.wardCode}>{place.wardCode}</option>}
          {list.map((entry) =>
            entry.code ? (
              <option key={entry.code} value={entry.code}>
                {entry.name ?? entry.code}
              </option>
            ) : null,
          )}
        </Select>
      </FormField>
      {wards.state === "error" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
          <span>{t("survey.form.wardsFailed")}</span>
          <Button variant="ghost" className="px-3 py-1" onClick={() => {
            setWards({ state: "loading" });
            setRound((n) => n + 1);
          }}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      <MapPinPicker
        value={pin}
        labels={labels}
        ids={{ group: `${pinId}-group`, inner: `${pinId}-inner`, label: `${pinId}-label` }}
        disabled={specialZone}
        readOnly={readOnly}
        onChange={(next) =>
          onChange({ ...place, latitude: next?.latitude ?? null, longitude: next?.longitude ?? null })
        }
      />
      {leadAction && placeDiffersFromLead(place, leadPlace) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{t("survey.form.placeDiffers")}</span>
          <Button variant="ghost" className="px-3 py-1" onClick={() => onChange(leadPlace)}>
            {t("survey.form.useLeadPlace")}
          </Button>
        </div>
      )}
    </div>
  );
}
