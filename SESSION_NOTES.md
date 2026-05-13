# Session Notes — Portfolio Exposure Breakdown

**Date**: 2026-05-13
**Branch**: `claude/portfolio-exposure-breakdown-QJWJj`

## Feature

"Esposizione Portfolio" — a new collapsible section at the bottom of the Allocazione page showing cross-ETF portfolio exposure by:

- **Principali Holdings**: top 15 companies aggregated across all ETFs + direct stocks
- **Settori**: sector weights from Yahoo Finance `topHoldings.sectorWeightings`
- **Emittenti ETF**: ETF fund families/issuers from Yahoo Finance `fundProfile.family`

## New Files

| File | Purpose |
|------|---------|
| `types/exposure.ts` | TypeScript types: ExposureHolding, ExposureSector, ExposureIssuer, PortfolioExposureData |
| `lib/server/portfolioExposureService.ts` | Server-side computation: fetches Yahoo Finance quoteSummary, aggregates exposure |
| `app/api/portfolio/exposure/route.ts` | GET endpoint, auth-gated, 24h Firestore cache in `exposure-cache/{userId}` |
| `lib/hooks/usePortfolioExposure.ts` | React Query hook, enabled only when section is open (lazy) |
| `components/allocation/ExposureSection.tsx` | Collapsible card UI with 3 tabs + drill-down sources |

## Modified Files

| File | Change |
|------|--------|
| `lib/query/queryKeys.ts` | Added `portfolio.exposure` query key |
| `app/dashboard/allocation/page.tsx` | Dynamic import + `<ExposureSection userId={user.uid} />` at bottom |
| `firestore.rules` | Added `exposure-cache/{userId}` rule (read: isOwner, write: false) |

## Technical Notes

- Yahoo Finance only provides ~10 top holdings per ETF — results are approximate for diversified funds
- Cache key: `{etfCount}-{sortedTickers}-{roundedTotalValue}` — auto-invalidates on portfolio changes
- `resolveAssetValueEur()` in the service mirrors `calculateAssetValue()` from `assetService.ts` (can't import client SDK server-side)
- Sector labels mapped to Italian in `SECTOR_LABELS` constant
- Direct equity stocks contribute 100% of their value as company exposure
- Non-equity assets (bonds, cash, real estate, crypto) are excluded from company/sector analysis but included in `totalAssets` count
- Country breakdown deferred to v2 (requires JustETF or paid data feed)

## Known Limitations

- Top ~10 holdings per ETF only (Yahoo Finance API limitation)
- No country/geographic exposure (v2)
- ETF tickers that Yahoo Finance does not recognise are silently skipped

---

## Follow-up — JustETF v2 spec (same session)

- **Cosa**: created `docs/justetf-exposure-v2-spec.md`, a 17-section implementation specification for adding geographic (country) and currency exposure tabs to the Esposizione Portfolio section, sourced from JustETF scraping by ISIN. Includes architecture diagram, concrete cheerio selectors, per-ISIN Firestore cache layout, feature flag (`NEXT_PUBLIC_JUSTETF_SCRAPING_ENABLED`), 5-phase rollout, and a self-contained Claude Code prompt for each phase so it can be implemented one phase per session.
- **Perché**: the original Reddit user request explicitly asked for country and ETF-issuer exposure. Issuer was solved in v1 via Yahoo Finance `fundProfile.family`. Country/currency require a different data source — Yahoo Finance does not expose them for ETFs. JustETF is the only public source with reliable Italian-market coverage. Spec-first keeps the implementation discussion separate from the v1 PR.
- **Nota**: JustETF's terms forbid automated scraping, so the spec requires a feature flag (default `false`) and a visible "personal use" disclaimer. For any future public SaaS deployment, replace with a licensed feed (Morningstar / Refinitiv).

---

## Follow-up — explicit calculation drill-down (same session)

- **Cosa**: added per-row transparency about how each aggregated exposure value was computed. (1) Chevron affordance on every expandable row across all three tabs — previously rows in Holdings and Emittenti were already clickable but had no visual cue. (2) New formula renderer "X% di €Y = €Z" in Holdings and Settori drill-downs, with a "Totale" footer line when there are 2+ sources. (3) Added the missing drill-down to the Settori tab (sources were already in the data, just not rendered). (4) New helper components `SourceFormulaLine` and `ExpandableRow` shared across the three lists.
- **Perché**: a financial app must let the user verify the math. Without the drill-down/formula, the percentages on the dashboard read like a black box, which erodes trust. The chevron affordance fixes a discoverability bug — the v1 had click-to-expand on Holdings and Issuers, but users could not tell rows were interactive.
- **Nota**: `sectorWeight` and `assetValueEur` were added to the source types as **optional**, so v1 cached documents without these fields degrade gracefully (only show the contribution amount, no formula). For direct stocks where `holdingPct === 1`, the formula is intentionally suppressed (`100% di X = X` is redundant).

---

## Follow-up — fix the Aggiorna button (same session)

- **Cosa**: the API route now accepts `?force=true` to bypass the Firestore cache read (while still writing the recomputed result back). The hook exposes a new `refresh()` callback that arms a `forceRef` consumed by the next queryFn call. The Aggiorna button in `ExposureSection` calls `refresh()` instead of React Query's plain `refetch()`.
- **Perché**: in v1 the Aggiorna button only triggered React Query's `refetch()`, which re-hit the endpoint but received the same cached document when the cacheKey (etfCount + tickers + rounded total value) was unchanged. After the drill-down feature added new source fields, existing cached docs lacked those fields and users could not see the formula until either the portfolio changed or the 24h TTL expired. The fix removes that friction for any future schema change too.
- **Nota**: `force=true` only bypasses the **read** path; the **write** still happens, so the next non-forced visit benefits from the freshly recomputed cache. Performance impact: zero on normal flows, ~2–4s extra latency on explicit refresh (Yahoo Finance fetch time for all ETFs in parallel).
