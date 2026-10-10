import { AUTH_ROUTES, GUEST_ONLY_PATHS, PROTECTED_PATHS } from "../constants";

const matches = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/**
 * Optimistic redirect based on cookie presence only. Pages still authorize
 * through the DAL; this only saves a round trip and a flash of the wrong page.
 */
export function guardRedirect(url: URL, signedIn: boolean): URL | null {
  const path = url.pathname;

  if (!signedIn && PROTECTED_PATHS.some((base) => matches(path, base))) {
    const login = new URL(AUTH_ROUTES.login, url);
    login.searchParams.set("next", `${path}${url.search}`);
    return login;
  }

  // `session` is set when the server found the cookies stale (dal.expiredSessionUrl):
  // bouncing back to /account would loop.
  if (signedIn && !url.searchParams.has("session") && GUEST_ONLY_PATHS.some((base) => matches(path, base))) {
    return new URL(AUTH_ROUTES.account, url);
  }

  return null;
}
