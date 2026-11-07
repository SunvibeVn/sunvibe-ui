// W33 Task G0: what the public pages load, read from the output of `npm run build` (run it first).
// Next 16 prints no sizes and build-manifest.json has no per-route data, so this reads
// .next/diagnostics/route-bundle-stats.json (first-load JS per route), prerender-manifest.json (render type) and the
// route's prerendered `.meta` (status) and `_full.segment.rsc` (the next-intl messages it receives, SV-026).
// Measure the build as production has it, with the variables in the same command:
//   NEXT_PUBLIC_OWNER_INTAKE_ENABLED=false NEXT_PUBLIC_SITE_URL=https://www.sunvibe.vn npm run build
//   node scripts/measure-public-pages.mjs [route ...]
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_DIR = join(UI_DIR, ".next");
const DEFAULT_ROUTES = ["/", "/login", "/list-with-us"];

// Strings that only a given module puts in a chunk; minified names are useless, literals survive.
const MARKERS = {
  zod: /ZodError/,
  "auth forms": /Forgot password\?/, // login-form.tsx
  "staff shell": /workspace-drawer/, // workspace-shell.tsx
};

const MESSAGE_FILES = { vi: "src/i18n/messages/vi.json", en: "src/i18n/messages/en.json" };

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const kb = (bytes) => (bytes / 1024).toFixed(1);

function outputName(route) {
  return route === "/" ? "index" : route.replace(/^\//, "");
}

function renderType(prerender, route) {
  const entry = prerender.routes[route];
  if (!entry) return "DYNAMIC";
  const meta = join(NEXT_DIR, "server", "app", `${outputName(route)}.meta`);
  const status = existsSync(meta) ? readJson(meta).status : undefined;
  return status && status !== 200 ? `${entry.renderingMode}, ${status}` : entry.renderingMode;
}

function messagesOf(route) {
  const payload = join(NEXT_DIR, "server", "app", `${outputName(route)}.segments`, "_full.segment.rsc");
  if (!existsSync(payload)) return "n/a (no prerendered payload)";
  const text = readFileSync(payload, "utf8");
  const found = [];
  for (const [locale, file] of Object.entries(MESSAGE_FILES)) {
    const messages = readJson(join(UI_DIR, file));
    for (const [namespace, value] of Object.entries(messages)) {
      // The namespace key followed by the start of its serialized value, so the same namespace of the other locale,
      // or a same-named prop elsewhere, does not count.
      const serialized = JSON.stringify(value);
      if (text.includes(`"${namespace}":${serialized.slice(0, 80)}`)) {
        found.push({ locale, namespace, bytes: Buffer.byteLength(serialized) });
      }
    }
  }
  if (found.length === 0) return "none";
  const total = found.reduce((sum, item) => sum + item.bytes, 0);
  return `${found.map((item) => `${item.locale}.${item.namespace}`).join(", ")} (${kb(total)} KB)`;
}

function measure(routes) {
  const stats = readJson(join(NEXT_DIR, "diagnostics", "route-bundle-stats.json"));
  const prerender = readJson(join(NEXT_DIR, "prerender-manifest.json"));
  const rows = [];
  for (const route of routes) {
    const entry = stats.find((item) => item.route === route);
    if (!entry) {
      rows.push([route, "not built", "", "", "", ...Object.keys(MARKERS).map(() => ""), ""]);
      continue;
    }
    const chunks = entry.firstLoadChunkPaths.map((path) => readFileSync(join(UI_DIR, path)));
    const gzip = chunks.reduce((sum, chunk) => sum + gzipSync(chunk).length, 0);
    const text = chunks.map((chunk) => chunk.toString("utf8")).join("\n");
    rows.push([
      route,
      renderType(prerender, route),
      String(chunks.length),
      kb(entry.firstLoadUncompressedJsBytes),
      kb(gzip),
      ...Object.values(MARKERS).map((marker) => (marker.test(text) ? "yes" : "no")),
      messagesOf(route),
    ]);
  }
  const header = ["Route", "Render", "JS files", "JS KB", "JS KB gzip", ...Object.keys(MARKERS), "Messages"];
  return [header, header.map(() => "---"), ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

const routes = process.argv.slice(2);
console.log(measure(routes.length > 0 ? routes : DEFAULT_ROUTES));
