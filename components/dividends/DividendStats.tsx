/**
 * DividendStats — server-computed advanced dividend analysis.
 *
 * Scope after the 2026 redesign: this component renders ONLY the three sections that
 * genuinely need the server's cost-basis engines and cannot be derived from the
 * dividend list in the browser:
 *   - YOC Portafoglio (yield on cost vs current yield)
 *   - Crescita Dividendi per Azione (DPS growth / CAGR)
 *   - Rendimento Totale per Asset (capital gain + current-holding dividends on cost)
 *
 * The period totals, KPI grid, payer leaderboard and the by-asset / by-year / monthly
 * charts moved to DividendTrackingTab, where they are derived in memory (dividendAnalytics)
 * from the already-fetched dividend list. This component is mounted inside the tab's
 * "Analisi avanzata" disclosure and is fed the period's date bounds + asset filter so it
 * stays consistent with the period axis.
 *
 * Data source: /api/dividends/stats with optional date range + assetId.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, ChevronRight, HelpCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatters';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { motion } from 'framer-motion';
import { chartShellSettle } from '@/lib/utils/motionVariants';
import { useCountUp } from '@/lib/utils/useCountUp';

interface DividendStatsProps {
  startDate?: Date;
  endDate?: Date;
  // When set, stats are filtered to a single asset (affects the YOC summary).
  assetId?: string;
}

interface DividendStatsData {
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
  totalReturnAssets?: Array<{
    assetId: string;
    assetTicker: string;
    assetName: string;
    costBasis: number;
    currentValue: number;
    netDividends: number;
    capitalGainAbsolute: number;
    capitalGainPercentage: number;
    dividendReturnPercentage: number;
    totalReturnPercentage: number;
  }>;
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

/** Animated percentage value with a +/- sign; counts from the previous value, not zero. */
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTooltip(false);
    };
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTooltip]);

  return (
    <div className="relative" ref={tooltipRef}>
      <button
        type="button"
        className="cursor-help rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setShowTooltip((current) => !current)}
        aria-label="Come leggere questa card"
        aria-expanded={showTooltip}
        aria-haspopup="true"
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

/** Slim loading placeholder for the advanced sections (mounted inside a disclosure). */
function AdvancedSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid gap-4 desktop:grid-cols-2">
        <div className="h-40 rounded-2xl border bg-card animate-pulse" />
        <div className="h-40 rounded-2xl border bg-card animate-pulse" />
      </div>
      <div className="h-48 rounded-2xl border bg-card animate-pulse" />
    </div>
  );
}

export function DividendStats({ startDate, endDate, assetId }: DividendStatsProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const [stats, setStats] = useState<DividendStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  type DpsAsset = NonNullable<DividendStatsData['dividendGrowthData']>['byAsset'][number];
  const [selectedDpsAsset, setSelectedDpsAsset] = useState<DpsAsset | null>(null);

  const yocSummary = useMemo(() => {
    if (!stats?.yieldOnCostAssets || stats.yieldOnCostAssets.length === 0 || stats.portfolioYieldOnCost === undefined) {
      return null;
    }
    const totalCurrentValue = stats.yieldOnCostAssets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0);
    const totalTtmDividends = stats.yieldOnCostAssets.reduce((sum, a) => sum + a.ttmGrossDividends, 0);
    const currentYieldPortfolio = totalCurrentValue > 0
      ? stats.yieldOnCostAssets.reduce((sum, a) => sum + a.currentYieldPercentage * (a.quantity * a.currentPrice), 0) / totalCurrentValue
      : 0;
    return {
      coverage: stats.yieldOnCostAssets.length,
      currentYieldPortfolio,
      spread: stats.portfolioYieldOnCost - currentYieldPortfolio,
      totalTtmDividends,
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
    if (user && ownerId) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ownerId, startDate, endDate, assetId]);

  const loadStats = async () => {
    if (!user || !ownerId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('userId', ownerId);
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

  if (!stats) {
    if (loading) return <AdvancedSkeleton />;
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Nessuna statistica disponibile
      </div>
    );
  }

  const hasAdvanced =
    yocSummary || growthSummary || (!assetId && stats.totalReturnAssets && stats.totalReturnAssets.length > 0);

  if (!hasAdvanced) {
    return (
      <div className="rounded-xl border border-border/60 p-6 text-center text-sm text-muted-foreground">
        Le metriche di rendimento (YOC, crescita DPS, rendimento totale) richiedono asset con costo di acquisto e quantità correnti. Aggiungi il costo medio agli asset per vederle qui.
      </div>
    );
  }

  return (
    <div className={`space-y-6 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* YOC + DPS growth headline summaries. */}
      {(yocSummary || growthSummary) && (
        <div className="grid gap-4 grid-cols-1 desktop:grid-cols-2">
          {yocSummary && (
            <motion.div variants={chartShellSettle} initial="idle" animate="settle">
              <Card className="border-border/70">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm font-medium">YOC Portafoglio</CardTitle>
                    <MetricInfoTooltip content="YOC Portafoglio misura il rendimento da dividendi lordi degli ultimi 12 mesi rispetto al costo medio di acquisto degli asset che hanno dividendi. Lo spread vs rendimento corrente è la differenza tra questo YOC e il rendimento calcolato sul valore di mercato attuale: positivo significa che il rendimento sul tuo costo è più alto di quello sul valore corrente. Nota: considera solo gli asset attualmente in portafoglio; i dividendi di asset venduti non sono inclusi qui, ma restano visibili nello storico dividendi." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <SettledPercentValue
                      value={stats.portfolioYieldOnCost}
                      className="text-[36px] leading-none font-bold font-mono tabular-nums text-foreground"
                    />
                    <div className="text-right text-xs text-muted-foreground">
                      <p>TTM lordo su costo medio</p>
                      <p>{yocSummary.coverage} {yocSummary.coverage === 1 ? 'asset coperto' : 'asset coperti'}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    <AdvancedRow label="Spread vs rendimento corrente">
                      <SettledPercentValue
                        value={yocSummary.spread}
                        className={`text-base font-semibold font-mono tabular-nums ${getMetricValueColor(yocSummary.spread, 'percentage')}`}
                      />
                    </AdvancedRow>
                    <AdvancedRow label="Cost basis tracciato">
                      <span className="text-base font-semibold font-mono tabular-nums">
                        {stats.totalCostBasis !== undefined ? formatCurrency(stats.totalCostBasis) : '—'}
                      </span>
                    </AdvancedRow>
                    <AdvancedRow label="Dividendi/Cedole TTM (lordo)">
                      <span className="text-base font-semibold font-mono tabular-nums">
                        {formatCurrency(yocSummary.totalTtmDividends)}
                      </span>
                    </AdvancedRow>
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
                    <MetricInfoTooltip content="La crescita DPS mediana prende l'ultimo tasso di crescita anno su anno del dividendo per azione per ogni asset con storico sufficiente e ne usa la mediana, così il risultato è meno sensibile ai casi estremi. La media portafoglio è invece la media aritmetica semplice degli stessi tassi YoY, quindi può spostarsi di più in presenza di outlier." />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <SettledPercentValue
                      value={growthSummary.median}
                      className={`text-[36px] leading-none font-bold font-mono tabular-nums ${getMetricValueColor(growthSummary.median ?? null, 'percentage')}`}
                    />
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Anno su anno, cedole escluse</p>
                      <p>{growthSummary.coverage} {growthSummary.coverage === 1 ? 'asset con storico' : 'asset con storico'}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    <AdvancedRow label="Media portafoglio">
                      <SettledPercentValue
                        value={growthSummary.average}
                        className={`text-base font-semibold font-mono tabular-nums ${getMetricValueColor(growthSummary.average ?? null, 'percentage')}`}
                      />
                    </AdvancedRow>
                    <AdvancedRow label="Miglior ultimo YoY">
                      <span className={`text-base font-semibold font-mono tabular-nums ${getMetricValueColor(growthSummary.leader?.latestYoyGrowth ?? null, 'percentage')}`}>
                        {growthSummary.leader
                          ? `${growthSummary.leader.assetTicker} ${growthSummary.leader.latestYoyGrowth! >= 0 ? '+' : ''}${growthSummary.leader.latestYoyGrowth!.toFixed(1)}%`
                          : '—'}
                      </span>
                    </AdvancedRow>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {/* DPS Growth — genuinely tabular (one column per year), kept as a table. */}
      {stats.dividendGrowthData && stats.dividendGrowthData.byAsset.length > 0 && (() => {
        const { byAsset, portfolioMedianGrowth } = stats.dividendGrowthData!;
        const allYears = [...new Set(byAsset.flatMap((a) => a.yearlyDps.map((y) => y.year)))].sort((a, b) => a - b);

        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[var(--chart-2)]" />
                  Crescita Dividendi per Azione
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  DPS lordo annuale (cedole escluse) — crescita anno su anno per asset
                </p>
              </div>
              {!assetId && portfolioMedianGrowth !== undefined && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Mediana portafoglio</p>
                  <p className={`text-xl font-bold font-mono tabular-nums ${getMetricValueColor(portfolioMedianGrowth, 'percentage')}`}>
                    {portfolioMedianGrowth >= 0 ? '+' : ''}{portfolioMedianGrowth.toFixed(2)}%
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {/* Mobile card view — tap to open year detail dialog */}
              <div className="desktop:hidden space-y-3">
                {byAsset.map((asset) => (
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
                        <span className={`font-medium font-mono ${getMetricValueColor(asset.latestYoyGrowth ?? null, 'percentage')}`}>
                          {asset.latestYoyGrowth === undefined ? '—' : `${asset.latestYoyGrowth >= 0 ? '+' : ''}${asset.latestYoyGrowth.toFixed(2)}%`}
                        </span>
                      </span>
                      <span>
                        CAGR:{' '}
                        <span className={`font-medium font-mono ${getMetricValueColor(asset.cagr ?? null, 'percentage')}`}>
                          {asset.cagr === undefined ? '—' : `${asset.cagr >= 0 ? '+' : ''}${asset.cagr.toFixed(2)}%`}
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>

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
                    const dpsMap = new Map(selectedDpsAsset.yearlyDps.map((y) => [y.year, y.totalDps]));
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
                            {allYears.map((year) => (
                              <tr key={year} className="border-b last:border-0">
                                <td className="py-2 text-muted-foreground">{year}</td>
                                <td className="py-2 text-right tabular-nums font-mono font-medium">
                                  {dpsMap.has(year) ? dpsMap.get(year)!.toFixed(4) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex gap-6 text-sm pt-1 border-t">
                          <div>
                            <p className="text-xs text-muted-foreground">YoY</p>
                            <p className={`font-semibold font-mono ${getMetricValueColor(selectedDpsAsset.latestYoyGrowth ?? null, 'percentage')}`}>
                              {selectedDpsAsset.latestYoyGrowth === undefined ? '—' : `${selectedDpsAsset.latestYoyGrowth >= 0 ? '+' : ''}${selectedDpsAsset.latestYoyGrowth.toFixed(2)}%`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">CAGR</p>
                            <p className={`font-semibold font-mono ${getMetricValueColor(selectedDpsAsset.cagr ?? null, 'percentage')}`}>
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
                      <th className="text-left py-3 pr-4" scope="col">Asset</th>
                      {allYears.map((year) => (
                        <th key={year} className="text-right py-3 px-2" scope="col">{year}</th>
                      ))}
                      <th className="text-right py-3 px-2" scope="col">YoY %</th>
                      <th className="text-right py-3 pl-2" scope="col">CAGR %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAsset.map((asset) => {
                      const dpsMap = new Map(asset.yearlyDps.map((y) => [y.year, y.totalDps]));
                      return (
                        <tr key={asset.assetId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-3 pr-4">
                            <p className="font-medium">{asset.assetTicker || asset.assetName}</p>
                            {asset.assetTicker && <p className="text-xs text-muted-foreground">{asset.assetName}</p>}
                          </td>
                          {allYears.map((year) => (
                            <td key={year} className="text-right py-3 px-2 tabular-nums font-mono text-muted-foreground">
                              {dpsMap.has(year) ? dpsMap.get(year)!.toFixed(4) : '—'}
                            </td>
                          ))}
                          <td className={`text-right py-3 px-2 font-medium tabular-nums font-mono ${getMetricValueColor(asset.latestYoyGrowth ?? null, 'percentage')}`}>
                            {asset.latestYoyGrowth === undefined ? '—' : `${asset.latestYoyGrowth >= 0 ? '+' : ''}${asset.latestYoyGrowth.toFixed(2)}%`}
                          </td>
                          <td className={`text-right py-3 pl-2 font-medium tabular-nums font-mono ${getMetricValueColor(asset.cagr ?? null, 'percentage')}`}>
                            {asset.cagr === undefined ? '—' : `${asset.cagr >= 0 ? '+' : ''}${asset.cagr.toFixed(2)}%`}
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

      {/* Total Return — flat divide-y rows (A4). Comparison only, hidden under asset filter. */}
      {!assetId && stats.totalReturnAssets && stats.totalReturnAssets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[var(--chart-1)]" />
              Rendimento Totale per Asset
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Plusvalenza non realizzata + dividendi netti del possesso attuale, sul costo d&apos;acquisto
            </p>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {stats.totalReturnAssets.map((asset) => (
                <div key={asset.assetId} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{asset.assetTicker}</p>
                    <p className="text-xs text-muted-foreground truncate">{asset.assetName}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end w-28">
                    <span className={`text-sm font-mono tabular-nums ${getMetricValueColor(asset.capitalGainPercentage, 'percentage')}`} title={formatCurrency(asset.capitalGainAbsolute)}>
                      {asset.capitalGainPercentage >= 0 ? '+' : ''}{asset.capitalGainPercentage.toFixed(2)}%
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Plusval.</span>
                  </div>
                  <div className="hidden sm:flex flex-col items-end w-28">
                    <span className={`text-sm font-mono tabular-nums ${getMetricValueColor(asset.dividendReturnPercentage, 'percentage')}`} title={formatCurrency(asset.netDividends)}>
                      +{asset.dividendReturnPercentage.toFixed(2)}%
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Dividendi</span>
                  </div>
                  <div className="flex flex-col items-end w-28">
                    <span className={`text-base font-semibold font-mono tabular-nums ${getMetricValueColor(asset.totalReturnPercentage, 'percentage')}`}>
                      {asset.totalReturnPercentage >= 0 ? '+' : ''}{asset.totalReturnPercentage.toFixed(2)}%
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rend. totale</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** A flat label → value row used inside the YOC / DPS summary cards. */
function AdvancedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
