# CLAUDE.md — raqib-frontend

Raqib is an M&E (monitoring and evaluation) platform for NGOs, INGOs and consultancies in Palestine and the region. This repo is the web app. The API, worker and AI engine live in `raqib-backend`.

## Read first

- `docs/BUILD_GUIDE.md` — the phased plan (same file as in the backend repo).
- `docs/UX_STANDARDS.md` — how every screen must look and behave.
- From the backend repo when building AI-related UI: `knowledge/kpi-assistant-spec.md` (§A7 UI, §B5 UI) and `knowledge/me-foundations.md` §1 (glossary text).

## Stack

Vite · React 18 · TypeScript · Tailwind · shadcn/ui (Radix) · TanStack Query · React Router · react-hook-form + zod · Recharts · Leaflet · Vitest · Playwright. Originally generated with Lovable.

## Commands

```bash
npm ci
npm run dev        # http://localhost:5173 ; set VITE_API_URL to the backend (default http://localhost:3001/api)
npm run build
npm run typecheck  # tsc -p tsconfig.app.json --noEmit (add in Phase 1 if missing)
npm run lint
npm test           # Vitest
npx playwright test
```

## Rules

1. **All API calls go through `src/services/api.ts`** and are used via TanStack Query hooks. No `fetch` in components.
2. **No hard-coded UI strings or colours.** Strings live in `src/i18n/en.json` and `src/i18n/ar.json`; colours and spacing come from design tokens.
3. **Arabic and RTL are first-class.** Use logical properties (`ms-/me-/ps-/pe-/start-/end-`); test every screen in both languages and attach screenshots of both to UI pull requests.
4. **Accessibility:** WCAG 2.2 AA. Labels on every input, keyboard navigation, status shown with text + icon, not colour alone. axe checks must pass.
5. **AI content is labelled** ("AI suggested — review before approval") until approved by an org admin.
6. **Never store tokens anywhere but the existing auth flow**; never log personal data to the console.
7. **Mobile:** data entry and dashboards must work at 375 px.
8. **Mock data** (`src/data/mockData.ts`) is for label constants only; move those constants to `src/lib/constants.ts` and delete the rest.
9. **Definition of done:** build, typecheck, lint and tests pass; empty/loading/error states designed; both languages checked; PR describes what, why and how tested.
