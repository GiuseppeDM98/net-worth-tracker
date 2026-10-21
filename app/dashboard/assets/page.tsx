/**
 * PATRIMONIO — verdict + tile grid (2026-08-22, the first page propagated after the Panoramica)
 *
 * The page answers "cosa possiedo, e cosa si è mosso?" before it shows a number: a rule-generated
 * verdict (lib/utils/patrimonioNarrative.ts) whose driver is an INSTRUMENT, then a 12-column
 * bento, each tile one question with a one-line reading above its figures:
 *
 *   Desktop (12 col): Patrimonio(5, 2 rows) | Liquidità(3) | Movimenti(4)
 *                                           | Classi(3)    | Rendimento(4)
 *                     [Mutuo(12) — one per loan with instalments linked to it]
 *                     Strumenti(12)
 *   Below desktop:    ONE sequence, the DOM above (The First-Screen Rule; since 2026-10-14):
 *                     title → the verdict's first sentence → G/P and Liquidità as a strip → «Il
 *                     perché» → Patrimonio, open, its chips lifted and its curve at 120px → «Il
 *                     resto della pagina» → Movimenti, Liquidità, Classi, Rendimento, [Mutuo],
 *                     Strumenti as closed rows (`useMobileSections`; doc/guide/patrimonio.md
 *                     § Composizione mobile).
 *
 * The DOM order IS the reading order (Movimenti before Liquidità); the desktop row is placed by
 * `col-start`, never by a CSS `order` swap, so a screen reader and the eye meet the tiles in
 * the same sequence. The hero's count line links to the Strumenti tile (`#strumenti`) at 1440 and
 * opens its row below `desktop:`.
 *
 * Data: the overview payload (`useDashboardOverview`, shared with the Panoramica — hero,
 * variations, sparkline, composition, top assets, per-instrument market effect), the assets
 * (rows, cash accounts, unrealized gains), the snapshots (Δ columns) and the trade ledger
 * (the month's movements). Every derived number is a tested pure function in
 * lib/utils/{patrimonioSummary,assetPerformanceDeltas}.ts; the page only wires them.
 *
 * The page owns every dialog — one AssetDialog serves the header's "Aggiungi asset", the
 * Liquidità tile's "Aggiungi conto" and the table's Modifica — so a mutation invalidates the
 * assets AND the overview in one place (doc/guide/patrimonio.md § Patrimonio).
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { House, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets, useDeleteAsset } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { calculateAssetValue, calculateTotalValue } from '@/lib/services/assetService';
import { summarizeOwnership } from '@/lib/utils/assetOwnership';
import { useAssetLedgerMeta, useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { migrateAssetLedger, backfillAverageCostEur } from '@/lib/services/assetTransactionService';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { DASHBOARD_OVERVIEW_STALE_TIME_MS, useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import { cardItem, staggerContainer } from '@/lib/utils/motionVariants';
import { buildPatrimonioVerdict, describeLastPriceUpdate, formatHoldingCounts } from '@/lib/utils/patrimonioNarrative';
import { useMobileSections, type SectionSpec } from '@/lib/hooks/useMobileSections';
import { useTabletComposition, useTabletStage } from '@/lib/hooks/useTabletComposition';
import {
  COMPACT_GRID_CLASS,
  COMPACT_GRID_WRAPPER_CLASS,
  INDEX_CLASS,
  PLAIN_GRID_CLASS,
  leadCellClass,
  REST_CELL_CLASS,
  STAGE_CLASS,
  STAGE_WRAPPER_CLASS,
  VERDICT_CELL_CLASS,
} from '@/lib/utils/tabletComposition';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { liftedBlocks } from '@/lib/utils/verdictStrip';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  costBasisOf,
  describePatrimonioClosedAnswers,
  isCashAccount,
  isHeld,
  isLiquidityRow,
  PATRIMONIO_PATRIMONIO_ID,
  PATRIMONIO_SECTION_IDS,
  patrimonioMutuoSectionId,
  patrimonioVerdictNamesMarket,
  rankInstrumentReturns,
  selectPatrimonioStrip,
  resolveLastPriceUpdate,
  summarizeCashAccounts,
  summarizeMonthTrades,
  summarizeUnrealizedGains,
} from '@/lib/utils/patrimonioSummary';
import { computeAssetPerformanceDeltas, computeAssetUnitPriceSeries } from '@/lib/utils/assetPerformanceDeltas';
import { isLoanAsset, type Asset, type FamilyMember } from '@/types/assets';
import { debtBalanceOf } from '@/lib/utils/mortgageRepayment';
import { propertiesWithLegacyDebt } from '@/lib/utils/loanMigration';
import { migratePropertyDebtsToLoans } from '@/lib/services/loanMigration';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { resolveLivedCashflow } from '@/lib/utils/overviewNarrative';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS, TILE_FOOTER_ACTION_CLASS, TILE_ROW_CELL_CLASS } from '@/components/ui/tile';
import { VerdictStrip } from '@/components/ui/verdict-strip';
import { PageRest } from '@/components/ui/page-rest';
import { RowAnswers } from '@/components/ui/row-answers';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { isPatrimonioLiftedBlock, PatrimonioTile, resolveHeroValueClass, type PatrimonioLiftedBlock } from '@/components/dashboard/overview/PatrimonioTile';
import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import { IntestatariTile } from '@/components/dashboard/overview/IntestatariTile';
import type { SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { LiquiditaTile } from '@/components/assets/tiles/LiquiditaTile';
import { MovimentiTile } from '@/components/assets/tiles/MovimentiTile';
import { isAssetRendimentoLiftedBlock, RendimentoTile } from '@/components/assets/tiles/RendimentoTile';
import { MutuoTile } from '@/components/assets/tiles/MutuoTile';
import { useMortgageInstalments } from '@/lib/hooks/useMortgageInstalments';
import { summarizeMortgage } from '@/lib/utils/mortgageSummary';
import { StrumentiTile } from '@/components/assets/StrumentiTile';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { TransactionDialog } from '@/components/assets/TransactionDialog';
import { AssetMovementsDialog } from '@/components/assets/AssetMovementsDialog';
import { TaxCalculatorModal } from '@/components/assets/TaxCalculatorModal';
import { CashAccountDialog } from '@/components/assets/CashAccountDialog';
import Link from 'next/link';

/** The page's own skeleton spans — the grid above, no numbers. */
const SKELETON_CELLS = [
  { span: 5, rows: 2, lines: 8 },
  { span: 3, lines: 4 },
  { span: 4, lines: 4 },
  { span: 3, lines: 5 },
  { span: 4, lines: 5 },
  { span: 12, lines: 8 },
];

/** How many instruments the hero footer names in its "Mercato:" digest. */
const DIGEST_INSTRUMENTS = 3;

/** The rows' eyebrows, as the controller announces them (a failed read, a strip cell's «apre …»). */
const ROW_EYEBROWS = {
  movimenti: 'Movimenti del mese',
  liquidita: 'Liquidità',
  classi: 'Classi',
  rendimento: 'Rendimento',
  intestatari: 'Intestatari',
  strumenti: 'Strumenti',
} as const;

/** With the overview unread there is no verdict and no hero: the month's movements open by default. */
const OVERVIEW_FAILED_DEFAULT_OPEN: readonly string[] = [PATRIMONIO_SECTION_IDS.movimenti];
const NO_DEFAULT_OPEN: readonly string[] = [];
/** A stable empty list while the settings are unread or hold no household member. */
const EMPTY_MEMBERS: readonly FamilyMember[] = [];

/**
 * The rows of the phone composition, in the DOM's order (The Closed-Row Rule;
 * 2026-10-14). Not a module constant: Classi and Rendimento exist with the overview, and «Mutuo»
 * is one row per loan with linked instalments — or ONE failed row when the instalments were not
 * read. The page memoizes it on these inputs, so the controller sees a stable list.
 */
function resolvePatrimonioSections(input: {
  overviewAvailable: boolean;
  movimentiFailed: boolean;
  mortgageSections: readonly SectionSpec[];
  /** The Intestatari row exists only when a held asset names a person (2026-10-17). */
  hasOwnership: boolean;
}): readonly SectionSpec[] {
  return [
    { id: PATRIMONIO_SECTION_IDS.movimenti, eyebrow: ROW_EYEBROWS.movimenti, failed: input.movimentiFailed },
    { id: PATRIMONIO_SECTION_IDS.liquidita, eyebrow: ROW_EYEBROWS.liquidita },
    ...(input.overviewAvailable
      ? [
          { id: PATRIMONIO_SECTION_IDS.classi, eyebrow: ROW_EYEBROWS.classi },
          { id: PATRIMONIO_SECTION_IDS.rendimento, eyebrow: ROW_EYEBROWS.rendimento },
        ]
      : []),
    ...(input.hasOwnership ? [{ id: PATRIMONIO_SECTION_IDS.intestatari, eyebrow: ROW_EYEBROWS.intestatari }] : []),
    ...input.mortgageSections,
    { id: PATRIMONIO_SECTION_IDS.strumenti, eyebrow: ROW_EYEBROWS.strumenti },
  ];
}

// Module-level so the page's try block holds no conditional: keeps it compilable by the React Compiler.
function describePriceUpdate(data: { updated: number; failed: unknown[] }): string {
  return `Aggiornati ${data.updated} prezzi${data.failed.length > 0 ? `, ${data.failed.length} falliti` : ''}`;
}

export default function AssetsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();

  const assetsQuery = useAssets(ownerId);
  const snapshotsQuery = useSnapshots(ownerId);
  const overviewQuery = useDashboardOverview(ownerId);
  // The household's members, for the «Intestatario» of each asset (the ONE settings key; a
  // settings document that does not exist, or one still being read, means no member).
  const { data: settings } = useSettings(ownerId);
  const { data: assets = [], isLoading: loadingAssets, isError: assetsError } = assetsQuery;
  const { data: snapshots = [], isLoading: loadingSnapshots } = snapshotsQuery;
  const { data: overview, isLoading: loadingOverview, isError: overviewError } = overviewQuery;
  const deleteAssetMutation = useDeleteAsset(ownerId || '');

  // ─── Trade-ledger migration trigger ───────────────────────────────────────────
  // The first time an owner has no ledger meta doc, fire the idempotent one-shot migration.
  // Silent: on failure the page degrades to no ledger (trade affordances stay hidden). The ref
  // is keyed by ownerId so switching accounts re-arms it.
  const { data: ledgerMeta, isLoading: isLedgerMetaLoading, isError: ledgerMetaError } = useAssetLedgerMeta(ownerId);
  const ledgerReady = !!ledgerMeta;
  const ledgerMigrationAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ownerId || isLedgerMetaLoading) return;
    if (ledgerMeta !== null) return;
    if (ledgerMigrationAttemptedRef.current === ownerId) return;
    ledgerMigrationAttemptedRef.current = ownerId;

    migrateAssetLedger(ownerId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.meta(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      })
      .catch((error) => {
        console.error('[AssetsPage] Ledger migration failed:', error);
      });
  }, [ownerId, isLedgerMetaLoading, ledgerMeta, queryClient]);

  // ─── averageCostEur backfill trigger ──────────────────────────────────────────
  // One-shot, post-migration: projects the EUR-side PMC onto ledger assets written before the
  // field existed, so G/P on a foreign-currency position stops comparing a native-currency PMC
  // against a EUR value. Silent, same posture as the migration above. Gated on the demo like every
  // other write (useDemoMode): the demo account's docs stay as seeded.
  const averageCostEurBackfillAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ownerId || isDemo || isLedgerMetaLoading || !ledgerMeta) return;
    if (ledgerMeta.averageCostEurBackfilledAt) return;
    if (averageCostEurBackfillAttemptedRef.current === ownerId) return;
    averageCostEurBackfillAttemptedRef.current = ownerId;

    backfillAverageCostEur(ownerId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.meta(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
      })
      .catch((error) => {
        console.error('[AssetsPage] averageCostEur backfill failed:', error);
      });
  }, [ownerId, isDemo, isLedgerMetaLoading, ledgerMeta, queryClient]);

  // ─── Legacy property debt → loan migration trigger ────────────────────────────
  // One-shot (2026-10-10): a property that still carries `outstandingDebt` gets a `loan` asset of
  // its own, its instalments re-pointed (lib/services/loanMigration.ts). Idempotent — once no
  // property carries a debt there is nothing to do — and gated on the demo like every write.
  const loanMigrationAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ownerId || isDemo || loadingAssets || propertiesWithLegacyDebt(assets).length === 0) return;
    if (loanMigrationAttemptedRef.current === ownerId) return;
    loanMigrationAttemptedRef.current = ownerId;

    migratePropertyDebtsToLoans(ownerId, assets)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
      })
      .catch((error) => {
        console.error('[AssetsPage] Loan migration failed:', error);
      });
  }, [ownerId, isDemo, loadingAssets, assets, queryClient]);

  // The whole ledger of the owner, filtered to the month in memory: a month query would need a
  // (userId, date) composite index that does not exist, and every trade mutation already
  // invalidates this cache (doc/guide/registro-operazioni.md § Asset Trade Ledger).
  const tradesQuery = useAssetTransactions(ownerId, undefined, { enabled: ledgerReady });
  const { data: trades = [], isLoading: loadingTrades, isError: tradesError } = tradesQuery;
  // A failed read of the ledger (or of its meta) is not «nessuna operazione»: Movimenti says so at
  // every width (2026-10-14) — until then the tile printed the month as empty.
  const movimentiFailed = ledgerMetaError || tradesError;

  // ─── Dialog state ─────────────────────────────────────────────────────────────
  // The two dialogs a reader opens most are MOUNTED only from their opening to the end of their
  // exit animation (since 2026-10-07): `AssetDialog` is 2900 lines and used to take part in every
  // render of the page while closed. `open` drives the animation, `mounted` the tree: it turns false
  // in `onExitComplete`, after Radix has handed the focus back to the opener — unmounting at
  // `onClose` would cut the exit and drop the focus on `body`. The record stays through the exit,
  // so the dialog leaves on its own title. `initialType` skips the type picker: «Aggiungi conto»
  // already knows it wants a cash account.
  const [assetDialog, setAssetDialog] = useState<{
    open: boolean;
    mounted: boolean;
    asset: Asset | null;
    initialType?: Asset['type'];
  }>({ open: false, mounted: false, asset: null });
  const [cashDetail, setCashDetail] = useState<{ open: boolean; asset: Asset | null }>({ open: false, asset: null });
  // The control each dialog was opened from (`event.currentTarget` at the click: a header action is
  // mounted twice, and Safari never focuses a pressed button), where its close returns the focus.
  const assetOpenerRef = useRef<HTMLElement | null>(null);
  const cashOpenerRef = useRef<HTMLElement | null>(null);
  const [tradeAsset, setTradeAsset] = useState<Asset | null>(null);
  const [movementsAsset, setMovementsAsset] = useState<Asset | null>(null);
  const [taxAsset, setTaxAsset] = useState<Asset | null>(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [sparklinePeriod, setSparklinePeriod] = useState<SparklinePeriod>('1A');

  // ─── Derived data (pure, tested) ──────────────────────────────────────────────
  const today = useMemo(() => getItalyMonthYear(), []);
  // The overview's gross total; when the overview failed, the same sum over the live assets so
  // the management tiles keep their shares.
  const totalValue = useMemo(() => overview?.metrics.totalValue ?? calculateTotalValue(assets), [overview, assets]);

  const cashAccounts = useMemo(() => assets.filter(isCashAccount), [assets]);
  // The Liquidità tile's rows: the accounts and the personal loans, which read «debito» beside them.
  const liquidityRows = useMemo(() => assets.filter(isLiquidityRow), [assets]);
  const instruments = useMemo(() => assets.filter((a) => !isCashAccount(a)), [assets]);
  // The net worth by «Intestatario» (lib/utils/assetOwnership.ts, 2026-10-17), on the live assets
  // and the settings' members, measured on the value and on the price of carry (the tile's
  // switch, 2026-10-18); null when no held asset names a person — then no tile, no row.
  const familyMembers = settings?.familyMembers ?? EMPTY_MEMBERS;
  const ownership = useMemo(() => {
    const summary = summarizeOwnership(assets, familyMembers, calculateAssetValue, costBasisOf);
    return summary.hasOwners ? summary : null;
  }, [assets, familyMembers]);
  // Sold-out positions stay in the table («Azzerato») but are not owned: every count runs on these.
  // A loan is neither an instrument nor an account: counted apart («1 prestito»).
  const heldInstruments = useMemo(() => instruments.filter((a) => isHeld(a) && !isLoanAsset(a)), [instruments]);
  const heldLoans = useMemo(() => assets.filter((a) => isLoanAsset(a) && isHeld(a)), [assets]);
  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  // «Mutuo»: every loan — and, until the migration below reaches it, every property still carrying
  // a legacy debt — is asked for its linked instalments (a repaid one keeps its history); a tile
  // appears only for one that has at least one (lib/utils/mortgageSummary.ts).
  const debtIds = useMemo(
    () => assets.filter((a) => isLoanAsset(a) || (a.type === 'realestate' && (a.outstandingDebt ?? 0) > 0)).map((a) => a.id),
    [assets],
  );
  const mortgageQuery = useMortgageInstalments(ownerId, debtIds);
  const {
    data: mortgageRows = [],
    isLoading: loadingMortgage,
    isError: mortgageError,
  } = mortgageQuery;
  // The header's «Aggiornato alle…» while figures restored from the persisted cache are being
  // reread: every key the tiles paint, the overview on its own one-minute threshold.
  const freshness = useFreshness([
    assetsQuery,
    snapshotsQuery,
    tradesQuery,
    mortgageQuery,
    {
      query: overviewQuery,
      staleAfterMs: DASHBOARD_OVERVIEW_STALE_TIME_MS,
      contentUpdatedAt: overview ? Date.parse(overview.freshness.updatedAt) : null,
    },
  ]);
  const mortgages = useMemo(() => {
    const now = new Date();
    return assets
      .filter((a) => debtIds.includes(a.id))
      .map((loan) => ({ loan, rows: mortgageRows.filter((row) => row.debtAssetId === loan.id) }))
      .filter(({ rows }) => rows.length > 0)
      .map(({ loan, rows }) =>
        summarizeMortgage(
          {
            id: loan.id,
            name: loan.name,
            debt: debtBalanceOf(loan),
            debtInterestRate: loan.debtInterestRate,
            // A legacy property IS what it finances; a loan names its property, a personal loan none.
            financedAssetName: isLoanAsset(loan) ? (loan.financedAssetId ? (assetsById.get(loan.financedAssetId)?.name ?? null) : null) : loan.name,
          },
          rows,
          now,
        ),
      );
  }, [assets, assetsById, debtIds, mortgageRows]);

  const cashSummary = useMemo(() => summarizeCashAccounts(liquidityRows, totalValue), [liquidityRows, totalValue]);
  const tradesSummary = useMemo(() => summarizeMonthTrades(trades, today), [trades, today]);
  const gains = useMemo(() => summarizeUnrealizedGains(instruments), [instruments]);
  const ranking = useMemo(() => rankInstrumentReturns(overview?.topAssets ?? []), [overview]);
  const performance = useMemo(() => computeAssetPerformanceDeltas(instruments, snapshots, today), [instruments, snapshots, today]);
  const unitPriceSeries = useMemo(() => computeAssetUnitPriceSeries(instruments, snapshots), [instruments, snapshots]);
  const lastPriceUpdate = useMemo(() => describeLastPriceUpdate(resolveLastPriceUpdate(assets), new Date()), [assets]);

  const sparklineDisplay = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return filterSparklineByPeriod(overview.sparklineData, sparklinePeriod);
  }, [overview, sparklinePeriod]);

  const heroValueClass = useMemo(() => resolveHeroValueClass(totalValue), [totalValue]);
  const holdingCounts = formatHoldingCounts(heldInstruments.length, cashAccounts.length, heldLoans.length);

  // Composition remapped by ASSET_CLASS_CHART_INDEX so a class is the same hue as everywhere.
  const assetClassData = useMemo(
    () =>
      (overview?.charts.assetClassData ?? []).map((d) => ({
        ...d,
        color: chartColors[ASSET_CLASS_CHART_INDEX[d.assetClass ?? ''] ?? 0] ?? d.color,
      })),
    [overview, chartColors],
  );

  // The three instruments that moved the most, closed by the rest of the measured market effect
  // so the digest visibly adds up to it (a list that is a subset of a total states its residual).
  const instrumentMovers = useMemo(() => {
    const top = (overview?.topInstrumentMovers ?? []).slice(0, DIGEST_INSTRUMENTS);
    const shown = top.map((m) => ({ key: m.id, label: m.name, delta: m.delta }));
    const marketEffect = overview?.marketEffect ?? null;
    if (marketEffect === null || top.length === 0) return shown;
    const residual = marketEffect - top.reduce((sum, m) => sum + m.delta, 0);
    return Math.abs(residual) >= 1 ? [...shown, { key: 'others', label: 'altri', delta: residual }] : shown;
  }, [overview]);

  const verdict = useMemo(() => {
    if (!overview) return null;
    return buildPatrimonioVerdict({
      month: today.month,
      totalValue,
      monthlyVariation: overview.variations.monthly,
      // Its sentence opens «Il perché» on a phone, where the year's chip is lifted (at every width since 2026-10-14).
      yearlyVariation: overview.variations.yearly,
      isNewATH: overview.ath?.isNewATH ?? false,
      instrumentCount: heldInstruments.length,
      accountCount: cashAccounts.length,
      loanCount: heldLoans.length,
      marketEffect: overview.marketEffect ?? null,
      monthFlows: overview.monthFlows ?? null,
      topMover: overview.topInstrumentMovers?.[0] ?? null,
      sales: overview.monthSales ?? null,
      savings: resolveLivedCashflow(overview.expenseStats)?.savings ?? null,
    });
  }, [overview, today.month, totalValue, heldInstruments.length, cashAccounts.length, heldLoans.length]);

  // The overview failed (or has not arrived): the management tiles still work on the live assets,
  // the verdict and the payload-fed tiles are replaced by one notice.
  const overviewUnavailable = overviewError || !overview || !verdict;

  // ─── The phone composition (2026-10-14) ───────────────────────────────────────
  // Every hook before the early returns below. A failed read of the instalments is ONE row named
  // after what it would have shown: «Mutuo» when a loan finances a property, else «Prestito».
  const mortgageFailedEyebrow = assets.some((a) => (isLoanAsset(a) && Boolean(a.financedAssetId)) || (a.type === 'realestate' && (a.outstandingDebt ?? 0) > 0))
    ? 'Mutuo'
    : 'Prestito';
  const mortgageSections = useMemo(
    (): readonly SectionSpec[] =>
      mortgageError
        ? [{ id: PATRIMONIO_SECTION_IDS.mutuo, eyebrow: mortgageFailedEyebrow, failed: true }]
        : mortgages.map((summary) => ({ id: patrimonioMutuoSectionId(summary.loanId), eyebrow: summary.kind === 'mortgage' ? 'Mutuo' : 'Prestito' })),
    [mortgageError, mortgageFailedEyebrow, mortgages],
  );
  const sectionSpecs = useMemo(
    () => resolvePatrimonioSections({ overviewAvailable: !overviewUnavailable, movimentiFailed, mortgageSections, hasOwnership: ownership !== null }),
    [overviewUnavailable, movimentiFailed, mortgageSections, ownership],
  );
  const sections = useMobileSections({
    route: 'assets',
    sections: sectionSpecs,
    defaultOpen: overviewUnavailable ? OVERVIEW_FAILED_DEFAULT_OPEN : NO_DEFAULT_OPEN,
  });
  // At 768 the same rows on two columns; on a tablet in landscape the index beside the verdict and
  // THE tile (lib/utils/tabletComposition.ts). The specs ARE the DOM's rows. With the overview unread
  // there is no THE tile and no stage: the plain grid, every wide row on both columns at 768.
  const stageRef = useTabletStage();
  const tablet = useTabletComposition({ sections, order: overviewUnavailable ? [] : sectionSpecs.map((section) => section.id) });

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const invalidatePortfolio = () => {
    if (!ownerId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
  };

  // Batch price update through the server (Yahoo rate limits, retries, FX) — never client-side.
  const handleUpdatePrices = async () => {
    if (!user || !ownerId) return;
    try {
      setUpdatingPrices(true);
      const response = await authenticatedFetch('/api/prices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(describePriceUpdate(data));
        invalidatePortfolio();
        queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(ownerId) });
      } else {
        toast.error("Errore nell'aggiornamento dei prezzi");
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error("Errore nell'aggiornamento dei prezzi");
    }
    // After the try/catch rather than in a `finally`: keeps the page compilable by the React Compiler.
    setUpdatingPrices(false);
  };

  const openAssetDialog = (opener: HTMLElement | null, asset: Asset | null, initialType?: Asset['type']) => {
    assetOpenerRef.current = opener;
    setAssetDialog({ open: true, mounted: true, asset, initialType });
  };
  const openCreate = (opener: HTMLElement) => openAssetDialog(opener, null);
  const openCreateCashAccount = (opener: HTMLElement) => openAssetDialog(opener, null, 'cash');
  const openEdit = (asset: Asset, opener: HTMLElement) => openAssetDialog(opener, asset);
  const handleAssetDialogClose = () => {
    setAssetDialog((prev) => ({ ...prev, open: false }));
    invalidatePortfolio();
  };
  // A reopen during the exit keeps the dialog: only a dialog still closed is unmounted.
  const handleAssetDialogExited = () => setAssetDialog((prev) => (prev.open ? prev : { open: false, mounted: false, asset: null }));
  // «Registra operazione» inside the edit form closes it and opens the trade dialog: the focus must
  // not go back to the table behind a modal that is opening.
  const handleRegisterTradeFromDialog = (asset: Asset) => {
    assetOpenerRef.current = null;
    setTradeAsset(asset);
  };

  const openCashDetail = (asset: Asset, opener: HTMLElement) => {
    // A personal loan sits among the Liquidità rows («debito») but is no account: its detail is
    // the asset form, where the principal and the TAN are typed.
    if (isLoanAsset(asset)) {
      openEdit(asset, opener);
      return;
    }
    cashOpenerRef.current = opener;
    setCashDetail({ open: true, asset });
  };
  const closeCashDetail = () => setCashDetail((prev) => ({ ...prev, open: false }));
  const handleCashDetailExited = () => setCashDetail((prev) => (prev.open ? prev : { open: false, asset: null }));
  // «Modifica» hands the account over to AssetDialog: the closing detail gives up the focus, and the
  // form returns it to the Liquidità row the detail was opened from (its own button is gone).
  const editCashAccount = (asset: Asset) => {
    const row = cashOpenerRef.current;
    cashOpenerRef.current = null;
    closeCashDetail();
    openAssetDialog(row, asset);
  };

  // The two-click arm lives in the dialog (`useArmedDelete`, no timer); the page only deletes.
  const handleCashDelete = async (assetId: string) => {
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Conto eliminato');
      closeCashDetail();
    } catch (error) {
      console.error('Error deleting cash account:', error);
      toast.error(describeWriteError(error));
    }
  };

  const headerActions = (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-9"
        onClick={handleUpdatePrices}
        disabled={isDemo || updatingPrices || instruments.length === 0}
        title={isDemo ? 'Non disponibile in modalità demo' : undefined}
        aria-label={updatingPrices ? 'Aggiornamento prezzi in corso' : 'Aggiorna prezzi'}
      >
        <RefreshCw className={cn('h-4 w-4', updatingPrices && 'animate-spin')} aria-hidden="true" />
        <span className="hidden sm:inline">{updatingPrices ? 'Aggiornamento...' : 'Aggiorna prezzi'}</span>
      </Button>
      {/* The guided path that records a house's purchase or sale (2026-10-21, doc/guide/compravendita.md). */}
      <Button asChild type="button" variant="outline" className="h-9" aria-label="Compra o vendi casa">
        <Link href="/dashboard/assets/compravendita">
          <House className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Compra o vendi casa</span>
        </Link>
      </Button>
      <Button
        type="button"
        className="h-9"
        onClick={(event) => openCreate(event.currentTarget)}
        disabled={isDemo}
        title={isDemo ? 'Non disponibile in modalità demo' : undefined}
        aria-label="Aggiungi asset"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Aggiungi asset</span>
      </Button>
    </>
  );

  // ─── Loading and errors ───────────────────────────────────────────────────────
  // The skeleton waits for EVERY query the tiles read (a cold ledger meta or snapshot read would
  // otherwise flash "registro non attivo" or empty Δ columns); a failed fetch is not an empty
  // set, so an error is an alert, never a skeleton that never lifts.
  if (loadingAssets || loadingOverview || loadingSnapshots || isLedgerMetaLoading || loadingMortgage) {
    return (
      <PageContainer>
        <PageHeader label="Patrimonio" title="Strumenti e conti" freshness={freshness} />
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  if (assetsError) {
    return (
      <PageContainer>
        <PageHeader label="Patrimonio" title="Strumenti e conti" freshness={freshness} />
        <ErrorNotice
          className="max-w-[920px]"
          notice={describeReadFailure({
            consequence:
              'I tuoi strumenti e conti non sono stati letti: senza di essi la pagina non ha nulla da misurare.',
            untouched: 'Niente di registrato è stato toccato; se il problema resta, controlla la connessione.',
          })}
        />
      </PageContainer>
    );
  }

  // The strip (G/P and Liquidità) and what THE tile and Rendimento hide because of it (The
  // Lifted-Figure Rule): the month's chip — its figures are in the first sentence —, the year's
  // chip whole — its euro is in «Il perché» —, the curve's last label (the hero), and the
  // «Mercato:» digest when the sentence names the market. The hero itself stays (the same rule: a
  // hero is never lifted).
  const strip = overviewUnavailable ? [] : selectPatrimonioStrip({ gains, cash: cashSummary });
  const heroLifted: PatrimonioLiftedBlock[] = [
    ...liftedBlocks(strip, PATRIMONIO_PATRIMONIO_ID).filter(isPatrimonioLiftedBlock),
    'monthly',
    'yearly',
    'curve-end',
    ...(verdict && patrimonioVerdictNamesMarket(verdict) ? (['movers'] as const) : []),
  ];
  const rendimentoLifted = liftedBlocks(strip, PATRIMONIO_SECTION_IDS.rendimento).filter(isAssetRendimentoLiftedBlock);
  // What the closed rows say beside their eyebrow: words and counts, never an amount.
  const personalLoans = liquidityRows.filter((a) => isLoanAsset(a) && isHeld(a)).length;
  const strumentiCount = formatHoldingCounts(heldInstruments.length, 0, heldLoans.length);
  const liquiditaCount = formatHoldingCounts(0, cashAccounts.length, personalLoans);
  const monthName = MONTH_NAMES[today.month - 1].toLowerCase();
  // What each closed row answers in the landscape index (2026-10-16): figures the strip and THE tile do not print.
  const rowAnswers = describePatrimonioClosedAnswers({
    trades: { summary: tradesSummary, ledgerReady, loading: ledgerReady && loadingTrades, failed: movimentiFailed },
    cash: cashSummary,
    classes: assetClassData,
    strip,
    gains,
    mortgages,
    mortgageFailed: mortgageError,
    instruments,
    totalValue,
    ownership,
  });

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageContainer>
      <div className="space-y-4">
        <PageHeader
          label="Patrimonio"
          title="Strumenti e conti"
          description={lastPriceUpdate ?? undefined}
          actions={headerActions}
          freshness={freshness}
        />

        {/* The stage: the verdict over the grid; on a tablet in landscape the answer on the left
            (verdict and THE tile) and the index on the right (lib/utils/tabletComposition.ts). With
            the overview unread there is no THE tile: a plain box over the plain grid, at every width. */}
        <RowAnswers value={rowAnswers}>
        <div className={STAGE_WRAPPER_CLASS}>
        <div ref={stageRef} className={overviewUnavailable ? 'space-y-4' : STAGE_CLASS}>
        <motion.div
          variants={cardItem}
          initial="hidden"
          animate="visible"
          data-stage="verdict"
          className={cn('pt-1', !overviewUnavailable && VERDICT_CELL_CLASS)}
        >
          {overviewUnavailable ? (
            <ErrorNotice
              className="max-w-[920px]"
              notice={describeReadFailure({
                consequence:
                  'Il riepilogo del patrimonio non è stato letto: verdetto, andamento, classi e rendimento tornano al prossimo caricamento.',
                untouched: 'Conti, movimenti e strumenti sono aggiornati.',
              })}
            />
          ) : (
            <PageVerdict
              verdict={verdict}
              ariaLabel="Verdetto del portafoglio"
              strip={<VerdictStrip figures={strip} onOpen={sections.reveal} eyebrows={sections.eyebrows} />}
              restCollapse={sections.collapse(VERDICT_REST_SECTION)}
            />
          )}
        </motion.div>

        <div className={overviewUnavailable ? undefined : COMPACT_GRID_WRAPPER_CLASS}>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className={overviewUnavailable ? PLAIN_GRID_CLASS : COMPACT_GRID_CLASS}
        >
          {!overviewUnavailable && (
            <motion.div variants={cardItem} data-stage="lead" className={cn(TILE_CELL_CLASS, leadCellClass(!overviewUnavailable), 'desktop:col-span-5 desktop:row-span-2')}>
              <PatrimonioTile
                id={PATRIMONIO_PATRIMONIO_ID}
                className="scroll-mt-24"
                liftedFigures={heroLifted}
                totalValue={totalValue}
                heroValueClass={heroValueClass}
                variations={overview.variations}
                isNewATH={overview.ath?.isNewATH ?? false}
                hasCurrentMonthSnapshot={overview.flags.currentMonthSnapshotExists}
                sparklinePeriod={sparklinePeriod}
                onSparklinePeriodChange={setSparklinePeriod}
                sparklineDisplay={sparklineDisplay}
                movers={instrumentMovers}
                countLine={
                  // The count is the way to the table, «18 strumenti» the line a reader looks for it
                  // under: at 1440 a link to the tile, below `desktop:` a button that opens its row.
                  holdingCounts ? (
                    sections.compact ? (
                      <button
                        type="button"
                        onClick={() => sections.reveal(PATRIMONIO_SECTION_IDS.strumenti)}
                        className="inline-flex min-h-11 items-center text-left underline-offset-2 hover:underline [@media(pointer:fine)]:min-h-0"
                      >
                        {holdingCounts}
                      </button>
                    ) : (
                      <a href="#strumenti" className="underline-offset-2 hover:underline">
                        {holdingCounts}
                      </a>
                    )
                  ) : (
                    'Aggiungi asset per iniziare'
                  )
                }
              />
            </motion.div>
          )}

          {/* «Il resto della pagina» right after THE tile — the grid's first child when the overview
              was not read and there is no tile (then the plain grid). Hidden from `desktop:`. The
              index opens here and holds every row after it; `contents` at 1440, so the cells placed
              by column below stay items of the twelve-column grid. */}
          <div className={overviewUnavailable ? 'contents' : INDEX_CLASS}>
          <PageRest sections={sections} className={overviewUnavailable ? undefined : REST_CELL_CLASS} />

          {/* DOM order = reading order on every width: the month's movements right after the hero
              («cosa si è mosso?»), then the accounts. On desktop the two are placed by column so
              the row still reads hero · Liquidità · Movimenti; a CSS `order` swap used to make a
              screen reader meet Liquidità first while the eye met Movimenti. */}
          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.movimenti), 'desktop:col-span-4 desktop:col-start-9 desktop:row-start-1')}
          >
            {movimentiFailed ? (
              // A failed read of the ledger is not «nessuna operazione», at every width (2026-10-14).
              // Silent below `desktop:`, where `PageRest` carries the one live node.
              <ErrorNotice
                compact
                collapse={sections.collapse(PATRIMONIO_SECTION_IDS.movimenti)}
                live={!sections.compact}
                notice={describeReadFailure({
                  subject: ROW_EYEBROWS.movimenti,
                  consequence: 'Il registro delle operazioni non è stato letto: acquisti e vendite del mese tornano al prossimo caricamento.',
                  untouched: 'Le operazioni registrate non sono state toccate.',
                })}
              />
            ) : (
              <MovimentiTile
                summary={tradesSummary}
                month={today.month}
                ledgerReady={ledgerReady}
                loading={ledgerReady && loadingTrades}
                assetsById={assetsById}
                onOpenMovements={setMovementsAsset}
                collapse={sections.collapse(PATRIMONIO_SECTION_IDS.movimenti)}
                asideWhenClosed={monthName}
              />
            )}
          </motion.div>

          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.liquidita), 'desktop:col-span-3 desktop:col-start-6 desktop:row-start-1')}
          >
            <LiquiditaTile
              summary={cashSummary}
              accountsById={assetsById}
              onSelect={openCashDetail}
              onAdd={openCreateCashAccount}
              isDemo={isDemo}
              collapse={sections.collapse(PATRIMONIO_SECTION_IDS.liquidita)}
              asideWhenClosed={liquiditaCount || 'nessun conto'}
            />
          </motion.div>

          {!overviewUnavailable && (
            <>
              <motion.div
                variants={cardItem}
                className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.classi), 'desktop:col-span-3')}
              >
                <ComposizioneTile
                  eyebrow="Classi"
                  collapse={sections.collapse(PATRIMONIO_SECTION_IDS.classi)}
                  asideWhenClosed="per asset class"
                  data={assetClassData}
                  footer={
                    <>
                      Target e ribilanciamento in{' '}
                      <Link href="/dashboard/allocation" className={TILE_FOOTER_ACTION_CLASS}>
                        Allocazione
                      </Link>
                      .
                    </>
                  }
                />
              </motion.div>

              <motion.div
                variants={cardItem}
                className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.rendimento), 'desktop:col-span-4')}
              >
                <RendimentoTile
                  gains={gains}
                  ranking={ranking}
                  rankedFrom={ranking.rankedFrom}
                  collapse={sections.collapse(PATRIMONIO_SECTION_IDS.rendimento)}
                  asideWhenClosed="vs PMC"
                  liftedFigures={rendimentoLifted}
                />
              </motion.div>
            </>
          )}

          {/* «Di chi è?» — the net worth by Intestatario (owner, 2026-10-17), a full row before the
              loans; absent when no held asset names a person. The same tile as the Panoramica's, on
              the live assets here. */}
          {ownership && (
            <motion.div
              variants={cardItem}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.intestatari), overviewUnavailable && 'tablet:col-span-2', 'desktop:col-span-12')}
            >
              <IntestatariTile
                summary={ownership}
                collapse={sections.collapse(PATRIMONIO_SECTION_IDS.intestatari)}
                asideWhenClosed="quote per persona"
              />
            </motion.div>
          )}

          {/* A failed read of the instalments is not «no mortgage»: it says so where the tile would be.
              With the overview unread (the plain grid) the loans and Strumenti take both columns at 768. */}
          {mortgageError ? (
            <motion.div
              variants={cardItem}
              className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.mutuo), overviewUnavailable && 'tablet:col-span-2', 'desktop:col-span-12')}
            >
              <ErrorNotice
                collapse={sections.collapse(PATRIMONIO_SECTION_IDS.mutuo)}
                live={!sections.compact}
                notice={describeReadFailure({
                  subject: mortgageFailedEyebrow,
                  consequence: 'Le rate collegate ai prestiti non sono state lette: interessi e capitale pagati tornano al prossimo caricamento.',
                })}
              />
            </motion.div>
          ) : (
            mortgages.map((summary) => (
              <motion.div
                key={summary.loanId}
                variants={cardItem}
                className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(patrimonioMutuoSectionId(summary.loanId)), overviewUnavailable && 'tablet:col-span-2', 'desktop:col-span-12')}
              >
                <MutuoTile
                  summary={summary}
                  showPropertyName={mortgages.length > 1}
                  collapse={sections.collapse(patrimonioMutuoSectionId(summary.loanId))}
                  asideWhenClosed={mortgages.length > 1 ? (summary.propertyName ?? summary.loanName) : 'interessi e capitale'}
                />
              </motion.div>
            ))
          )}

          <motion.div
            variants={cardItem}
            className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(PATRIMONIO_SECTION_IDS.strumenti), overviewUnavailable && 'tablet:col-span-2', 'desktop:col-span-12')}
          >
            <StrumentiTile
              collapse={sections.collapse(PATRIMONIO_SECTION_IDS.strumenti)}
              asideWhenClosed={strumentiCount || 'nessuno strumento'}
              assets={instruments}
              totalValue={totalValue}
              performance={performance}
              unitPriceSeries={unitPriceSeries}
              chartColors={chartColors}
              ledgerReady={ledgerReady}
              isDemo={isDemo}
              ownerId={ownerId}
              onAdd={openCreate}
              onEdit={openEdit}
              onRegisterTrade={setTradeAsset}
              onMovements={setMovementsAsset}
              onCalculateTaxes={setTaxAsset}
              members={familyMembers}
              allAssets={assets}
            />
          </motion.div>
          </div>
        </motion.div>
        </div>
        </div>
        </div>
        </RowAnswers>
      </div>

      {/* ── Dialogs — one instance each, shared by the header and every tile ── */}
      {assetDialog.mounted && (
        <AssetDialog
          open={assetDialog.open}
          asset={assetDialog.asset}
          initialType={assetDialog.initialType}
          onClose={handleAssetDialogClose}
          onRegisterTrade={handleRegisterTradeFromDialog}
          returnFocusTo={assetOpenerRef}
          onExitComplete={handleAssetDialogExited}
        />
      )}

      {cashDetail.asset && (
        <CashAccountDialog
          asset={cashDetail.asset}
          open={cashDetail.open}
          onClose={closeCashDetail}
          onEdit={editCashAccount}
          onDelete={handleCashDelete}
          isDemo={isDemo}
          returnFocusTo={cashOpenerRef}
          onExitComplete={handleCashDetailExited}
        />
      )}

      {tradeAsset && <TransactionDialog open onClose={() => setTradeAsset(null)} asset={tradeAsset} />}

      {movementsAsset && <AssetMovementsDialog open onClose={() => setMovementsAsset(null)} asset={movementsAsset} />}

      {taxAsset && <TaxCalculatorModal open onClose={() => setTaxAsset(null)} asset={taxAsset} />}
    </PageContainer>
  );
}
