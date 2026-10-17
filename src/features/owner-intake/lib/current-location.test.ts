import { afterEach, describe, expect, it, vi } from "vitest";

import { LOCATION_DEADLINE_MS, readCurrentLocation, type GeolocationReader } from "./current-location";

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

function succeeding(latitude: number, longitude: number): GeolocationReader {
  return {
    getCurrentPosition: (success) => success({ coords: { latitude, longitude } } as GeolocationPosition),
  };
}

function failing(code: number): GeolocationReader {
  return {
    getCurrentPosition: (_success, error) =>
      error?.({ code, message: "", PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError),
  };
}

describe("readCurrentLocation", () => {
  it("returns the rounded pin for a position inside the box", async () => {
    await expect(readCurrentLocation(succeeding(16.067812345678901, 108.22084567891234))).resolves.toEqual({
      status: "pinned",
      pin: { latitude: 16.067812, longitude: 108.220846 },
    });
  });

  it("refuses a position outside the box", async () => {
    await expect(readCurrentLocation(succeeding(10.7769, 106.7009))).resolves.toEqual({ status: "outOfArea" });
  });

  it("reports a denied permission", async () => {
    await expect(readCurrentLocation(failing(PERMISSION_DENIED))).resolves.toEqual({ status: "denied" });
  });

  it.each([POSITION_UNAVAILABLE, TIMEOUT])("reports error code %d as failed", async (code) => {
    await expect(readCurrentLocation(failing(code))).resolves.toEqual({ status: "failed" });
  });

  it("reports a browser without geolocation as unsupported", async () => {
    await expect(readCurrentLocation(undefined)).resolves.toEqual({ status: "unsupported" });
  });

  it("reports a throwing geolocation call as failed", async () => {
    const throwing: GeolocationReader = {
      getCurrentPosition: () => {
        throw new Error("blocked by permissions policy");
      },
    };
    await expect(readCurrentLocation(throwing)).resolves.toEqual({ status: "failed" });
  });

  describe("wall-clock deadline (a permission prompt that is never answered)", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const silent: GeolocationReader = { getCurrentPosition: () => undefined };

    it("reports failed once the deadline passes without any callback", async () => {
      vi.useFakeTimers();
      let settled: unknown;
      void readCurrentLocation(silent).then((result) => {
        settled = result;
      });
      await vi.advanceTimersByTimeAsync(LOCATION_DEADLINE_MS - 1);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toEqual({ status: "failed" });
    });

    it("waits longer than the browser timeout and clears its timer when the browser answers", async () => {
      vi.useFakeTimers();
      expect(LOCATION_DEADLINE_MS).toBeGreaterThan(15_000);
      await expect(readCurrentLocation(succeeding(16.0544, 108.2022))).resolves.toMatchObject({ status: "pinned" });
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
