// Public entry point for Client Components (error boundaries, signed-in calls); no server-only code.
export { AuthError } from "./components/auth-error";
export { apiClient, callApi } from "./session/api-client";
export type { ApiResult } from "./session/api-client";
export { RequireRole } from "./components/require-role";
export { RequireSession } from "./components/require-session";
export { ForbiddenNotice } from "./components/forbidden-notice";
export type { SessionTexts } from "./lib/session-view";
export { useSession } from "./session/use-session";
export { useSignOutHere } from "./session/sign-out-here";
export type { SessionSnapshot, SessionUser } from "./session/session-store";
