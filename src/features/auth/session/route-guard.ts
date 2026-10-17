import { AUTH_ROUTES, GUEST_ONLY_PATHS, PROTECTED_PATHS } from "../constants";

const matches = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** A page that needs a session (one of `PROTECTED_PATHS` or below it). */
export const isProtectedPath = (path: string): boolean => PROTECTED_PATHS.some((base) => matches(path, base));

/**
 * Optimistic redirect based on the sign-in hint cookie only. Only the API authorizes private data;
 * this only saves a round trip and a flash of the wrong page.
 */
export function guardRedirect(url: URL, signedIn: boolean): URL | null {
  const path = url.pathname;

  if (!signedIn && isProtectedPath(path)) {
    const login = new URL(AUTH_ROUTES.login, url);
    login.searchParams.set("next", `${path}${url.search}`);
    return login;
  }

  // `session` is set by the session-expired redirect (`/login?session=expired`): the hint may still be there,
  // and bouncing back to /account would loop.
  if (signedIn && !url.searchParams.has("session") && GUEST_ONLY_PATHS.some((base) => matches(path, base))) {
    return new URL(AUTH_ROUTES.account, url);
  }

  return null;
}
