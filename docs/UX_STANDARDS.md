# Raqib — UX Standards

Version 1.0 · October 2026 · Applies to every screen in `raqib-frontend`

The goal: an M&E officer who has never seen Raqib can set up a project, get good KPIs and enter data without training, in English or Arabic, on a laptop or a phone.

## 1. Users and their main jobs

| User | Main jobs | Screens they live in |
|---|---|---|
| M&E officer | Build framework, choose KPIs, enter/import data, prepare reports | Project setup, Framework, Data entry, Reports |
| Programme manager / org admin | Approve, watch progress, act on alerts | Dashboard, Framework (review), Insights |
| Donor viewer | Read approved results | Read-only project view, Reports |
| Consultant (assessments) | Run baseline/midterm/endline | Assessments pipeline |

Design every screen for the main job of its main user. Everything else goes in secondary menus.

## 2. Information architecture

```
Dashboard (portfolio)          ← default after login
Projects
  └ Project
      ├ Overview (scorecard, trends, Attention needed)
      ├ Framework (results tree + indicators + Suggest KPIs)
      ├ Data (entry, import, history)
      ├ Assessments
      ├ Qualitative
      ├ Beneficiaries
      └ Reports
Insights (all open alerts)
Indicator library (browse standards)
Settings (organisation, users, integrations, language)
```

Keep the left sidebar to these items. Project sub-navigation uses tabs.

## 3. Key flows

**First run (new organisation):** Welcome → organisation profile (name EN/AR, type, logo) → "Create your first project" with two paths: "Upload a proposal or logframe" (recommended) or "Start from a sector template". Show a three-step progress bar.

**Project setup:** Basics → Documents → Results chain (editable tree; AI draft clearly labelled) → KPIs (Suggest KPIs per result; accept/edit/reject cards) → Baselines & targets ("pending baseline" allowed, with a planned date) → Data plan (owner, method, frequency per indicator, generated from the indicators) → Review & approve. Save on every step; allow leaving and resuming.

**Weekly use:** Dashboard → "Attention needed" → act in one click (Add data, Set baseline, Suggest KPIs, Acknowledge).

## 4. Visual system

- **Design tokens** in `tailwind.config.ts` and CSS variables only; no hard-coded hex values in components. Decide the brand (Raqib's own palette, or Momentum Labs: red #EE2530, salmon #F8D6D0, navy) and set tokens once.
- **Typography:** the current font (DM Sans) has no Arabic glyphs. Add an Arabic font such as IBM Plex Sans Arabic or Noto Sans Arabic and apply it when `lang="ar"`. Body 15–16 px, line height 1.5 (1.7 for Arabic).
- **Spacing:** 4-px scale; generous white space around data tables.
- **Status colours** (always paired with icon and text):

| Status | Label EN | Label AR | Icon |
|---|---|---|---|
| on_track | On track | على المسار | check-circle |
| at_risk | At risk | معرّض للخطر | alert-triangle |
| off_track | Off track | خارج المسار | x-circle |
| not_started | Not started | لم يبدأ | circle |
| no_data | No recent data | لا توجد بيانات حديثة | clock |

- **Charts:** trend line with target line and baseline marker; label the latest value directly; avoid pie charts for more than three categories; disaggregation as small multiples or stacked bars with a legend that works in RTL.

## 5. Components and patterns

- **Indicator card:** name, level badge, standard badge (e.g., "EU GERF 2.38") or "Custom", quality badge, status, latest value vs target, sparkline.
- **KPI suggestion card:** see `knowledge/kpi-assistant-spec.md` §A7 (backend repo). Actions: Accept, Edit & accept, Reject (reason chips), Alternatives.
- **Glossary popover:** dotted underline on M&E terms; definitions come from `me-foundations.md` §1 (backend repo), in both languages.
- **Empty states:** illustration-free, one sentence of explanation, one primary button ("Upload your proposal", "Add your first data point").
- **Loading:** skeletons shaped like the content; AI tasks show named progress steps and an estimated time.
- **Errors:** human sentence + what to do ("We couldn't read this PDF. Try a Word file or a text-based PDF.").
- **Destructive actions:** confirm with the item name; offer undo for 10 seconds where possible.
- **Tables:** sticky header, sortable columns, row actions in a menu, export button; switch to cards under 640 px.

## 6. Language and right-to-left

- All strings in `src/i18n/en.json` and `src/i18n/ar.json` (use `react-i18next` or similar). No literal UI strings in components.
- Set `<html lang dir>` from the user's `languagePref`. Use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) instead of left/right.
- Mirror directional icons (arrows, chevrons) in RTL; do not mirror logos, charts' time axes or numbers.
- Offer Western (0–9) or Arabic-Indic (٠–٩) digits as a setting; default to Western digits for data tables.
- Dates: show `11 Oct 2026` / `١١ أكتوبر ٢٠٢٦` per locale; store ISO.
- Indicator names and results text have separate EN and AR fields; show the user's language with a toggle to see the other.
- Arabic copy is written in Modern Standard Arabic and reviewed by a native speaker before release.

## 7. Accessibility (WCAG 2.2 AA)

- Every input has a visible label; errors are announced (`aria-live`).
- Full keyboard use; visible focus ring; logical tab order in both directions.
- Text contrast ≥ 4.5:1; status never conveyed by colour alone.
- Touch targets ≥ 44 × 44 px on mobile.
- Charts have a text summary and a data table alternative.
- Automated axe checks in Playwright on every main page; zero serious/critical violations.

## 8. Writing style

- Short, active, plain: "Add data", "Suggest KPIs", "Set baseline".
- Explain why before asking: "Donors expect a baseline before the interim report. Add it now or set a date."
- Never blame the user. Never show raw error codes.
- Label AI content: "AI suggested — review before approval".

## 9. Performance budget

- Main bundle < 500 kB minified (route-level code splitting); map and charts loaded on demand.
- Dashboard interactive in < 3 s on a mid-range phone over 4G.
- TanStack Query: stale time 30 s for dashboards, invalidate precisely after mutations.

## 10. Review checklist for every UI pull request

- [ ] Works in English and Arabic (screenshots of both)
- [ ] Works at 375 px and 1440 px
- [ ] Keyboard-only walkthrough done
- [ ] Empty, loading and error states designed
- [ ] No hard-coded colours or strings
- [ ] axe check passes
