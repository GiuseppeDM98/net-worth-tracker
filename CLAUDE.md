# CLAUDE.md - Net Worth Tracker

This file is Claude Code's short project entrypoint. Operational implementation
rules are shared with Codex in [AGENTS.md](AGENTS.md). Durable context lives in:

- [docs/project-status.md](docs/project-status.md)
- [docs/agent-memory.md](docs/agent-memory.md)
- [SETUP.md](SETUP.md)
- [.claude/rules](.claude/rules)

Net Worth Tracker is a Next.js 16 + React 19 app for Italian investors. Core
areas live in `app/dashboard/*`, `app/api/*`, `components/*`, `lib/services/*`,
`lib/server/*`, `lib/utils/*`, `types/*`, `contexts/*`, and `public/*`.

## Stack And Integrations

- `next`, `react`, `typescript`, `tailwindcss`, `postcss`
- `firebase`, `firebase-admin`, Firestore rules in `firestore.rules`
- `@tanstack/react-query`, `recharts`, `@nivo/sankey`, `framer-motion`
- `@anthropic-ai/sdk`, `yahoo-finance2`, `cheerio`, Frankfurter FX API, FRED API
- `vitest`, `eslint`, `zod`, `react-hook-form`, shadcn/ui in `components/ui/*`

## Architecture

- App Router pages: `app/page.tsx`, `app/layout.tsx`, `app/dashboard/*`
- Public auth pages: `app/login/page.tsx`, `app/register/page.tsx`
- Server routes: `app/api/*`, with Firebase auth in `lib/server/apiAuth.ts`
- Firebase client/admin setup: `lib/firebase/config.ts`, `lib/firebase/admin.ts`
- Domain services: `lib/services/*`, server-only orchestration in `lib/server/*`
- Shared domain types: `types/*.ts`
- Test suite: `__tests__/*.test.ts`, configured by `vitest.config.ts`
- Shared dashboard layout: `components/layout/PageContainer.tsx`,
  `components/layout/PageHeader.tsx`, `components/layout/PageTabBar.tsx`,
  `components/layout/PageTabs.tsx`, `components/layout/ThemePicker.tsx`
- Navigation constants: `lib/constants/navigation.ts`

## Working Rules

- User-facing strings stay Italian; code comments stay English.
- Use `desktop:` for 1440px breakpoints; do not introduce `lg:`.
- Use `formatCurrency()`, `formatDate()`, and `dateHelpers.ts` for dates.
- Keep private API routes authenticated server-side.
- Keep settings fields synchronized across types, getters, setters, and UI.
- Preserve household scope behavior and unified cashflow movement workflows.
- Do not remove Caliber-managed sections from `AGENTS.md`.

## Current Status

Read [docs/project-status.md](docs/project-status.md) for active features and
recent architecture notes, including the dashboard shell/navigation refactor,
standalone Analisi page, assistant target-allocation context, household scoped
views, unified cashflow movements, and benchmark comparison workflows.
