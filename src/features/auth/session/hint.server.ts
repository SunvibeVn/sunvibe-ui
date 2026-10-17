import "server-only";

import { cookies } from "next/headers";
import { hintCookieName } from "./browser-cookies";

/**
 * Whether the request carries the sign-in hint cookie (auth-browser-session §4.4, §4.8). No backend call: it only
 * picks the right header button on first paint, never authorizes anything (auth-browser-session BR-8).
 * Reads request cookies, so call it inside a `Suspense` boundary to keep the page prerenderable.
 */
export async function hasSignInHint(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(hintCookieName())?.value);
}
