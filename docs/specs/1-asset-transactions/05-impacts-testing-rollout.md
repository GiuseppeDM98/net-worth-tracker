# 05 — Downstream Impacts, Testing, Rollout

> Status: **✅ IMPLEMENTED (all phases A→D complete, 2026-07-23)**. The impact table (§1), the
> regression checklist (§2), and the manual test scripts (§3) were all executed against Fases B/C/D
> as written — see CLAUDE.md → Current Status and AGENTS.md → *Asset Trade Ledger — Rendimenti &
> Dividends Surfaces (Fase D)*. Kept as a reference: `docs/specs/README.md` points other specs at
> this folder's *Binding instructions* and dependency ordering, and `2-pension-fund` cites §2 of
> `01-data-model-and-rules.md` as a design precedent.

## 1. Impact table

The load-bearing property: **the asset doc keeps carrying authoritative `quantity`/`averageCost`,
rewritten by the replay on every trade mutation.** Consumers that read the asset doc or the
snapshots therefore keep working with zero changes.

### Untouched by construction (verify, don't modify)

| Surface | Why safe |
| --- | --- |
| Panoramica / `dashboardOverviewService` (topAssets returnPercent, unrealizedGains, estimatedTaxes, hasCostBasisTracking, cashNetWorth, sparkline, topMovers) | reads asset docs + snapshots; derived fields keep the same shape/meaning |
| YOC / Current Yield (`yieldOnCost.ts`) & dividend stats yields | keyed on `quantity`/`averageCost`/`holdingStartDate` — all preserved; invariant #4 protects dividend scoping |
| PDF export, TaxCalculatorModal (still a non-persisting simulator in v1), stamp duty, portfolio exposure, Patrimonio Δ columns & G/P | asset-doc readers |
| Allocazione | value via injected `valueOf` only |
| Storico / Hall of Fame / FIRE / What-If / Monte Carlo / assistant / emails | snapshot/aggregate readers only |
| TWR, portfolio IRR, snapshots, `POST /api/portfolio/snapshot`, cron phases | trades are NW-neutral; cash-flow derivation from expenses unchanged |
| Cashflow / budget / cost centers | no expense/income docs are created by trades |
| `deriveHoldingStartDates` / `attributeSelectedChange` | kept as legacy fallback for pre-ledger history; the exact-date `holdingStartDate` from the ledger simply takes precedence via the existing `asset.holdingStartDate ?? derived` pattern |

### Touched (the complete list — anything beyond this is scope creep)

| File | Change | Spec |
| --- | --- | --- |
| `types/assetTransactions.ts` | new | 01 §1 |
| `types/assets.ts` | pointer comments only on `quantity`/`averageCost` | 01 §7 |
| `firestore.rules` | +2 match blocks | 01 §3 |
| `lib/server/validation.ts` | +schemas | 01 §4 |
| `lib/utils/assetTransactionUtils.ts` | new pure engine | 02 |
| `lib/server/assetTransactionUseCase.ts`, `app/api/1-asset-transactions/*` (3 route files) | new | 03 §1-2, §4 |
| server FX helper (`resolveTradePriceEur`) | new | 01 §6 |
| `lib/services/assetService.ts` | +`updateAssetMetadata` (nothing else changes; `updateAsset` untouched) | 03 §3 |
| `lib/services/assetTransactionService.ts`, `lib/hooks/useAssetTransactions.ts`, `lib/query/queryKeys.ts` | new / +key group | 03 §5 |
| `components/assets/TransactionDialog.tsx`, `components/assets/AssetMovementsDialog.tsx` | new | 04 §2, §4 |
| `components/assets/AssetDialog.tsx` | read-only qty/PMC (edit), first-buy create flow, `updateAssetMetadata` | 04 §3 |
| `components/assets/AssetManagementTab.tsx`, `AssetCard.tsx`, `app/dashboard/assets/page.tsx` | row actions + migration trigger | 04 §1 |
| `app/dashboard/performance/page.tsx` (+ small components) | Capitale investito + Plusvalenze realizzate | 04 §5 |
| `app/api/dividends/stats/route.ts` | ledger-based totalReturnAssets with static fallback | 04 §6 |

## 2. Regression checklist (run after phases B, C, D)

1. `npx tsc --noEmit` clean.
2. Suites: `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx`, plus the
   area suites AGENTS.md prescribes when touching these zones: `apiAuthRoutes`,
   `dashboardOverviewService`, `updateCashAssetBalancesAtomic`, `yieldOnCost`, `performanceService`.
3. **YOC unchanged after migration** — the sentinel for invariant #4: pick an asset with dividends
   older than the migration date; its YOC on Rendimenti and "YOC Portafoglio" on Dividendi must be
   identical before/after migration.
4. Panoramica hero total identical before/after migration (migration writes no asset doc).
5. A buy with settlement: cash card balance drops by `qty×priceEur + fees`; Panoramica total
   unchanged (NW-neutral); savings rate in Cashflow unchanged.
6. Edit that trade moving the settlement to another account: both balances correct (aggregated
   deltas); delete: both restored.
7. Sell all → "Azzerato" badge appears; asset excluded from stamp duty and new snapshots
   (existing `quantity > 0` filters); dividends history intact.
8. Rebuy after full sell → `holdingStartDate` = rebuy date; YOC ignores pre-gap dividends
   (existing behavior, now exact-date).
9. Shared account: the delegate can register/edit trades on the owner's assets; theme untouched.
10. Demo account: ledger visible, every mutation disabled.

## 3. Manual test script for the user (end of each UI phase)

Phase C: create a test asset (create-as-first-buy) → register a second buy (check PMC weighted
average against a hand calculation) → partial sell with settlement (check realized preview vs
toast vs Movimenti row, and the cash balance) → Rettifica split ×2 (value unchanged) → edit the
second buy's price (derived PMC updates) → delete the sell (cash restored) → try selling more than
held (Italian error) → try a pre-baseline date (blocked).

Phase D: compare "Capitale investito" vs "Contributi" for the same period and confirm the Popover
copy makes the difference legible; check "Plusvalenze realizzate" year buckets against the sells
registered in Phase C; confirm a fully-sold asset appears in the per-asset return list with the
`Chiusa` chip.

## 4. Rollout order

1. Phase A (pure engine) — mergeable alone, zero user-visible change.
2. Phase B — deploy code AND `firebase deploy --only firestore:rules` together; migration is
   lazy so nothing happens until a Patrimonio visit. Verify checklist items 3-4 immediately after
   the first real migration.
3. Phase C — the feature becomes visible. This is the highest-attention review (AssetDialog
   behavior change).
4. Phase D — metrics surfaces.
5. Each phase: STOP for the user's manual test + explicit go-ahead BEFORE commit; PR to `develop`.

## 5. Documentation ritual (pre-merge, per repo workflow)

- `CLAUDE.md`: Current Status → Latest entry; Key Features addition; Key Files additions
  (respect the 40k limit, English).
- `AGENTS.md`: new section *Asset Transactions / Trade Ledger* documenting at minimum: the
  baseline-must-not-touch-`holdingStartDate` invariant, the `updateAssetMetadata` vs `updateAsset`
  `deleteField()` trap, replay-ordering tie-breaks, why writes are Admin-only, the adjustment
  no-XIRR-flow caveat.
- `README.md` feature list; `Draft Release Temp.md` release note.
- Delete `SESSION_NOTES.md` in the same pre-merge commit (single code+docs commit, then PR).

---

## 6. Implementation prompt — FASE D

> **Modello consigliato: Sonnet 5, effort alto.** Fase di superfici e documentazione; l'unica
> parte delicata è l'estensione della route dividends/stats, ampiamente specificata in 04 §6.

Prompt da incollare in una nuova sessione (prerequisiti: Fasi A+B+C mergiate):

```text
Implementa la FASE D (ultima) della feature "Registro operazioni asset" di questo repo.
Prerequisito verificabile: TransactionDialog e AssetMovementsDialog esistono e funzionano
(Fase C). Se mancano, fermati e dillo.

Contesto obbligatorio — leggi TUTTO prima di scrivere codice:
- docs/specs/1-asset-transactions/README.md
- docs/specs/1-asset-transactions/04-ui.md — SOLO §5 e §6 (il resto è già implementato)
- docs/specs/1-asset-transactions/05-impacts-testing-rollout.md — questa spec, integrale
- AGENTS.md, in particolare: "Cross-Component Metric Consistency", "Cache Schema Evolution
  Without cacheKey Bump", "Performance Page (redesign 2026-06-20)", "Layout Tokens"
- DESIGN.md per le superfici Rendimenti; COMMENTS.md e DEVELOPMENT_GUIDELINES.md applicati.

Scope ESATTO:
1. Rendimenti (04 §5): riga MetricCard "Capitale investito" (computeInvestedCapital sul PERIODO
   selezionato dalla pagina — stessi bounds, mai una finestra ricalcolata) con Popover che
   disambigua rispetto a "Contributi netti"; nuova MetricSection "Plusvalenze realizzate"
   (per anno, token di segno) dentro il Collapsible esistente; entrambe gated su
   useAssetLedgerMeta.
2. Estensione totalReturnAssets in app/api/dividends/stats/route.ts (04 §6): calcolo ledger-based
   via replayTransactions + computeAssetTotalReturn, posizioni chiuse incluse con isClosed,
   campi di risposta SOLO additivi/opzionali, fallback statico per asset senza ledger; chip
   "Chiusa" nella UI dividendi che consuma la route.
3. Checklist di regressione di questa spec §2 eseguita e riportata all'utente punto per punto.
4. Rituale documentazione di §5: CLAUDE.md (Current Status, Key Features, Key Files — inglese,
   limite 40k), AGENTS.md (nuova sezione con gli invarianti e le trappole elencate in §5),
   README.md, Draft Release Temp.md; rimozione di SESSION_NOTES.md nello stesso commit pre-merge.

Gate di uscita: npx tsc --noEmit + le suite di §2. Poi FERMATI: dimmi esplicitamente COSA e COME
testare riguardo a quanto fatto durante questa sessione (partendo dallo script di test manuale di
§3, Fase D), poi ATTENDI la conferma esplicita dell'utente prima del commit pre-merge unico
(codice + documentazione). Branch: feature/asset-transactions-fase-d; PR verso develop, mai main.
```
