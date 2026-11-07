import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Checks the parts of .cursor/rules/naming-layout.mdc that a file listing can decide. Existing names keep what the rule
// says of them; a new word or a new entry goes into the rule first, then here.

const SRC = fileURLToPath(new URL(".", import.meta.url));
const FEATURES = path.join(SRC, "features");

/** Routes follow Next's file conventions, and the generated client is not ours to name. */
const SKIPPED = new Set([path.join(SRC, "app"), path.join(SRC, "api", "generated")]);

const ENTRIES = new Set(["index", "client", "proxy", "phone", "public", "session-sync", "constants"]);
const AREA_FOLDERS = new Set(["components", "lib", "schemas"]);
const FLAT_FOLDERS = new Set(["services", "types"]);
const ONLY_IN: Readonly<Record<string, string>> = { session: "auth", data: "marketing" };

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (SKIPPED.has(full)) return [];
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

const relative = (file: string): string => path.relative(SRC, file).replaceAll("\\", "/");

describe("the UI naming standard (naming-layout.mdc, SV-178)", () => {
  it("fileNames_areKebabCase: only the listed dotted kinds, and a schema is <thing>.schema.ts", () => {
    const name = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.(?:d|test|test-support|server|schema|schema\.test))?$/;
    const offenders = filesUnder(SRC)
      .map(relative)
      .filter((file) => {
        const base = path.posix.basename(file).replace(/\.[a-z0-9]+$/, "");
        return !name.test(base) || /-schema(?:\.|$)/.test(base);
      });
    expect(offenders).toEqual([]);
  });

  it("featureFolders_areTheListedOnes: the entries and folders of the first table, a test of an entry counting as that entry", () => {
    const offenders = readdirSync(FEATURES, { withFileTypes: true })
      .filter((feature) => feature.isDirectory())
      .flatMap((feature) => {
        const root = path.join(FEATURES, feature.name);
        return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
          const shown = `${feature.name}/${entry.name}`;
          if (entry.isFile()) return ENTRIES.has(entry.name.replace(/(?:\.test)?\.ts$/, "")) ? [] : [shown];
          const folders = readdirSync(path.join(root, entry.name), { withFileTypes: true }).filter((item) => item.isDirectory());
          if (AREA_FOLDERS.has(entry.name)) {
            const deeper = folders.filter((area) =>
              readdirSync(path.join(root, entry.name, area.name), { withFileTypes: true }).some((item) => item.isDirectory()),
            );
            return deeper.map((area) => `${shown}/${area.name}`);
          }
          if (FLAT_FOLDERS.has(entry.name)) return folders.map((area) => `${shown}/${area.name}`);
          return ONLY_IN[entry.name] === feature.name ? [] : [shown];
        });
      });
    expect(offenders).toEqual([]);
  });

  it("useFiles_exportAHook: a use-<thing> file holds a hook", () => {
    const offenders = filesUnder(SRC)
      .filter((file) => /^use-.*\.tsx?$/.test(path.basename(file)) && !file.endsWith(".test.ts"))
      .filter((file) => !/export\s+(?:function|const)\s+use[A-Z]/.test(readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});
