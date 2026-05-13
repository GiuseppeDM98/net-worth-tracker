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
