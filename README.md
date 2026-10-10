# Sunvibe UI

Web frontend for Sunvibe, an AI-powered property rental platform. Built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 4.

## Getting started

```bash
cp .env.example .env.local   # then fill in real values
npm install
npm run dev                  # http://localhost:3000
```

| Command         | What it does               |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Environment variables

| Variable               | Where it's used | Purpose                                                    |
| ---------------------- | --------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Server + client | Public site URL; makes share-preview image links absolute  |
| `AUTH_SERVICE_URL`     | Server only     | Base URL of `auth-service`                                 |
| `PROPERTY_SERVICE_URL` | Server only     | Base URL of `property-service`                             |

Backend URLs must never get the `NEXT_PUBLIC_` prefix. Only Server Components, Server Actions and Route Handlers call the backend.

## Project structure

```
src/
├── app/                    # Routing only: layouts, pages, metadata files
│   ├── layout.tsx          # Root layout: <html>, fonts, site-wide metadata
│   ├── globals.css         # Tailwind entry + brand tokens (navy, bg-brand-gradient)
│   ├── icon.png, opengraph-image.jpg, twitter-image.jpg
│   └── (marketing)/        # Route group: public site with header + footer
│       ├── layout.tsx
│       └── page.tsx        # "/" composes sections from @/features/marketing
│
├── features/               # One folder per business domain; backend-facing ones mirror a service
│   ├── marketing/          # Landing page sections and content (frontend only)
│   ├── auth/               # ↔ auth-service
│   │   ├── services/       #   API calls (server-only)
│   │   ├── types/          #   DTOs matching the service contract
│   │   └── index.ts        #   Public API of the feature
│   └── property/           # ↔ property-service
│
├── components/             # Shared, feature-agnostic UI
│   ├── brand/              # Logo
│   ├── icons/              # Inline SVG icon set
│   └── layout/             # SiteHeader, SiteFooter
│
├── config/                 # site.ts (brand, links), navigation.ts, env.ts (server env)
└── lib/                    # Framework-agnostic helpers
    ├── api/                # createHttpClient, ApiError, pagination types
    └── utils/
public/images/brand/        # Logo and share-banner source files
```

## Conventions

**`app/` stays thin.** Route files only compose components from `features/` and `components/`. Group routes by layout with route groups: `(marketing)` today, and later e.g. `(auth)` for `/login` and `(dashboard)` for signed-in pages.

**One feature per business domain.** A feature that talks to a backend service owns everything for that domain: `services/`, `types/`, and later `components/`, `actions/` (Server Actions) and `hooks/`. Inside a feature, use relative imports.

**Import features only through their `index.ts`.** ESLint blocks deep imports such as `@/features/property/services/...`; use `@/features/property` instead. This keeps each feature's internals free to change.

**Services are server-only.** Each service file starts with `import "server-only"` and creates its own client:

```ts
const propertyApi = createHttpClient({ baseUrl: () => serverEnv.propertyServiceUrl });
```

The client handles JSON, query strings, Bearer tokens and errors (non-2xx responses throw `ApiError` with `status` and `body`). Caching is opt-in per call, following `cacheComponents` in `next.config.ts`.

### Adding a feature for a new backend service

1. Add `XXX_SERVICE_URL` to `.env.example` and a getter to `src/config/env.ts`.
2. Create `src/features/<name>/` with `types/<name>.types.ts` and `services/<name>.service.ts`.
3. Export the public API from `src/features/<name>/index.ts`.
4. Use it from a Server Component or Server Action, e.g. `await propertyService.list({ city: "HCMC" })`.

The endpoint paths and DTOs in `auth` and `property` are a starting contract. Align them with the real services before use.
