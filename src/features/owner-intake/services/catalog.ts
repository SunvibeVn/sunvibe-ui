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

function parseProvince(raw: { code?: string; name?: string }): Province | null {
  return raw.code && raw.name ? { code: raw.code, name: raw.name } : null;
}

function parseWard(raw: { code?: string; name?: string; type?: string }): Ward | null {
  const type = WARD_TYPES.find((known) => known === raw.type);
  return raw.code && raw.name && type ? { code: raw.code, name: raw.name, type } : null;
}

export async function loadProvinces(client: PublicClient = createPublicClient()): Promise<CatalogResult<Province>> {
  return toCatalogResult(await toPublicResult(client.GET("/api/v1/public/provinces")), parseProvince);
}

export async function loadWards(
  provinceCode: string,
  client: PublicClient = createPublicClient(),
): Promise<CatalogResult<Ward>> {
  const result = await toPublicResult(
    client.GET("/api/v1/public/provinces/{provinceCode}/wards", { params: { path: { provinceCode } } }),
  );
  return toCatalogResult(result, parseWard);
}
