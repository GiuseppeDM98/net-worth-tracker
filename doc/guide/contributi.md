# Contributi esterni (PR di un contributore)

For whoever tries, accepts or integrates a contributor's pull request. Moved whole from AGENTS.md § 5 → Commands on
2026-11-17; AGENTS.md keeps a two-line stub there. Commands, the worktree junction and the session commit rules: AGENTS.md
§ Commands and WORKFLOW.md.

## Contributors' PRs

- **A trial merge of an open PR runs in a worktree, never in the main checkout** (2026-09-07): fetch `refs/pr/<N>`,
  `git merge --no-commit --no-ff`, `tsc` + area suites + eslint, `git merge --abort`. `node_modules` is a directory
  junction on Windows (`New-Item -ItemType Junction`; `cmd //c mklink` is refused), a `cp -cR` clone on macOS
  (Turbopack refuses a symlink out of the root, 2026-10-04); two at a time at most; a conflict is judged on `git
  merge-tree --write-tree`, never guessed. **Never `git worktree remove --force` a worktree that held a junction or a
  build** (2026-09-30: it emptied the main `node_modules`): drop the junction, check the path is gone, delete the
  build, remove the worktree, count `ls node_modules | wc -l`.
- **An accepted PR merged "with changes" is its diff applied, not its commits** (2026-09-07): `git apply --reject` of
  `base...head`, the session's fixes on top, one commit with the author as `Co-authored-by`, never the PR's own
  `CLAUDE.md` and draft hunks. **While a spec series is open** (2026-09-27; `doc/perf/` closed on 2026-10-08,
  `doc/mobile/` on 2026-10-17) it is crossed with the open specs (a cited line that moves, a count, a baseline, a rule the new code should follow), the
  specs amended in the same commit; it lands BEFORE a spec that rewrites the same files. Look first for the five defects
  of that day's three PRs: a sentence or number born in a component, an overflow asserted on `document`, an absence
  with no positive anchor, a hook running with its feature off, a write that does not invalidate its reader's key.
