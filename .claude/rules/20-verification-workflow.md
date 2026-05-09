# Verification Workflow

Use targeted verification first, then broader checks when the blast radius is larger.

```powershell
npm.cmd test -- --run __tests__/householdUtils.test.ts
npm.cmd test
npm.cmd run build
```

- Household utility changes: run `__tests__/householdUtils.test.ts`.
- Budget changes: run `__tests__/budgetUtils.test.ts`.
- Performance changes: run `__tests__/performanceService.test.ts`.
- Assistant changes: run assistant route, policy, month context, thread, and memory tests.
- Broad cross-page changes: run the full Vitest suite and `npm.cmd run build`.
- `npm.cmd run lint` currently reports repo-wide historical issues; do not treat it as a clean regression signal until the baseline is fixed.
