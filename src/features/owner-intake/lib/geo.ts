/** A map pin as the request sends it: both coordinates, rounded to 6 decimals. */
export type Pin = { latitude: number; longitude: number };

/** Approximate box of the old Đà Nẵng area that the server accepts, edges inclusive (BR-7, handoff 2.5). */
export const SERVICE_BOX = {
  minLatitude: 15.85,
  maxLatitude: 16.25,
  minLongitude: 107.75,
  maxLongitude: 108.4,
} as const;

/** Map pins and browser locations carry 12-15 decimals; the server refuses more than 10, so send 6. */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(6));
}

/** Same check as the server: round first, then compare with the box. */
export function isInsideServiceBox(latitude: number, longitude: number): boolean {
  const lat = roundCoordinate(latitude);
  const lon = roundCoordinate(longitude);
  return (
    lat >= SERVICE_BOX.minLatitude &&
    lat <= SERVICE_BOX.maxLatitude &&
    lon >= SERVICE_BOX.minLongitude &&
    lon <= SERVICE_BOX.maxLongitude
  );
}

/** The rounded pin for a point inside the box, or undefined when the server would refuse it. */
export function placePin(latitude: number, longitude: number): Pin | undefined {
  if (!isInsideServiceBox(latitude, longitude)) return undefined;
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}
