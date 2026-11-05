// What the build shows of the phone channel (auth-email-access spec 6.1, A-20). The caller passes
// `process.env.NEXT_PUBLIC_AUTH_PHONE_MODE` written out literally, so Next inlines it at build time. This only shows or
// hides: the server decides (BR-17), so a value that does not match the API refuses at the API, never opens anything.

export type PhoneMode = "off" | "legacy-login" | "on";

export type PhoneRoute = "login" | "sign-up" | "verify-phone";

/** `account`: the route leaves for `/account`. */
export type PhoneRouteAccess = "show" | "not-found" | "account";

/** Only an exact value opens anything: every other one, empty included, reads as `off`. */
export function parsePhoneMode(value: string | undefined): PhoneMode {
  return value === "legacy-login" || value === "on" ? value : "off";
}

/** The table of spec 6.1: what a phone route does in a mode. */
export function phoneRouteAccess(route: PhoneRoute, mode: PhoneMode): PhoneRouteAccess {
  if (mode === "on") return "show";
  if (route === "verify-phone") return "account";
  return route === "login" && mode === "legacy-login" ? "show" : "not-found";
}
