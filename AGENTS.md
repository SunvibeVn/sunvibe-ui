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
- Typecheck: npx tsc --noEmit (no npm script yet)
- Test: npm test (Vitest, src/**/*.test.ts)
- Generate API client: TODO(owner): added in setup Phase 7 (reads ../sunvibe-server/api/openapi.json)

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
- Use the generated client in src/api/generated once it exists (Phase 7). Never invent endpoint URLs;
  check sunvibe-server/api/openapi.json (or the BE controllers until it exists).
- Missing endpoint: STOP and write it to the hub docs/plans/<feature>-api-gaps.md. Do not invent it.
- Access token in memory only; refresh token is an httpOnly cookie set by the API. Never use localStorage
  or sessionStorage for tokens.

## Hard rules
- TypeScript strict; no `any` in new code.
- Every page handles loading, empty and error states (route-group error.tsx exists; add loading/empty UI).
- Server-only modules start with import "server-only"; never import them from Client Components.
- Never read or print .env files. Only NEXT_PUBLIC_* vars reach the browser.
- User-facing text is Vietnamese; keep strings out of logic so i18n can be added later.

## Before saying "done"
1. npm run lint, npx tsc --noEmit and npm test pass
2. The feature works in the browser against the local API (http://localhost:8082)

## Shared context (hub docs)
- In Cursor workspace: hub-docs/features/INDEX.md, then the feature doc.
- From a Claude session in this repo: ../docs/features/INDEX.md
- Business terms: hub-docs/product/glossary.md
- Decision on API access: hub-docs/decisions/ADR-001-direct-browser-api.md
