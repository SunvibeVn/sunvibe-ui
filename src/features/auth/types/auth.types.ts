/** Body of login, register and refresh responses (`LoginResponse` in auth-service). */
export type AuthTokenResponse = {
  tokenType: string;
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  username: string;
  userEmail: string | null;
  roles: string[];
  phoneVerified: boolean;
  emailVerified: boolean;
  message: string;
};

/** A token pair: the access token from the body, the refresh token from Set-Cookie. */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  phoneVerified: boolean;
};

/** Body of `GET /api/user/query/my-info` (`UserProfileInfo`). */
export type UserProfile = {
  fullName: string;
  /** The phone number. */
  username: string;
  email: string | null;
  profileImageUrl: string | null;
  kycStatus: string;
  accountStatus: string;
  phoneVerified: boolean;
  emailVerified: boolean;
};

/** A verification code was sent (`VerificationSendResponse`). */
export type VerificationSendResult = {
  channel: "PHONE" | "EMAIL";
  /** Partly hidden phone or e-mail. */
  sentTo: string;
  expiresAt: string;
  resendAvailableAt: string;
};

/** `PasswordForgotResponse`; `resetToken` is only present in the SMS flow. */
export type PasswordForgotResult = {
  message: string;
  resetToken?: string;
  expiresAt?: string;
  otpExpirationMinutes: number;
};
