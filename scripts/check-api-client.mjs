// npm run check:api-client: fails unless src/api/generated/schema.d.ts is exactly what openapi-typescript generates
// from the contract recorded in contract-source.json. CI checks out sunvibe-server at the recorded serverCommit
// next to this repo; locally it reads ../sunvibe-server/api/openapi.json (or --contract <file>).
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contractSha256, generateClient, normalizedText, paths } from "./api-contract.mjs";

const { contract, schema, source } = paths();
const fail = (message) => {
  console.error(`check:api-client: ${message}`);
  process.exit(1);
};

if (!existsSync(source)) fail(`${source} is missing; run npm run gen:api.`);
const record = JSON.parse(readFileSync(source, "utf8"));
if (!record.serverContractCommitted || !record.serverCommit) {
  fail("the client was generated from an uncommitted contract; commit it in sunvibe-server and run npm run gen:api.");
}
if (!existsSync(contract)) fail(`contract ${contract} not found (server commit ${record.serverCommit}).`);
const sha = contractSha256(contract);
if (sha !== record.sha256) {
  fail(`contract sha256 ${sha} differs from the recorded ${record.sha256} (server commit ${record.serverCommit}).`);
}
const temp = mkdtempSync(join(tmpdir(), "sv-api-client-"));
try {
  const expected = join(temp, "schema.d.ts");
  generateClient(contract, expected);
  if (!existsSync(schema) || normalizedText(schema) !== normalizedText(expected)) {
    fail("src/api/generated/schema.d.ts is not the client generated from the recorded contract; run npm run gen:api.");
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(`check:api-client: client matches contract ${record.sha256.slice(0, 12)} (server ${record.serverCommit.slice(0, 7)}).`);
