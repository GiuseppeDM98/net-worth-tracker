# Household Scope Rules

Household mode is optional and must preserve single-user behavior when disabled.

- Use `useHouseholdScopeFilter()` for page-level household filters.
- The returned `scope` object is memoized by `selectedScopeKey`; do not replace it with fresh inline `{ kind, id }` objects in dependency arrays.
- Keep unscoped pages on their fast default data path. Do not fetch full assets/expenses/snapshots just in case scoped household reporting might be used; gate heavy collections behind `householdEnabled && isScoped`.
- Prefer `useMemo` for scoped derived data such as filtered assets, expenses, snapshots, dividends, transfers, and performance metrics.
- Avoid `useEffect + setState` for scoped data unless synchronizing with an external system.
- Components receiving scoped collections must call hooks before empty-data returns; a participant/profile can legitimately have zero assets or chart rows.
- Snapshot, PDF, email, and AI-context paths must preserve saved household split metadata instead of recomputing historical splits from current settings only.
