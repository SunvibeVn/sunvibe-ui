import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { forgotByEmailSchema } from "./auth.schema";
import {
  EMAIL_MAX_LENGTH,
  EMAIL_MAX_LOCAL_PART_LENGTH,
  EMAIL_MAX_RAW_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PHONE_MAX_RAW_LENGTH,
} from "./identifier-policy";
import { signUpPhoneSchema } from "./phone-auth.schema";
import { normalizePhone } from "./phone-policy";

// The corpus is the one list of accepted and refused identifiers, shared byte for byte with auth-service
// (auth-email-access plan PD-8, spec U-1).

type EmailCase = { id: string; raw: string; valid: boolean; canonical: string | null; note: string };
type PhoneCase = EmailCase & { national: string | null };
type Corpus = { rawLimits: { email: number; phone: number }; email: EmailCase[]; phone: PhoneCase[] };

const CORPUS_SHA256 = "a494b197efb848ed2754fcb0b6386b5a30aad6e6fe4a26aff7d9f64b051b46a7";

const bytes = readFileSync(new URL("./identifier-corpus.json", import.meta.url));
const corpus = JSON.parse(bytes.toString("utf8")) as Corpus;

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The file a relative or `@/` import resolves to, or null for a package. */
function resolveImport(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(from), specifier)
      : null;
  if (base === null) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync) ?? null;
}

/** Every package and file a module reaches through runtime imports; `import type` brings nothing into a bundle. */
function reachableImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/^(?:import|export)\s+(?!type\s)[^;]*?from\s+"([^"]+)"/gm)) {
      const target = resolveImport(file, specifier);
      if (target) queue.push(target);
      else seen.add(specifier);
    }
  }
  return seen;
}

describe("identifier corpus", () => {
  it("corpus_hashPinned", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(CORPUS_SHA256);
  });

  it("holds the cases of the handoff", () => {
    expect(corpus.email).toHaveLength(56);
    expect(corpus.phone).toHaveLength(42);
  });

  describe("corpus_email_everyCase", () => {
    it.each(corpus.email)("$id $note", ({ raw, valid, canonical }) => {
      expect(normalizeEmail(raw)).toBe(valid ? canonical : null);
      const parsed = forgotByEmailSchema.safeParse({ email: raw });
      expect(parsed.success).toBe(valid);
      if (parsed.success) expect(parsed.data.email).toBe(canonical);
    });
  });

  describe("corpus_phone_everyCase", () => {
    it.each(corpus.phone)("$id $note", ({ raw, valid, canonical, national }) => {
      expect(normalizePhone(raw)).toEqual(valid ? { key: canonical, national } : null);
      const parsed = signUpPhoneSchema.safeParse({ username: raw });
      expect(parsed.success).toBe(valid);
      if (parsed.success) expect(parsed.data.username).toBe(national);
    });
  });
});

describe("limits_equalTheApi", () => {
  it("uses the raw limits of the corpus", () => {
    expect(EMAIL_MAX_RAW_LENGTH).toBe(corpus.rawLimits.email);
    expect(PHONE_MAX_RAW_LENGTH).toBe(corpus.rawLimits.phone);
  });

  it("uses the limits of auth-service for the address and the password", () => {
    expect(EMAIL_MAX_LENGTH).toBe(254);
    expect(EMAIL_MAX_LOCAL_PART_LENGTH).toBe(64);
    expect(PASSWORD_MAX_LENGTH).toBe(256);
  });
});

describe("publicSchemas_doNotImportPhoneParser", () => {
  const entries = ["../index.ts", "../client.ts", "./auth.schema.ts", "./identifier-policy.ts", "../components/login-form.tsx", "../components/sign-up-email-form.tsx", "../components/sign-up-verify-section.tsx", "../components/sign-up-details-section.tsx", "../lib/sign-up-flow.ts", "../components/forgot-password-form.tsx", "../components/reset-password-section.tsx", "../lib/password-reset-flow.ts"].map(
    (file) => fileURLToPath(new URL(file, import.meta.url)),
  );

  it.each(entries)("%s reaches no phone parser", (entry) => {
    const reached = [...reachableImports(entry)];
    expect(reached.filter((name) => name.includes("libphonenumber") || name.includes("phone-policy"))).toEqual([]);
  });

  it("sees the parser where it is imported, so a miss is not a broken scan", () => {
    const entry = fileURLToPath(new URL("./phone-auth.schema.ts", import.meta.url));
    expect([...reachableImports(entry)].some((name) => name.includes("libphonenumber"))).toBe(true);
  });
});
