import "server-only";

// Server-only entry point of the API helpers: for server-only services such as property.service.ts. Browser and
// Client Component code imports "@/lib/api".
export { createHttpClient } from "./http-client";
export type { HttpClient, RequestOptions } from "./http-client";
