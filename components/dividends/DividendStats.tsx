/**
 * Dividend statistics dashboard
 *
 * Features:
 * - Metric cards: Total dividends, average, top payer, upcoming dividends
 * - Charts: By asset, by type, monthly trend
 *
 * Data Source: /api/dividends/stats with optional date range
 * Conditional Rendering: Cards/charts only show when data exists
 *
 * Note: YOC (Yield on Cost) metrics have been moved to the Performance page
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { DividendStatsSkeleton } from './DividendStatsSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign, TrendingDown, Calendar, TrendingUp, ChevronRight, HelpCircle } from 'lucide-react';
import { EmptyState, CalendarEmptyIcon, ChartEmptyIcon } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils/formatters';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { chartShellSettle } from '@/lib/utils/motionVariants';
import { useCountUp } from '@/lib/utils/useCountUp';

// Custom tooltip that uses Tailwind dark-mode tokens for background/border,
// while preserving per-series colors via entry.color.
const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; fill?: string; payload?: { fill?: string } }>;
  label?: string | number;
}) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-sm min-w-[140px]">
      {label !== undefined && (
        <p className="font-medium text-popover-foreground mb-1">{label}</p>
      )}
      {payload.map((entry, index) => {
        // Bar/Line: entry.color; PieChart: entry.payload.fill or entry.fill
        const color = entry.color || entry.fill || entry.payload?.fill || 'var(--popover-foreground)';
        return (
          <p key={index} className="tabular-nums" style={{ color }}>
            {entry.name} : {formatCurrency(entry.value)}
          </p>
        );
      })}
    </div>
  );
};

interface DividendStatsProps {
  startDate?: Date;
  endDate?: Date;
  // When set, stats are filtered to a single asset (affects charts + metric cards)
  assetId?: string;
}

interface DividendStatsData {
  period: {
    totalGross: number;
    totalTax: number;
    totalNet: number;
    count: number;
  };
  allTime: {
    totalGross: number;
    totalTax: number;
    totalNet: number;
    count: number;
  };
  averageYield: number;
  upcomingTotal: number;
  byAsset: Array<{
    assetTicker: string;
    assetName: string;
    totalNet: number;
    count: number;
  }>;
  byYear: Array<{
    year: number;
    totalGross: number;
    totalTax: number;
    totalNet: number;
  }>;
  byMonth: Array<{
    month: string;
    totalNet: number;
  }>;
  // YOC (Yield on Cost) fields
  portfolioYieldOnCost?: number;
  totalCostBasis?: number;
  yieldOnCostAssets?: Array<{
    assetId: string;
    assetTicker: string;
    assetName: string;
    quantity: number;
    averageCost: number;
    currentPrice: number;
    ttmGrossDividends: number;
    yocPercentage: number;
    currentYieldPercentage: number;
    difference: number;
  }>;
  // Total return = unrealized capital gain % + all-time dividend return % (on cost basis)
  totalReturnAssets?: Array<{
    assetId: string;
    assetTicker: string;
    assetName: string;
    costBasis: number;
    currentValue: number;
    allTimeNetDividends: number;
    capitalGainAbsolute: number;
    capitalGainPercentage: number;
    dividendReturnPercentage: number;
    totalReturnPercentage: number;
  }>;
  // DPS growth per asset: equity only, excludes coupons and finalPremium
  dividendGrowthData?: {
    byAsset: Array<{
      assetId: string;
      assetTicker: string;
      assetName: string;
      currency: string;
      yearlyDps: Array<{ year: number; totalDps: number }>;
      yoyGrowth: Record<number, number>;
      cagr?: number;
      latestYoyGrowth?: number;
    }>;
    portfolioMedianGrowth?: number;
    portfolioAvgGrowth?: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B9D'];

function SettledPercentValue({
  value,
  className,
  decimals = 2,
}: {
  value?: number;
  className?: string;
  decimals?: number;
}) {
  const animatedValue = useCountUp(value ?? null, { fromPrevious: true, duration: 420, startDelay: 0 });

  if (value === undefined || animatedValue === null) {
    return <span className={className}>—</span>;
  }

  return (
    <span className={className}>
      {animatedValue >= 0 ? '+' : ''}
      {animatedValue.toFixed(decimals)}%
    </span>
  );
}

function MetricInfoTooltip({ content }: { content: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  return (
    <div className="relative" ref={tooltipRef}>
      <button
        type="button"
        className="cursor-help rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setShowTooltip((current) => !current)}
        aria-label="Come leggere questa card"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {showTooltip && (
        <div className="absolute right-0 top-6 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <p className="text-xs leading-relaxed">{content}</p>
        </div>
      )}
    </div>
  );
}

export function DividendStats({ startDate, endDate, assetId }: DividendStatsProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<DividendStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  type DpsAsset = NonNullable<DividendStatsData['dividendGrowthData']>['byAsset'][number];
  const [selectedDpsAsset, setSelectedDpsAsset] = useState<DpsAsset | null>(null);

  const yocSummary = useMemo(() => {
    if (!stats?.yieldOnCostAssets || stats.yieldOnCostAssets.length === 0 || stats.portfolioYieldOnCost === undefined) {
      return null;
    }

    const totalCurrentValue = stats.yieldOnCostAssets.reduce(
      (sum, asset) => sum + (asset.quantity * asset.currentPrice),
      0
    );
    const totalTtmDividends = stats.yieldOnCostAssets.reduce(
      (sum, asset) => sum + asset.ttmGrossDividends,
      0
    );
    const currentYieldPortfolio = totalCurrentValue > 0
      ? (totalTtmDividends / totalCurrentValue) * 100
      : 0;

    return {
      coverage: stats.yieldOnCostAssets.length,
      currentYieldPortfolio,
      spread: stats.portfolioYieldOnCost - currentYieldPortfolio,
    };
  }, [stats]);

  const growthSummary = useMemo(() => {
    const growthData = stats?.dividendGrowthData;
    if (!growthData || growthData.byAsset.length === 0) return null;

    const leader = [...growthData.byAsset]
      .filter((asset) => asset.latestYoyGrowth !== undefined)
      .sort((a, b) => (b.latestYoyGrowth ?? Number.NEGATIVE_INFINITY) - (a.latestYoyGrowth ?? Number.NEGATIVE_INFINITY))[0];

    return {
      coverage: growthData.byAsset.length,
      median: growthData.portfolioMedianGrowth,
      average: growthData.portfolioAvgGrowth,
      leader,
    };
  }, [stats]);

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user, startDate, endDate, assetId]);

  const loadStats = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append('userId', user.uid);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      if (assetId) params.append('assetId', assetId);

      const response = await authenticatedFetch(`/api/dividends/stats?${params.toString()}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore nel caricamento delle statistiche');
      }

      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Error loading dividend stats:', error);
      toast.error('Errore nel caricamento delle statistiche');
    } finally {
      setLoading(false);
    }
  };

  // Skeleton on first load (no data yet): mirrors real layout to avoid height jump.
  // On subsequent filter changes the section stays visible (dimmed) while refetching.
  if (!stats) {
    if (loading) return <DividendStatsSkeleton />;
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Nessuna statistica disponibile</div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Metric Cards Row 1: Period Stats */}
      <div className="grid gap-4 grid-cols-1 desktop:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividendi Ricevuti (Netto)</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(stats.period.totalNet)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate
                ? `Dal ${startDate.toLocaleDateString('it-IT')} al ${endDate.toLocaleDateString('it-IT')}`
                : startDate
                  ? `Dal ${startDate.toLocaleDateString('it-IT')}`
                  : endDate
                    ? `Fino al ${endDate.toLocaleDateString('it-IT')}`
                    : 'Periodo selezionato'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Totale storico: {formatCurrency(stats.allTime.totalNet)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasse Pagate</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(stats.period.totalTax)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(startDate || endDate) ? 'Periodo selezionato' : 'Totale ritenute'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Totale storico: {formatCurrency(stats.allTime.totalTax)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividendi in Arrivo</CardTitle>
            <Calendar className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(stats.upcomingTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Annunciati ma non ancora pagati
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Basati su ex-date future
            </p>
          </CardContent>
        </Card>
      </div>

      {(yocSummary || growthSummary) && (
        <div className="grid gap-4 grid-cols-1 desktop:grid-cols-2">
          {yocSummary && (
            <motion.div variants={chartShellSettle} initial="idle" animate="settle">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm font-medium">YOC Portafoglio</CardTitle>
                    <MetricInfoTooltip content="YOC Portafoglio misura il rendimento da dividendi lordi degli ultimi 12 mesi rispetto al costo storico totale degli asset che hanno dividendi. Lo spread vs rendimento corrente e' la differenza tra questo YOC e il rendimento calcolato sul valore di mercato attuale: positivo significa che il rendimento sul tuo costo storico e' piu' alto di quello sul valore corrente." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <SettledPercentValue
                      value={stats.portfolioYieldOnCost}
                      className="text-3xl font-semibold text-foreground desktop:text-4xl tabular-nums"
                    />
                    <div className="text-right text-xs text-muted-foreground">
                      <p>TTM lordo su costo storico</p>
                      <p>{yocSummary.coverage} {yocSummary.coverage === 1 ? 'asset coperto' : 'asset coperti'}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Spread vs Rendimento Corrente
                      </p>
                      <SettledPercentValue
                        value={yocSummary.spread}
                        className={`mt-1 text-lg font-semibold tabular-nums ${yocSummary.spread >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                    />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Cost basis tracciato
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {stats.totalCostBasis !== undefined ? formatCurrency(stats.totalCostBasis) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {growthSummary && (
            <motion.div variants={chartShellSettle} initial="idle" animate="settle">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm font-medium">Crescita DPS Mediana</CardTitle>
                    <MetricInfoTooltip content="La crescita DPS mediana prende l'ultimo tasso di crescita anno su anno del dividendo per azione per ogni asset con storico sufficiente e ne usa la mediana, cosi' il risultato e' meno sensibile ai casi estremi. La media portafoglio e' invece la media aritmetica semplice degli stessi tassi YoY, quindi puo' spostarsi di piu' in presenza di outlier." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <SettledPercentValue
                      value={growthSummary.median}
                      className={`text-3xl font-semibold desktop:text-4xl tabular-nums ${
                        (growthSummary.median ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    />
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Anno su anno, cedole escluse</p>
                      <p>{growthSummary.coverage} {growthSummary.coverage === 1 ? 'asset con storico' : 'asset con storico'}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 border-t border-border/50 pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Media portafoglio
                      </p>
                      <SettledPercentValue
                        value={growthSummary.average}
                        className={`mt-1 text-lg font-semibold tabular-nums ${
                          (growthSummary.average ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Miglior ultimo YoY
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {growthSummary.leader
                          ? `${growthSummary.leader.assetTicker} ${growthSummary.leader.latestYoyGrowth! >= 0 ? '+' : ''}${growthSummary.leader.latestYoyGrowth!.toFixed(1)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {/* Charts Row 1: Pie Chart (Dividends by Asset) */}
      <div className="grid gap-6 desktop:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dividendi per Asset</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byAsset.length === 0 ? (
              <EmptyState
                icon={<CalendarEmptyIcon />}
                title="Nessun dato disponibile"
                className="h-64"
              />
            ) : (() => {
              // Limit to top 7 + group the rest as "Altri" to keep legend compact
              const pieData = stats.byAsset.length > 8
                ? [
                    ...stats.byAsset.slice(0, 7),
                    {
                      assetTicker: 'Altri',
                      assetName: 'Altri asset',
                      totalNet: stats.byAsset.slice(7).reduce((sum, a) => sum + a.totalNet, 0),
                      count: stats.byAsset.slice(7).reduce((sum, a) => sum + a.count, 0),
                    },
                  ]
                : stats.byAsset;
              return (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="totalNet"
                      nameKey="assetTicker"
                      cx="50%"
                      cy="45%"
                      outerRadius={75}
                      animationBegin={0}
                      animationDuration={600}
                      animationEasing="ease-out"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        {/* Bar Chart: Dividends by Year */}
        <Card>
          <CardHeader>
            <CardTitle>Dividendi per Anno</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byYear.length === 0 ? (
              <EmptyState
                icon={<ChartEmptyIcon />}
                title="Nessun dato disponibile"
                className="h-64"
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.byYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)' }} />
                  <Legend />
                  <Bar dataKey="totalGross" fill="#10B981" name="Lordo" animationDuration={600} animationEasing="ease-out" />
                  <Bar dataKey="totalTax" fill="#EF4444" name="Tasse" animationDuration={600} animationEasing="ease-out" />
                  <Bar dataKey="totalNet" fill="#3B82F6" name="Netto" animationDuration={600} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Line Chart (Monthly Dividend Income) */}
      <Card>
        <CardHeader>
          <CardTitle>Reddito Mensile da Dividendi</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byMonth.length === 0 ? (
            <EmptyState
              icon={<ChartEmptyIcon />}
              title="Nessun dato disponibile"
              className="h-64"
            />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.byMonth}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => formatCurrency(value).replace(/,00$/, '')} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalNet"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Dividendi Netti"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Assets Table */}
      {stats.byAsset.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Asset per Dividendi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byAsset.slice(0, 10).map((asset, index) => (
                <div key={asset.assetTicker} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    >
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{asset.assetTicker}</p>
                      <p className="text-sm text-muted-foreground">{asset.assetName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatCurrency(asset.totalNet)}</p>
                    <p className="text-xs text-muted-foreground">{asset.count} dividendi</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DPS Growth Table — dividend per share growth analysis (equity only, coupons excluded).
          Shown both for all assets and when filtered to a single asset. */}
      {stats.dividendGrowthData && stats.dividendGrowthData.byAsset.length > 0 && (() => {
        const { byAsset, portfolioMedianGrowth } = stats.dividendGrowthData!;
        // Union of all years across all assets, used for consistent column headers
        const allYears = [...new Set(byAsset.flatMap(a => a.yearlyDps.map(y => y.year)))].sort((a, b) => a - b);

        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  Crescita Dividendi per Azione
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  DPS lordo annuale (cedole escluse) — crescita anno su anno per asset
                </p>
              </div>
              {/* Portfolio median shown only in the all-assets view */}
              {!assetId && portfolioMedianGrowth !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Mediana portafoglio</p>
                    <p className={`text-xl font-bold ${portfolioMedianGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {portfolioMedianGrowth >= 0 ? '+' : ''}{portfolioMedianGrowth.toFixed(2)}%
                    </p>
                  </div>
              )}
            </CardHeader>
            <CardContent>
              {/* Mobile card view — tap to open year detail dialog */}
              <div className="desktop:hidden space-y-3">
                {byAsset.map(asset => (
                  <button
                    key={asset.assetId}
                    className="w-full text-left rounded-md border p-3 space-y-1.5 hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedDpsAsset(asset)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{asset.assetTicker || asset.assetName}</p>
                        {asset.assetTicker && <p className="text-xs text-muted-foreground truncate">{asset.assetName}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        YoY:{' '}
                          <span className={`font-medium ${asset.latestYoyGrowth === undefined ? '' : asset.latestYoyGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {asset.latestYoyGrowth === undefined ? '—' : `${asset.latestYoyGrowth >= 0 ? '+' : ''}${asset.latestYoyGrowth.toFixed(2)}%`}
                        </span>
                      </span>
                      <span>
                        CAGR:{' '}
                        <span className={`font-medium ${asset.cagr === undefined ? '' : asset.cagr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {asset.cagr === undefined ? '—' : `${asset.cagr >= 0 ? '+' : ''}${asset.cagr.toFixed(2)}%`}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {/* DPS detail dialog — shows years vertically on mobile */}
              <Dialog open={selectedDpsAsset !== null} onOpenChange={(open) => { if (!open) setSelectedDpsAsset(null); }}>
                <DialogContent className="max-w-xs" aria-describedby={undefined}>
                  <DialogHeader>
                    <DialogTitle className="text-base">
                      {selectedDpsAsset?.assetTicker || selectedDpsAsset?.assetName}
                    </DialogTitle>
                    {selectedDpsAsset?.assetTicker && (
                      <p className="text-sm text-muted-foreground">{selectedDpsAsset.assetName}</p>
                    )}
                  </DialogHeader>
                  {selectedDpsAsset && (() => {
                    const dpsMap = new Map(selectedDpsAsset.yearlyDps.map(y => [y.year, y.totalDps]));
                    return (
                      <div className="space-y-4 pt-1">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                              <th className="text-left py-2">Anno</th>
                              <th className="text-right py-2">DPS Lordo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allYears.map(year => (
                              <tr key={year} className="border-b last:border-0">
                                <td className="py-2 text-muted-foreground">{year}</td>
                                <td className="py-2 text-right tabular-nums font-medium">
                                  {dpsMap.has(year) ? dpsMap.get(year)!.toFixed(4) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex gap-6 text-sm pt-1 border-t">
                          <div>
                            <p className="text-xs text-muted-foreground">YoY</p>
                            <p className={`font-semibold ${selectedDpsAsset.latestYoyGrowth === undefined ? 'text-muted-foreground' : selectedDpsAsset.latestYoyGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {selectedDpsAsset.latestYoyGrowth === undefined ? '—' : `${selectedDpsAsset.latestYoyGrowth >= 0 ? '+' : ''}${selectedDpsAsset.latestYoyGrowth.toFixed(2)}%`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CAGR</p>
                            <p className={`font-semibold ${selectedDpsAsset.cagr === undefined ? 'text-muted-foreground' : selectedDpsAsset.cagr >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                              {selectedDpsAsset.cagr === undefined ? '—' : `${selectedDpsAsset.cagr >= 0 ? '+' : ''}${selectedDpsAsset.cagr.toFixed(2)}%`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </DialogContent>
              </Dialog>
              {/* Desktop table */}
              <div className="hidden desktop:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="text-left py-3 pr-4">Asset</th>
                      {allYears.map(year => (
                        <th key={year} className="text-right py-3 px-2">{year}</th>
                      ))}
                      <th className="text-right py-3 px-2 text-amber-600">YoY %</th>
                      <th className="text-right py-3 pl-2 text-blue-600">CAGR %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAsset.map(asset => {
                      const dpsMap = new Map(asset.yearlyDps.map(y => [y.year, y.totalDps]));
                      return (
                        <tr key={asset.assetId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3 pr-4">
                            <p className="font-medium">{asset.assetTicker || asset.assetName}</p>
                            {asset.assetTicker && <p className="text-xs text-muted-foreground">{asset.assetName}</p>}
                          </td>
                          {allYears.map(year => (
                            <td key={year} className="text-right py-3 px-2 tabular-nums text-muted-foreground">
                              {dpsMap.has(year) ? dpsMap.get(year)!.toFixed(4) : '—'}
                            </td>
                          ))}
                          <td className={`text-right py-3 px-2 font-medium tabular-nums ${
                            asset.latestYoyGrowth === undefined ? 'text-muted-foreground' :
                            asset.latestYoyGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {asset.latestYoyGrowth === undefined
                              ? '—'
                              : `${asset.latestYoyGrowth >= 0 ? '+' : ''}${asset.latestYoyGrowth.toFixed(2)}%`}
                          </td>
                          <td className={`text-right py-3 pl-2 font-medium tabular-nums ${
                            asset.cagr === undefined ? 'text-muted-foreground' :
                            asset.cagr >= 0 ? 'text-blue-600' : 'text-red-600'
                          }`}>
                            {asset.cagr === undefined
                              ? '—'
                              : `${asset.cagr >= 0 ? '+' : ''}${asset.cagr.toFixed(2)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Total Return Table — combines unrealized capital gain and all-time dividend income.
          Hidden when filtered to a single asset (the table is only meaningful for comparisons). */}
      {!assetId && stats.totalReturnAssets && stats.totalReturnAssets.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                Rendimento Totale per Asset
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Plusvalenza non realizzata + dividendi netti storici, sul costo d&apos;acquisto
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {/* Mobile card view */}
            <div className="desktop:hidden space-y-3">
              {stats.totalReturnAssets.map(asset => (
                <div key={asset.assetId} className="rounded-md border p-3 space-y-2">
                  <div>
                    <p className="font-medium text-sm">{asset.assetTicker}</p>
                    <p className="text-xs text-muted-foreground">{asset.assetName}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="space-y-1">
                      <div>
                        <span className="text-muted-foreground">Plusval.: </span>
                        <span className={`font-medium ${asset.capitalGainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {asset.capitalGainPercentage >= 0 ? '+' : ''}{asset.capitalGainPercentage.toFixed(2)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dividendi: </span>
                        <span className="font-medium text-green-600">+{asset.dividendReturnPercentage.toFixed(2)}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Rend. Totale</p>
                      <p className={`text-base font-semibold ${asset.totalReturnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {asset.totalReturnPercentage >= 0 ? '+' : ''}{asset.totalReturnPercentage.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden desktop:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                    <th className="text-left py-3 pr-4">Asset</th>
                    <th className="text-right py-3 px-3">Plusval. %</th>
                    <th className="text-right py-3 px-3">Dividendi %</th>
                    <th className="text-right py-3 pl-3 font-semibold">Rend. Totale %</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.totalReturnAssets.map(asset => (
                    <tr key={asset.assetId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{asset.assetTicker}</p>
                        <p className="text-xs text-muted-foreground">{asset.assetName}</p>
                      </td>
                      <td className={`text-right py-3 px-3 ${asset.capitalGainPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span title={formatCurrency(asset.capitalGainAbsolute)}>
                          {asset.capitalGainPercentage >= 0 ? '+' : ''}{asset.capitalGainPercentage.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right py-3 px-3 text-green-600">
                        <span title={formatCurrency(asset.allTimeNetDividends)}>
                          +{asset.dividendReturnPercentage.toFixed(2)}%
                        </span>
                      </td>
                      <td className={`text-right py-3 pl-3 font-semibold ${asset.totalReturnPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {asset.totalReturnPercentage >= 0 ? '+' : ''}{asset.totalReturnPercentage.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
