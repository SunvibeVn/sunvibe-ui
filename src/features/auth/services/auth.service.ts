import "server-only";

import { serverEnv } from "@/config/env";
import { createHttpClient } from "@/lib/api";
import type { AuthTokens, LoginRequest, User } from "../types/auth.types";

// Endpoint paths follow an assumed REST contract; align them with auth-service.
const authApi = createHttpClient({ baseUrl: () => serverEnv.authServiceUrl });

export const authService = {
  login(credentials: LoginRequest) {
    return authApi.post<AuthTokens>("/auth/login", credentials, { cache: "no-store" });
  },

  getCurrentUser(accessToken: string) {
    return authApi.get<User>("/auth/me", { accessToken, cache: "no-store" });
  },
};
