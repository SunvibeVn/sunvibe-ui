"use client";

import { Alert } from "@/components/ui/alert";
import { AUTH_ERROR_TEXT } from "../lib/auth-error-text";
import { useCookiesWork } from "../lib/use-cookies-work";

/** Shown on the sign-in, sign-up and password reset forms when the browser blocks cookies or `sessionStorage`. */
export function CookiesRequiredNotice() {
  if (useCookiesWork()) return null;
  return <Alert tone="error">{AUTH_ERROR_TEXT.cookiesRequired}</Alert>;
}
