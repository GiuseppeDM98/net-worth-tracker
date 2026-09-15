/**
 * Cashflow › Dividendi — a verdict over a tile grid (2026-08-23).
 *
 * The tab answers «quanto rendono i miei flussi?» before any number: the rule-generated verdict
 * (lib/utils/dividendiNarrative.ts) sits at the top next to the period axis, and under it a
 * 12-column bento of tiles, each answering ONE question with a reading line over its figures.
 * The payments list — table or calendar — is the last tile, the inventory it is.
 *
 *   Mobile (1 col):   Verdict → [periodo · + · scarica] → Incasso netto → Rendimento → Chi paga
 *                     di più → Affidabilità → Per anno → Pagamenti → Dettaglio
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
 * so in its aside and its footer, and since 2026-09-14 the verdict's yield clause names the
 * window and the population too (AGENTS.md → Centri di Costo, "a view that displays a period
 * must name the window of every figure that uses a different one").
 *
 * TWO POPULATIONS, BOTH NAMED (2026-09-14, the owner's call). The verdict and the inventory
 * read the REGISTRY — every payment of the period, sold instruments included, because the
 * income was real. Affidabilità and Chi paga di più answer in the present tense («posso
 * contare su questo reddito?»), so they measure the instruments STILL HELD (`heldAssetIds`,
 * from the page's assets) and name what the sold ones paid in their own clause: on the
 * owner's mirror «Concentrazione alta: SPM.MI vale il 47%» was a risk on a stock already sold.
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
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { PageVerdict } from '@/components/ui/page-verdict';
import { Tile, TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { ErrorNotice } from '@/components/ui/error-notice';
import { EmptyState } from '@/components/ui/empty-state';
import { describeReadFailure, resolveSurfaceState } from '@/lib/utils/statesNarrative';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { Download, FileDown, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
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
  describeFilteredDividends,
  describeReliability,
  describeSoldIncomeNote,
  describeYearlyFooter,
  describeYearlyIncome,
  describeYield,
  describeYieldFooter,
  dryMonthNames,
} from '@/lib/utils/dividendiNarrative';
import { DIVIDEND_SCRAPE_SUBMITTING, describeModalStatus, describeScrapeReading } from '@/lib/utils/dialogNarrative';
import type { Narrative } from '@/lib/utils/narrative';

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

const VIEW_OPTIONS: { value: 'table' | 'calendar'; label: string }[] = [
  { value: 'table', label: 'Tabella' },
  { value: 'calendar', label: 'Calendario' },
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

/** A pill option is 44px on touch and the dense 32px on a pointer (AGENTS.md → Accessibility). */
const PILL_OPTION_CLASS = 'min-h-11 desktop:min-h-0';
/** The toolbar's controls: the same floor, `h-8` being the sanctioned dense idiom at 1440. */
const TOOLBAR_CONTROL_CLASS = 'h-11 desktop:h-8';
/** A `SelectTrigger` sizes itself through `data-[size]`, which outranks a bare `h-*`. */
const TOOLBAR_SELECT_CLASS = 'h-11 data-[size=default]:h-11 desktop:h-8 desktop:data-[size=default]:h-8';

/** The element that has the focus right now — the control an action was started from. */
function focusedControl(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

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
  // Where the focus goes back to when each modal closes: Radix restores it to whatever was
  // focused at open, which is `body` for a window event or a table row (measured 2026-09-14).
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const formTriggerRef = useRef<HTMLElement | null>(null);
  const scrapeTriggerRef = useRef<HTMLElement | null>(null);

  const now = useMemo(() => new Date(), []);

  // The server block: YOC, DPS growth, per-instrument total return. Range-free by design.
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDividendStats(ownerId);

  // The instruments still in the portfolio — the population Affidabilità and Chi paga measure.
  const heldAssetIds = useMemo(() => new Set(assets.filter((a) => a.quantity > 0).map((a) => a.id)), [assets]);

  // --- Period derivations (pure layer, no refetch) ---
  // The list's slice first: the hero reads its announced half, so it must exist before it.
  const periodList = useMemo(() => sliceForList(dividends, period, now), [dividends, period, now]);
  // The same window the slice used, so the calendar can never browse past what it holds.
  const periodBounds = useMemo(() => resolvePeriodBounds(period, now), [period, now]);

  const summary = useMemo(() => computePeriodSummary(dividends, period, now), [dividends, period, now]);
  const comparison = useMemo(() => computeNetComparison(dividends, period, now), [dividends, period, now]);
  const reliability = useMemo(() => computeReliability(dividends, period, now, heldAssetIds), [dividends, period, now, heldAssetIds]);
  const ranking = useMemo(
    () => rankPayerShares(dividends, period, now, RANKED_PAYERS, heldAssetIds),
    [dividends, period, now, heldAssetIds],
  );
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

  // The top three HELD payers' combined share, for the concentration footer — null when there
  // is no third held payer, so the sentence never claims a "primi tre" that does not exist.
  const topThreeShare = useMemo(() => {
    if (ranking.heldPayerCount <= 3 || ranking.total <= 0) return null;
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
        // The registry's count: every payer of the period, sold or not, because the net beside
        // it is the registry's too.
        payerCount: ranking.payerCount,
        yieldSummary,
        next: nextOverall,
        upcomingNet,
      }),
    [period, now, summary, comparison, ranking.payerCount, yieldSummary, nextOverall, upcomingNet],
  );

  // Affidabilità's footer: the concentration of the held income, then where the sold income went.
  const reliabilityFooter = useMemo<Narrative | null>(() => {
    const concentration = describeConcentration(reliability, topThreeShare);
    const sold = describeSoldIncomeNote(ranking.soldNet, ranking.soldPayerCount);
    if (!concentration) return sold;
    if (!sold) return concentration;
    return [...concentration, { text: ' ' }, ...sold];
  }, [reliability, topThreeShare, ranking.soldNet, ranking.soldPayerCount]);

  // --- The list's own filters ---
  // Options come from the dividends themselves, not the live portfolio: only instruments that
  // actually paid appear, and a sold asset that paid in the past stays filterable.
  const assetOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const d of periodList) if (!byId.has(d.assetId)) byId.set(d.assetId, d.assetTicker || d.assetName);
    return [...byId.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }, [periodList]);

  // The types the period actually holds: a filter offering six types over two is a menu of
  // dead options.
  const typeOptions = useMemo(() => {
    const present = new Set(periodList.map((d) => d.dividendType));
    return Object.entries(dividendTypeLabels).filter(([value]) => present.has(value as Dividend['dividendType']));
  }, [periodList]);

  // An instrument absent from the current slice is no filter at all — derived, never reset in
  // an effect (react-hooks/set-state-in-effect). The same for a type.
  const effectiveAssetFilter = assetFilter !== ALL && assetOptions.some((o) => o.id === assetFilter) ? assetFilter : ALL;
  const effectiveTypeFilter = typeFilter !== ALL && typeOptions.some(([value]) => value === typeFilter) ? typeFilter : ALL;
  const hasListFilters = effectiveAssetFilter !== ALL || effectiveTypeFilter !== ALL;

  const listDividends = useMemo(() => {
    let list = periodList;
    if (effectiveAssetFilter !== ALL) list = list.filter((d) => d.assetId === effectiveAssetFilter);
    if (effectiveTypeFilter !== ALL) list = list.filter((d) => d.dividendType === effectiveTypeFilter);
    return list;
  }, [periodList, effectiveAssetFilter, effectiveTypeFilter]);

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
    formTriggerRef.current = focusedControl();
    setSelectedDividend(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = (dividend: Dividend) => {
    formTriggerRef.current = focusedControl();
    setSelectedDividend(dividend);
    setDialogOpen(true);
  };

  const handleOpenDetails = (dividend: Dividend, triggerElement: HTMLElement) => {
    detailTriggerRef.current = triggerElement;
    setDetailDividend(dividend);
    setDetailDialogOpen(true);
  };

  const assetsWithIsin = useMemo(() => assets.filter((a) => a.isin && a.isin.trim() !== ''), [assets]);

  const handleScrapeAll = useCallback(() => {
    if (!user || !ownerId) return;
    scrapeTriggerRef.current = focusedControl();
    setScrapeDialogOpen(true);
  }, [user, ownerId]);

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

  /**
   * One request per instrument with an ISIN, the modal open and its reading saying «Sto
   * scaricando» for the whole run — an `AlertDialogAction` used to close the modal on the
   * click, so a run «di alcuni minuti» had no signal at all until its toast.
   */
  const executeScrapeAll = async () => {
    if (!user || !ownerId) return;
    try {
      setScraping(true);
      let successCount = 0;
      let failedCount = 0;
      // What the route dropped as older than each asset's floor (holding start, else the day
      // the asset was created in the app): counted so the toast can say WHY a history-rich
      // instrument produced nothing, and how to recover — until 2026-09-13 this read as
      // «Nessun nuovo dividendo trovato» and nothing else.
      let filteredCount = 0;
      let filteredByCreation = 0;
      for (const asset of assetsWithIsin) {
        try {
          const response = await authenticatedFetch('/api/dividends/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: ownerId, assetId: asset.id }),
          });
          if (response.ok) {
            const result = await response.json();
            if (result.created > 0) successCount++;
            if (typeof result.filtered === 'number' && result.filtered > 0) {
              filteredCount += result.filtered;
              if (result.floorSource === 'created') filteredByCreation++;
            }
          } else failedCount++;
        } catch (error) {
          console.error(`Error scraping ${asset.ticker}:`, error);
          failedCount++;
        }
      }
      if (successCount > 0) {
        toast.success(`Scaricati dividendi per ${successCount} ${successCount === 1 ? 'strumento' : 'strumenti'}`);
        await onRefresh();
      } else {
        toast.warning('Nessun nuovo dividendo trovato');
      }
      if (filteredCount > 0) {
        toast.info(describeFilteredDividends(filteredCount, filteredByCreation), { duration: 12_000 });
      }
      if (failedCount > 0) toast.warning(`${failedCount} ${failedCount === 1 ? 'strumento ha' : 'strumenti hanno'} fallito lo scarico`);
    } catch (error) {
      console.error('Error scraping dividends:', error);
      toast.error('Errore durante lo scarico dei dividendi');
    } finally {
      setScraping(false);
      setScrapeDialogOpen(false);
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

  // The axis picks a VALUE the whole page reads, so it is a radiogroup, not a tablist with no
  // panel (AGENTS.md → Accessibility); arrows move it, one Tab stop, 44px on touch.
  const periodPicker = (
    <SegmentedPill
      options={PERIOD_OPTIONS}
      value={period}
      onChange={setPeriod}
      layoutId="dividendi-period-axis"
      ariaLabel="Periodo"
      semantics="radio"
      optionClassName={PILL_OPTION_CLASS}
      className="w-full"
    />
  );

  const nothingRecorded = dividends.length === 0;

  const addButtonLabel = isDemo ? 'Aggiungi dividendo — non disponibile in modalità demo' : 'Aggiungi dividendo';

  const listFilters = (
    <>
      <Select value={effectiveAssetFilter} onValueChange={setAssetFilter}>
        <SelectTrigger className={cn(TOOLBAR_SELECT_CLASS, 'w-[190px] text-[13px]')} aria-label="Filtra per strumento">
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
      <Select value={effectiveTypeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className={cn(TOOLBAR_SELECT_CLASS, 'w-[150px] text-[13px]')} aria-label="Filtra per tipo">
          <SelectValue placeholder="Tutti i tipi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tutti i tipi</SelectItem>
          {typeOptions.map(([value, label]) => (
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
          className={cn(TOOLBAR_CONTROL_CLASS, 'gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground')}
          onClick={() => {
            setAssetFilter(ALL);
            setTypeFilter(ALL);
          }}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Azzera
        </Button>
      )}
    </>
  );

  const viewSwitch = (
    <SegmentedPill
      options={VIEW_OPTIONS}
      value={viewMode}
      onChange={setViewMode}
      layoutId="dividendi-view-switch"
      ariaLabel="Vista dei pagamenti"
      optionClassName={PILL_OPTION_CLASS}
      className="w-fit"
    />
  );

  // `FileDown`, not `Download`: the header's download is the scrape from Borsa Italiana, and one
  // icon for two opposite movements of data read as one action.
  const exportButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExportCSV}
      disabled={listDividends.length === 0}
      aria-label="Esporta i pagamenti elencati come CSV"
      className={cn(TOOLBAR_CONTROL_CLASS, 'gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground')}
    >
      <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
      Esporta CSV
    </Button>
  );

  // The header's «Scarica dividendi storici» is `hidden desktop:flex`; on a phone the same act
  // sits beside «Esporta CSV» — the two movements of data, one out and one in, in one row.
  const scrapeButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleScrapeAll}
      disabled={isDemo}
      aria-label={isDemo ? 'Scarica dividendi storici — non disponibile in modalità demo' : 'Scarica dividendi storici per gli strumenti con ISIN'}
      className={cn(TOOLBAR_CONTROL_CLASS, 'gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground desktop:hidden')}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Scarica storico
    </Button>
  );

  const scrapeReading = describeModalStatus(scraping ? { phase: 'submitting' } : { phase: 'idle' }, {
    idle: describeScrapeReading(assetsWithIsin.map((a) => getAssetDisplayTicker(a))),
    submitting: DIVIDEND_SCRAPE_SUBMITTING,
  });

  return (
    <div className="space-y-4">
      {/* ── Verdict, with the one period axis beside it on desktop ──────────────── */}
      <div className="flex items-start justify-between gap-6 pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto sui dividendi" />
        {!nothingRecorded && <div className="hidden w-[320px] shrink-0 desktop:block">{periodPicker}</div>}
      </div>

      {/* ── Below desktop: the axis under the verdict, with the only «add» affordance there is
          on a phone — the bottom-nav FAB belongs to Tracciamento. The scrape lives in the
          Pagamenti toolbar there: four period labels and two 44px squares did not fit 390. ── */}
      {!nothingRecorded && (
        <div className="flex items-center gap-2 desktop:hidden">
          <div className="min-w-0 flex-1">{periodPicker}</div>
          <Button size="icon" onClick={handleCreate} disabled={isDemo} aria-label={addButtonLabel} className="h-11 w-11 shrink-0">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      {nothingRecorded ? (
        // Nothing recorded is the FIRST name of an absence (doc/guide/stati.md): one tile that
        // names the next action, never a hero at «0 €» beside «Copertura 0%» and «Chi paga di
        // più 0 €» (the page did exactly that until 2026-09-14). The action lives here because
        // this is the surface that owns the missing thing.
        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
            <Tile eyebrow="Pagamenti" ariaLabel="Pagamenti">
              <EmptyState
                className="mt-3"
                message="Nessun pagamento registrato. Aggiungi il primo dividendo o la prima cedola, oppure scarica lo storico da Borsa Italiana per gli strumenti con ISIN: da lì in poi i pagamenti recenti arrivano da soli ogni giorno."
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="default" onClick={handleCreate} disabled={isDemo} aria-label={addButtonLabel}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Aggiungi dividendo
                    </Button>
                    <Button
                      size="default"
                      variant="outline"
                      onClick={handleScrapeAll}
                      disabled={isDemo || assetsWithIsin.length === 0}
                      aria-label={
                        assetsWithIsin.length === 0
                          ? 'Scarica dividendi storici — nessuno strumento ha un ISIN'
                          : 'Scarica dividendi storici per gli strumenti con ISIN'
                      }
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Scarica dividendi storici
                    </Button>
                  </div>
                }
              />
            </Tile>
          </div>
        </div>
      ) : (
        <>
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
                now={now}
              />
            </div>

            <div className={cn(TILE_CELL_CLASS, 'order-4 desktop:order-none desktop:col-span-3')}>
              <AffidabilitaTile
                reliability={reliability}
                reading={describeReliability(reliability, dryMonthNames(coverage))}
                months={coverage}
                footer={reliabilityFooter}
                emptyCopy={
                  ranking.soldPayerCount > 0
                    ? `Nessun incasso ${subject.inPeriod} dagli strumenti ancora in portafoglio: i ${ranking.soldPayerCount === 1 ? 'pagamenti vengono da uno strumento venduto' : `pagamenti vengono da ${ranking.soldPayerCount} strumenti venduti`}.`
                    : `Nessun incasso ${subject.inPeriod}: non c’è una regolarità da misurare.`
                }
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
                // The same order as the desktop toolbar: what narrows the list, then how it is shown.
                mobileToolbar={
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">{listFilters}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {viewSwitch}
                      {exportButton}
                      {scrapeButton}
                    </div>
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

          {/* ── Dettaglio, below the fold — or the failed read said in its place, never nothing ── */}
          {statsError ? (
            <ErrorNotice
              compact
              notice={describeReadFailure({
                consequence: 'Il dettaglio per strumento non è stato letto: crescita del dividendo e rendimento totale restano fuori.',
              })}
            />
          ) : (
            <DividendiDettaglio stats={stats ?? null} now={now} />
          )}
        </>
      )}

      {/* Scrape confirmation, in the modal vocabulary: the reading names the instruments and the
          floor, then says «Sto scaricando» for the whole run. */}
      <ResponsiveModal
        open={scrapeDialogOpen}
        onClose={() => {
          if (!scraping) setScrapeDialogOpen(false);
        }}
        width="sm"
        eyebrow="Dividendi · Scarica"
        title="Scarica dividendi storici"
        reading={scrapeReading}
        returnFocusTo={scrapeTriggerRef}
        footer={
          <>
            <Button variant="outline" onClick={() => setScrapeDialogOpen(false)} disabled={scraping}>
              Annulla
            </Button>
            <Button onClick={executeScrapeAll} disabled={scraping || assetsWithIsin.length === 0}>
              {scraping ? 'Scaricamento…' : 'Scarica'}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          {assetsWithIsin.length === 0
            ? 'Aggiungi l’ISIN a uno strumento dal Patrimonio e torna qui.'
            : 'I pagamenti già registrati non vengono duplicati.'}
        </p>
      </ResponsiveModal>

      <DividendDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedDividend(null);
        }}
        dividend={selectedDividend}
        onSuccess={onRefresh}
        returnFocusTo={formTriggerRef}
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
        returnFocusTo={detailTriggerRef}
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
