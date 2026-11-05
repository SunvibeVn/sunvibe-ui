import { z } from "zod";
import { CONTROL_CHARACTER, normalizeEmail, PASSWORD_MAX_LENGTH } from "./identifier-policy";

// Mirrors auth-service validation: LoginRequest, EmailRegisterRequest, EmailBindSendRequest, StrongPasswordValidator,
// VerificationConfirmRequest, PasswordResetRequest. The phone forms have their own module, phone-auth.schema.ts, so
// public pages do not load the phone parser.

export type PasswordRule = { id: string; label: string; test: (value: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "8 to 72 characters", test: (v) => v.length >= 8 && v.length <= 72 },
  { id: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "A number", test: (v) => /\d/.test(v) },
  { id: "special", label: "One of @ $ ! % * ? &", test: (v) => /[@$!%*?&]/.test(v) },
];

const PASSWORD_CHARSET = /^[A-Za-z\d@$!%*?&]+$/;

const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

const strongPassword = z
  .string()
  .refine((value) => PASSWORD_RULES.every((rule) => rule.test(value)), {
    message: "Use 8–72 characters with uppercase, lowercase, a number and one of @$!%*?&.",
  })
  .refine((value) => value === "" || PASSWORD_CHARSET.test(value), {
    message: "Use only letters, numbers and @$!%*?&.",
  });

/** Any accepted form of an address gives its canonical value, the one the flows send. */
const email = z.string().transform((raw, context) => {
  const address = normalizeEmail(raw);
  if (address !== null) return address;
  context.addIssue({ code: "custom", message: "Enter a valid email address." });
  return z.NEVER;
});

/** A password the account already has: never trimmed, only held to the limits of the API. */
export const accountPassword = z
  .string()
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

const passwordsMatch = { path: ["confirmPassword"], message: "Passwords do not match." };

const fullName = z
  .string()
  .trim()
  .min(6, "Full name must be 6 to 100 characters.")
  .max(100, "Full name must be 6 to 100 characters.")
  // U+0000 cannot be stored, and auth-service refuses every control character in a name.
  .refine((value) => !CONTROL_CHARACTER.test(value), { message: "Full name has an invalid character." });

export const loginSchema = z.object({ email, password: accountPassword });

/** Step 1 of sign-up: only the address, which receives the code. */
export const signUpEmailSchema = z.object({ email });

/** Step 3 of sign-up: what the person fills in once the email or phone is verified. */
export const signUpDetailsSchema = z
  .object({ fullName, password: strongPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);

export const otpSchema = z.object({ code: otpCode });

export const forgotByEmailSchema = z.object({ email });

/** Bind or replace the account email: the new address and the current password (auth-email-access spec 4.9). */
export const emailBindSendSchema = z.object({ newEmail: email, currentPassword: accountPassword });

/** Reset fields without the cross-field check: zod 4 can't `.omit()` a refined object. */
export const resetPasswordFieldsSchema = z.object({
  resetToken: z.string().min(1, "This reset link is invalid or has expired."),
  otpCode,
  newPassword: strongPassword,
  confirmPassword: z.string(),
});

export const resetPasswordSchema = resetPasswordFieldsSchema.refine(
  (data) => data.newPassword === data.confirmPassword,
  passwordsMatch,
);

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpDetailsInput = z.infer<typeof signUpDetailsSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
