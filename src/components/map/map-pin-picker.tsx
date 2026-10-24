"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { readCurrentLocation } from "@/lib/map/current-location";
import { type MapBox, placePin, type Pin, SERVICE_BOX } from "@/lib/map/geo";

import type { LeafletMapProps } from "./leaflet-map";

/** Every text of the picker, in the language of the screen it sits on (Vietnamese intake, English workspace). */
export type MapPinLabels = {
  /** Visible label of the area and accessible name of the map. */
  label: string;
  hint: string;
  loading: string;
  failed: string;
  /** Shown instead of the map for a special-zone ward (already holds the ward name). */
  specialZone: string;
  clear: string;
  locate: string;
  locating: string;
  /** A click or drag outside the box. */
  pinOutOfArea: string;
  /** The browser location is outside the box. */
  outOfArea: string;
  denied: string;
  locationFailed: string;
  unsupported: string;
};

const LabelsContext = createContext<Pick<MapPinLabels, "loading" | "failed"> | null>(null);

function MapMessage({ kind }: { kind: "loading" | "failed" }) {
  const labels = useContext(LabelsContext);
  return (
    <div role="status" className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
      {labels?.[kind] ?? ""}
    </div>
  );
}

function MapFailed() {
  return <MapMessage kind="failed" />;
}

// Leaflet touches `window` when imported: load it in the browser only. A failed chunk shows a message instead of
// the route error page, so the form still works without a pin.
const LeafletMap = dynamic<LeafletMapProps>(
  () => import("./leaflet-map").then((module) => module.LeafletMap).catch(() => MapFailed),
  { ssr: false, loading: () => <MapMessage kind="loading" /> },
);

type Notice = "pinOutOfArea" | "outOfArea" | "denied" | "failed" | "unsupported";

const NOTICE_LABEL = {
  pinOutOfArea: "pinOutOfArea",
  outOfArea: "outOfArea",
  denied: "denied",
  failed: "locationFailed",
  unsupported: "unsupported",
} as const satisfies Record<Notice, keyof MapPinLabels>;

export type MapPinPickerProps = {
  /** The pin, already rounded and inside the box; undefined when none. */
  value?: Pin;
  onChange: (pin: Pin | undefined) => void;
  labels: MapPinLabels;
  /** Ids of the outer and inner focus targets (a form's first-invalid-field focus lands here) and of the label. */
  ids?: { group: string; inner: string; label: string };
  /** The box a pin must lie in; the service box of the pilot by default. */
  box?: MapBox;
  /** True for a SPECIAL_ZONE ward: no map and no location button, only `labels.specialZone`. */
  disabled?: boolean;
  /** Read-only while submitting. */
  readOnly?: boolean;
  /** True while "use current location" waits for the browser; a form blocks its submit meanwhile. */
  onLocatingChange?: (locating: boolean) => void;
  /** The error to show under the map (a pin refused by the server). */
  error?: string;
};

const DEFAULT_IDS = { group: "latitude", inner: "longitude", label: "location-label" };

/**
 * Optional map pin with "use current location" and "remove". Generic: texts, ids and the allowed box come through
 * props, so the Vietnamese owner intake and the English workspace dialogs share it.
 */
export function MapPinPicker({
  value,
  onChange,
  labels,
  ids = DEFAULT_IDS,
  box = SERVICE_BOX,
  disabled = false,
  readOnly = false,
  onLocatingChange,
  error,
}: MapPinPickerProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [locating, setLocating] = useState(false);
  // A location that arrives after the ward became a special zone must not set the pin.
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);
  // A location that arrives after this picker left the screen must not reach the form.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const notifyLocating = useEffectEvent((value: boolean) => onLocatingChange?.(value));
  // Reports every change, and "not locating" when the picker leaves mid-read, so the form never stays blocked.
  useEffect(() => {
    notifyLocating(locating);
    return () => notifyLocating(false);
  }, [locating]);

  const errorId = `${ids.group}-error`;
  const hintId = `${ids.group}-hint`;

  const pick = (latitude: number, longitude: number) => {
    if (readOnly) return false;
    const pin = placePin(latitude, longitude, box);
    setNotice(pin ? null : "pinOutOfArea");
    if (pin) onChange(pin);
    return pin !== undefined;
  };

  // navigator.geolocation is read here only, on click.
  const locate = async () => {
    setNotice(null);
    setLocating(true);
    const result = await readCurrentLocation("geolocation" in navigator ? navigator.geolocation : undefined, box);
    if (!mountedRef.current) return;
    setLocating(false);
    if (disabledRef.current) return;
    if (result.status === "pinned") onChange(result.pin);
    else setNotice(result.status);
  };

  return (
    <LabelsContext value={labels}>
      <div
        id={ids.group}
        tabIndex={-1}
        role="group"
        aria-labelledby={ids.label}
        aria-describedby={error ? errorId : hintId}
      >
        <div id={ids.inner} tabIndex={-1} className="space-y-2">
          <p id={ids.label} className="text-sm font-medium text-slate-700">
            {labels.label}
          </p>
          {disabled ? (
            <p id={hintId} className="text-xs text-slate-500">
              {labels.specialZone}
            </p>
          ) : (
            <>
              <p id={hintId} className="text-xs text-slate-500">
                {labels.hint}
              </p>
              <div className="isolate h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <LeafletMap pin={value} onPick={pick} interactive={!readOnly} label={labels.label} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="px-4 py-1.5"
                  pending={locating}
                  disabled={readOnly}
                  onClick={() => void locate()}
                >
                  {locating ? labels.locating : labels.locate}
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
                    {labels.clear}
                  </Button>
                )}
              </div>
              {notice && (
                <p role="status" className="text-sm text-amber-700">
                  {labels[NOTICE_LABEL[notice]]}
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
    </LabelsContext>
  );
}
