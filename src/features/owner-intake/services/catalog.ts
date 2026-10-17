import { createPublicClient, toPublicResult, type PublicApiResult } from "@/lib/api";

import type { CatalogResult, Province, Ward, WardType } from "../types/catalog";

type PublicClient = ReturnType<typeof createPublicClient>;

const WARD_TYPES: readonly WardType[] = ["WARD", "COMMUNE", "SPECIAL_ZONE"];

function toCatalogResult<Raw, T>(
  result: PublicApiResult<Raw[]>,
  parse: (raw: Raw) => T | null,
): CatalogResult<T> {
  if (!result.ok) {
    if (result.kind === "http" && result.status === 404) return { status: "empty" };
    if (result.kind === "http" && result.status >= 500 && result.correlationId) {
      return { status: "failed", correlationId: result.correlationId };
    }
    return { status: "failed" };
  }
  // Keep the server order (Vietnamese collator, handoff section 6); never re-sort.
  const items = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const item = parse(raw);
    return item ? [item] : [];
  });
  return items.length > 0 ? { status: "ready", items } : { status: "empty" };
}

function parseProvince(raw: { code?: string; name?: string } | null): Province | null {
  if (!raw || typeof raw !== "object") return null;
  return raw.code && raw.name ? { code: raw.code, name: raw.name } : null;
}

function parseWard(raw: { code?: string; name?: string; type?: string } | null): Ward | null {
  if (!raw || typeof raw !== "object") return null;
  const type = WARD_TYPES.find((known) => known === raw.type);
  return raw.code && raw.name && type ? { code: raw.code, name: raw.name, type } : null;
}

/**
 * Runs one catalog request and never throws: a client that cannot be built or that throws (e.g. a missing
 * NEXT_PUBLIC_API_URL in production) is `failed`, like a network error, so the selects show the retry.
 */
async function loadCatalog<Raw, T>(
  request: (client: PublicClient) => Promise<PublicApiResult<Raw[]>>,
  parse: (raw: Raw) => T | null,
  client: PublicClient | undefined,
): Promise<CatalogResult<T>> {
  try {
    // Parsing stays inside: a malformed 200 body is a failed load, never a throw.
    return toCatalogResult(await request(client ?? createPublicClient()), parse);
  } catch {
    return { status: "failed" };
  }
}

export function loadProvinces(client?: PublicClient): Promise<CatalogResult<Province>> {
  return loadCatalog((api) => toPublicResult(api.GET("/api/v1/public/provinces")), parseProvince, client);
}

export function loadWards(provinceCode: string, client?: PublicClient): Promise<CatalogResult<Ward>> {
  return loadCatalog(
    (api) =>
      toPublicResult(api.GET("/api/v1/public/provinces/{provinceCode}/wards", { params: { path: { provinceCode } } })),
    parseWard,
    client,
  );
}
