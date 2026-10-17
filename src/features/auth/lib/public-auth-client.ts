import type { Client } from "openapi-fetch";
import type { paths } from "@/api/generated/schema";
import {
  type ClientResponse,
  createPublicClient,
  type PublicApiNetworkError,
  type PublicApiResult,
  toPublicResult,
} from "@/lib/api";

// The anonymous auth calls (registration send-code/verify-code, password reset by e-mail or SMS): no cookie, no
// Authorization header, no Web Lock (auth-browser-session §3.1). Nothing here logs.

/** One request through the anonymous typed client it is given. */
export type PublicAuthCall<T> = (client: Client<paths>) => Promise<ClientResponse<T>>;

/** Sends one anonymous call; never throws. */
export type PublicAuthClient = <T>(call: PublicAuthCall<T>) => Promise<PublicApiResult<T>>;

const networkError: PublicApiNetworkError = Object.freeze({ ok: false, kind: "network" });

/**
 * An anonymous client built at the first call, never at creation: the flows also load while client components render
 * on the server. A client that cannot be built (a missing or invalid API URL in a production build) and a call that
 * throws both answer `{ ok: false, kind: "network" }`.
 */
export function createPublicAuthClient(build: () => Client<paths> = () => createPublicClient()): PublicAuthClient {
  let client: Client<paths> | undefined;
  return async <T>(call: PublicAuthCall<T>): Promise<PublicApiResult<T>> => {
    try {
      client ??= build();
      return await toPublicResult(call(client));
    } catch {
      return networkError;
    }
  };
}
