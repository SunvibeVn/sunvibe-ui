"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { readCurrentLocation } from "../lib/current-location";
import { placePin, type Pin } from "../lib/geo";

import type { LeafletMapProps } from "./leaflet-map";

function MapMessage({ messageKey }: { messageKey: "map.loading" | "map.failed" }) {
  const t = useTranslations("OwnerIntake");
  return (
    <div role="status" className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
      {t(messageKey)}
    </div>
  );
}

function MapFailed() {
  return <MapMessage messageKey="map.failed" />;
}

// Leaflet touches `window` when imported: load it in the browser only. A failed chunk shows a message instead of
// the route error page, so the form still works without a pin.
const LeafletMap = dynamic<LeafletMapProps>(
  () => import("./leaflet-map").then((module) => module.LeafletMap).catch(() => MapFailed),
  { ssr: false, loading: () => <MapMessage messageKey="map.loading" /> },
);

type Notice = "pinOutOfArea" | "outOfArea" | "denied" | "failed" | "unsupported";

const NOTICE_KEY = {
  pinOutOfArea: "errors.fields.latitude.outOfArea",
  outOfArea: "location.outOfArea",
  denied: "location.denied",
  failed: "location.failed",
  unsupported: "location.unsupported",
} as const satisfies Record<Notice, string>;

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
 * Optional map pin and "Dùng vị trí hiện tại" (BR-7, US-2 AC-2/AC-3). The ids `latitude` and `longitude` match
 * fieldElementId, so the first-invalid-field focus lands on this area.
 */
export function LocationPicker({
  value,
  onChange,
  disabled = false,
  wardName = "",
  readOnly = false,
  onLocatingChange,
  latitudeError,
  longitudeError,
}: LocationPickerProps) {
  const t = useTranslations("OwnerIntake");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [locating, setLocating] = useState(false);
  // A location that arrives after the ward became a special zone must not set the pin.
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  // A location that arrives after this picker left the screen (e.g. the success screen) must not reach the form.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const notifyLocating = useEffectEvent((value: boolean) => onLocatingChange?.(value));
  useEffect(() => notifyLocating(locating), [locating]);

  const error = latitudeError ?? longitudeError;
  const errorId = "location-error";
  const hintId = "location-hint";

  const pick = (latitude: number, longitude: number) => {
    if (readOnly) return false;
    const pin = placePin(latitude, longitude);
    setNotice(pin ? null : "pinOutOfArea");
    if (pin) onChange(pin);
    return pin !== undefined;
  };

  // navigator.geolocation is read here only, on click (US-2 AC-3).
  const locate = async () => {
    setNotice(null);
    setLocating(true);
    const result = await readCurrentLocation("geolocation" in navigator ? navigator.geolocation : undefined);
    if (!mountedRef.current) return;
    setLocating(false);
    if (disabledRef.current) return;
    if (result.status === "pinned") onChange(result.pin);
    else setNotice(result.status);
  };

  return (
    <div
      id="latitude"
      tabIndex={-1}
      role="group"
      aria-labelledby="location-label"
      aria-describedby={error ? errorId : hintId}
    >
      <div id="longitude" tabIndex={-1} className="space-y-2">
        <p id="location-label" className="text-sm font-medium text-slate-700">
          {t("map.label")}
        </p>
        {disabled ? (
          <p id={hintId} className="text-xs text-slate-500">
            {t("map.specialZone", { name: wardName })}
          </p>
        ) : (
          <>
            <p id={hintId} className="text-xs text-slate-500">
              {t("map.hint")}
            </p>
            <div className="isolate h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <LeafletMap pin={value} onPick={pick} interactive={!readOnly} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="px-4 py-1.5"
                pending={locating}
                disabled={readOnly}
                onClick={() => void locate()}
              >
                {locating ? t("location.locating") : t("location.button")}
              </Button>
              {value && (
                <Button
                  variant="ghost"
                  className="px-4 py-1.5"
                  disabled={readOnly}
                  onClick={() => {
                    setNotice(null);
                    onChange(undefined);
                  }}
                >
                  {t("map.clear")}
                </Button>
              )}
            </div>
            {notice && (
              <p role="status" className="text-sm text-amber-700">
                {t(NOTICE_KEY[notice])}
              </p>
            )}
          </>
        )}
        {error && (
          <p id={errorId} className="text-sm text-rose-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
