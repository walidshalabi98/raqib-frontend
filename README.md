# Raqib — web app

The web app for Raqib (رقيب), an M&E platform for NGOs, INGOs and consultancies in Palestine and the region. The API lives in [raqib-backend](https://github.com/walidshalabi98/raqib-backend).

Stack: Vite 7 · React 18 · TypeScript · Tailwind 3 · shadcn/ui (Radix) · TanStack Query · React Router · react-hook-form + zod · Recharts · Leaflet · Vitest. Originally generated with Lovable.

## Quick start

Requirements: Node 22 and a running backend (see the backend README).

```bash
npm ci
echo "VITE_API_URL=http://localhost:3001/api" > .env.local   # optional; this is the default
npm run dev                                               # http://localhost:8080
```

The sign-in form starts empty. In development, sign in with an account from the backend's dev seed, for example `admin@momentumlabs.ps` (its password is `admin123` only under `NODE_ENV=development`; see the backend README).

> The dev server listens on `::` (IPv6). On machines without IPv6 run `npx vite --host 127.0.0.1`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build locally |
| `npm run lint` | ESLint (`no-explicit-any` is a warning until typed API models arrive in Phase 2) |
| `npm run typecheck` | TypeScript check of the app and the Vite config |
| `npm test` | Vitest unit tests |

Use **npm** only: `package-lock.json` is the single lockfile. Bun lockfiles were removed so local installs, CI and Vercel get the same versions. If the Vercel project's install command is set to Bun, change it to `npm ci`.

## Configuration

| Variable | Notes |
|---|---|
| `VITE_API_URL` | backend base URL including `/api`, e.g. `https://api.example.org/api`. Set per environment in Vercel. |
| `VITE_EMAIL_ENABLED` | `true` once the backend sends email (`RESEND_API_KEY` set there); unset or anything else means email is off. While it is off, "Forgot password?" says that reset by email is not available yet and to ask the organisation's admin, and the team screens say that the admin hands over a temporary password. Flip it in Vercel (and redeploy) when email is switched on. |

## Deployment (Vercel)

`vercel.json` routes every path to the app and sends security headers, including a Content-Security-Policy. `connect-src` currently allows any `https:` host. Once the production API address is fixed, replace `https:` with that address.

Until the public launch the site stays out of search engines: every response has the header `X-Robots-Tag: noindex, nofollow` (`vercel.json`) and `index.html` has `<meta name="robots" content="noindex, nofollow">`. `public/robots.txt` allows crawling on purpose: a crawler that may not fetch a page never sees its noindex, and could list a linked address anyway. Remove the header and the meta tag at launch (they apply to every deployment of the Vercel project). The favicon is `public/favicon.svg` (the Raqib monogram), with `public/favicon.ico` (16, 32 and 48 px) and `public/apple-touch-icon.png` (180 px) for browsers and phones that do not use SVG icons.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on `main`: install, lint, typecheck, tests, build, a check that the main bundle stays under 500 kB, and `npm audit --audit-level=critical`.

Known audit findings: Tailwind 3 depends on `chokidar`/`micromatch`/`braces`, and no patched version of `braces` exists. These are build-time tools and are not shipped to browsers. Removing them means moving to Tailwind 4 and dropping `lovable-tagger`, which itself depends on Tailwind 3. The owner accepted these 5 high findings (12 October 2026) until the Tailwind upgrade planned in Phase 6.

## Project layout

```
src/
  pages/            one file per route (all loaded on demand)
  components/       app components; components/ui is generated shadcn/ui
  contexts/         auth context
  services/api.ts   the only place that calls the backend
  lib/              helpers
docs/               build guide and UX standards
```

## Working on Raqib

Read [`CLAUDE.md`](CLAUDE.md), [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) and [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) before changing screens.

- **Roles:** role-aware UI uses `can(role, capability)` from `src/lib/permissions.ts`, a mirror of the backend role matrix (backend `docs/SECURITY_SETUP.md` §8; keep both in step). The server enforces every rule; the UI only hides what a role cannot use. Pages read the role with `usePermissions()` and pass props such as `readOnly`, `canManage`, `canGenerate` or `audience` to components. The role comes from the current access token (`src/lib/session.ts`), the one the server reads, so a role an admin changes reaches the screens with the next token refresh (at most 15 minutes) without signing in again; `AuthProvider` then drops every cached response, because the API answers donor viewers in another shape. Missing or unknown roles get nothing (the donor view), and donor viewers never see beneficiaries' personal data or unreviewed AI output.
- **Reports to donors:** every report starts as a draft that only staff see. The reports list (project Reports tab and the Reports page) shows staff each report's status as text and icon (Draft / Published to donors). Each finished report opens in a reading view (`ReportReader`) that shows its AI-written narrative in a sandboxed frame (no scripts, no network requests: `reportFrameDocument` in `src/lib/reports.ts`), labelled "AI written — review before publishing" while it is a draft. Org admins and platform admins (`report.publish`) publish only from that view, once the text is on screen, after a confirmation that says what donors will see; they can unpublish from the row or the view (`PATCH /api/reports/:id/publish` and `/unpublish`, `src/hooks/useReports.ts`). Donor viewers receive published reports only and read them in the same view. Staff generate a report with a title, type, donor format and optional period (`GenerateReportDialog`, react-hook-form with the zod schema in `src/lib/reportForm.ts`).
- **Sign-in and passwords:** `/` is the sign-in screen (nothing pre-filled; `autocomplete` set for password managers) with "Forgot password?" on the same card; `/login`, the address in older invitation emails, redirects there. The Forgot password form always answers with the same message whatever the server knows, so it never tells who has an account; while email is off (`VITE_EMAIL_ENABLED`) it says instead that reset by email is not available yet and to ask the organisation's admin. The "password changed" notice after a reset is shown once (cleared from the history state, announced, focus on the heading), and a reset ends any session the browser had. `/reset-password?token=…` (the emailed link, no sign-in) moves the token out of the address bar into the history state at once, asks for the new password twice, and sends the user to sign in with a notice; an invalid, expired or used link says so and offers a new one. Settings has Change password for every role; the server ends the account's other sessions and this one continues with the token pair it returns. The rules mirror the backend policy (`src/lib/passwordPolicy.ts`: 10 to 200 characters in their Unicode NFC form, not the current password, not the email's local part, at least 4 different characters, not a common password and not the product's or organisation's name, with the same 118-entry list as the server) and the server's refusals are shown from their `code` in English or Arabic, never as the server's English text. Every password field has a "Show password" toggle. The screens before sign-in set `<html lang dir>` and the page title in the chosen language, and their language switch has 44 px targets. Calls before sign-in (`login`, `forgotPassword`, `resetPassword`) send no token and pass a 401 on to the screen instead of signing out. A signed-in call that gets 401 refreshes once and sends the request again: only a refused refresh or a second 401 signs the user out; any other answer (400, 403, 409…) reaches the screen, and a refresh that is rate limited (429), fails on the server or gets no answer keeps the session and says to try again. The screens before sign-in follow the browser's language and have an English / Arabic switch.
- **Temporary passwords:** org admins and platform admins invite users and reset another member's password (Settings → Team members; `users.resetPassword` and `canResetPasswordOf` in `src/lib/permissions.ts`: never their own, and a platform admin's only as a platform admin), after a confirmation. While email is off, or when the email failed, the API returns the temporary password once (`temporaryPassword`). The mutation function hands it straight to `PasswordHandoverProvider` (mounted above the routes in `src/App.tsx`), so it is shown even if the admin left Settings while the request ran, and it never enters the mutation state or the query cache. `TemporaryPasswordDialog` shows it with a copy button, in groups of four for reading aloud, and the warning (shown only once; share it privately; ask them to change it after signing in). The focus starts on Copy password; a click outside and Escape do not close it; Done asks first when the password was not copied; closing or reloading the tab asks for confirmation while it is open. It is never logged or stored. With email on, the API emails a single-use link to choose a password and the screen only confirms. The Reset password row action keeps its visible label on phones.
- **Project tabs in the address:** `/projects/:id?tab=reports` opens the Reports tab (the Reports page links there; the backend's report notifications too); switching tabs updates `?tab=`.
- **Project dashboard:** `GET /api/dashboard/projects/:id/dashboard` (`useProjectDashboard`). Staff and donor viewers get the same keys; donor trends carry survey results as monthly aggregates (`surveyAggregates`, plotted by `src/lib/trends.ts`). Each indicator card's progress bar follows the backend's `indicatorProgress`: (current − baseline) / (target − baseline), also for indicators to reduce; current / target only for an output or activity count with no baseline; no bar otherwise. `src/services/api.paths.test.ts` pins the dashboard and report paths to the backend's routes.
