// Shared by gen-api.mjs and check-api-client.mjs: where the contract and the generated client live, how the
// contract is hashed (line endings normalized, so Windows and CI agree) and how the client is generated.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** --ui-dir and --contract override the defaults (this repo and ../sunvibe-server/api/openapi.json). */
export function paths(argv = process.argv.slice(2)) {
  const option = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const uiDir = resolve(option("--ui-dir") ?? UI_DIR);
  const contract = resolve(option("--contract") ?? process.env.SUNVIBE_API_CONTRACT ?? join(uiDir, "..", "sunvibe-server", "api", "openapi.json"));
  const generated = join(uiDir, "src", "api", "generated");
  return { uiDir, contract, schema: join(generated, "schema.d.ts"), source: join(generated, "contract-source.json") };
}

export function contractSha256(file) {
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

/** Runs the pinned openapi-typescript CLI of this repo; throws with its output on failure. */
export function generateClient(contract, output) {
  const require = createRequire(join(UI_DIR, "package.json"));
  const cli = join(dirname(require.resolve("openapi-typescript/package.json")), "bin", "cli.js");
  const result = spawnSync(process.execPath, [cli, contract, "-o", output], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`openapi-typescript failed:\n${result.stdout}${result.stderr}`);
}

/**
 * The git commit of the repository holding the contract, whether the contract file is committed there, and whether
 * that commit is on a remote-tracking branch (local check, no fetch): CI can only check out a pushed commit.
 */
export function serverState(contract) {
  const run = (...args) => spawnSync("git", ["-C", dirname(contract), ...args], { encoding: "utf8" });
  const head = run("rev-parse", "HEAD");
  if (head.status !== 0) return { serverCommit: null, serverContractCommitted: false, serverCommitOnRemote: false };
  const status = run("status", "--porcelain", "--", contract);
  const remote = run("branch", "-r", "--contains", "HEAD");
  return {
    serverCommit: head.stdout.trim(),
    serverContractCommitted: status.status === 0 && status.stdout.trim() === "",
    serverCommitOnRemote: remote.status === 0 && remote.stdout.trim() !== "",
  };
}

export function normalizedText(file) {
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
