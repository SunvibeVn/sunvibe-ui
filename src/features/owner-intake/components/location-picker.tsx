"use client";

import { useTranslations } from "next-intl";

import { type MapPinLabels, MapPinPicker } from "@/components/map/map-pin-picker";
import type { Pin } from "@/lib/map/geo";

export type LocationPickerProps = {
  /** The pin, already rounded and inside the service box; undefined when none. */
  value?: Pin;
  onChange: (pin: Pin | undefined) => void;
  /** True for a SPECIAL_ZONE ward: no map and no location button, only a notice (handoff section 4). */
  disabled?: boolean;
  /** Name of the chosen ward, for the special-zone notice. */
  wardName?: string;
  /** Read-only while submitting. */
  readOnly?: boolean;
  /** True while "Dùng vị trí hiện tại" waits for the browser; the form blocks its submit meanwhile. */
  onLocatingChange?: (locating: boolean) => void;
  /** Error on `latitude` (every pair, box and special-zone error of the server lands here). */
  latitudeError?: string;
  /** Error on `longitude` (range or decimals only). */
  longitudeError?: string;
};

/**
 * Optional map pin and "Dùng vị trí hiện tại" (BR-7, US-2 AC-2/AC-3): the shared picker with the Vietnamese texts.
 * The ids `latitude` and `longitude` match fieldElementId, so the first-invalid-field focus lands on this area.
 */
export function LocationPicker({ wardName = "", latitudeError, longitudeError, ...props }: LocationPickerProps) {
  const t = useTranslations("OwnerIntake");
  const labels: MapPinLabels = {
    label: t("map.label"),
    hint: t("map.hint"),
    loading: t("map.loading"),
    failed: t("map.failed"),
    specialZone: t("map.specialZone", { name: wardName }),
    clear: t("map.clear"),
    locate: t("location.button"),
    locating: t("location.locating"),
    pinOutOfArea: t("errors.fields.latitude.outOfArea"),
    outOfArea: t("location.outOfArea"),
    denied: t("location.denied"),
    locationFailed: t("location.failed"),
    unsupported: t("location.unsupported"),
  };
  return (
    <MapPinPicker
      {...props}
      labels={labels}
      ids={{ group: "latitude", inner: "longitude", label: "location-label" }}
      error={latitudeError ?? longitudeError}
    />
  );
}
