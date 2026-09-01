/**
 * PATRIMONIO — verdict + tile grid (2026-08-22, the first page propagated after the Panoramica)
 *
 * The page answers "cosa possiedo, e cosa si è mosso?" before it shows a number: a rule-generated
 * verdict (lib/utils/patrimonioNarrative.ts) whose driver is an INSTRUMENT, then a 12-column
 * bento, each tile one question with a one-line reading above its figures:
 *
 *   Mobile (1 col):   Verdict → Patrimonio → Movimenti → Liquidità → Classi → Rendimento → Strumenti
 *   Desktop (12 col): Patrimonio(5, 2 rows) | Liquidità(3) | Movimenti(4)
 *                                           | Classi(3)    | Rendimento(4)
 *                     Strumenti(12)
 *
 * Data: the overview payload (`useDashboardOverview`, shared with the Panoramica — hero,
 * variations, sparkline, composition, top assets, per-instrument market effect), the assets
 * (rows, cash accounts, unrealized gains), the snapshots (Δ columns) and the trade ledger
 * (the month's movements). Every derived number is a tested pure function in
 * lib/utils/{patrimonioSummary,assetPerformanceDeltas}.ts; the page only wires them.
 *
 * The page owns every dialog — one AssetDialog serves the header's "Aggiungi asset", the
 * Liquidità tile's "Aggiungi conto" and the table's Modifica — so a mutation invalidates the
 * assets AND the overview in one place (AGENTS.md → dual invalidation).
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets, useDeleteAsset } from '@/lib/hooks/useAssets';
import { calculateTotalValue } from '@/lib/services/assetService';
import { useAssetLedgerMeta, useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { migrateAssetLedger } from '@/lib/services/assetTransactionService';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { filterSparklineByPeriod } from '@/lib/utils/sparklinePeriod';
import { cardItem, springLayoutTransition, staggerContainer } from '@/lib/utils/motionVariants';
import { buildPatrimonioVerdict, describeLastPriceUpdate, formatHoldingCounts } from '@/lib/utils/patrimonioNarrative';
import {
  isCashAccount,
  isHeld,
  rankInstrumentReturns,
  resolveLastPriceUpdate,
  summarizeCashAccounts,
  summarizeMonthTrades,
  summarizeUnrealizedGains,
} from '@/lib/utils/patrimonioSummary';
import { computeAssetPerformanceDeltas, computeAssetUnitPriceSeries } from '@/lib/utils/assetPerformanceDeltas';
import type { Asset } from '@/types/assets';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { PatrimonioTile, resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { ComposizioneTile } from '@/components/dashboard/overview/ComposizioneTile';
import type { SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { LiquiditaTile } from '@/components/assets/tiles/LiquiditaTile';
import { MovimentiTile } from '@/components/assets/tiles/MovimentiTile';
import { RendimentoTile } from '@/components/assets/tiles/RendimentoTile';
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

export default function AssetsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();

  const { data: assets = [], isLoading: loadingAssets, isError: assetsError } = useAssets(ownerId);
  const { data: snapshots = [], isLoading: loadingSnapshots } = useSnapshots(ownerId);
  const { data: overview, isLoading: loadingOverview, isError: overviewError } = useDashboardOverview(ownerId);
  const deleteAssetMutation = useDeleteAsset(ownerId || '');

  // ─── Trade-ledger migration trigger ───────────────────────────────────────────
  // The first time an owner has no ledger meta doc, fire the idempotent one-shot migration.
  // Silent: on failure the page degrades to no ledger (trade affordances stay hidden). The ref
  // is keyed by ownerId so switching accounts re-arms it.
  const { data: ledgerMeta, isLoading: isLedgerMetaLoading } = useAssetLedgerMeta(ownerId);
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

  // The whole ledger of the owner, filtered to the month in memory: a month query would need a
  // (userId, date) composite index that does not exist, and every trade mutation already
  // invalidates this cache (AGENTS.md → Asset Trade Ledger).
  const { data: trades = [], isLoading: loadingTrades } = useAssetTransactions(ownerId, undefined, { enabled: ledgerReady });

  // ─── Dialog state ─────────────────────────────────────────────────────────────
  const [assetDialog, setAssetDialog] = useState<{ open: boolean; asset: Asset | null }>({ open: false, asset: null });
  const [cashDetail, setCashDetail] = useState<Asset | null>(null);
  const [cashPendingDeleteId, setCashPendingDeleteId] = useState<string | undefined>();
  const cashPendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const instruments = useMemo(() => assets.filter((a) => !isCashAccount(a)), [assets]);
  // Sold-out positions stay in the table («Azzerato») but are not owned: every count runs on these.
  const heldInstruments = useMemo(() => instruments.filter(isHeld), [instruments]);
  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const cashSummary = useMemo(() => summarizeCashAccounts(cashAccounts, totalValue), [cashAccounts, totalValue]);
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
      isNewATH: overview.ath?.isNewATH ?? false,
      instrumentCount: heldInstruments.length,
      accountCount: cashAccounts.length,
      marketEffect: overview.marketEffect ?? null,
      topMover: overview.topInstrumentMovers?.[0] ?? null,
    });
  }, [overview, today.month, totalValue, heldInstruments.length, cashAccounts.length]);

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
        toast.success(`Aggiornati ${data.updated} prezzi${data.failed.length > 0 ? `, ${data.failed.length} falliti` : ''}`);
        invalidatePortfolio();
        queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all(ownerId) });
      } else {
        toast.error("Errore nell'aggiornamento dei prezzi");
      }
    } catch (error) {
      console.error('Error updating prices:', error);
      toast.error("Errore nell'aggiornamento dei prezzi");
    } finally {
      setUpdatingPrices(false);
    }
  };

  const openCreate = () => setAssetDialog({ open: true, asset: null });
  const openEdit = (asset: Asset) => setAssetDialog({ open: true, asset });
  const handleAssetDialogClose = () => {
    setAssetDialog({ open: false, asset: null });
    invalidatePortfolio();
  };

  const handleCashDelete = async (assetId: string) => {
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Conto eliminato');
      setCashDetail(null);
    } catch (error) {
      console.error('Error deleting cash account:', error);
      toast.error("Errore nell'eliminazione del conto");
    }
  };

  // 2-click disarm — the same pattern as the table rows.
  const handleCashDeleteClick = (assetId: string) => {
    if (cashPendingDeleteId === assetId) {
      if (cashPendingDeleteTimerRef.current) clearTimeout(cashPendingDeleteTimerRef.current);
      setCashPendingDeleteId(undefined);
      handleCashDelete(assetId);
    } else {
      if (cashPendingDeleteTimerRef.current) clearTimeout(cashPendingDeleteTimerRef.current);
      setCashPendingDeleteId(assetId);
      cashPendingDeleteTimerRef.current = setTimeout(() => setCashPendingDeleteId(undefined), 3000);
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
      <Button
        type="button"
        className="h-9"
        onClick={openCreate}
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
  if (loadingAssets || loadingOverview || loadingSnapshots || isLedgerMetaLoading) {
    return (
      <PageContainer width="wide">
        <PageHeader label="Patrimonio" title="Strumenti e conti" separator={false} />
        <TileGridSkeleton cells={SKELETON_CELLS} />
      </PageContainer>
    );
  }

  if (assetsError) {
    return (
      <PageContainer width="wide">
        <PageHeader label="Patrimonio" title="Strumenti e conti" separator={false} />
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

  // The overview failed (or has not arrived): the management tiles still work on the live assets,
  // the verdict and the payload-fed tiles are replaced by one notice.
  const overviewUnavailable = overviewError || !overview || !verdict;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <PageContainer width="wide">
      <motion.div layout="position" transition={springLayoutTransition} className="space-y-4">
        <PageHeader
          label="Patrimonio"
          title="Strumenti e conti"
          description={lastPriceUpdate ?? undefined}
          separator={false}
          actions={headerActions}
        />

        <motion.div variants={cardItem} initial="hidden" animate="visible" className="pt-1">
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
            <PageVerdict verdict={verdict} ariaLabel="Verdetto del portafoglio" />
          )}
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12"
        >
          {!overviewUnavailable && (
            <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}>
              <PatrimonioTile
                totalValue={totalValue}
                heroValueClass={heroValueClass}
                variations={overview.variations}
                isNewATH={overview.ath?.isNewATH ?? false}
                hasCurrentMonthSnapshot={overview.flags.currentMonthSnapshotExists}
                sparklinePeriod={sparklinePeriod}
                onSparklinePeriodChange={setSparklinePeriod}
                sparklineDisplay={sparklineDisplay}
                movers={instrumentMovers}
                countLine={formatHoldingCounts(heldInstruments.length, cashAccounts.length) || 'Aggiungi asset per iniziare'}
              />
            </motion.div>
          )}

          {/* Below desktop, the month's movements read right after the hero: "cosa si è mosso?" */}
          <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-3')}>
            <LiquiditaTile
              summary={cashSummary}
              accountsById={assetsById}
              onSelect={(asset) => {
                setCashPendingDeleteId(undefined);
                setCashDetail(asset);
              }}
              onAdd={openCreate}
              isDemo={isDemo}
            />
          </motion.div>

          <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'order-1 desktop:order-none desktop:col-span-4')}>
            <MovimentiTile
              summary={tradesSummary}
              month={today.month}
              ledgerReady={ledgerReady}
              loading={ledgerReady && loadingTrades}
              assetsById={assetsById}
              onOpenMovements={setMovementsAsset}
            />
          </motion.div>

          {!overviewUnavailable && (
            <>
              <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-3')}>
                <ComposizioneTile
                  eyebrow="Classi"
                  data={assetClassData}
                  footer={
                    <>
                      Target e ribilanciamento in{' '}
                      <Link href="/dashboard/allocation" className="text-foreground underline-offset-2 hover:underline">
                        Allocazione
                      </Link>
                      .
                    </>
                  }
                />
              </motion.div>

              <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-4')}>
                <RendimentoTile gains={gains} ranking={ranking} rankedFrom={ranking.rankedFrom} />
              </motion.div>
            </>
          )}

          <motion.div variants={cardItem} className={cn(TILE_CELL_CLASS, 'order-5 desktop:order-none tablet:col-span-2 desktop:col-span-12')}>
            <StrumentiTile
              assets={instruments}
              totalValue={totalValue}
              performance={performance}
              unitPriceSeries={unitPriceSeries}
              ledgerReady={ledgerReady}
              isDemo={isDemo}
              ownerId={ownerId}
              onAdd={openCreate}
              onEdit={openEdit}
              onRegisterTrade={setTradeAsset}
              onMovements={setMovementsAsset}
              onCalculateTaxes={setTaxAsset}
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ── Dialogs — one instance each, shared by the header and every tile ── */}
      <AssetDialog open={assetDialog.open} asset={assetDialog.asset} onClose={handleAssetDialogClose} onRegisterTrade={setTradeAsset} />

      <CashAccountDialog
        asset={cashDetail}
        open={cashDetail !== null}
        onClose={() => {
          setCashDetail(null);
          setCashPendingDeleteId(undefined);
        }}
        onEdit={(asset) => {
          setCashDetail(null);
          openEdit(asset);
        }}
        pendingDeleteId={cashPendingDeleteId}
        onDeleteClick={handleCashDeleteClick}
        isDemo={isDemo}
      />

      {tradeAsset && <TransactionDialog open onClose={() => setTradeAsset(null)} asset={tradeAsset} />}

      {movementsAsset && <AssetMovementsDialog open onClose={() => setMovementsAsset(null)} asset={movementsAsset} />}

      {taxAsset && <TaxCalculatorModal open onClose={() => setTaxAsset(null)} asset={taxAsset} />}
    </PageContainer>
  );
}
