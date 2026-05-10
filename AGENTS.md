# AI Agent Guidelines - Net Worth Tracker

This is the shared entrypoint for Codex, Claude Code, and Caliber-generated
agent context. Keep this file concise. Durable project knowledge lives in:

- [docs/agent-memory.md](docs/agent-memory.md)
- [docs/project-status.md](docs/project-status.md)
- [.claude/rules](.claude/rules)
- [SETUP.md](SETUP.md)

When a change affects durable guidance, update the docs above first, then keep
`AGENTS.md` as the short summary.

## Source Of Truth

- Treat `AGENTS.md` as the shared operational entrypoint for implementation,
  tests, localization, git hygiene, and recurring pitfalls.
- Treat `CLAUDE.md` as Claude Code's project entrypoint.
- Read `docs/agent-memory.md` for durable operational memory.
- Read `docs/project-status.md` for architecture and current feature status.
- If files conflict, prefer `AGENTS.md` / `docs/agent-memory.md` for how to
  work and `CLAUDE.md` / `docs/project-status.md` for what currently exists.

## Non-Negotiables

- User-facing text is Italian; code comments are English only.
- Use `desktop:` for the 1440px Tailwind breakpoint; do not introduce `lg:`.
- Use `formatCurrency()`, `formatDate()`, and `dateHelpers.ts` helpers.
- Keep settings fields synchronized across types, getters, and setters.
- Prefer `useMemo` for derived collections; avoid `useEffect + setState`.
- Private `app/api/*` routes must verify Firebase UID server-side.
- Cron routes must validate `Authorization: Bearer ${process.env.CRON_SECRET}`.
- Do not revert unrelated user changes or touch `Draft Release Temp.md` / `Temp.md`.

## Core Areas

- App Router: `app/page.tsx`, `app/layout.tsx`, `app/dashboard/*`
- APIs: `app/api/*`, especially `app/api/ai/assistant/*`, `app/api/dividends/*`, `app/api/portfolio/snapshot/*`
- Services: `lib/services/*`, `lib/server/*`, `lib/helpers/priceUpdater.ts`
- Types: `types/*`
- Tests: `__tests__/*.test.ts` with `vitest.config.ts`

## Workflow Skills

Codex does not automatically load repo-local skills. Treat `.agents/skills/*`
as workflow playbooks: when a task matches one of these areas, read the matching
`SKILL.md` before changing code. `.claude/skills/*` mirrors the same workflows
for Claude Code.

- API auth / private routes: `.agents/skills/api-auth-routes/SKILL.md`
- Vitest route tests: `.agents/skills/vitest-route-testing/SKILL.md`
- Dividends, coupons, snapshots, and snapshot routes:
  `.agents/skills/dividend-and-snapshot-workflows/SKILL.md`
- Assistant SSE streaming, thread state, memory, and prompt context:
  `.agents/skills/assistant-streaming/SKILL.md`
- Caliber setup or missing Caliber binary:
  `.agents/skills/setup-caliber/SKILL.md`
- Searching available workflow guidance:
  `.agents/skills/find-skills/SKILL.md`

Do not duplicate skill content into `AGENTS.md`; keep this file as a short index
and update the skill file itself when the detailed workflow changes. Keep the
`.agents/skills` and `.claude/skills` copies aligned.

## Commands

```bash
npm.cmd test -- --run __tests__/assistantRoutes.test.ts
npm.cmd test -- --run __tests__/apiAuthRoutes.test.ts
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

## Verification

- Start with the narrowest `__tests__/*` file related to the change.
- Broaden to `npm.cmd test`, then `npx tsc --noEmit`, then `npm.cmd run build`.
- For docs-only edits, `git diff --check` is the minimum useful check.
- `npm.cmd run lint` may still report historical repo issues.

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
  2. Run: `caliber refresh && git add CLAUDE.md .claude/ .cursor/ .cursorrules .github/copilot-instructions.md .github/instructions/ AGENTS.md CALIBER_LEARNINGS.md .agents/ .opencode/ 2>/dev/null`
  3. After it completes, briefly tell the user what Caliber updated. Then proceed with the commit.

**Valid `caliber refresh` options:** `--quiet` (suppress output) and `--dry-run` (preview without writing). Do not pass any other flags — options like `--auto-approve`, `--debug`, or `--force` do not exist and will cause errors.

**`caliber config`** takes no flags — it runs an interactive provider setup. Do not pass `--provider`, `--api-key`, or `--endpoint`.

If `caliber` is not found, read `.agents/skills/setup-caliber/SKILL.md` and follow its instructions to install Caliber.
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
If the pre-commit hook is not set up, read `.agents/skills/setup-caliber/SKILL.md` and follow the setup instructions.
<!-- /caliber:managed:sync -->
