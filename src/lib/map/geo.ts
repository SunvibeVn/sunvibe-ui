/** A map pin as the request sends it: both coordinates, rounded to 6 decimals. */
export type Pin = { latitude: number; longitude: number };

/** A latitude/longitude box, edges inclusive. */
export type MapBox = { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number };

/** Approximate box of the old Đà Nẵng area that the server accepts, edges inclusive (BR-7, handoff 2.5). */
export const SERVICE_BOX: MapBox = {
  minLatitude: 15.85,
  maxLatitude: 16.25,
  minLongitude: 107.75,
  maxLongitude: 108.4,
};

/** Map pins and browser locations carry 12-15 decimals; the server refuses more than 10, so send 6. */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

/** Same check as the server: round first, then compare with the box (the service box by default). */
export function isInsideServiceBox(latitude: number, longitude: number, box: MapBox = SERVICE_BOX): boolean {
  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);
  return (
    lat >= box.minLatitude &&
    lat <= box.maxLatitude &&
    lon >= box.minLongitude &&
    lon <= box.maxLongitude
  );
}

/** The rounded pin for a point inside the box, or undefined when the server would refuse it. */
export function placePin(latitude: number, longitude: number, box: MapBox = SERVICE_BOX): Pin | undefined {
  if (!isInsideServiceBox(latitude, longitude, box)) return undefined;
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}
