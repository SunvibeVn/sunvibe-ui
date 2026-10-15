<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Sunvibe UI
Next.js 16.4 (App Router, React 19.3) web app for sunvibe.vn. Package manager: npm (package-lock.json).

## Commands
- Dev: npm run dev
- Build: npm run build
- Lint: npm run lint
- Typecheck: npm run typecheck
- Test: npm test (Vitest, src/**/*.test.ts)
- Generate API types: npm run gen:api (reads ../sunvibe-server/api/openapi.json -> src/api/generated/schema.d.ts; commit it)
- Git hooks (husky): pre-commit runs eslint --fix on staged files; pre-push blocks pushes to main

## Architecture
- src/app: routes in groups (auth), (marketing), (onboarding), (platform). Pages stay thin.
- src/features/<feature>/{actions,components,lib,schemas,services,session,types}.
  Public API: index.ts (Server Components), client.ts (Client Components), proxy.ts (src/proxy.ts only).
  ESLint blocks deep imports like @/features/auth/components/... ; import from the feature root.
- src/components/{ui,layout,brand,icons}: shared components. src/lib/api: typed fetch client.
  src/config: env.ts (server env), site.ts, navigation.ts. src/proxy.ts: Next 16 proxy (auth guard + refresh).
- next.config.ts enables cacheComponents and partialPrefetching. Read the Next 16 docs in
  node_modules/next/dist/docs/ before using caching, proxy or Server Action APIs.
- UI kit / styling: Tailwind CSS v4 + own components in src/components/ui (no external UI kit).
  Forms: native <form action> + useActionState + zod 4 schemas. Data fetching: src/lib/api http client
  (no query library). i18n: planned, library not chosen yet (TODO(owner)).

## API access (see .cursor/rules/data-fetching.mdc)
- Target (ADR-001): the browser calls Spring Boot directly. No BFF.
- Current state: auth runs through Server Actions that call the API with the server-only API_BASE_URL,
  and Next keeps its own HttpOnly session cookies (sv_at / sv_rt). Keep that code working until a
  planned auth-migration task replaces it; do not add new BFF-style endpoints or Route Handlers.
- New API calls use openapi-fetch typed with src/api/generated/schema.d.ts (paths). Never invent endpoint URLs;
  regenerate with npm run gen:api when the contract changes.
- Missing endpoint: STOP and write it to the hub docs/features/<module>/<feature>/impl/<feature>-api-gaps.md. Do not invent it.
- Access token in memory only; refresh token is an httpOnly cookie set by the API. Never use localStorage
  or sessionStorage for tokens.

## Hard rules
- TypeScript strict; no `any` in new code.
- Every page handles loading, empty and error states (route-group error.tsx exists; add loading/empty UI).
- Server-only modules start with import "server-only"; never import them from Client Components.
- Never read or print .env files. Only NEXT_PUBLIC_* vars reach the browser.
- Never commit a secret: CI gitleaks-scans new commits (.github/workflows/secret-scan.yml). A false positive goes
  into .gitleaksignore as a fingerprint (never the value), only after owner review, in its own PR to main first.
- User-facing text is Vietnamese; keep strings out of logic so i18n can be added later.

## Before saying "done"
1. npm run lint, npm run typecheck and npm test pass
2. The feature works in the browser against the local API (http://localhost:8081)
3. Docs: Claude session -> run /update-docs <feature> (edits ../docs; a Stop hook reminds once per session on
   feature/* and fix/* branches). Cursor -> tell the owner to run /update-docs <feature> in a hub Claude session.

## Shared context (hub docs)
- In Cursor workspace: hub-docs/features/INDEX.md, then hub-docs/features/<module>/<feature>/ (brief/ = business
  truth, read only; as-built/; impl/ = spec, plan, FE handoff; latest only). Module rules: <module>/brief/ if present.
- From a Claude session in this repo: ../docs/features/INDEX.md and ../docs/features/<module>/<feature>/
- Business terms: hub-docs/product/glossary.md
- Decision on API access: hub-docs/decisions/ADR-001-direct-browser-api.md
