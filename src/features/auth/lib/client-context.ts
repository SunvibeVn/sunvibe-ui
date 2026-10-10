import "server-only";

import { headers } from "next/headers";
import { forwardedHeaders } from "./forwarded-headers";

/** The real client's User-Agent and IP, to forward on every auth-service call. */
export async function clientContextHeaders() {
  return forwardedHeaders(await headers());
}
