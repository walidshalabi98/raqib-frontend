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

Sign in with a seeded demo account from the backend, for example `admin@momentumlabs.ps` / `admin123` (development only).

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

## Deployment (Vercel)

`vercel.json` routes every path to the app and sends security headers, including a Content-Security-Policy. `connect-src` currently allows any `https:` host. Once the production API address is fixed, replace `https:` with that address.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on `main`: install, lint, typecheck, tests, build, a check that the main bundle stays under 500 kB, and `npm audit --audit-level=critical`.

Known audit findings: Tailwind 3 depends on `chokidar`/`micromatch`/`braces`, and no patched version of `braces` exists. These are build-time tools and are not shipped to browsers. Removing them means moving to Tailwind 4 and dropping `lovable-tagger`, which itself depends on Tailwind 3. The owner accepted these 5 high findings (12 October 2026) until the Tailwind upgrade planned in Phase 6.

## Project layout

```
src/
  pages/            one file per route (lazy-loaded except Login)
  components/       app components; components/ui is generated shadcn/ui
  contexts/         auth context
  services/api.ts   the only place that calls the backend
  lib/              helpers
docs/               build guide and UX standards
```

## KPI Assistant (Phase 4)

The KPI Assistant suggests indicators for the results chain (spec: `raqib-backend/knowledge/kpi-assistant-spec.md` Part A). It lives on the project's **M&E Framework** tab, inside the results chain panel:

- **Suggest KPIs** in the panel header (all results) and on each goal, outcome and output row. Activities get no button.
- Suggestions appear as cards under their result. **Accept**, **Edit & accept** (the indicator form, pre-filled from the suggestion; only the fields you change are sent), **Reject** (pick a reason, then confirm) and **Show alternatives**.
- After you add a goal, outcome or output, a prompt offers suggestions for it. Nothing is sent to the AI until you click; **Not now** hides the prompt for this session.
- Each result's indicator count opens its indicators, with their source, the AI label and a quality badge. An indicator with quality problems offers **Show alternatives**.
- The indicator table has a **Source** column. AI-made indicators keep the "AI suggested — review before approval" label until an org admin approves that indicator; approving the framework does not remove it. Org and platform admins get an **Approve** button on unapproved indicators once the framework is approved or active.
- **Request alternative** in the AI KPI Builder review step uses the same assistant. The alternatives appear on the framework tab; the toast's **Open the framework** link opens it directly (`/projects/:id?tab=me-framework`; any project tab can be opened with `?tab=`).
- Donor viewers see none of the KPI Assistant UI.
- Without an Anthropic API key on the backend, the panel says AI suggestions are not set up and the buttons stay visible but disabled. You can still add indicators by hand or from the library.

Code: `src/components/kpi/` (cards, progress, provider), `src/hooks/useKpiSuggestions.ts` and `useKpiAssistant.ts`, `src/lib/kpiSuggestions.ts` (pure helpers), `src/components/project/ResultsChainPanel.tsx` and `ResultIndicatorList.tsx`. Toast messages are written in the user's language. The global toaster does not set `dir` yet, so an Arabic toast is laid out left-to-right; that fix is planned for Phase 6. The KPI components have axe checks in English and Arabic (`src/components/kpi/KpiAccessibility.test.tsx`, `axe-core`; colour contrast is checked on the screenshots, which jsdom cannot do). Screenshots in English and Arabic at 375 px and 1440 px go in `docs/screenshots/phase4/` with the pull request.

## Working on Raqib

Read [`CLAUDE.md`](CLAUDE.md), [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) and [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) before changing screens.

- **Roles:** role-aware UI uses `can(role, capability)` from `src/lib/permissions.ts`, a mirror of the backend role matrix (backend `docs/SECURITY_SETUP.md` §8; keep both in step). The server enforces every rule; the UI only hides what a role cannot use. Pages read the role with `usePermissions()` and pass props such as `readOnly`, `canManage`, `canGenerate` or `audience` to components. The role comes from the current access token (`src/lib/session.ts`), the one the server reads, so a role an admin changes reaches the screens with the next token refresh (at most 15 minutes) without signing in again; `AuthProvider` then drops every cached response, because the API answers donor viewers in another shape. Missing or unknown roles get nothing (the donor view), and donor viewers never see beneficiaries' personal data or unreviewed AI output.
