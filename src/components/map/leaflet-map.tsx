"use client";

import "leaflet/dist/leaflet.css";

import { icon, type LatLngExpression, type LeafletMouseEvent, type Marker as LeafletMarker } from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

import type { Pin } from "@/lib/map/geo";
import { TILE_ATTRIBUTION, TILE_REFERRER_POLICY, TILE_URL } from "@/lib/map/map-tiles";

/** Center of Đà Nẵng and a zoom that shows the city. */
const CENTER: LatLngExpression = [16.0544, 108.2022];
const ZOOM = 12;

// The default marker icon resolves its images from the CSS path, which bundlers break; serve copies from public/.
const MARKER_ICON = icon({
  iconUrl: "/leaflet/marker-icon.png",
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  shadowUrl: "/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

export type LeafletMapProps = {
  pin?: Pin;
  /** A click or drag end at this point; returns false when the pin is refused, so a dragged marker goes back. */
  onPick: (latitude: number, longitude: number) => boolean;
  /** False while submitting: the pin cannot move. */
  interactive: boolean;
  /** Accessible name of the map. */
  label: string;
};

function ClickToPick({ onPick, interactive }: Pick<LeafletMapProps, "onPick" | "interactive">) {
  useMapEvents({
    click: (event: LeafletMouseEvent) => {
      if (interactive) onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

/** Brings a pin set from outside the view (current location) into view. */
function KeepPinInView({ pin }: { pin?: Pin }) {
  const map = useMap();
  useEffect(() => {
    if (!pin) return;
    const point: LatLngExpression = [pin.latitude, pin.longitude];
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [map, pin]);
  return null;
}

/** Leaflet map with OSM tiles; browser only (load it through next/dynamic with ssr: false). */
export function LeafletMap({ pin, onPick, interactive, label }: LeafletMapProps) {
  return (
    <MapContainer center={CENTER} zoom={ZOOM} scrollWheelZoom={false} className="h-full w-full" aria-label={label}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} referrerPolicy={TILE_REFERRER_POLICY} />
      <ClickToPick onPick={onPick} interactive={interactive} />
      <KeepPinInView pin={pin} />
      {pin && (
        <Marker
          position={[pin.latitude, pin.longitude]}
          icon={MARKER_ICON}
          draggable={interactive}
          eventHandlers={{
            dragend: (event) => {
              const marker = event.target as LeafletMarker;
              const { lat, lng } = marker.getLatLng();
              if (!onPick(lat, lng)) marker.setLatLng([pin.latitude, pin.longitude]);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
