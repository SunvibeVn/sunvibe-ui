import "server-only";

import { unwrap, type ApiResponse, type RequestOptions } from "@/lib/api";
import { BACKEND_REFRESH_COOKIE } from "../constants";
import type { LoginInput, RegisterInput, ResetPasswordInput } from "../schemas/auth.schema";
import type {
  AuthTokenResponse,
  PasswordForgotResult,
  UserProfile,
  VerificationSendResult,
} from "../types/auth.types";
import { authApi, toAuthSession } from "./auth-api";

/** The signed-in user's access token and the real client's headers (see forwarded-headers.ts). */
export type CallContext = { accessToken?: string; headers?: Record<string, string> };

function options({ accessToken, headers }: CallContext): RequestOptions {
  return { cache: "no-store", accessToken, headers };
}

export const authService = {
  login(input: LoginInput, context: CallContext = {}) {
    return toAuthSession(() =>
      authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/auth/login", input, options(context)),
    );
  },

  register(input: RegisterInput, context: CallContext = {}) {
    return toAuthSession(() =>
      authApi.postRaw<ApiResponse<AuthTokenResponse>>("/api/users/command/register", input, options(context)),
    );
  },

  async logout(refreshToken: string, context: CallContext = {}) {
    await authApi.post("/api/auth/logout", undefined, {
      ...options(context),
      cookie: { [BACKEND_REFRESH_COOKIE]: refreshToken },
    });
  },

  async getProfile(accessToken: string) {
    return unwrap(
      await authApi.get<ApiResponse<UserProfile>>("/api/user/query/my-info", options({ accessToken })),
    );
  },

  async sendPhoneCode(context: CallContext) {
    return unwrap(
      await authApi.post<ApiResponse<VerificationSendResult>>(
        "/api/auth/verification/phone/send",
        undefined,
        options(context),
      ),
    );
  },

  async confirmPhone(code: string, context: CallContext) {
    await authApi.post("/api/auth/verification/phone/confirm", { code }, options(context));
  },

  async forgotPasswordByEmail(email: string, context: CallContext = {}) {
    return unwrap(
      await authApi.post<ApiResponse<PasswordForgotResult>>("/api/auth/forgot-password", { email }, options(context)),
    );
  },

  async forgotPasswordBySms(phoneNumber: string, context: CallContext = {}) {
    return unwrap(
      await authApi.post<ApiResponse<PasswordForgotResult>>(
        "/api/auth/forgot-password/sms",
        { phoneNumber },
        options(context),
      ),
    );
  },

  async resetPassword(input: ResetPasswordInput, context: CallContext = {}) {
    await authApi.post("/api/auth/reset-password", input, options(context));
  },
};
