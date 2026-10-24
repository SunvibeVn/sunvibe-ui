import { describe, expect, it } from "vitest";

import { TILE_ATTRIBUTION, TILE_REFERRER_POLICY, TILE_URL } from "./map-tiles";

describe("map tiles", () => {
  it("loads OpenStreetMap raster tiles over https (C-FE-2)", () => {
    expect(TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("uses a fixed attribution literal, because Leaflet writes it with innerHTML", () => {
    expect(TILE_ATTRIBUTION).toBe(
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    );
  });

  it("sends only the origin to the tile server", () => {
    expect(TILE_REFERRER_POLICY).toBe("strict-origin-when-cross-origin");
  });
});
