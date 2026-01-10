# AI Agent Guidelines - Net Worth Tracker (Lean)

Project-specific conventions and recurring pitfalls for Net Worth Tracker.
For architecture and status, see [CLAUDE.md](CLAUDE.md).

---

## Critical Conventions

### Italian Localization
- All user-facing text in Italian
- Use `formatCurrency()` for EUR formatting (e.g. €1.234,56)
- Use `formatDate()` for DD/MM/YYYY format
- **All code comments in English only**

### Firebase Date Handling
- Always use `toDate()` from `lib/utils/dateHelpers.ts`
- API responses serialize Firestore Timestamps as ISO strings
- Never use manual `instanceof Date` checks on API data

### Custom Tailwind Breakpoint
- Use `desktop:` (1025px) instead of `lg:` (1024px)
- Define in `app/globals.css` with `@theme inline`

---

## Key Patterns

### React Query Cache Invalidation
Invalidate all related caches (direct + indirect) after mutations.
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
}
```

### Lazy-Loading Tabs (mountedTabs)
Never remove from `mountedTabs` once added to preserve state.

### Date Range Queries (Firestore)
End date must include full day:
```typescript
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
```

### Asset Price History %
For assets with `price === 1` or `displayMode === 'totalValue'`, compute % using total value.

### Borsa Italiana Scraper
- ETF and Stock tables have different structures
- Pass `assetType` to `scrapeDividendsByIsin(asset.isin, asset.type)`

### Currency Conversion (Dividends)
- Use `currencyConversionService.ts` (Frankfurter API)
- Cache 24h and store `exchangeRate` for audit

### Chart Y Axis
Use `formatCurrencyCompact()` for Y axis labels on mobile to avoid layout compression.

---

## Common Errors to Avoid

### Date Range Query Errors
**Sintomo**: Manca l'ultimo giorno nei risultati Firestore
**Causa**: `new Date(year, month, 0)` taglia dopo mezzanotte
**Soluzione**:
```typescript
const endDate = new Date(year, month, 0, 23, 59, 59, 999);
```
**Prevenzione**: Sempre includere `23, 59, 59, 999` per fine periodo

### React Query Incomplete Cache Invalidation
**Sintomo**: UI mostra dati stale dopo una mutation
**Causa**: Invalidazione solo della cache diretta
**Soluzione**:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(userId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
}
```
**Prevenzione**: Traccia API -> Firestore -> cache e invalida tutte le dipendenze

### Firestore setDoc Data Loss
**Sintomo**: Campi scompaiono dopo save parziali
**Causa**: `setDoc()` senza `{ merge: true }`
**Soluzione**:
```typescript
await setDoc(docRef, payload, { merge: true });
```
**Prevenzione**: Usa merge per ogni update parziale

---

## Key Files
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`
- Asset history utils: `lib/utils/assetPriceHistoryUtils.ts`
- Performance service: `lib/services/performanceService.ts`
- Currency conversion: `lib/services/currencyConversionService.ts`
- Query keys: `lib/query/queryKeys.ts`

**Last updated**: 2026-01-10
