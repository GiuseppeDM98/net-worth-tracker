/**
 * DividendTrackingTab — "Dividendi & Cedole"
 *
 * Rebuilt around the app's Trade Republic hierarchy, mirroring the Cost Centers
 * Panoramica: a period axis drives a dominant net-income hero, a KPI chip grid, an
 * income-reliability read (B2) and a flat ranked leaderboard of payers — then the
 * working surfaces (table / calendar), the charts and the server-computed advanced
 * analysis sit below behind progressive disclosure.
 *
 * IA, top to bottom:
 * 1. Actions (add / scrape / export) + the daily-scrape note.
 * 2. Period axis (Mese / Anno / 12 mesi / Storico) — drives every figure below.
 * 3. Hero: net dividends cashed in the period + variation chip + trailing-12m sparkline.
 * 4. KPI chip grid: Lordo / Tasse / In arrivo / Media mensile.
 * 5. Reliability strip (B2): income coverage + payer concentration.
 * 6. Payer leaderboard: flat divide-y ranked by net income with a share bar.
 * 7. Workspace: Tabella / Calendario, with secondary asset/type filters in "Filtra".
 * 8. Charts (collapsible): by payer, by year, monthly net.
 * 9. Advanced analysis (collapsible): YOC, DPS growth, total return (server-computed).
 *
 * WHY in-memory derivation: the tab already receives the full dividend list as a prop,
 * so every period view (hero, KPI, leaderboard, charts, reliability) is derived in the
 * pure layer (dividendAnalytics) with no refetch — switching period is instant. Only the
 * advanced YOC/DPS/total-return block needs the server (cost-basis engines); it is fed
 * the period's date bounds so it stays consistent with the axis.
 */
'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { DividendDialog } from './DividendDialog';
import { DividendTable } from './DividendTable';
import { DividendCalendar } from './DividendCalendar';
import { DividendStats } from './DividendStats';
import { DividendRecordDetailsDialog } from './DividendRecordDetailsDialog';
import { ProvisionalCouponBanner } from './ProvisionalCouponBanner';
import { InflationRateDialog } from './InflationRateDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ChevronDown,
  Download,
  Filter,
  Info,
  Loader2,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toDate } from '@/lib/utils/dateHelpers';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import {
  DividendPeriod,
  computePeriodSummary,
  computeNetComparison,
  computeUpcomingNet,
  rankPayers,
  buildMonthlyNetSeries,
  buildYearlySeries,
  computeReliability,
  periodToDateBounds,
  PayerRow,
} from '@/lib/utils/dividendAnalytics';

interface DividendTrackingTabProps {
  dividends: Dividend[];
  assets: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

const PERIOD_OPTIONS: { value: DividendPeriod; label: string }[] = [
  { value: 'month', label: 'Mese' },
  { value: 'year', label: 'Anno' },
  { value: 'rolling12', label: '12 mesi' },
  { value: 'all', label: 'Storico' },
];

const PERIOD_NOUN: Record<DividendPeriod, string> = {
  month: 'questo mese',
  year: "quest'anno",
  rolling12: 'ultimi 12 mesi',
  all: 'da sempre',
};

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  color: 'var(--popover-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

export function DividendTrackingTab({ dividends, assets, loading, onRefresh }: DividendTrackingTabProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const chartColors = useChartColors();
  const [scraping, setScraping] = useState(false);
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const assetsWithIsinCount = useMemo(
    () => assets.filter((a) => a.isin && a.isin.trim() !== '').length,
    [assets]
  );

  // Asset filter options come from the dividends themselves, not the live portfolio:
  // only instruments that actually paid at least one dividend appear, and a sold asset
  // that paid in the past stays filterable (ticker/name are denormalized on each record).
  const assetFilterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const d of dividends) {
      if (!byId.has(d.assetId)) byId.set(d.assetId, d.assetTicker || d.assetName);
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }, [dividends]);
  const [selectedDividend, setSelectedDividend] = useState<Dividend | null>(null);
  const [detailDividend, setDetailDividend] = useState<Dividend | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailDialogStyle, setDetailDialogStyle] = useState<CSSProperties | undefined>(undefined);
  const [inflationCoupon, setInflationCoupon] = useState<Dividend | null>(null);
  const [inflationDialogOpen, setInflationDialogOpen] = useState(false);
  const detailDialogRef = useRef<HTMLDivElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  // --- Primary control: period axis ---
  const [period, setPeriod] = useState<DividendPeriod>('year');

  // --- Secondary filters (narrow the workspace list only) ---
  const [assetFilter, setAssetFilter] = useState<string>('__all__');
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [focusedDate, setFocusedDate] = useState<Date | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);

  // --- Disclosure ---
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [chartsOpen, setChartsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const now = useMemo(() => new Date(), []);

  // --- In-memory period derivations (pure layer) ---
  const summary = useMemo(() => computePeriodSummary(dividends, period, now), [dividends, period, now]);
  const comparison = useMemo(() => computeNetComparison(dividends, period, now), [dividends, period, now]);
  const upcomingNet = useMemo(() => computeUpcomingNet(dividends, now), [dividends, now]);
  const payers = useMemo(() => rankPayers(dividends, period, now), [dividends, period, now]);
  const reliability = useMemo(() => computeReliability(dividends, period, now), [dividends, period, now]);
  const sparkline = useMemo(() => buildMonthlyNetSeries(dividends, now, 12), [dividends, now]);
  const monthlySeries = useMemo(() => buildMonthlyNetSeries(dividends, now), [dividends, now]);
  const yearlySeries = useMemo(() => buildYearlySeries(dividends, now), [dividends, now]);
  const maxPayerNet = payers[0]?.net ?? 0;

  // Future inflation-linked coupons still at the provisional fixed floor (B1 banner).
  const provisionalCoupons = useMemo(
    () =>
      dividends
        .filter((d) => d.isProvisional && toDate(d.paymentDate) > now)
        .sort((a, b) => toDate(a.paymentDate).getTime() - toDate(b.paymentDate).getTime()),
    [dividends, now]
  );

  // Period → date bounds, fed to the server-computed advanced block so it tracks the axis.
  const { startDate: periodStart, endDate: periodEnd } = useMemo(
    () => periodToDateBounds(period, now),
    [period, now]
  );

  // --- Workspace list: dividends scoped to the period, plus secondary filters ---
  const hasSecondaryFilters = assetFilter !== '__all__' || typeFilter !== '__all__' || focusedDate !== null;
  const workspaceDividends = useMemo(() => {
    let list = dividends;

    // Scope to the period window by payment date. "all" keeps everything; bounded
    // periods keep the window start onward (no upper bound, so upcoming payments stay
    // visible in the working list).
    if (period !== 'all' && periodStart) {
      list = list.filter((d) => toDate(d.paymentDate) >= periodStart);
    }
    if (assetFilter !== '__all__') list = list.filter((d) => d.assetId === assetFilter);
    if (typeFilter !== '__all__') list = list.filter((d) => d.dividendType === typeFilter);
    if (focusedDate) {
      list = list.filter((d) => {
        const p = toDate(d.paymentDate);
        return (
          p.getFullYear() === focusedDate.getFullYear() &&
          p.getMonth() === focusedDate.getMonth() &&
          p.getDate() === focusedDate.getDate()
        );
      });
    }
    return list;
  }, [dividends, period, periodStart, assetFilter, typeFilter, focusedDate]);

  const focusSummary = useMemo(() => {
    if (!focusedDate) return null;
    const totalNet = workspaceDividends.reduce((sum, d) => sum + (d.netAmountEur ?? d.netAmount), 0);
    return { count: workspaceDividends.length, totalNet };
  }, [workspaceDividends, focusedDate]);

  // --- Handlers ---
  const handleCreate = () => {
    setSelectedDividend(null);
    setDialogOpen(true);
  };

  const handleEdit = (dividend: Dividend) => {
    setSelectedDividend(dividend);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedDividend(null);
  };

  const handleDialogSuccess = async () => {
    await onRefresh();
  };

  const clearSecondaryFilters = () => {
    setAssetFilter('__all__');
    setTypeFilter('__all__');
    setFocusedDate(null);
  };

  const handleCalendarDateClick = (date: Date) => {
    const day = new Date(date);
    day.setHours(12, 0, 0, 0);
    setFocusedDate(day);
  };

  const handleOpenDetails = (dividend: Dividend, triggerElement: HTMLElement) => {
    detailTriggerRef.current = triggerElement;
    setDetailDividend(dividend);
    setDetailDialogOpen(true);
  };

  useEffect(() => {
    if (!detailDialogOpen) {
      setDetailDialogStyle(undefined);
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDetailDialogStyle(undefined);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const trigger = detailTriggerRef.current;
      const dialog = detailDialogRef.current;
      if (!trigger || !dialog) {
        setDetailDialogStyle(undefined);
        return;
      }
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + triggerRect.width / 2 - dialogRect.left;
      const originY = triggerRect.top + triggerRect.height / 2 - dialogRect.top;
      setDetailDialogStyle({ transformOrigin: `${originX}px ${originY}px` });
    });

    return () => cancelAnimationFrame(frameId);
  }, [detailDialogOpen]);

  const handleScrapeAll = () => {
    if (!user) return;
    if (assetsWithIsinCount === 0) {
      toast.error('Nessun asset con ISIN trovato per lo scraping');
      return;
    }
    setScrapeDialogOpen(true);
  };

  const executeScrapeAll = async () => {
    if (!user) return;
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
            body: JSON.stringify({ userId: user.uid, assetId: asset.id }),
          });
          if (response.ok) {
            const result = await response.json();
            if (result.scraped > 0) successCount++;
          } else {
            failedCount++;
          }
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
      if (failedCount > 0) {
        toast.warning(`${failedCount} asset hanno fallito lo scraping`);
      }
    } catch (error) {
      console.error('Error scraping dividends:', error);
      toast.error('Errore durante lo scraping dei dividendi');
    } finally {
      setScraping(false);
    }
  };

  const handleExportCSV = () => {
    if (workspaceDividends.length === 0) {
      toast.error('Nessun dividendo da esportare');
      return;
    }

    const headers = [
      'Asset Ticker', 'Asset Name', 'Ex-Date', 'Payment Date', 'Dividend Per Share',
      'Quantity', 'Gross Amount', 'Tax Amount', 'Net Amount', 'Currency', 'Type', 'Notes',
    ];
    const rows = workspaceDividends.map((d) => [
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

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dividendi_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Esportati ${workspaceDividends.length} dividendi in CSV`);
  };

  if (loading) {
    return <DividendTabSkeleton />;
  }

  const deltaText =
    comparison.deltaPct !== null
      ? `${comparison.deltaPct >= 0 ? '+' : ''}${(comparison.deltaPct * 100).toFixed(1)}% vs periodo precedente`
      : null;
  const deltaPositive = (comparison.deltaPct ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="space-y-2">
        <div className="flex flex-col desktop:flex-row desktop:flex-wrap desktop:items-center gap-2">
          <Button onClick={handleCreate} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined}>
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Dividendo
          </Button>
          <Button
            onClick={handleScrapeAll}
            variant="outline"
            disabled={isDemo || scraping}
            title={isDemo ? 'Non disponibile in modalità demo' : 'Scarica manualmente tutti i dividendi storici per i tuoi asset con ISIN'}
          >
            {scraping ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Scaricamento...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Scarica Tutti (Manuale)</>
            )}
          </Button>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
          I dividendi recenti vengono scaricati automaticamente ogni giorno. Usa &quot;Scarica Tutti&quot; solo per importare dividendi storici o forzare un refresh.
        </p>
      </div>

      {/* Period axis */}
      <SegmentedControl
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
        aria-label="Periodo"
        className="max-w-md"
      />

      {/* B1 — inflation-linked coupons awaiting their announced FOI rate. */}
      {provisionalCoupons.length > 0 && (
        <ProvisionalCouponBanner
          coupons={provisionalCoupons}
          isDemo={isDemo}
          onSelect={(coupon) => {
            setInflationCoupon(coupon);
            setInflationDialogOpen(true);
          }}
        />
      )}

      {/* HERO — net dividends cashed in the period. */}
      <section>
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Dividendi netti incassati · {PERIOD_NOUN[period]}
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-3">
          <span className="text-[40px] desktop:text-[48px] leading-none font-bold font-mono tabular-nums">
            {formatCurrency(summary.net)}
          </span>
          {deltaText && (
            <span
              className={cn(
                'mb-1 inline-flex items-center gap-1 rounded-[9px] px-[10px] py-[5px] text-[13px] font-semibold font-mono tabular-nums',
                deltaPositive ? 'bg-positive/10 text-positive' : 'bg-destructive/10 text-destructive'
              )}
            >
              {deltaPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {deltaText}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {summary.count} {summary.count === 1 ? 'pagamento' : 'pagamenti'} · {formatCurrency(summary.gross)} lordi
        </p>

        {/* Edge-to-edge trailing-12m sparkline — visual shape only. */}
        {sparkline.length >= 2 && (
          <div className="mt-4 h-16 -mx-1">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="divHeroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Hidden X axis so the tooltip header reads the month, not the point index. */}
                <XAxis dataKey="label" hide />
                <RechartsTooltip
                  formatter={(value) => [formatCurrency(value as number), 'Netto']}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }}
                />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#divHeroFill)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* KPI chip grid. */}
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        <KpiChip label="Lordo" value={formatCurrency(summary.gross)} />
        <KpiChip label="Tasse" value={formatCurrency(summary.tax)} subline="ritenute nel periodo" />
        <KpiChip label="In arrivo" value={formatCurrency(upcomingNet)} subline="netto annunciato" />
        <KpiChip label="Media mensile" value={formatCurrency(summary.averageMonthlyNet)} subline="netto / mese" />
      </div>

      {/* Reliability strip (B2) — only meaningful with income over more than one month. */}
      {period !== 'month' && reliability.payerCount > 0 && (
        <ReliabilityStrip reliability={reliability} />
      )}

      {/* Payer leaderboard — flat divide-y ranked by net income. */}
      {payers.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Chi paga di più</h3>
          <div className="divide-y divide-border/60 rounded-xl border border-border/60 overflow-hidden">
            {payers.map((row, i) => (
              <PayerListRow key={row.assetId} row={row} maxNet={maxPayerNet} index={i} color={chartColors[i % Math.max(1, chartColors.length)] ?? 'var(--chart-1)'} />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nessun dividendo incassato {PERIOD_NOUN[period]}.
        </p>
      )}

      {/* Workspace: table / calendar + secondary filters. */}
      <section className="space-y-4">
        {/* 3-column grid keeps the view pill optically centered regardless of the
            "Filtra" button width; stacks on mobile (pill centered, button below). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <span className="hidden sm:block" aria-hidden="true" />
          <SegmentedControl
            options={[
              { value: 'table', label: 'Tabella' },
              { value: 'calendar', label: 'Calendario' },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as 'table' | 'calendar')}
            aria-label="Vista"
            className="w-full max-w-xs justify-self-center"
          />
          <button
            type="button"
            onClick={() => setRefineOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 justify-self-center sm:justify-self-end rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            aria-expanded={refineOpen}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtra
            {hasSecondaryFilters && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden="true" />}
          </button>
        </div>

        {/* Secondary filters (asset / type) — narrow the working list, not the metrics. */}
        <Collapsible open={refineOpen} onOpenChange={setRefineOpen}>
          <CollapsibleContent>
            <div className="rounded-xl border border-border/60 p-4 grid gap-4 sm:grid-cols-2 desktop:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="assetFilter">Asset</Label>
                <Select value={assetFilter} onValueChange={setAssetFilter}>
                  <SelectTrigger id="assetFilter" className="w-full">
                    <SelectValue placeholder="Tutti gli asset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tutti gli asset</SelectItem>
                    {assetFilterOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="typeFilter">Tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger id="typeFilter" className="w-full">
                    <SelectValue placeholder="Tutti i tipi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tutti i tipi</SelectItem>
                    {Object.entries(dividendTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasSecondaryFilters && (
                <Button onClick={clearSecondaryFilters} variant="ghost" size="sm" className="justify-self-start">
                  Azzera filtri
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Day focus banner — tokenized, set by clicking a calendar day. */}
        {focusedDate && focusSummary && (
          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Filter className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Focus: {format(focusedDate, 'dd MMMM yyyy', { locale: it })}</p>
                <p className="text-muted-foreground">
                  {focusSummary.count} {focusSummary.count === 1 ? 'pagamento' : 'pagamenti'} · netto {formatCurrency(focusSummary.totalNet)}
                </p>
              </div>
            </div>
            <Button onClick={() => setFocusedDate(null)} variant="ghost" size="sm" className="self-start">
              Rimuovi focus
            </Button>
          </div>
        )}

        {viewMode === 'table' ? (
          <DividendTable
            dividends={workspaceDividends}
            onEdit={handleEdit}
            onOpenDetails={handleOpenDetails}
            onRefresh={onRefresh}
            showTotals={hasSecondaryFilters || period !== 'all'}
            activeDividendId={detailDividend?.id ?? null}
            isDemo={isDemo}
          />
        ) : (
          <DividendCalendar
            dividends={workspaceDividends}
            onDateClick={handleCalendarDateClick}
            selectedDate={focusedDate}
          />
        )}
      </section>

      {/* Charts — collapsed by default (progressive disclosure). */}
      {(monthlySeries.length > 0 || yearlySeries.length > 0) && (
        <Collapsible open={chartsOpen} onOpenChange={setChartsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors">
            <span>Grafici</span>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', chartsOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <DividendCharts
              payers={payers}
              yearlySeries={yearlySeries}
              monthlySeries={monthlySeries}
              chartColors={chartColors}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Advanced analysis — server-computed YOC / DPS / total return, period-scoped. */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors">
          <span>Analisi avanzata · rendimento e crescita</span>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          {advancedOpen && (
            <DividendStats
              startDate={periodStart}
              endDate={periodEnd}
              assetId={assetFilter !== '__all__' ? assetFilter : undefined}
            />
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Scrape confirmation */}
      <AlertDialog open={scrapeDialogOpen} onOpenChange={setScrapeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scarica dividendi storici</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno scaricati i dividendi per {assetsWithIsinCount} asset con ISIN. Questa operazione potrebbe richiedere alcuni minuti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={executeScrapeAll}>Scarica</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DividendDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        dividend={selectedDividend}
        onSuccess={handleDialogSuccess}
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

// --- KPI chip ---------------------------------------------------------------

function KpiChip({ label, value, subline }: { label: string; value: string; subline?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">{label}</p>
      <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">{value}</p>
      {subline && <p className="text-[12px] text-muted-foreground mt-1.5">{subline}</p>}
    </div>
  );
}

// --- Reliability strip (B2) -------------------------------------------------

/**
 * Two risk reads on the income stream: how many months actually paid (smoothness) and
 * how concentrated the income is on the top payer. Both come straight from the pure
 * layer; the meters are functional shape, not decoration.
 */
function ReliabilityStrip({
  reliability,
}: {
  reliability: ReturnType<typeof computeReliability>;
}) {
  const coverage = Math.round(reliability.coveragePct * 100);
  const topShare = Math.round(reliability.topPayerSharePct * 100);
  // HHI bands: < 0.15 diversified, 0.15–0.25 moderate, > 0.25 concentrated.
  const concentrationLabel =
    reliability.concentrationHhi > 0.25 ? 'Concentrato' : reliability.concentrationHhi > 0.15 ? 'Moderato' : 'Diversificato';

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Copertura mensile</p>
          <p className="text-[20px] font-bold font-mono tabular-nums leading-none">{coverage}%</p>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-[var(--chart-2)]" style={{ width: `${coverage}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {reliability.monthsWithIncome} di {reliability.monthsInWindow} mesi con almeno un incasso
        </p>
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Concentrazione</p>
          <Badge variant="outline" className="font-normal text-muted-foreground">{concentrationLabel}</Badge>
        </div>
        <p className="text-[20px] font-bold font-mono tabular-nums leading-none mt-3">{topShare}%</p>
        <p className="text-xs text-muted-foreground mt-2">
          dal pagatore principale{reliability.topPayerTicker ? ` (${reliability.topPayerTicker})` : ''} · {reliability.payerCount} {reliability.payerCount === 1 ? 'strumento' : 'strumenti'}
        </p>
      </div>
    </section>
  );
}

// --- Payer leaderboard row --------------------------------------------------

/**
 * A single payer as a flat list row: identity dot + name on the left, dominant net
 * number + share bar (relative to the top payer) on the right.
 */
function PayerListRow({
  row,
  maxNet,
  index,
  color,
}: {
  row: PayerRow;
  maxNet: number;
  index: number;
  color: string;
}) {
  const sharePct = maxNet > 0 ? Math.round((row.net / maxNet) * 100) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.18 }}
      className="flex items-center gap-4 px-4 py-3.5"
    >
      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{row.assetTicker}</p>
        <p className="text-xs text-muted-foreground truncate">{row.assetName}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 w-32 flex-shrink-0">
        <span className="font-mono font-semibold tabular-nums">{formatCurrency(row.net)}</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${sharePct}%`, backgroundColor: color, opacity: 0.7 }} />
        </span>
      </div>
    </motion.div>
  );
}

// --- Charts -----------------------------------------------------------------

function DividendCharts({
  payers,
  yearlySeries,
  monthlySeries,
  chartColors,
}: {
  payers: PayerRow[];
  yearlySeries: ReturnType<typeof buildYearlySeries>;
  monthlySeries: ReturnType<typeof buildMonthlyNetSeries>;
  chartColors: string[];
}) {
  const color = (i: number) => chartColors[i % Math.max(1, chartColors.length)] ?? 'var(--chart-1)';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 desktop:grid-cols-2">
        {/* By payer (pie). */}
        {payers.length > 0 && (
          <div className="rounded-xl border border-border/60 p-4">
            <h4 className="text-sm font-semibold mb-2">Dividendi per asset</h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={payers} dataKey="net" nameKey="assetTicker" cx="50%" cy="45%" outerRadius={72} animationDuration={500}>
                  {payers.map((_, i) => (
                    <Cell key={i} fill={color(i)} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value, name) => [formatCurrency(value as number), name as string]} contentStyle={TOOLTIP_CONTENT_STYLE} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By year (bar). */}
        {yearlySeries.length > 0 && (
          <div className="rounded-xl border border-border/60 p-4">
            <h4 className="text-sm font-semibold mb-2">Dividendi per anno</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={yearlySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${Math.round(v as number)}€`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
                <RechartsTooltip formatter={(value, name) => [formatCurrency(value as number), name as string]} contentStyle={TOOLTIP_CONTENT_STYLE} cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gross" name="Lordo" fill={color(0)} radius={[3, 3, 0, 0]} />
                <Bar dataKey="net" name="Netto" fill={color(1)} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly net (line). */}
      {monthlySeries.length > 1 && (
        <div className="rounded-xl border border-border/60 p-4">
          <h4 className="text-sm font-semibold mb-2">Reddito mensile netto</h4>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlySeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => `${Math.round(v as number)}€`} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
              <RechartsTooltip formatter={(value) => [formatCurrency(value as number), 'Netto']} contentStyle={TOOLTIP_CONTENT_STYLE} cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.3 }} />
              <Line type="monotone" dataKey="net" name="Netto" stroke={color(0)} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// --- Skeleton ---------------------------------------------------------------

function DividendTabSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-hidden="true">
      <div className="flex gap-2">
        <div className="h-9 w-40 bg-muted rounded-md" />
        <div className="h-9 w-44 bg-muted rounded-md" />
        <div className="h-9 w-32 bg-muted rounded-md" />
      </div>
      <div className="h-9 w-full max-w-md bg-muted rounded-lg" />
      <div className="space-y-2">
        <div className="h-3 w-40 bg-muted rounded" />
        <div className="h-12 w-56 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-muted/60 rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border border-border/60 divide-y divide-border/60">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="h-2.5 w-2.5 bg-muted rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/4 bg-muted rounded" />
              <div className="h-3 w-1/3 bg-muted rounded" />
            </div>
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
