/** OpenStreetMap raster tiles for the map pickers (owner intake C-FE-2, survey meeting place). */
export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Leaflet writes the attribution with innerHTML: keep it a constant literal in code, never from messages or input.
 * The OSM licence wording stays in English, as OpenStreetMap asks.
 */
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Leaflet sets it on every tile <img>: the tile server sees our origin, not the page path. */
export const TILE_REFERRER_POLICY = "strict-origin-when-cross-origin";
