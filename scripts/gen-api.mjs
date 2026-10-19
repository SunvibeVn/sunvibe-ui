// npm run gen:api: generate src/api/generated/schema.d.ts from ../sunvibe-server/api/openapi.json and record which
// contract it came from in src/api/generated/contract-source.json (commit both). CI (check:api-client) checks the
// client against that exact server commit.
import { existsSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { contractSha256, generateClient, paths, serverState } from "./api-contract.mjs";

const { uiDir, contract, schema, source } = paths();
if (!existsSync(contract)) {
  console.error(`Missing ${contract}. Run ./gradlew exportOpenApi in sunvibe-server (or pass --contract <file>).`);
  process.exit(1);
}
generateClient(contract, schema);
const state = serverState(contract);
const record = {
  contract: "sunvibe-server/api/openapi.json",
  sha256: contractSha256(contract),
  serverCommit: state.serverCommit,
  serverContractCommitted: state.serverContractCommitted,
};
writeFileSync(source, JSON.stringify(record, null, 2) + "\n");
console.log(`Wrote ${relative(uiDir, schema)} and ${relative(uiDir, source)} (server ${state.serverCommit ?? "unknown"}).`);
if (!state.serverContractCommitted) {
  console.error(
    "Warning: the contract has uncommitted changes (or is not in a git repository), so CI cannot verify this client." +
      " Commit and push the contract in sunvibe-server, then run npm run gen:api again.",
  );
} else if (!state.serverCommitOnRemote) {
  console.error(
    `Warning: server commit ${state.serverCommit} is not on any remote branch of your sunvibe-server clone, so the CI` +
      " job api-client cannot check it out. Push sunvibe-server (and fetch), then run npm run gen:api again.",
  );
}
