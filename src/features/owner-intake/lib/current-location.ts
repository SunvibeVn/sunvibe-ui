import { placePin, type Pin } from "./geo";

/** The part of `navigator.geolocation` this module uses; tests pass a fake. */
export type GeolocationReader = Pick<Geolocation, "getCurrentPosition">;

export type CurrentLocationResult =
  | { status: "pinned"; pin: Pin }
  | { status: "outOfArea" }
  | { status: "denied" }
  | { status: "failed" }
  | { status: "unsupported" };

const PERMISSION_DENIED = 1;

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 };

/**
 * Reads the browser location once and turns it into a pin inside the service box (US-2 AC-3). Call it only from
 * a click handler, with `navigator.geolocation` (undefined when the browser has none).
 */
export function readCurrentLocation(geolocation: GeolocationReader | undefined): Promise<CurrentLocationResult> {
  if (!geolocation) return Promise.resolve({ status: "unsupported" });
  return new Promise((resolve) => {
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          const pin = placePin(coords.latitude, coords.longitude);
          resolve(pin ? { status: "pinned", pin } : { status: "outOfArea" });
        },
        (error) => resolve({ status: error.code === PERMISSION_DENIED ? "denied" : "failed" }),
        OPTIONS,
      );
    } catch {
      resolve({ status: "failed" });
    }
  });
}
