/** Local API the browser calls (dev profile). */
export const API_URL = "http://localhost:8081";

export const API_UNAVAILABLE_REASON =
  `Local API not reachable at ${API_URL} (GET /api/v1/public/provinces failed). ` +
  "Start sunvibe-server with the dev profile to run the owner intake E2E specs.";

let probe: Promise<boolean> | undefined;

/** True when the public catalog answers; probed once per worker. */
export function isApiAvailable(): Promise<boolean> {
  probe ??= fetch(`${API_URL}/api/v1/public/provinces`, { signal: AbortSignal.timeout(3_000) })
    .then((response) => response.ok)
    .catch(() => false);
  return probe;
}
