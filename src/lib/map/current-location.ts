import { type MapBox, placePin, type Pin } from "./geo";

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
 * Wall-clock limit of one read. PositionOptions.timeout does not count the time the permission prompt waits, and an
 * ignored or dismissed prompt never calls back; without this the form would wait (and block its submit) forever.
 */
export const LOCATION_DEADLINE_MS = 20_000;

/**
 * Reads the browser location once and turns it into a pin inside the service box (US-2 AC-3). Call it only from
 * a click handler, with `navigator.geolocation` (undefined when the browser has none).
 */
export function readCurrentLocation(
  geolocation: GeolocationReader | undefined,
  box?: MapBox,
): Promise<CurrentLocationResult> {
  if (!geolocation) return Promise.resolve({ status: "unsupported" });
  return new Promise((resolve) => {
    // The first answer wins (browser callback, throw or deadline); the timer is cleared either way.
    const settle = (result: CurrentLocationResult) => {
      clearTimeout(deadline);
      resolve(result);
    };
    const deadline = setTimeout(() => settle({ status: "failed" }), LOCATION_DEADLINE_MS);
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          const pin = placePin(coords.latitude, coords.longitude, box);
          settle(pin ? { status: "pinned", pin } : { status: "outOfArea" });
        },
        (error) => settle({ status: error.code === PERMISSION_DENIED ? "denied" : "failed" }),
        OPTIONS,
      );
    } catch {
      settle({ status: "failed" });
    }
  });
}
