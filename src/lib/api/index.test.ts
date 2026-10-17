import { describe, expect, it } from "vitest";

import * as browserApi from "./index";

describe("@/lib/api browser barrel", () => {
  it("doesNotExportTheServerOnlyHttpClient", () => {
    // createHttpClient is for server-only services; it lives in "@/lib/api/server".
    expect(Object.keys(browserApi)).not.toContain("createHttpClient");
  });
});
