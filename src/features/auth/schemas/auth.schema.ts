import { z } from "zod";

// Mirrors auth-service validation: LoginRequest, UserRegisterRequest,
// StrongPasswordValidator, VerificationConfirmRequest, PasswordResetRequest.

export type PasswordRule = { id: string; label: string; test: (value: string) => boolean };

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: "8 to 72 characters", test: (v) => v.length >= 8 && v.length <= 72 },
  { id: "upper", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { id: "digit", label: "A number", test: (v) => /\d/.test(v) },
  { id: "special", label: "One of @ $ ! % * ? &", test: (v) => /[@$!%*?&]/.test(v) },
];

const PASSWORD_CHARSET = /^[A-Za-z\d@$!%*?&]+$/;

/** "090 123 4567", "090.123.4567" or "+84 90 123 4567" → "0901234567". */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.\-()]/g, "").replace(/^\+84/, "0");
}

const phone = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^[0-9]{10,12}$/, "Enter a phone number of 10 to 12 digits."));

const otpCode = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

const strongPassword = z
  .string()
  .refine((value) => PASSWORD_RULES.every((rule) => rule.test(value)), {
    message: "Use 8–72 characters with uppercase, lowercase, a number and one of @$!%*?&.",
  })
  .refine((value) => value === "" || PASSWORD_CHARSET.test(value), {
    message: "Use only letters, numbers and @$!%*?&.",
  });

const email = z.string().trim().pipe(z.email("Enter a valid email address."));

const optionalEmail = z
  .string()
  .trim()
  .max(100, "Use at most 100 characters.")
  .refine((value) => value === "" || z.email().safeParse(value).success, {
    message: "Enter a valid email address.",
  });

const passwordsMatch = { path: ["confirmPassword"], message: "Passwords do not match." };

const fullName = z
  .string()
  .trim()
  .min(6, "Full name must be 6 to 100 characters.")
  .max(100, "Full name must be 6 to 100 characters.");

export const loginSchema = z.object({
  username: phone,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z
  .object({
    fullName,
    username: phone,
    email: optionalEmail,
    idCardNumber: z
      .string()
      .trim()
      .regex(/^(|\d{9}|\d{12})$/, "Enter a 9-digit CMND or 12-digit CCCD number."),
    password: strongPassword,
    confirmPassword: z.string(),
    /** Proof from the SMS step ("verify first, register later"); auth-service refuses a register without it. */
    registrationToken: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);

/** Step 1 of sign-up: only the phone number, which receives the SMS code. */
export const signUpPhoneSchema = z.object({ username: phone });

/** Step 3 of sign-up: what the person fills in once the phone is verified. */
export const signUpDetailsSchema = z
  .object({ fullName, password: strongPassword, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, passwordsMatch);

export const otpSchema = z.object({ code: otpCode });

export const forgotByEmailSchema = z.object({ email });

export const forgotBySmsSchema = z.object({ phoneNumber: phone });

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
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
