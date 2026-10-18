import { describe, expect, it } from "vitest";

import { parseDuplicateInput } from "./duplicate-input";

const ID = "01JE2EACCT0000000000000001";

describe("parseDuplicateInput", () => {
  it("reads a request code in any case with outer spaces", () => {
    expect(parseDuplicateInput(" sv-e2ea-aa2a ")).toEqual({ kind: "code", code: "SV-E2EA-AA2A" });
    expect(parseDuplicateInput("SV-7K3M-Q9TX")).toEqual({ kind: "code", code: "SV-7K3M-Q9TX" });
  });

  it("refuses inner spaces and letters outside the code alphabet", () => {
    expect(parseDuplicateInput("SV-AB CD-EFGH")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("SV-ABCD-EFGI")).toEqual({ kind: "invalid" }); // I
    expect(parseDuplicateInput("SV-ABCD-EFG1")).toEqual({ kind: "invalid" }); // 1
    expect(parseDuplicateInput("SV-ABC-EFGH")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("SVABCDEFGH")).toEqual({ kind: "invalid" });
  });

  it("takes the id from an absolute link of any host", () => {
    expect(parseDuplicateInput(`https://sunvibe.vn/workspace/owner-leads/${ID}`)).toEqual({ kind: "id", id: ID });
    expect(parseDuplicateInput(`http://localhost:3000/workspace/owner-leads/${ID}`)).toEqual({ kind: "id", id: ID });
    expect(parseDuplicateInput(`  https://host/workspace/owner-leads/${ID}  `)).toEqual({ kind: "id", id: ID });
  });

  it("takes the id from a relative link", () => {
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID}`)).toEqual({ kind: "id", id: ID });
    expect(parseDuplicateInput(`workspace/owner-leads/${ID}`)).toEqual({ kind: "id", id: ID });
  });

  it("returns the id upper-cased, as the server compares ids case-sensitively", () => {
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID.toLowerCase()}`)).toEqual({ kind: "id", id: ID });
  });

  it("ignores query, hash and a trailing slash", () => {
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID}?x=1`)).toEqual({ kind: "id", id: ID });
    expect(parseDuplicateInput(`https://host/workspace/owner-leads/${ID}#history`)).toEqual({ kind: "id", id: ID });
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID}/`)).toEqual({ kind: "id", id: ID });
  });

  it("refuses other paths, bad ids and other schemes", () => {
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID}/edit`)).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(`/workspace/other/${ID}`)).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("/workspace/owner-leads/")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("/workspace/owner-leads/short")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID}9`)).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(`/workspace/owner-leads/${ID.slice(0, 25)}-`)).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(`javascript:/workspace/owner-leads/${ID}`)).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(`ftp://host/workspace/owner-leads/${ID}`)).toEqual({ kind: "invalid" });
  });

  it("refuses empty and unrelated text", () => {
    expect(parseDuplicateInput("")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("   ")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput("hello")).toEqual({ kind: "invalid" });
    expect(parseDuplicateInput(ID)).toEqual({ kind: "invalid" });
  });
});
