# CLAUDE.md - Net Worth Tracker

This file is Claude Code's short project entrypoint. Operational implementation
rules are shared with Codex in [AGENTS.md](AGENTS.md). Durable context lives in:

- [docs/project-status.md](docs/project-status.md)
- [docs/agent-memory.md](docs/agent-memory.md)
- [SETUP.md](SETUP.md)
- [.claude/rules](.claude/rules)

Keep this file compact so Caliber can refresh it safely.

## Project Snapshot

Net Worth Tracker is a Next.js 16 + React 19 app for Italian investors. Core
areas live in `app/dashboard/*`, `app/api/*`, `components/*`, `lib/services/*`,
`lib/server/*`, `lib/utils/*`, `types/*`, `contexts/*`, and `public/*`.

## Stack And Integrations

- `next`, `react`, `typescript`, `tailwindcss`, `postcss`
- `firebase`, `firebase-admin`, Firestore rules in `firestore.rules`
- `@tanstack/react-query`, `recharts`, `@nivo/sankey`, `framer-motion`
- `@anthropic-ai/sdk`, `yahoo-finance2`, `cheerio`, Frankfurter FX API
- `vitest`, `eslint`, `zod`, `react-hook-form`, shadcn/ui in `components/ui/*`

## Architecture

- App Router pages: `app/page.tsx`, `app/layout.tsx`, `app/dashboard/*`
- Public auth pages: `app/login/page.tsx`, `app/register/page.tsx`
- Server routes: `app/api/*`, with Firebase auth in `lib/server/apiAuth.ts`
- Firebase client/admin setup: `lib/firebase/config.ts`, `lib/firebase/admin.ts`
- Domain services: `lib/services/*`, server-only orchestration in `lib/server/*`
- Shared domain types: `types/*.ts`
- Test suite: `__tests__/*.test.ts`, configured by `vitest.config.ts`

## Working Rules

- User-facing strings stay Italian; code comments stay English.
- Use `desktop:` for 1440px breakpoints; do not introduce `lg:`.
- Use `formatCurrency()`, `formatDate()`, and `dateHelpers.ts` for dates.
- Keep settings synchronized across types, getters, and setters.
- Prefer `useMemo` for derived data; avoid `useEffect + setState` for computed collections.
- Do not revert unrelated changes or touch `Draft Release Temp.md` / `Temp.md`.
- Private `app/api/*` routes must verify Firebase UID server-side.
- Cron routes must check `Authorization: Bearer ${process.env.CRON_SECRET}`.

## Commands

```bash
npm.cmd test -- --run __tests__/householdUtils.test.ts
npm.cmd test -- --run __tests__/assistantRoutes.test.ts
npm.cmd test
```

```bash
npx tsc --noEmit
npm.cmd run build
```

```bash
git diff --check
npm.cmd run lint
```

## Focus Areas

- Household ownership flows: `types/household.ts`, `lib/utils/householdUtils.ts`, `components/household/*`
- Assistant flows: `app/api/ai/assistant/*`, `lib/server/assistant/*`, `components/assistant/*`
- Snapshot and pricing flows: `app/api/portfolio/snapshot/*`, `app/api/prices/*`, `lib/helpers/priceUpdater.ts`
- Dividend flows: `app/api/dividends/*`, `lib/server/dividendUseCase.ts`, `lib/server/dividendProcessor.ts`
- Performance flows: `app/api/performance/*`, `lib/services/performanceService.ts`
- PDF export: `components/pdf/*`, `lib/services/pdfDataService.ts`, `lib/utils/pdfGenerator.tsx`

## Verification Notes

- Use the smallest matching test first from `__tests__/*`.
- Broaden to `npm.cmd test`, then `npx tsc --noEmit`, then `npm.cmd run build`.
- For docs-only edits, `git diff --check` is enough.
- `npm.cmd run lint` may still show repo-wide historical issues.

<!-- caliber:managed:pre-commit -->
## Before Committing

**IMPORTANT:** Before every git commit, you MUST ensure Caliber syncs agent configs with the latest code changes.

First, check if the pre-commit hook is already installed:
```bash
grep -q "caliber" .git/hooks/pre-commit 2>/dev/null && echo "hook-active" || echo "no-hook"
```

- If **hook-active**: the hook handles sync automatically — just commit normally. Tell the user: "Caliber will sync your agent configs automatically via the pre-commit hook."
- If **no-hook**: run Caliber manually before committing:
  1. Tell the user: "Caliber: Syncing agent configs with your latest changes..."
  2. Run: `caliber refresh && git add CALIBER_LEARNINGS.md CLAUDE.md .claude/ AGENTS.md .agents/ 2>/dev/null`
  3. After it completes, briefly tell the user what Caliber updated. Then proceed with the commit.

**Valid `caliber refresh` options:** `--quiet` (suppress output) and `--dry-run` (preview without writing). Do not pass any other flags — options like `--auto-approve`, `--debug`, or `--force` do not exist and will cause errors.

**`caliber config`** takes no flags — it runs an interactive provider setup. Do not pass `--provider`, `--api-key`, or `--endpoint`.

If `caliber` is not found, tell the user: "This project uses Caliber for agent config sync. Run /setup-caliber to get set up."
<!-- /caliber:managed:pre-commit -->

<!-- caliber:managed:learnings -->
## Session Learnings

Read `CALIBER_LEARNINGS.md` for patterns and anti-patterns learned from previous sessions.
These are auto-extracted from real tool usage — treat them as project-specific rules.
<!-- /caliber:managed:learnings -->

<!-- caliber:managed:model-config -->
## Model Configuration

Recommended default: `claude-sonnet-4-6` with high effort (stronger reasoning; higher cost and latency than smaller models).
Smaller/faster models trade quality for speed and cost — pick what fits the task.
Pin your choice (`/model` in Claude Code, or `CALIBER_MODEL` when using Caliber with an API provider) so upstream default changes do not silently change behavior.

<!-- /caliber:managed:model-config -->

<!-- caliber:managed:sync -->
## Context Sync

This project uses [Caliber](https://github.com/caliber-ai-org/ai-setup) to keep AI agent configs in sync across Claude Code, Cursor, Copilot, and Codex.
Configs update automatically before each commit via `caliber refresh`.
If the pre-commit hook is not set up, run `/setup-caliber` to configure everything automatically.
<!-- /caliber:managed:sync -->
