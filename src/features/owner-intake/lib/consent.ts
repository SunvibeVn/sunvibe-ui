import { fieldElementId } from "./field-errors";

/**
 * Version of the consent notice shown to the owner (BR-9). Bump it whenever OwnerIntake.consent.notice in
 * src/i18n/messages/vi.json changes; the server only accepts the version it knows.
 */
export const CONSENT_NOTICE_VERSION = "owner-intake-2026-10-21";

/** DOM id of the consent checkbox; matches fieldElementId so focus-first-invalid reaches it. */
export const consentCheckboxId = fieldElementId("consent.accepted");

/** DOM id of the BR-9 notice shown right under the checkbox. */
export const consentNoticeId = `${consentCheckboxId}-notice`;

/** DOM id of the `consent.accepted` field error (E-2). */
export const consentErrorId = `${consentCheckboxId}-error`;

/** aria-describedby of the checkbox: the notice always, the field error too when there is one. */
export function consentDescribedBy(hasError: boolean): string {
  return hasError ? `${consentNoticeId} ${consentErrorId}` : consentNoticeId;
}
