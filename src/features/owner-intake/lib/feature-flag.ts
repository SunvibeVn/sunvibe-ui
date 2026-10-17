/**
 * Whether /list-with-us is reachable (BR-15, C-7, Q-11). The caller passes
 * `process.env.NEXT_PUBLIC_OWNER_INTAKE_ENABLED` written out literally, so Next inlines it at build time.
 * Only the exact value "true" turns the page on; anything else keeps it a 404.
 */
export function isOwnerIntakeEnabled(value: string | undefined): boolean {
  return value === "true";
}
