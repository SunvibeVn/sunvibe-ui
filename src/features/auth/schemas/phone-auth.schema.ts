import { z } from "zod";
import { accountPassword } from "./auth.schema";
import { normalizePhone } from "./phone-policy";

// The schemas of the phone forms. They reach the phone parser, so only phone routes may import this module
// (auth-email-access spec 6.3): `publicSchemas_doNotImportPhoneParser` keeps it out of the public pages.

/** Any accepted form of a number gives its national form, the one the phone flows send and show. */
const phone = z.string().transform((raw, context) => {
  const number = normalizePhone(raw);
  if (number) return number.national;
  context.addIssue({ code: "custom", message: "Enter a valid phone number." });
  return z.NEVER;
});

export const phoneLoginSchema = z.object({ username: phone, password: accountPassword });

/**
 * The form of `legacy-login`: no parser on the value, only the marks people write dropped, so a stored number the policy
 * refuses still reaches the API in the old shape (auth-email-access D4-7).
 */
const legacyPhone = z
  .string()
  .transform((value) => value.replace(/[\s.\-()]/g, "").replace(/^\+84/, "0"))
  .pipe(z.string().regex(/^[0-9]{10,12}$/, "Enter a phone number of 10 to 12 digits."));

export const legacyPhoneLoginSchema = z.object({ username: legacyPhone, password: accountPassword });

/** Step 1 of a phone sign-up: only the phone number, which receives the SMS code. */
export const signUpPhoneSchema = z.object({ username: phone });

export const forgotBySmsSchema = z.object({ phoneNumber: phone });
