// Public entry point for the phone routes only (`/login/phone`, `/sign-up/phone`). Everything here reaches the phone
// parser, which public pages must not load (auth-email-access spec 6.3), so it stays out of index.ts and client.ts.
export { PhoneLoginForm } from "./components/phone-login-form";
export { SignUpPhoneForm } from "./components/sign-up-phone-form";
