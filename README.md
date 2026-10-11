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

Known audit findings: Tailwind 3 depends on `chokidar`/`micromatch`/`braces`, and no patched version of `braces` exists. These are build-time tools and are not shipped to browsers. Removing them means moving to Tailwind 4 and dropping `lovable-tagger`, which itself depends on Tailwind 3.

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

## Working on Raqib

Read [`CLAUDE.md`](CLAUDE.md), [`docs/BUILD_GUIDE.md`](docs/BUILD_GUIDE.md) and [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) before changing screens.
