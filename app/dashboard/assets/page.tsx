/**
 * ASSETS PAGE
 *
 * HERO CARDS:
 * Replicated from Panoramica page — data comes from useDashboardOverview (shared RQ cache).
 *
 * CONTI CORRENTI:
 * Assets with type=cash AND assetClass=cash are shown above the table as clickable cards.
 * Clicking opens a read-only detail dialog with Modifica/Elimina actions.
 * These assets are excluded from the Gestione Asset table.
 *
 * PERFORMANCE METRICS:
 * Each asset row/card shows Δ Mese, Δ YTD, Δ Inizio inline — computed from monthly snapshots.
 * Desktop: toggle button swaps the table to a dedicated 8-column performance view.
 * Mobile: 3 chip badges below the asset value.
 */

'use client';

import { motion } from 'framer-motion';
import { useRef, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets, useDeleteAsset } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Wallet, TrendingUp, TrendingDown, Pencil, Trash2 } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetDialog } from '@/components/assets/AssetDialog';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency } from '@/lib/services/chartService';
import { calculateAssetValue, calculateUnrealizedGains } from '@/lib/services/assetService';
import { formatNumber } from '@/lib/services/chartService';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { toast } from 'sonner';
import type { Asset } from '@/types/assets';
import { Timestamp } from 'firebase/firestore';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

// Format a Firebase Timestamp or JS Date as dd/MM/yyyy for display.
function formatAssetDate(ts: Date | Timestamp | null | undefined): string {
  if (!ts) return '—';
  const d = ts instanceof Timestamp ? ts.toDate() : (ts as Date);
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

// Grid of cash account cards — module-level for stable reference.
function CashAccountsSection({
  assets,
  onSelect,
}: {
  assets: Asset[];
  onSelect: (asset: Asset) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Conti Correnti
      </p>
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        {assets.map((asset) => (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelect(asset)}
            // bg-muted/40 (no border) keeps these as lighter KPI chips, not full cards.
            // bg-card + border would give them equal visual weight to the hero cards above.
            className={cn(
              'cursor-pointer rounded-xl bg-muted/40 p-5 text-left',
              'hover:bg-muted/60 active:bg-muted/70 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted mb-3">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground truncate mb-0.5">{asset.name}</p>
            <p className="text-lg font-bold font-mono tabular-nums tracking-tight text-foreground">
              {formatCurrency(calculateAssetValue(asset), asset.currency)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// Read-only detail dialog for a single cash account asset.
// Shows value, currency, name, last-updated date.
// Modifica → opens AssetDialog; Elimina → 2-click disarm (same pattern as the rest of the app).
function CashAccountDetailDialog({
  asset,
  open,
  onClose,
  onEdit,
  pendingDeleteId,
  onDeleteClick,
}: {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  pendingDeleteId: string | undefined;
  onDeleteClick: (assetId: string) => void;
}) {
  if (!asset) return null;
  const value = calculateAssetValue(asset);
  const isPending = pendingDeleteId === asset.id;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <DialogTitle className="text-base">{asset.name}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Dettagli del conto corrente {asset.name}
          </DialogDescription>
        </DialogHeader>

        {/* Main value */}
        <p className="text-3xl font-bold font-mono tabular-nums tracking-tight text-foreground">
          {formatCurrency(value, asset.currency)}
        </p>

        {/* Detail rows */}
        <div className="divide-y divide-border border-t border-border">
          {[
            { label: 'Valuta', value: asset.currency },
            { label: 'Nome', value: asset.name },
            { label: 'Aggiornato', value: formatAssetDate(asset.updatedAt) },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className="text-sm font-mono text-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        <DialogFooter className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onEdit(asset)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifica
          </Button>
          <Button
            type="button"
            variant={isPending ? 'destructive' : 'outline'}
            className={cn('flex-1', !isPending && 'text-destructive hover:text-destructive')}
            onClick={() => onDeleteClick(asset.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isPending ? 'Conferma?' : 'Elimina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssetsPage() {
  const { user } = useAuth();

  const { data: assets = [], isLoading: loading, refetch: refetchAssets } = useAssets(user?.uid);
  const { data: snapshots = [], refetch: refetchSnapshots } = useSnapshots(user?.uid);
  const { data: overview, isLoading: loadingOverview } = useDashboardOverview(user?.uid);

  const deleteAssetMutation = useDeleteAsset(user?.uid || '');
  const queryClient = useQueryClient();

  // ─── Cash detail dialog state ─────────────────────────────────────────────────
  const [cashDetailOpen, setCashDetailOpen] = useState(false);
  const [selectedCashAsset, setSelectedCashAsset] = useState<Asset | null>(null);
  const [cashEditOpen, setCashEditOpen] = useState(false);
  const [cashPendingDeleteId, setCashPendingDeleteId] = useState<string | undefined>();
  const cashPendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Derived metrics for hero cards ──────────────────────────────────────────
  const totalValue = overview?.metrics.totalValue ?? 0;
  const liquidNetTotal = overview?.metrics.liquidNetTotal ?? 0;
  const sparkline12m = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return overview.sparklineData.slice(-13);
  }, [overview]);

  // Total unrealized G/P across invested assets with cost basis.
  // Exclude pure cash accounts (type=cash && assetClass=cash): they don't represent
  // invested capital, so including their cost basis in the denominator would dilute G/P %
  // without contributing any unrealized gain to the numerator.
  const { totalGainLoss, totalGainPct } = useMemo(() => {
    const withCost = assets.filter(
      (a) => a.averageCost && a.averageCost > 0 && !(a.type === 'cash' && a.assetClass === 'cash')
    );
    if (withCost.length === 0) return { totalGainLoss: 0, totalGainPct: 0 };
    const gainLoss = withCost.reduce((sum, a) => sum + calculateUnrealizedGains(a), 0);
    const costBasis = withCost.reduce((sum, a) => sum + a.quantity * a.averageCost!, 0);
    return { totalGainLoss: gainLoss, totalGainPct: costBasis > 0 ? (gainLoss / costBasis) * 100 : 0 };
  }, [assets]);

  const handleRefresh = async () => {
    await Promise.all([refetchAssets(), refetchSnapshots()]);
  };

  // ─── Cash / non-cash asset split ──────────────────────────────────────────────
  // Cash accounts (type=cash AND assetClass=cash, active quantity) are shown in
  // the dedicated "Conti Correnti" section above the table, not in the table.
  const cashAssets = useMemo(
    () => assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash' && a.quantity > 0),
    [assets]
  );
  const nonCashAssets = useMemo(
    () => assets.filter((a) => !(a.type === 'cash' && a.assetClass === 'cash')),
    [assets]
  );

  // ─── Cash asset handlers ──────────────────────────────────────────────────────
  const handleCashDelete = async (assetId: string) => {
    try {
      await deleteAssetMutation.mutateAsync(assetId);
      toast.success('Asset eliminato con successo');
      setCashDetailOpen(false);
      setSelectedCashAsset(null);
    } catch (error) {
      console.error('Error deleting cash asset:', error);
      toast.error("Errore nell'eliminazione dell'asset");
    }
  };

  // 2-click disarm pattern — consistent with AssetManagementTab and other pages.
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

  const handleCashEdit = (asset: Asset) => {
    setCashDetailOpen(false);
    setSelectedCashAsset(asset);
    setCashEditOpen(true);
  };

  const handleCashDialogClose = () => {
    setCashEditOpen(false);
    setSelectedCashAsset(null);
    // Invalidate assets + overview so the card grid, table, and hero block reflect any changes.
    if (user?.uid) {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user.uid) });
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading || loadingOverview) {
    return (
      <PageContainer>
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded bg-muted animate-pulse" />
        </div>
        {/* Hero + Liquid skeleton */}
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-40 bg-muted rounded animate-pulse mb-3" />
            <div className="h-12 w-52 bg-muted rounded animate-pulse mb-4" />
            <div className="flex gap-1.5 mb-3">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-[68px] bg-muted rounded animate-pulse mb-2" />
            <div className="h-3 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-32 bg-muted rounded animate-pulse mb-3" />
            <div className="h-8 w-36 bg-muted rounded animate-pulse mb-4" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="h-10 w-64 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        label="Portfolio"
        title="Patrimonio"
        description="Gestisci e monitora il tuo patrimonio"
      />

      {/* ── HERO + LIQUID — same as Panoramica, data from shared RQ cache ── */}
      <motion.section
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">

          {/* Hero Card */}
          <motion.div layout="position" transition={springLayoutTransition} variants={heroMetricSettle}>
            <Card className="rounded-2xl overflow-hidden h-full">
              <CardContent className="p-[22px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Patrimonio Totale Lordo
                </p>

                <OverviewAnimatedCurrency
                  value={totalValue}
                  animateOnMount={true}
                  className="text-[44px] font-bold font-mono tracking-[-0.03em] desktop:text-[54px]"
                />

                {/* Variation chips */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {overview?.variations.monthly && (
                    <span className={cn(
                      'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                      'text-[15px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.monthly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.monthly.value >= 0
                        ? <TrendingUp className="h-[13px] w-[13px]" />
                        : <TrendingDown className="h-[13px] w-[13px]" />
                      }
                      {overview.variations.monthly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.monthly.value)}{' '}
                      ({overview.variations.monthly.percentage >= 0 ? '+' : ''}
                      {overview.variations.monthly.percentage.toFixed(2)}%) questo mese
                    </span>
                  )}
                  {overview?.variations.yearly && (
                    <span className={cn(
                      'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                      'text-[15px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.yearly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.yearly.value >= 0
                        ? <TrendingUp className="h-[13px] w-[13px]" />
                        : <TrendingDown className="h-[13px] w-[13px]" />
                      }
                      {overview.variations.yearly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.yearly.value)}{' '}
                      ({overview.variations.yearly.percentage >= 0 ? '+' : ''}
                      {overview.variations.yearly.percentage.toFixed(2)}%) YTD
                    </span>
                  )}
                </div>

                {/* G/P non realizzato — shown only when at least one asset has cost basis */}
                {totalGainLoss !== 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">G/P non realizzato</span>
                    <span className={cn(
                      'text-[13px] font-semibold font-mono tabular-nums',
                      totalGainLoss > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {totalGainLoss > 0 ? '+' : ''}{formatCurrency(totalGainLoss)}
                      <span className="ml-1.5 text-[11px] opacity-80">
                        ({totalGainLoss > 0 ? '+' : ''}{formatNumber(totalGainPct, 2)}%)
                      </span>
                    </span>
                  </div>
                )}

                {/* Area sparkline — last 12 months, edge-to-edge via -mx-[22px] */}
                {sparkline12m.length >= 2 && (
                  <>
                    <div className="-mx-[22px] mt-3" style={{ height: 68 }}>
                      <NetWorthSparkline
                        data={sparkline12m}
                        filled={true}
                        color="var(--chart-1)"
                        height={68}
                      />
                    </div>
                    <div className="flex justify-between mt-1 mb-3 px-px text-[10px] text-muted-foreground font-mono">
                      <span>{cachedFormatCurrencyEUR(sparkline12m[0].totalNetWorth, true)}</span>
                      <span>{cachedFormatCurrencyEUR(sparkline12m[sparkline12m.length - 1].totalNetWorth, true)}</span>
                    </div>
                  </>
                )}

                <p className="text-[11px] text-muted-foreground mt-2.5">
                  {(overview?.flags.assetCount ?? 0) === 0
                    ? 'Aggiungi asset per iniziare'
                    : `${overview?.flags.assetCount ?? 0} asset in portafoglio`}
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Liquid Card */}
          <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
            <Card className="rounded-2xl h-full">
              <CardContent className="p-[22px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Sintesi Patrimoniale
                </p>

                <OverviewAnimatedCurrency
                  value={liquidNetTotal}
                  animateOnMount={true}
                  startDelay={105}
                  duration={390}
                  className="text-[36px] font-bold font-mono tracking-[-0.025em]"
                />

                {/* 3-row breakdown + Patrimonio Totale Lordo footer */}
                <div className="mt-3 pt-3 border-t border-border divide-y divide-border">
                  {[
                    {
                      label: 'Liquidità',
                      value: overview?.metrics.cashNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.cashNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                    {
                      label: 'Investimenti Liquidabili',
                      value: overview?.metrics.liquidInvestmentsNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.liquidInvestmentsNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                    {
                      label: 'Investimenti Illiquidi',
                      value: overview?.metrics.illiquidNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.illiquidNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-[7px]">
                      <span className="text-[14px] text-muted-foreground">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-mono tabular-nums text-foreground">
                          {cachedFormatCurrencyEUR(row.value)}
                        </span>
                        <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-[42px] text-right">
                          {row.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Footer: Patrimonio Totale Lordo */}
                  <div className="flex items-center justify-between py-[7px]">
                    <span className="text-[14px] font-semibold text-foreground">Patrimonio Totale Lordo</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold font-mono tabular-nums text-foreground">
                        {cachedFormatCurrencyEUR(totalValue)}
                      </span>
                      <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-[42px] text-right">
                        100.0%
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Fiscal rows — shown only when cost basis tracking is enabled ── */}
                {overview?.flags.hasCostBasisTracking && overview.metrics && (
                  <div className="mt-3 pt-3 border-t border-border divide-y divide-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground pb-2">
                      Impatto Fiscale
                    </p>
                    {[
                      {
                        label: 'Plusvalenze Non Realizzate',
                        value: overview.metrics.unrealizedGains,
                        className: overview.metrics.unrealizedGains >= 0
                          ? 'text-green-500 dark:text-green-400'
                          : 'text-red-500 dark:text-red-400',
                        prefix: overview.metrics.unrealizedGains >= 0 ? '+' : '',
                      },
                      {
                        label: 'Tasse Stimate',
                        value: overview.metrics.estimatedTaxes,
                        className: 'text-amber-500 dark:text-amber-400',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Liquidabile Netto',
                        value: overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Illiquido Netto',
                        value: overview.metrics.netTotal - overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                      {
                        label: 'Pat. Netto Totale',
                        value: overview.metrics.netTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between py-[7px]">
                        <span className="text-[14px] text-muted-foreground">{row.label}</span>
                        <span className={cn('text-[14px] font-bold font-mono tabular-nums', row.className)}>
                          {row.prefix}{cachedFormatCurrencyEUR(row.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </motion.section>

      {/* ── CONTI CORRENTI — cash accounts shown as clickable cards ── */}
      <CashAccountsSection
        assets={cashAssets}
        onSelect={(asset) => {
          setSelectedCashAsset(asset);
          setCashDetailOpen(true);
        }}
      />

      {/* Cash account detail dialog */}
      <CashAccountDetailDialog
        asset={selectedCashAsset}
        open={cashDetailOpen}
        onClose={() => {
          setCashDetailOpen(false);
          setCashPendingDeleteId(undefined);
        }}
        onEdit={handleCashEdit}
        pendingDeleteId={cashPendingDeleteId}
        onDeleteClick={handleCashDeleteClick}
      />

      {/* AssetDialog for editing a cash account (opened from the detail dialog) */}
      <AssetDialog
        open={cashEditOpen}
        asset={selectedCashAsset}
        onClose={handleCashDialogClose}
      />

      {/* ── ASSET TABLE — cash assets excluded, performance metrics inline ── */}
      <AssetManagementTab
        assets={nonCashAssets}
        allAssets={assets}
        loading={loading}
        onRefresh={handleRefresh}
        snapshots={snapshots}
      />
    </PageContainer>
  );
}
