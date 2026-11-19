// The Next.js version this app installs (SV-323). next and eslint-config-next are pinned exactly, to one version, and
// that version is outside every range listed below. A range is added here when an advisory names the installed version.
// Run: node --test "scripts/tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (name) => JSON.parse(readFileSync(join(ROOT, name), "utf8"));

/** Affected ranges, both ends included, as the advisories publish them. */
const AFFECTED = [
  { advisory: "GHSA-mfr8-8qww-v76h", from: "16.3.0", to: "16.4.4" },
  { advisory: "GHSA-vc7v-qv4w-wrv8", from: "16.2.0", to: "16.4.4" },
];

const EXACT = /^(\d+)\.(\d+)\.(\d+)$/;

function parts(version) {
  const match = EXACT.exec(version);
  assert.ok(match, `"${version}" is not an exact x.y.z version (no range, no tag)`);
  return match.slice(1).map(Number);
}

function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

const pkg = readJson("package.json");
const next = pkg.dependencies.next;
const eslintConfigNext = pkg.devDependencies["eslint-config-next"];

test("next and eslint-config-next are pinned exactly, to the same version", () => {
  parts(next);
  parts(eslintConfigNext);
  assert.equal(eslintConfigNext, next);
});

test("the pinned next version is outside the ranges of the published advisories", () => {
  for (const { advisory, from, to } of AFFECTED) {
    const inside = compare(next, from) >= 0 && compare(next, to) <= 0;
    assert.equal(inside, false, `next ${next} is inside ${advisory} (>=${from} <=${to})`);
  }
});

test("the lockfile installs the pinned version of both packages", () => {
  const { packages } = readJson("package-lock.json");
  assert.equal(packages["node_modules/next"].version, next);
  assert.equal(packages["node_modules/eslint-config-next"].version, eslintConfigNext);
});
