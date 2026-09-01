/**
 * Cashflow › Dividendi — a verdict over a tile grid (2026-08-23).
 *
 * The tab answers «quanto rendono i miei flussi?» before any number: the rule-generated verdict
 * (lib/utils/dividendiNarrative.ts) sits at the top next to the period axis, and under it a
 * 12-column bento of tiles, each answering ONE question with a reading line over its figures.
 * The payments list — table or calendar — is the last tile, the inventory it is.
 *
 *   Mobile (1 col):   Verdict → [periodo · +] → Incasso netto → Rendimento → Chi paga di più →
 *                     Affidabilità → Per anno → Pagamenti → Dettaglio
 *   Desktop (12 col): Incasso netto (5, 2 rows) | Affidabilità (3) | Rendimento (4)
 *                                               | Chi paga di più (4) | Per anno (3)
 *                     Pagamenti (12)
 *                     Dettaglio (collapsible, below the fold)
 *
 * ONE period axis governs the verdict and every tile. The instrument/type filters narrow ONLY
 * the Pagamenti list: a YOC computed over one instrument is not the portfolio's YOC, and a
 * leaderboard filtered to a single payer is not a leaderboard.
 *
 * TWO WINDOWS, BOTH NAMED. Everything derived in the browser (dividendAnalytics) follows the
 * picker. The Rendimento tile does not: YOC and current yield are TTM on the current holding
 * and DPS growth runs on closed calendar years, all measured by the server — so that tile says
 * so in its aside and its footer rather than pretending to follow the axis (AGENTS.md →
 * Centri di Costo, "a view that displays a period must name the window of every figure that
 * uses a different one").
 *
 * WHY IN-MEMORY: the tab already receives the full dividend list as a prop, so every period
 * view is derived without a refetch and switching period is instant. The server block is one
 * range-free query (`useDividendStats`), cached per owner.
 */
'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Skeleton } from '@/components/ui/skeleton';
import { useDividendStats } from '@/lib/hooks/useDividendStats';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { DividendDialog } from './DividendDialog';
import { DividendTable } from './DividendTable';
import { DividendCalendar } from './DividendCalendar';
import { DividendRecordDetailsDialog } from './DividendRecordDetailsDialog';
import { ProvisionalCouponBanner } from './ProvisionalCouponBanner';
import { InflationRateDialog } from './InflationRateDialog';
import { DividendiDettaglio } from './DividendiDettaglio';
import { IncassoNettoTile } from './tiles/IncassoNettoTile';
import { AffidabilitaTile } from './tiles/AffidabilitaTile';
import { RendimentoTile } from './tiles/RendimentoTile';
import { PagatoriTile } from './tiles/PagatoriTile';
import { PerAnnoTile } from './tiles/PerAnnoTile';
import { PagamentiTile } from './tiles/PagamentiTile';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { Download, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import {
  DividendPeriod,
  buildCoverageMonths,
  computeNetComparison,
  computePeriodSummary,
  computeReliability,
  monthsInWindow,
  nextPayments,
  rankPayerShares,
  resolveMonthlyWindow,
  resolvePeriodBounds,
  sliceForList,
  summarizePayments,
  summarizeYearlyIncome,
  summarizeYield,
  filterPaidByPeriod,
} from '@/lib/utils/dividendAnalytics';
import {
  buildDividendiVerdict,
  describeComparisonLabel,
  describeConcentration,
  describeDividendPeriod,
  describeMonthlyWindow,
  describeNetIncome,
  describePayerRanking,
  describePayersFooter,
  describePaymentsCount,
  describePaymentsFooter,
  describePaymentsInventory,
  describePeriodEyebrow,
  describeReliability,
  describeYearlyFooter,
  describeYearlyIncome,
  describeYield,
  describeYieldFooter,
  dryMonthNames,
} from '@/lib/utils/dividendiNarrative';

interface DividendTrackingTabProps {
  dividends: Dividend[];
  assets: Asset[];
  loading: boolean;
  /** The dividends/assets read failed: say so, never render an unread ledger as zero. */
  loadFailed: boolean;
  onRefresh: () => Promise<void>;
}

const PERIOD_OPTIONS: { value: DividendPeriod; label: string }[] = [
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'rolling12', label: '12 mesi' },
  { value: 'all', label: 'Storico' },
];

/** Months of the hero's bars behind a single month; a year and the trailing windows set their own. */
const FLOW_MONTHS = 6;
/** Payers listed before the residual row closes the list. */
const RANKED_PAYERS = 5;
/** Announced payments listed in the hero's footer. */
const UPCOMING_SHOWN = 3;

/** The page's own grid, so the loading state has the proportions of what replaces it. */
const SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 3, lines: 5 },
  { span: 4, lines: 5 },
  { span: 4, lines: 6 },
  { span: 3, lines: 4 },
  { span: 12, lines: 6 },
];

const ALL = '__all__';

export function DividendTrackingTab({ dividends, assets, loading, loadFailed, onRefresh }: DividendTrackingTabProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();

  // --- Primary control: the one period axis ---
  const [period, setPeriod] = useState<DividendPeriod>('year');

  // --- Secondary filters: they narrow the Pagamenti list ONLY ---
  const [assetFilter, setAssetFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // --- Dialogs (the tab owns every one of them) ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDividend, setSelectedDividend] = useState<Dividend | null>(null);
  const [detailDividend, setDetailDividend] = useState<Dividend | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailDialogStyle, setDetailDialogStyle] = useState<CSSProperties | undefined>(undefined);
  const [inflationCoupon, setInflationCoupon] = useState<Dividend | null>(null);
  const [inflationDialogOpen, setInflationDialogOpen] = useState(false);
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [scraping, setScraping] = useState(false);
  const detailDialogRef = useRef<HTMLDivElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  const now = useMemo(() => new Date(), []);

  // The server block: YOC, DPS growth, per-instrument total return. Range-free by design.
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDividendStats(ownerId);

  // --- Period derivations (pure layer, no refetch) ---
  // The list's slice first: the hero reads its announced half, so it must exist before it.
  const periodList = useMemo(() => sliceForList(dividends, period, now), [dividends, period, now]);
  // The same window the slice used, so the calendar can never browse past what it holds.
  const periodBounds = useMemo(() => resolvePeriodBounds(period, now), [period, now]);

  const summary = useMemo(() => computePeriodSummary(dividends, period, now), [dividends, period, now]);
  const comparison = useMemo(() => computeNetComparison(dividends, period, now), [dividends, period, now]);
  const reliability = useMemo(() => computeReliability(dividends, period, now), [dividends, period, now]);
  const ranking = useMemo(() => rankPayerShares(dividends, period, now, RANKED_PAYERS), [dividends, period, now]);
  const yearly = useMemo(() => summarizeYearlyIncome(dividends, now), [dividends, now]);
  const monthly = useMemo(() => resolveMonthlyWindow(dividends, period, now, FLOW_MONTHS), [dividends, period, now]);
  const coverage = useMemo(() => buildCoverageMonths(dividends, period, now), [dividends, period, now]);
  // What the hero says about announced money is scoped to the period, exactly like its net:
  // an unscoped total sitting beside a scoped one is two windows in one tile, and it printed
  // «127 €» next to a list that held one 57 € coupon.
  const upcoming = useMemo(() => nextPayments(periodList, now, UPCOMING_SHOWN), [periodList, now]);
  const upcomingNet = useMemo(() => summarizePayments(periodList, now).announcedNet, [periodList, now]);
  // The verdict's «il prossimo stacco è …» is the portfolio's, not the period's: it names an
  // instrument AND a date, so it cannot be mistaken for a figure of the selected window.
  const nextOverall = useMemo(() => nextPayments(dividends, now, 1)[0] ?? null, [dividends, now]);
  const yieldSummary = useMemo(() => summarizeYield(stats ?? null), [stats]);
  const windowMonths = useMemo(
    () => monthsInWindow(period, filterPaidByPeriod(dividends, period, now), now),
    [dividends, period, now],
  );

  // The top three payers' combined share, for the concentration footer — null when there is no
  // third payer, so the sentence never claims a "primi tre" that does not exist.
  const topThreeShare = useMemo(() => {
    if (ranking.payerCount <= 3 || ranking.total <= 0) return null;
    return ranking.rows.slice(0, 3).reduce((sum, row) => sum + row.percentage, 0);
  }, [ranking]);

  const subject = describeDividendPeriod(period, now);
  const comparisonLabel = describeComparisonLabel(period, now);

  const verdict = useMemo(
    () =>
      buildDividendiVerdict({
        period,
        now,
        summary,
        comparison,
        payerCount: ranking.payerCount,
        yieldSummary,
        next: nextOverall,
        upcomingNet,
      }),
    [period, now, summary, comparison, ranking.payerCount, yieldSummary, nextOverall, upcomingNet],
  );

  // --- The list's own filters ---
  // Options come from the dividends themselves, not the live portfolio: only instruments that
  // actually paid appear, and a sold asset that paid in the past stays filterable.
  const assetOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const d of periodList) if (!byId.has(d.assetId)) byId.set(d.assetId, d.assetTicker || d.assetName);
    return [...byId.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }, [periodList]);

  // An instrument absent from the current slice is no filter at all — derived, never reset in
  // an effect (react-hooks/set-state-in-effect).
  const effectiveAssetFilter = assetFilter !== ALL && assetOptions.some((o) => o.id === assetFilter) ? assetFilter : ALL;
  const hasListFilters = effectiveAssetFilter !== ALL || typeFilter !== ALL;

  const listDividends = useMemo(() => {
    let list = periodList;
    if (effectiveAssetFilter !== ALL) list = list.filter((d) => d.assetId === effectiveAssetFilter);
    if (typeFilter !== ALL) list = list.filter((d) => d.dividendType === typeFilter);
    return list;
  }, [periodList, effectiveAssetFilter, typeFilter]);

  const inventory = useMemo(() => summarizePayments(listDividends, now), [listDividends, now]);

  // Future inflation-linked coupons still at the provisional fixed floor.
  const provisionalCoupons = useMemo(
    () =>
      dividends
        .filter((d) => d.isProvisional && toDate(d.paymentDate) > now)
        .sort((a, b) => toDate(a.paymentDate).getTime() - toDate(b.paymentDate).getTime()),
    [dividends, now],
  );

  // --- Handlers ---
  const handleCreate = useCallback(() => {
    setSelectedDividend(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = (dividend: Dividend) => {
    setSelectedDividend(dividend);
    setDialogOpen(true);
  };

  const handleOpenDetails = (dividend: Dividend, triggerElement: HTMLElement) => {
    detailTriggerRef.current = triggerElement;
    setDetailDividend(dividend);
    setDetailDialogOpen(true);
  };

  const assetsWithIsinCount = useMemo(() => assets.filter((a) => a.isin && a.isin.trim() !== '').length, [assets]);

  const handleScrapeAll = useCallback(() => {
    if (!user || !ownerId) return;
    if (assetsWithIsinCount === 0) {
      toast.error('Nessun asset con ISIN trovato per lo scraping');
      return;
    }
    setScrapeDialogOpen(true);
  }, [user, ownerId, assetsWithIsinCount]);

  // The page header owns the two page-level actions; the tab owns the dialogs behind them, so
  // the two talk through window events — the same channel Tracciamento's «Nuova Spesa» uses.
  useEffect(() => {
    const onAdd = () => handleCreate();
    const onScrape = () => handleScrapeAll();
    window.addEventListener('cashflow:add-dividend', onAdd);
    window.addEventListener('cashflow:scrape-dividends', onScrape);
    return () => {
      window.removeEventListener('cashflow:add-dividend', onAdd);
      window.removeEventListener('cashflow:scrape-dividends', onScrape);
    };
  }, [handleCreate, handleScrapeAll]);

  // The dialog grows out of the row that opened it. Only the measuring branch lives here: the
  // clear belongs to `onOpenChange`, which is where closing actually happens — an effect that
  // also cleared would be a setState in an effect for a state change already handled.
  useEffect(() => {
    if (!detailDialogOpen) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frameId = requestAnimationFrame(() => {
      const trigger = detailTriggerRef.current;
      const dialog = detailDialogRef.current;
      if (!trigger || !dialog) {
        setDetailDialogStyle(undefined);
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      setDetailDialogStyle({
        transformOrigin: `${triggerRect.left + triggerRect.width / 2 - dialogRect.left}px ${
          triggerRect.top + triggerRect.height / 2 - dialogRect.top
        }px`,
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [detailDialogOpen]);

  const executeScrapeAll = async () => {
    if (!user || !ownerId) return;
    const assetsWithIsin = assets.filter((a) => a.isin && a.isin.trim() !== '');
    try {
      setScraping(true);
      let successCount = 0;
      let failedCount = 0;
      for (const asset of assetsWithIsin) {
        try {
          const response = await authenticatedFetch('/api/dividends/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: ownerId, assetId: asset.id }),
          });
          if (response.ok) {
            const result = await response.json();
            if (result.scraped > 0) successCount++;
          } else failedCount++;
        } catch (error) {
          console.error(`Error scraping ${asset.ticker}:`, error);
          failedCount++;
        }
      }
      if (successCount > 0) {
        toast.success(`Scaricati dividendi per ${successCount} asset`);
        await onRefresh();
      } else {
        toast.warning('Nessun nuovo dividendo trovato');
      }
      if (failedCount > 0) toast.warning(`${failedCount} asset hanno fallito lo scraping`);
    } catch (error) {
      console.error('Error scraping dividends:', error);
      toast.error('Errore durante lo scraping dei dividendi');
    } finally {
      setScraping(false);
    }
  };

  const handleExportCSV = () => {
    if (listDividends.length === 0) {
      toast.error('Nessun dividendo da esportare');
      return;
    }
    const headers = [
      'Asset Ticker', 'Asset Name', 'Ex-Date', 'Payment Date', 'Dividend Per Share',
      'Quantity', 'Gross Amount', 'Tax Amount', 'Net Amount', 'Currency', 'Type', 'Notes',
    ];
    const rows = listDividends.map((d) => [
      d.assetTicker,
      d.assetName,
      format(toDate(d.exDate), 'dd/MM/yyyy', { locale: it }),
      format(toDate(d.paymentDate), 'dd/MM/yyyy', { locale: it }),
      d.dividendPerShare.toFixed(4),
      d.quantity.toString(),
      d.grossAmount.toFixed(2),
      d.taxAmount.toFixed(2),
      d.netAmount.toFixed(2),
      d.currency,
      dividendTypeLabels[d.dividendType],
      d.notes || '',
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dividendi_${format(now, 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Esportati ${listDividends.length} dividendi in CSV`);
  };

  if (resolveSurfaceState({ loading: loading, failed: loadFailed }) === 'failed') {
    return (
      <ErrorNotice
        className="max-w-[920px]"
        notice={describeReadFailure({
          consequence: 'Dividendi e strumenti non sono stati letti: un incasso non letto non è un incasso mancato.',
          untouched: 'I dividendi registrati non sono stati toccati.',
        })}
      />
    );
  }

  if (loading) {
    return (
      <TileGridSkeleton
        cells={SKELETON_CELLS}
        className="pt-1"
        toolbar={<Skeleton className="mx-auto h-9 w-full max-w-[320px] rounded-lg desktop:hidden" />}
      />
    );
  }

  const periodPicker = (
    <SegmentedControl
      options={PERIOD_OPTIONS}
      value={period}
      onChange={setPeriod}
      aria-label="Periodo"
      className="w-full"
    />
  );

  const listFilters = (
    <>
      <Select value={effectiveAssetFilter} onValueChange={setAssetFilter}>
        <SelectTrigger className="h-8 w-[190px] text-[13px]" aria-label="Filtra per strumento">
          <SelectValue placeholder="Tutti gli strumenti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tutti gli strumenti</SelectItem>
          {assetOptions.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="h-8 w-[150px] text-[13px]" aria-label="Filtra per tipo">
          <SelectValue placeholder="Tutti i tipi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tutti i tipi</SelectItem>
          {Object.entries(dividendTypeLabels).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasListFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setAssetFilter(ALL);
            setTypeFilter(ALL);
          }}
        >
          <X className="h-3.5 w-3.5" />
          Azzera
        </Button>
      )}
    </>
  );

  const viewSwitch = (
    <SegmentedControl
      options={[
        { value: 'table', label: 'Tabella' },
        { value: 'calendar', label: 'Calendario' },
      ]}
      value={viewMode}
      onChange={(v) => setViewMode(v as 'table' | 'calendar')}
      aria-label="Vista dei pagamenti"
      className="w-[210px]"
    />
  );

  const exportButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExportCSV}
      disabled={listDividends.length === 0}
      aria-label="Esporta i pagamenti elencati come CSV"
      className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      Esporta CSV
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* ── Verdict, with the one period axis beside it on desktop ──────────────── */}
      <div className="flex items-start justify-between gap-6 pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sui dividendi" />
        <div className="hidden w-[320px] shrink-0 desktop:block">{periodPicker}</div>
      </div>

      {/* ── Below desktop: the axis under the verdict, with the only «add» affordance
          there is on a phone — the bottom-nav FAB belongs to Tracciamento ─────────── */}
      <div className="flex items-center gap-2 desktop:hidden">
        <div className="min-w-0 flex-1">{periodPicker}</div>
        <Button
          size="icon"
          onClick={handleCreate}
          disabled={isDemo}
          aria-label={isDemo ? 'Aggiungi dividendo — non disponibile in modalità demo' : 'Aggiungi dividendo'}
          className="h-11 w-11 shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'order-1 tablet:col-span-2 desktop:order-none desktop:col-span-5 desktop:row-span-2')}>
          <IncassoNettoTile
            eyebrow={describePeriodEyebrow(period, now)}
            reading={describeNetIncome(summary, windowMonths)}
            net={summary.net}
            count={summary.count}
            comparison={comparison}
            comparisonLabel={comparisonLabel}
            months={monthly.points}
            highlightKey={monthly.highlightKey}
            windowLabel={describeMonthlyWindow(period, monthly.points.length)}
            upcoming={upcoming}
            upcomingNet={upcomingNet}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-3')}>
          <AffidabilitaTile
            reliability={reliability}
            reading={describeReliability(reliability, dryMonthNames(coverage))}
            months={coverage}
            footer={describeConcentration(reliability, topThreeShare)}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-2 desktop:order-none desktop:col-span-4')}>
          <RendimentoTile
            summary={yieldSummary}
            reading={yieldSummary ? describeYield(yieldSummary) : null}
            footer={yieldSummary ? describeYieldFooter(yieldSummary) : null}
            isLoading={statsLoading}
            isError={statsError}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-3 desktop:order-none desktop:col-span-4')}>
          <PagatoriTile
            ranking={ranking}
            reading={describePayerRanking(ranking, subject.inPeriod)}
            footer={describePayersFooter(upcomingNet)}
            emptyCopy={`Nessun dividendo incassato ${subject.inPeriod}.`}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-5 desktop:order-none desktop:col-span-3')}>
          <PerAnnoTile summary={yearly} reading={describeYearlyIncome(yearly)} footer={describeYearlyFooter(yearly)} />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'order-6 tablet:col-span-2 desktop:order-none desktop:col-span-12')}>
          <PagamentiTile
            aside={describePaymentsCount(listDividends.length, periodList.length)}
            reading={describePaymentsInventory(inventory)}
            notice={
              provisionalCoupons.length > 0 ? (
                <ProvisionalCouponBanner
                  coupons={provisionalCoupons}
                  isDemo={isDemo}
                  onSelect={(coupon) => {
                    setInflationCoupon(coupon);
                    setInflationDialogOpen(true);
                  }}
                />
              ) : undefined
            }
            toolbar={
              <div className="flex flex-wrap items-center gap-2">
                {listFilters}
                <div className="ml-auto flex items-center gap-2">
                  {viewSwitch}
                  {exportButton}
                </div>
              </div>
            }
            mobileToolbar={
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">{viewSwitch}</div>
                <div className="flex flex-wrap items-center gap-2">{listFilters}</div>
              </div>
            }
            footer={describePaymentsFooter()}
          >
            {viewMode === 'calendar' ? (
              <DividendCalendar dividends={listDividends} now={now} bounds={periodBounds} />
            ) : (
              <DividendTable
                dividends={listDividends}
                onEdit={handleEdit}
                onOpenDetails={handleOpenDetails}
                onRefresh={onRefresh}
                showTotals
                activeDividendId={detailDividend?.id ?? null}
                isDemo={isDemo}
                now={now}
              />
            )}
          </PagamentiTile>
        </div>
      </div>

      {/* ── Dettaglio, below the fold ───────────────────────────────────────────── */}
      {!statsError && <DividendiDettaglio stats={stats ?? null} now={now} />}

      {/* Scrape confirmation */}
      <AlertDialog open={scrapeDialogOpen} onOpenChange={setScrapeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scarica dividendi storici</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno scaricati i dividendi per {assetsWithIsinCount} asset con ISIN. Questa operazione potrebbe
              richiedere alcuni minuti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={executeScrapeAll} disabled={scraping}>
              {scraping ? 'Scaricamento…' : 'Scarica'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DividendDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedDividend(null);
        }}
        dividend={selectedDividend}
        onSuccess={onRefresh}
      />

      <DividendRecordDetailsDialog
        open={detailDialogOpen}
        dividend={detailDividend}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) setDetailDialogStyle(undefined);
        }}
        onEdit={handleEdit}
        onSetInflationRate={(d) => {
          setInflationCoupon(d);
          setInflationDialogOpen(true);
        }}
        dialogRef={detailDialogRef}
        style={detailDialogStyle}
      />

      <InflationRateDialog
        open={inflationDialogOpen}
        coupon={inflationCoupon}
        asset={assets.find((a) => a.id === inflationCoupon?.assetId) ?? null}
        onClose={() => setInflationDialogOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  );
}
