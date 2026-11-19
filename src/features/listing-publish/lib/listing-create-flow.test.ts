import { describe, expect, it, vi } from "vitest";

import type { ApiResult } from "@/features/auth/client";

import type { ListingCreated } from "../types";

import { runListingCreate, type ListingCreateFlowDeps } from "./listing-create-flow";

const AGREEMENT_ID = "01JF000000000000000000000A";
const LISTING_ID = "01JG000000000000000000000L";

function deps(answer: ApiResult<ListingCreated>) {
  return {
    create: vi.fn<ListingCreateFlowDeps["create"]>(() => Promise.resolve(answer)),
    goTo: vi.fn<ListingCreateFlowDeps["goTo"]>(),
    reread: vi.fn<ListingCreateFlowDeps["reread"]>(),
  };
}

const http = (status: number, code?: string): ApiResult<ListingCreated> => ({
  ok: false,
  kind: "http",
  status,
  ...(code === undefined ? {} : { code }),
  fieldErrors: [],
  correlationId: "corr-00000001",
});

describe("runListingCreate (listing-publish E06-S1, spec section 6, UL-2)", () => {
  it("listingCreateFlow_created_goesToTheListing: one create, then the listing's page, and no reread", async () => {
    const flow = deps({ ok: true, status: 201, replayed: false, data: { listingId: LISTING_ID, code: "TD-7K3M-Q9TX" } });

    const outcome = await runListingCreate(AGREEMENT_ID, flow);

    expect(outcome).toEqual({ kind: "created" });
    expect(flow.create.mock.calls).toEqual([[AGREEMENT_ID]]);
    expect(flow.goTo.mock.calls).toEqual([[`/workspace/listings/${LISTING_ID}`]]);
    expect(flow.reread).not.toHaveBeenCalled();
  });

  it("listingCreateFlow_refusals_sentenceAndReread: each refusal or failure gives its sentence and one reread, never the listing page", async () => {
    const rows: [ApiResult<ListingCreated>, string][] = [
      [http(409, "LISTING_EXISTS"), "create.exists"],
      [http(409, "LISTING_NOT_ALLOWED"), "create.notAllowed"],
      [http(404, "NOT_FOUND"), "create.notFound"],
      [http(404), "create.notFound"],
      [http(409, "CONCURRENT_MODIFICATION"), "create.concurrent"],
      [http(403, "FORBIDDEN"), "create.failed"],
      [http(500, "INTERNAL_ERROR"), "create.failed"],
      [http(409, "SOMETHING_NEW"), "create.failed"],
      [http(400, "VALIDATION_FAILED"), "create.failed"],
      [{ ok: false, kind: "network" }, "create.failed"],
      [{ ok: false, kind: "signed-out" }, "create.failed"],
      [{ ok: false, kind: "unavailable" }, "create.failed"],
    ];
    for (const [answer, sentence] of rows) {
      const flow = deps(answer);

      const outcome = await runListingCreate(AGREEMENT_ID, flow);

      expect(outcome).toEqual({ kind: "refused", sentence });
      expect(flow.create).toHaveBeenCalledTimes(1);
      expect(flow.reread).toHaveBeenCalledTimes(1);
      expect(flow.goTo).not.toHaveBeenCalled();
    }
  });
});
