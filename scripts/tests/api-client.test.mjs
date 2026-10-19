// Behavior of scripts/gen-api.mjs (npm run gen:api) and scripts/check-api-client.mjs (npm run check:api-client).
// gen:api records which contract the client came from; check:api-client proves the committed client matches it.
// Run: node --test "scripts/tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = {
  openapi: "3.0.1",
  info: { title: "fixture", version: "1" },
  paths: { "/api/v1/things": { get: { responses: { 200: { description: "ok" } } } } },
};

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

/** A workspace with server/api/openapi.json committed in its own repo and an empty ui/ folder. */
function workspace({ eol = "\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "sv api client "));
  const server = join(root, "server");
  const ui = join(root, "ui");
  mkdirSync(join(server, "api"), { recursive: true });
  mkdirSync(join(ui, "src", "api", "generated"), { recursive: true });
  git(server, "init", "-q", "-b", "main");
  git(server, "config", "user.email", "t@example.com");
  git(server, "config", "user.name", "t");
  git(server, "config", "core.autocrlf", "false");
  const contract = join(server, "api", "openapi.json");
  writeFileSync(contract, JSON.stringify(CONTRACT, null, 2).replace(/\n/g, eol) + eol);
  git(server, "add", "-A");
  git(server, "commit", "-q", "-m", "contract");
  return { root, server, ui, contract, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function node(script, ws, ...extra) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), "--ui-dir", ws.ui, "--contract", ws.contract, ...extra], {
    encoding: "utf8",
  });
}

const sourceFile = (ws) => join(ws.ui, "src", "api", "generated", "contract-source.json");
const schemaFile = (ws) => join(ws.ui, "src", "api", "generated", "schema.d.ts");

test("gen:api writes the client and records the server commit and contract hash", () => {
  const ws = workspace();
  try {
    const result = node("gen-api.mjs", ws);
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(schemaFile(ws), "utf8"), /"\/api\/v1\/things"/);
    const source = JSON.parse(readFileSync(sourceFile(ws), "utf8"));
    assert.equal(source.serverCommit, git(ws.server, "rev-parse", "HEAD"));
    assert.equal(source.serverContractCommitted, true);
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
  } finally {
    ws.cleanup();
  }
});

test("the recorded hash does not depend on the contract's line endings", () => {
  const lf = workspace({ eol: "\n" });
  const crlf = workspace({ eol: "\r\n" });
  try {
    assert.equal(node("gen-api.mjs", lf).status, 0);
    assert.equal(node("gen-api.mjs", crlf).status, 0);
    const a = JSON.parse(readFileSync(sourceFile(lf), "utf8")).sha256;
    const b = JSON.parse(readFileSync(sourceFile(crlf), "utf8")).sha256;
    assert.equal(a, b);
  } finally {
    lf.cleanup();
    crlf.cleanup();
  }
});

test("gen:api warns and records it when the contract has uncommitted changes", () => {
  const ws = workspace();
  try {
    writeFileSync(ws.contract, JSON.stringify({ ...CONTRACT, info: { title: "changed", version: "2" } }, null, 2) + "\n");
    const result = node("gen-api.mjs", ws);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /uncommitted/);
    assert.equal(JSON.parse(readFileSync(sourceFile(ws), "utf8")).serverContractCommitted, false);
  } finally {
    ws.cleanup();
  }
});

test("gen:api warns when the server commit is on no remote branch (CI could not fetch it)", () => {
  const ws = workspace();
  try {
    const unpushed = node("gen-api.mjs", ws);
    assert.equal(unpushed.status, 0, unpushed.stderr);
    assert.match(unpushed.stderr, /not on any remote branch/);
    git(ws.root, "clone", "-q", "--bare", ws.server, join(ws.root, "server.git"));
    git(ws.server, "remote", "add", "origin", join(ws.root, "server.git"));
    git(ws.server, "fetch", "-q", "origin");
    const pushed = node("gen-api.mjs", ws);
    assert.equal(pushed.status, 0, pushed.stderr);
    assert.doesNotMatch(pushed.stderr, /not on any remote branch/);
  } finally {
    ws.cleanup();
  }
});

test("check:api-client passes for a client generated from the recorded contract", () => {
  const ws = workspace();
  try {
    assert.equal(node("gen-api.mjs", ws).status, 0);
    const result = node("check-api-client.mjs", ws);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    ws.cleanup();
  }
});

test("check:api-client fails when the contract is not the one the client was generated from", () => {
  const ws = workspace();
  try {
    assert.equal(node("gen-api.mjs", ws).status, 0);
    writeFileSync(ws.contract, JSON.stringify({ ...CONTRACT, paths: {} }, null, 2) + "\n");
    const result = node("check-api-client.mjs", ws);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sha256/);
  } finally {
    ws.cleanup();
  }
});

test("check:api-client fails when schema.d.ts differs from the generated client", () => {
  const ws = workspace();
  try {
    assert.equal(node("gen-api.mjs", ws).status, 0);
    writeFileSync(schemaFile(ws), readFileSync(schemaFile(ws), "utf8") + "export type HandWritten = 1;\n");
    const result = node("check-api-client.mjs", ws);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /schema\.d\.ts/);
  } finally {
    ws.cleanup();
  }
});

test("check:api-client fails without a contract record or with one made from an uncommitted contract", () => {
  const ws = workspace();
  try {
    assert.equal(node("check-api-client.mjs", ws).status, 1);
    writeFileSync(ws.contract, JSON.stringify({ ...CONTRACT, info: { title: "wip", version: "3" } }, null, 2) + "\n");
    assert.equal(node("gen-api.mjs", ws).status, 0);
    const result = node("check-api-client.mjs", ws);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /uncommitted/);
  } finally {
    ws.cleanup();
  }
});
