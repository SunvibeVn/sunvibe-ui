# Sunvibe UI

Web frontend for Sunvibe, an AI-powered property rental platform. Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and zod; tested with Vitest.

## Getting started

```bash
cp .env.example .env.local   # then fill in real values
npm install
npm run dev                  # http://localhost:3000
```

Sign-up, login and the account page need [sunvibe-server](../sunvibe-server) running (default `http://localhost:8082`).

| Command              | What it does                 |
| -------------------- | ---------------------------- |
| `npm run dev`        | Start the dev server         |
| `npm run build`      | Production build             |
| `npm run start`      | Serve the production build   |
| `npm run lint`       | Run ESLint                   |
| `npm test`           | Run unit tests (Vitest)      |
| `npm run test:watch` | Run unit tests in watch mode |

## Environment variables

| Variable               | Where it's used | Purpose                                                                       |
| ---------------------- | --------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Server + client | Public site URL; makes share-preview image links absolute                     |
| `API_BASE_URL`         | Server only     | Base URL of sunvibe-server (default `http://localhost:8082` in development)   |

`API_BASE_URL` must never get the `NEXT_PUBLIC_` prefix. The browser never calls the backend: only Server Components, Server Actions and `src/proxy.ts` do.

## Project structure

```
src/
├── proxy.ts                # Silent token refresh + optimistic route guards (Next 16 "middleware")
├── app/                    # Routing only: layouts, pages, metadata files
│   ├── layout.tsx          # Root layout: <html>, fonts, site-wide metadata
│   ├── globals.css         # Tailwind entry + brand tokens (navy, bg-brand-gradient)
│   ├── icon.png, opengraph-image.jpg, twitter-image.jpg
│   ├── (marketing)/        # "/" landing page, with site header + footer
│   ├── (auth)/             # /login, /sign-up, /forgot-password, /reset-password
│   ├── (onboarding)/       # /verify-phone (signed in, phone not verified yet)
│   └── (platform)/         # /account and future signed-in pages
│
├── features/               # One folder per business domain; backend-facing ones mirror a service
│   ├── marketing/          # Landing page sections and content (frontend only)
│   ├── auth/               # ↔ auth-service
│   │   ├── actions/        #   Server Actions ("use server")
│   │   ├── components/     #   Forms, auth shell, account overview, user menu
│   │   ├── lib/            #   Form state, safe redirects, forwarded headers, client hooks
│   │   ├── schemas/        #   zod schemas shared by client and server
│   │   ├── services/       #   auth-service calls
│   │   ├── session/        #   Cookies, refresh, route guard, data access layer
│   │   ├── types/          #   DTOs matching the service contract
│   │   ├── index.ts        #   Public API for pages and layouts
│   │   ├── client.ts       #   Public API for Client Components (error boundaries)
│   │   └── proxy.ts        #   Public API for src/proxy.ts only
│   └── property/           # ↔ property-service
│
├── components/             # Shared, feature-agnostic UI
│   ├── brand/              # Logo
│   ├── icons/              # Inline SVG icon set
│   ├── layout/             # SiteShell, SiteHeader, SiteFooter
│   └── ui/                 # Button, Input, FormField, Alert, PasswordInput, OtpInput
│
├── config/                 # site.ts (brand, links), navigation.ts, env.ts (server env)
└── lib/                    # Framework-agnostic helpers
    ├── api/                # createHttpClient, ApiError, ApiResponse envelope
    └── utils/
public/images/brand/        # Logo and share-banner source files
```

## Conventions

**`app/` stays thin.** Route files only compose components from `features/` and `components/`. Route groups give each area its own layout without changing URLs.

**One feature per business domain.** A feature that talks to a backend service owns everything for that domain: `services/`, `types/`, `schemas/`, `actions/`, `components/`. Inside a feature, use relative imports.

**Import features only through their entry points.** ESLint blocks deep imports such as `@/features/property/services/...`. Use `@/features/<name>` from pages and layouts, `@/features/<name>/client` from Client Components, and `@/features/<name>/proxy` from `src/proxy.ts`. Each feature's internals stay free to change.

**Backend calls are server-only.** Service files start with `import "server-only"` and use a client from `createHttpClient`:

```ts
const propertyApi = createHttpClient({ baseUrl: () => serverEnv.apiBaseUrl });
```

The client handles JSON, query strings, Bearer tokens and cookies. Non-2xx responses throw `ApiError` with `status`, `body`, `fieldErrors` and `retryAfterSeconds`; `unwrap()` reads the backend's `{ code, message, result }` envelope. Caching is opt-in per call, following `cacheComponents` in `next.config.ts`.

**Anything that reads cookies, headers or `searchParams` renders inside `<Suspense>`.** With `cacheComponents` on, reading them outside a boundary is a build error.

**File names** are kebab-case with a role suffix where useful: `*.action.ts`, `*.service.ts`, `*.schema.ts`, `*.types.ts`, and colocated `*.test.ts`.

## Authentication

The browser never talks to sunvibe-server directly:

1. Forms post to Server Actions, which validate with zod and call auth-service.
2. Server Actions keep the tokens in HttpOnly cookies on this site: `sv_at` for the access token and `sv_rt` for the refresh token. Both are prefixed `__Host-` in production. An SMS reset token lives briefly in `sv_reset`.
3. `src/proxy.ts` refreshes an expired access token before the page renders. It also redirects signed-out visitors away from `/account` and `/verify-phone`, and signed-in users away from `/login` and `/sign-up`.
4. Pages authorize with `requireUser()` from `@/features/auth`. The proxy's redirects are only a UX shortcut.

**Backend requirements before production:** see "Backend changes" in `docs/superpowers/specs/2026-10-10-auth-feature-design.md`. Two items are needed: forwarding the real client IP, and a configurable domain for the reset link. Deployments also need an edge proxy (load balancer, Nginx, CDN) that **overwrites** `X-Forwarded-For` with the real client address. Next.js passes on whatever the client sent, and the backend rate-limits on that header.

### Adding a feature for a new backend module

1. Create `src/features/<name>/` with `types/<name>.types.ts` and `services/<name>.service.ts`. The service uses `serverEnv.apiBaseUrl`; every module answers on the same base URL.
2. Export the public API from `src/features/<name>/index.ts`.
3. Use it from a Server Component or Server Action, e.g. `await propertyService.list({ city: "HCMC" })`.

The endpoint paths and DTOs in `property` are a starting contract; align them with property-service before use. `auth` follows the real auth-service contract.
