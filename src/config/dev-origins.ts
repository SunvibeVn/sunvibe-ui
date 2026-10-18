const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Hostnames the dev server must serve besides `localhost` (Next `allowedDevOrigins`). When the app is opened from a
 * phone on the LAN, the page host is the LAN IP; without it Next drops the HMR socket and the page never hydrates, so
 * every form stays inert. LAN testing already sets NEXT_PUBLIC_API_URL to that same IP (docs/setup/lan-device-testing.md).
 * Plain relative module: next.config.ts imports it and cannot use the `@/` alias.
 */
export function devOriginsFromApiUrl(apiUrl: string | undefined, nodeEnv: string | undefined): string[] {
  if (nodeEnv === "production" || !apiUrl) return [];
  try {
    const { hostname } = new URL(apiUrl);
    return LOCAL_HOSTS.has(hostname) ? [] : [hostname];
  } catch {
    return [];
  }
}
