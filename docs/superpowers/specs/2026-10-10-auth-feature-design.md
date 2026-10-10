# Auth feature design (sunvibe-ui)

Date: 2026-10-10 · Status: awaiting review

## 1. Goal

Port the legacy React auth screens (`Login.jsx`, `SignUp.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `authen.css`) to production-grade Next.js 16 code. The screens must work end to end against the current `sunvibe-server` auth-service, not the legacy backend the old files called.

**Done means:** with `sunvibe-server` running on `:8082`, a user can sign up, verify their phone by SMS code, log in, log out, request a password reset by e-mail or SMS, and set a new password. The session renews silently, and no token is ever readable by browser JavaScript. `npm run build`, `npm run lint` and the unit tests all pass.

### Decisions already made

| Topic | Decision |
| --- | --- |
| Scope | Option A: login, sign-up, phone verification, forgot password (e-mail + SMS), reset password, logout, `/account` page |
| Session model | BFF. The browser only talks to Next.js; Server Actions call the backend server-to-server; Next.js stores the tokens in its own HttpOnly cookies |
| Validation | `zod`, one schema per form, shared by client and server |
| UI | Tailwind + Sunvibe brand tokens. No Semantic UI, Formik, react-otp-input or react-toastify |
| UI language | English, matching the landing page. i18n is out of scope |

## 2. Backend contract (source: `sunvibe-server/modules/auth-service`)

All responses use the envelope `{ code, message, result }`. Errors come in two shapes: `BaseErrorModel { code, message, errorTime }` and, for validation, `ErrorResponse { message, errors: [{ field, message }] }`.

| Action | Endpoint | Body | Notes |
| --- | --- | --- | --- |
| Login | `POST /api/auth/login` | `{ username, password }` | `username` is the phone number (10–12 digits) |
| Register | `POST /api/users/command/register` | `{ fullName, username, email?, idCardNumber?, password, confirmPassword }` | Signs the user in at once. The account stays PENDING until the phone is verified |
| Refresh | `POST /api/auth/refresh-token` | — | Reads the `cookie-jwt-rf` cookie and rotates it. 401 means the session is over |
| Logout | `POST /api/auth/logout` | — | Reads `cookie-jwt-rf`. Idempotent |
| Profile | `GET /api/user/query/my-info` | — | Bearer token required |
| Send phone code | `POST /api/auth/verification/phone/send` | — | Bearer required. Returns `{ channel, sentTo, expiresAt, resendAvailableAt }` |
| Confirm phone | `POST /api/auth/verification/phone/confirm` | `{ code }` (6 digits) | Bearer required |
| Forgot (e-mail) | `POST /api/auth/forgot-password` | `{ email }` | Same response whether or not the account exists. The e-mail carries an OTP and a link `…/reset-password?token=…` |
| Forgot (SMS) | `POST /api/auth/forgot-password/sms` | `{ phoneNumber }` | The response carries `resetToken` |
| Reset | `POST /api/auth/reset-password` | `{ resetToken, otpCode, newPassword, confirmPassword }` | Signs out every device |

**Token responses** (login, register, refresh): the body has `accessToken`, `expiresIn` (900 s), `username`, `userEmail`, `roles`, `phoneVerified` and `emailVerified`. The refresh token only travels in `Set-Cookie: cookie-jwt-rf=…`.

**Password rule:** 8–72 characters, at least one uppercase letter, one lowercase letter, one digit and one of `@$!%*?&`. Only `[A-Za-z0-9@$!%*?&]` is allowed.

**Error statuses:** 401 wrong credentials · 423 account locked (`Retry-After` header) · 429 rate limited (`Retry-After`) · 406 validation (`errors[]`) · 409 conflict, e.g. phone already used (`errors[]`) · 400 wrong or expired OTP / reset token · 404 user gone.

## 3. Architecture

```
Browser ──form POST──▶ Next.js Server Action ──fetch──▶ sunvibe-server (:8082)
   ▲                         │  reads Set-Cookie: cookie-jwt-rf
   │◀── Set-Cookie sv_at / sv_rt (HttpOnly, on the Next.js domain)
   │
   └──page request──▶ proxy.ts ── sv_at missing but sv_rt present? ──▶ POST /refresh-token
                         └─▶ Server Components read the session through the DAL (inside <Suspense>)
```

- **Server Actions** run every auth mutation. They validate with zod, call `authService`, write or clear the session cookies, then `redirect()`.
- **`src/proxy.ts`** (Next 16's name for middleware) runs on page requests. It does two things:
  - **Silent refresh.** When the access cookie has expired but the refresh cookie is present, it calls the backend. It writes the new cookies to both the response and the forwarded request, so the same render already sees the new token.
  - **Optimistic redirects.** Protected routes (`/account`, `/verify-phone`) without any session cookie go to `/login?next=…`. Guest-only routes (`/login`, `/sign-up`) go to `/account` when a session cookie exists. `/forgot-password` and `/reset-password` are open to everyone.
- **Data Access Layer (`dal.ts`)** is the only place that reads the session for rendering. Pages call `requireUser()`, which does the real authorization; the proxy's redirects are only UX. Calls are deduplicated per request with React `cache()`.
- **`cacheComponents` is on.** Every component that reads cookies sits behind `<Suspense>`; reading cookies outside a boundary is a build error. Layouts never await the session at their top level.

### 3.1 Session cookies (owned by Next.js)

| Cookie | Content | Options |
| --- | --- | --- |
| `sv_at` | Access JWT | HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age = expiresIn − 30 s` so it expires before the backend rejects the token |
| `sv_rt` | Refresh token | HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` 7 days (the backend's idle lifetime) |
| `sv_reset` | SMS reset token | HttpOnly, `SameSite=Lax`, `Path=/reset-password`, `Max-Age` 15 min; deleted after a successful reset |

- In production the names get the `__Host-` prefix. This forces `Secure` and `Path=/`, with no `Domain`, so a subdomain can't plant or overwrite them. (`sv_reset` keeps its plain name because its path isn't `/`.)
- `SameSite=Lax` rather than `Strict`, so a user arriving from an external link (e-mail, Zalo) is still signed in on the first page. Server Actions already reject cross-origin POSTs.
- When the proxy refreshes, the backend's 30 s refresh-reuse grace absorbs concurrent requests (several tabs, prefetches).
- If the refresh fails with 401, both cookies are deleted. A network error or 5xx keeps them, so a backend outage doesn't sign everyone out.

### 3.2 Talking to the backend

- **One base URL.** The backend is a modular monolith on one port, so `AUTH_SERVICE_URL` and `PROPERTY_SERVICE_URL` are replaced by a single `API_BASE_URL` (default `http://localhost:8082`). `property.service.ts`, `env.ts`, `.env.example` and the README change accordingly.
- **`lib/api` additions:**
  - an `ApiResponse<T>` envelope type and an `unwrap` helper;
  - `ApiError.retryAfterSeconds`, parsed from `Retry-After`;
  - `ApiError.fieldErrors`, parsed from `errors[]`;
  - a `requestRaw` variant that also returns the response headers (needed for `Set-Cookie`);
  - a `cookie` request option that sends `Cookie: cookie-jwt-rf=…`.
- **Client context forwarding.** Every auth call forwards the browser's `User-Agent` and `X-Forwarded-For`, taken from `headers()` in actions or `request.headers` in the proxy. Without this the backend would see every user as the Next.js server (see §8).

## 4. File structure and naming

Conventions: kebab-case file names, PascalCase component exports, and role suffixes `*.action.ts`, `*.service.ts`, `*.schema.ts`, `*.types.ts`. Inside a feature use relative imports. Other code imports only from a feature's public entry points.

```
src/
├── proxy.ts                                 # matcher + composes features/auth/proxy
├── app/
│   ├── (auth)/                              # guest pages, split-screen brand layout
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── sign-up/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (onboarding)/verify-phone/page.tsx   # signed-in, phone not yet verified
│   └── (platform)/                          # signed-in pages with site header/footer
│       ├── layout.tsx
│       └── account/page.tsx
├── components/
│   ├── ui/                                  # generic primitives, no business logic
│   │   ├── button.tsx  input.tsx  label.tsx  field-error.tsx
│   │   ├── alert.tsx   password-input.tsx    otp-input.tsx
│   └── layout/site-header.tsx               # + <Suspense><UserMenu/></Suspense>
├── features/auth/
│   ├── index.ts            # public API for pages: forms, UserMenu, DAL, actions
│   ├── proxy.ts            # public API for src/proxy.ts only (no React)
│   ├── actions/            # 'use server'
│   │   ├── login.action.ts           register.action.ts
│   │   ├── verify-phone.action.ts    forgot-password.action.ts
│   │   ├── reset-password.action.ts  logout.action.ts
│   ├── components/
│   │   ├── auth-shell.tsx            auth-illustration.tsx (inline SVG)
│   │   ├── login-form.tsx            sign-up-form.tsx
│   │   ├── verify-phone-form.tsx     forgot-password-form.tsx
│   │   ├── reset-password-form.tsx   resend-countdown.tsx
│   │   ├── user-menu.tsx             logout-button.tsx
│   ├── schemas/auth.schema.ts        # zod: login, register, otp, forgot, reset
│   ├── services/auth.service.ts      # every backend call (server-only)
│   ├── session/
│   │   ├── cookies.ts                # names, options, read/write via next/headers
│   │   ├── backend-cookies.ts        # extract cookie-jwt-rf from Set-Cookie
│   │   ├── refresh.ts                # refresh logic used by the proxy
│   │   └── dal.ts                    # getSessionUser, requireUser, redirectIfSignedIn
│   ├── lib/
│   │   ├── form-state.ts             # FormState type + ApiError → FormState mapper
│   │   ├── safe-redirect.ts          # validate ?next= (relative paths only)
│   │   └── client-context.ts         # User-Agent / X-Forwarded-For forwarding
│   ├── types/auth.types.ts           # DTOs mirroring the backend
│   └── constants.ts                  # routes, cookie names, timings
└── lib/api/                          # extended as described in §3.2
```

- **Second entry point for the proxy.** The ESLint rule that blocks deep imports gets one exception: `@/features/*/proxy`. This keeps React components and `next/headers` out of the proxy bundle.
- **Old files.** The five legacy files are deleted once ported. They depend on packages and modules that don't exist here, and copies remain in `business-ui`. The `login.png`/`signup.png` images aren't reused: they're Silva Farm branding. `auth-illustration.tsx` replaces them with a brand-colored SVG.

## 5. Screens and flows

**Shared shell (`(auth)/layout.tsx`):**
- **Desktop:** a navy brand panel on the left (logo, tagline, illustration, three short value points) and the form card on the right.
- **Mobile:** only the logo and the card, with no horizontal scroll at 360 px.

**Shared form behavior:**
- Each form is a client component using `useActionState`, posting to a Server Action through `<form action>`, so it works before JavaScript loads.
- Native constraints (`required`, `pattern`, `inputMode`, `autoComplete`) give instant hints. zod validates each field on blur for consistent messages, and the server validates again.
- The submit button shows a pending state and is disabled while submitting.
- Typed values (except passwords) survive a failed submit.

| Route | Fields | Success | Notes |
| --- | --- | --- | --- |
| `/login` | Phone number, password (show/hide) | Redirect to `next` (sanitized) if `phoneVerified`, otherwise to `/verify-phone` | Links to forgot password and sign-up. Shows a banner for `?reset=success` and `?session=expired` |
| `/sign-up` | Full name, phone, e-mail (optional), ID card (optional, 9 or 12 digits), password, confirm | Session cookies set → `/verify-phone` | Live password-rule checklist under the password field |
| `/verify-phone` | 6-digit code | `/account` | Requires a session. Already verified → `/account`. "Send code" button (not automatic, to save the 5/hour limit), masked destination, resend countdown from `resendAvailableAt`. The OTP input supports paste and auto-advance |
| `/forgot-password` | Tabs: E-mail \| Phone | E-mail: neutral "if an account exists, we sent a code and a link" message. Phone: `resetToken` stored in `sv_reset` → `/reset-password` | Wording never reveals whether the account exists |
| `/reset-password` | 6-digit code, new password, confirm | Clear `sv_reset` → `/login?reset=success` | Token comes from `?token=` (e-mail link) or `sv_reset` (SMS). With neither, shows "link invalid or expired" and a link back |
| `/account` | — | — | Shows name, phone, e-mail, account status, phone/e-mail verified badges. "Verify phone" call to action when needed. Log out button |
| Header | — | — | Signed out: "Log in" link. Signed in: an "Account" link with a user icon (no name, which would need a backend call). Behind `<Suspense>`, based on cookie presence only, so the landing page makes no backend call |

## 6. Error handling

Every action returns `FormState = { status: 'idle' | 'error' | 'success', message?, fieldErrors?, values? }`.

| Backend result | Shown to the user |
| --- | --- |
| zod failure | Field errors; no backend call |
| 406 / 409 with `errors[]` | Mapped to the matching field (backend field names equal form field names) |
| 401 on login | "Phone number or password is incorrect." |
| 423 | "Too many failed attempts. Try again in N minutes." (from `Retry-After`) |
| 429 | "Please wait N seconds before trying again." |
| 400 on OTP / reset | "The code is incorrect or has expired." |
| 401 on an authenticated call | Clear session → `/login?session=expired&next=…` |
| Network error / 5xx | "We couldn't reach the server. Please try again." Logged server-side with `console.error`; tokens and passwords are never logged |

Route-level `error.tsx` boundaries under `(auth)` and `(platform)` catch unexpected render errors.

## 7. Testing

- **Unit tests with Vitest** (new dev dependency, `npm test`) for the pure logic:
  - zod schemas, especially password and phone rules matching the backend;
  - `backend-cookies` parsing;
  - `safe-redirect` (rejects `//evil.com`, `https://…` and `/\evil`);
  - the `ApiError` → `FormState` mapper;
  - `refresh.ts` decision logic with a mocked `fetch`.
- **Build gates:** `npm run build`, `npm run lint` and `tsc --noEmit` must pass. The build also proves that no cookie read sits outside `<Suspense>`.
- **Manual end-to-end check** against a local `sunvibe-server`: the full flow in §1. The SMS and e-mail codes are read from the backend log (`LoggingSmsSender`) or the dev mailbox.

## 8. Backend changes this design depends on (not done in this repo)

1. **Real client IP behind the BFF (required before production).** The rate limiter, login lockout and audit log use `getRemoteAddr()`. Behind Next.js, every user shares the server's IP, so for example only 5 sign-ups per hour would be possible site-wide. Fix: enable `server.forward-headers-strategy` and trust `X-Forwarded-For` only from the Next.js server's address. This frontend already forwards the header.
2. **Reset link domain.** `EmailTemplate.java` hardcodes `https://yourapp.com/reset-password?token=…`. It should use a configurable frontend URL. The route `/reset-password?token=` matches on this side.

## 9. Out of scope

OAuth/social login, e-mail verification UI, change password, "log out of all devices", i18n, KYC/profile editing.
