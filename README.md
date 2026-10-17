# Sunvibe UI

Web frontend for Sunvibe, an AI-powered property rental platform. Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and zod; tested with Vitest.

## Getting started

```bash
cp .env.example .env.local   # then fill in real values
npm install
npm run dev                  # http://localhost:3000
```

Sign-up, login and the account page need [sunvibe-server](../sunvibe-server) running (default `http://localhost:8081`).

| Command              | What it does                 |
| -------------------- | ---------------------------- |
| `npm run dev`        | Start the dev server         |
| `npm run build`      | Production build             |
| `npm run start`      | Serve the production build   |
| `npm run lint`       | Run ESLint                   |
| `npm test`           | Run unit tests (Vitest)      |
| `npm run test:watch` | Run unit tests in watch mode |

## Environment variables

| Variable               | Where it's used | Purpose                                                                                  |
| ---------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Server + client | Public site URL; makes share-preview image links absolute                                |
| `NEXT_PUBLIC_API_URL`  | Server + client | Origin of sunvibe-server that the browser calls (required and `https://` in production)  |
| `API_BASE_URL`         | Server only     | Base URL of sunvibe-server for the server-only property service (default `http://localhost:8081`) |

`API_BASE_URL` must never get the `NEXT_PUBLIC_` prefix. The browser calls the backend directly (ADR-001); no Server Action, Route Handler or `src/proxy.ts` code forwards a user token.

## Project structure

```
src/
├── proxy.ts                # Optimistic redirects from the sign-in hint cookie only (Next 16 "middleware")
├── app/                    # Routing only: layouts, pages, metadata files
│   ├── layout.tsx          # Root layout: <html>, fonts, site-wide metadata, SessionProvider
│   ├── globals.css         # Tailwind entry + brand tokens (navy, bg-brand-gradient)
│   ├── icon.png, opengraph-image.jpg, twitter-image.jpg
│   ├── (marketing)/        # "/" landing page, with site header + footer
│   ├── (auth)/             # /login, /sign-up, /forgot-password, /reset-password
│   ├── (onboarding)/       # /verify-phone (signed in, phone not verified yet)
│   └── (platform)/         # /account and future signed-in pages
│
├── features/               # One folder per business domain; backend-facing ones mirror a service
│   ├── marketing/          # Landing page sections and content (frontend only)
│   ├── owner-intake/       # "List with us" form
│   ├── auth/               # ↔ auth-service, called from the browser
│   │   ├── components/     #   Forms, auth shell, account overview, user menu, RequireSession/RequireRole
│   │   ├── lib/            #   Form state, *-flow.ts (pure flow logic), safe redirects, client hooks
│   │   ├── schemas/        #   zod schemas
│   │   ├── session/        #   Session store, session-api, api-client, cookie lock, cross-tab sync, logout
│   │   ├── index.ts        #   Public API for pages and layouts
│   │   ├── client.ts       #   Public API for Client Components (useSession, callApi, RequireSession)
│   │   └── proxy.ts        #   Public API for src/proxy.ts only
│   └── property/           # ↔ property-service (server-only, public data)
│
├── components/             # Shared, feature-agnostic UI
│   ├── brand/              # Logo
│   ├── icons/              # Inline SVG icon set
│   ├── layout/             # SiteShell, SiteHeader, SiteFooter
│   └── ui/                 # Button, Input, FormField, Alert, PasswordInput, OtpInput
│
├── api/generated/          # schema.d.ts from sunvibe-server/api/openapi.json (npm run gen:api)
├── config/                 # site.ts, navigation.ts, public-env.ts (NEXT_PUBLIC_*), env.ts (server env)
├── i18n/                   # next-intl setup; Vietnamese messages in messages/vi.json
└── lib/                    # Framework-agnostic helpers
    ├── api/                # createPublicClient/toPublicResult (openapi-fetch); server.ts: server-only createHttpClient, used only by server-only services such as property.service.ts
    └── utils/
public/images/brand/        # Logo and share-banner source files
```

## Conventions

**`app/` stays thin.** Route files only compose components from `features/` and `components/`. Route groups give each area its own layout without changing URLs.

**One feature per business domain.** A feature owns everything for its domain: `components/`, `lib/`, `schemas/`, `session/` or `services/` as needed. Inside a feature, use relative imports.

**Import features only through their entry points.** ESLint blocks deep imports such as `@/features/property/services/...`. Use `@/features/<name>` from pages and layouts, `@/features/<name>/client` from Client Components, and `@/features/<name>/proxy` from `src/proxy.ts`. Each feature's internals stay free to change.

**API calls use openapi-fetch typed from `src/api/generated/schema.d.ts`.** Never hand-write an endpoint that is not in `sunvibe-server/api/openapi.json`. Anonymous calls use `createPublicClient` + `toPublicResult` from `@/lib/api` with `credentials: "omit"`; map errors by their `code`, never show raw server text. Signed-in calls use `callApi` / `apiClient` from `@/features/auth/client`.

**Public SEO pages may fetch public endpoints in Server Components** (for example `propertyService`, built on the server-only `createHttpClient`). Server code never sends a user token. Caching is opt-in per call, following `cacheComponents` in `next.config.ts`.

**Anything that reads cookies, headers or `searchParams` renders inside `<Suspense>`.** With `cacheComponents` on, reading them outside a boundary is a build error.

**File names** are kebab-case with a role suffix where useful: `*-flow.ts`, `*.service.ts`, `*.schema.ts`, `*.types.ts`, and colocated `*.test.ts`.

## Authentication

The browser talks to sunvibe-server directly (ADR-001); Next.js holds no session:

1. Forms run client-function actions (`useActionState`) that validate with zod and call the flows in `src/features/auth/lib/*-flow.ts`.
2. The access token lives only in the memory of one tab (`session/session-store.ts`). The refresh token is an HttpOnly cookie that the API sets. Only the seven cookie calls in `session/session-api.ts` (login, refresh, logout, register, password reset, password change, logout-all) send `credentials: "include"`, under a browser-wide lock; every other call omits credentials.
3. `callApi` / `apiClient` send `Authorization: Bearer` and refresh once on a 401. Tabs stay in step through a `BroadcastChannel`; only a refresh 401 ends the session.
4. A sign-in hint cookie (`sv_signed_in`, no token) lets `src/proxy.ts` redirect signed-out visitors away from `/account` and `/verify-phone`, and signed-in users away from `/login` and `/sign-up`. The hint never authorizes anything.
5. Signed-in sections wrap their content in `RequireSession` (and `RequireRole` for staff screens) and read the user with `useSession` (from `@/features/auth/client`). The API decides every access.
6. Access and refresh tokens never go into any storage. The single-use registration and reset tokens (SMS or e-mail link) may be kept in `sessionStorage` until the flow ends.

### Adding a feature for a new backend module

1. Run `npm run gen:api` after the endpoint is in `sunvibe-server/api/openapi.json`.
2. Create `src/features/<name>/` with its components and pure `lib/` modules; call the API with `createPublicClient` (anonymous) or `callApi` (signed in).
3. Export the public API from `src/features/<name>/index.ts` and `client.ts`.

The endpoint paths and DTOs in `property` are a starting contract; align them with property-service before use. `auth` follows the real contract in `src/api/generated/schema.d.ts`.
