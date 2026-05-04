'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBenchmarkReturns } from '@/lib/hooks/useBenchmarkReturns';
import { useFxRates } from '@/lib/hooks/useFxRates';
import { BenchmarkComparisonChart } from './BenchmarkComparisonChart';
import { BENCHMARKS } from '@/lib/constants/benchmarks';
import { MonthlyReturnHeatmapData, TimePeriod } from '@/types/performance';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface BenchmarkComparisonSectionProps {
  portfolioHeatmapData: MonthlyReturnHeatmapData[];
  startDate: Date;
  endDate: Date;
  selectedPeriod: TimePeriod;
  // Pre-computed from the main performance page — used directly in the table so the
  // TWR shown here matches the KPI card exactly (avoids rounding drift from heatmap).
  portfolioTWR: number | null;
  // Same denominator used by the main metric for annualization (months in period).
  numberOfMonths: number;
  // Cumulative TWR (de-annualized from portfolioTWR) — consistent with KPI card.
  portfolioTotalGrowth: number | null;
}

/**
 * "Confronto con Portafogli Modello" section in the Rendimenti page.
 *
 * Each of the 4 benchmark hooks is always declared (React rules require stable hook
 * call counts), but `enabled` is false for inactive benchmarks so no fetches happen.
 * Data from enabled hooks is merged into the chart.
 *
 * Collapsed by default on mobile (dense page), open on desktop.
 */
export function BenchmarkComparisonSection({
  portfolioHeatmapData,
  startDate,
  endDate,
  selectedPeriod,
  portfolioTWR,
  numberOfMonths,
  portfolioTotalGrowth,
}: BenchmarkComparisonSectionProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isOpen, setIsOpen] = useState(!isMobile);
  const [activeBenchmarkIds, setActiveBenchmarkIds] = useState<string[]>([BENCHMARKS[0].id]);
  // Which benchmark pill is showing its composition tooltip
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [convertToEur, setConvertToEur] = useState(false);

  // Fixed hooks — one per benchmark definition (4 total, stable call count).
  const b0 = useBenchmarkReturns(BENCHMARKS[0].id, activeBenchmarkIds.includes(BENCHMARKS[0].id));
  const b1 = useBenchmarkReturns(BENCHMARKS[1].id, activeBenchmarkIds.includes(BENCHMARKS[1].id));
  const b2 = useBenchmarkReturns(BENCHMARKS[2].id, activeBenchmarkIds.includes(BENCHMARKS[2].id));
  const b3 = useBenchmarkReturns(BENCHMARKS[3].id, activeBenchmarkIds.includes(BENCHMARKS[3].id));

  const hookResults = [b0, b1, b2, b3];

  const { data: fxRates = [], isLoading: fxLoading, isError: fxError } = useFxRates(convertToEur);

  const benchmarkData = useMemo(() => {
    const map: Record<string, ReturnType<typeof useBenchmarkReturns>['data']> = {};
    BENCHMARKS.forEach((b, i) => {
      if (hookResults[i].data) map[b.id] = hookResults[i].data;
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b0.data, b1.data, b2.data, b3.data]);

  const benchmarkErrors = useMemo(() => {
    const map: Record<string, boolean> = {};
    BENCHMARKS.forEach((b, i) => {
      if (hookResults[i].isError) map[b.id] = true;
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b0.isError, b1.isError, b2.isError, b3.isError]);

  const anyLoading =
    (convertToEur && fxLoading) ||
    activeBenchmarkIds.some((id) => {
      const idx = BENCHMARKS.findIndex(b => b.id === id);
      return idx >= 0 && hookResults[idx].isLoading;
    });

  const toggleBenchmark = (id: string) => {
    setActiveBenchmarkIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
    // Close the composition panel when toggling off
    setExpandedInfo(prev => prev === id ? null : prev);
  };

  const getChartHeight = () => (isMobile ? 260 : 380);

  const hasPortfolioData = portfolioHeatmapData.some(y => y.months.some(m => m.return !== null));
  const readyBenchmarkIds = activeBenchmarkIds.filter(id => benchmarkData[id]);

  return (
    <Card className="mt-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer select-none">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Confronto con Portafogli Modello</CardTitle>
                <CardDescription className="mt-1">
                  Crescita di 100 indicizzata al primo mese del periodo.{' '}
                  {convertToEur ? 'Benchmark convertiti in EUR.' : 'Rendimenti benchmark in USD.'}
                </CardDescription>
              </div>
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  isOpen && 'rotate-180'
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Benchmark toggle pills + composition info */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {BENCHMARKS.map(benchmark => {
                  const isActive = activeBenchmarkIds.includes(benchmark.id);
                  const hasError = benchmarkErrors[benchmark.id];
                  const isInfoOpen = expandedInfo === benchmark.id;
                  return (
                    <div key={benchmark.id} className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={isActive ? 'default' : 'outline'}
                        onClick={() => toggleBenchmark(benchmark.id)}
                        className={cn(
                          'transition-all duration-150',
                          isActive && 'ring-2 ring-offset-1',
                          hasError && 'opacity-50'
                        )}
                        style={
                          isActive
                            ? { backgroundColor: benchmark.color, borderColor: benchmark.color }
                            : { borderColor: benchmark.color, color: benchmark.color }
                        }
                      >
                        {benchmark.name}
                        {hasError && ' ⚠'}
                      </Button>
                      {/* Info toggle button showing/hiding composition */}
                      <button
                        type="button"
                        aria-label={`Mostra composizione ${benchmark.name}`}
                        onClick={() => setExpandedInfo(prev => prev === benchmark.id ? null : benchmark.id)}
                        className={cn(
                          'rounded-full p-1 transition-colors',
                          isInfoOpen
                            ? 'text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Composition panel — shown when a benchmark's info button is clicked */}
              {expandedInfo && (() => {
                const b = BENCHMARKS.find(x => x.id === expandedInfo);
                if (!b) return null;
                return (
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 duration-150">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-muted-foreground text-xs">{b.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                      {b.components.map(c => (
                        <span key={c.ticker} className="text-xs tabular-nums">
                          <span className="font-medium font-mono">{c.ticker}</span>
                          {' '}
                          <span className="text-muted-foreground">{c.name}</span>
                          {' '}
                          <span className="font-medium" style={{ color: b.color }}>
                            {Math.round(c.weight * 100)}%
                          </span>
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fonte: prezzi storici mensili (adjusted close) via Yahoo Finance. Ribilanciamento annuale assunto.
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* EUR conversion toggle */}
            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="convert-to-eur"
                checked={convertToEur}
                onCheckedChange={setConvertToEur}
              />
              <Label htmlFor="convert-to-eur" className="text-sm cursor-pointer select-none">
                Converti benchmark in EUR
              </Label>
              {convertToEur && fxError && (
                <span className="text-xs text-red-500 dark:text-red-400">
                  ⚠ Tassi di cambio non disponibili
                </span>
              )}
            </div>

            {/* Loading indicator */}
            {anyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                Caricamento dati benchmark...
              </div>
            )}

            {/* Chart */}
            {hasPortfolioData && readyBenchmarkIds.length > 0 ? (
              <BenchmarkComparisonChart
                portfolioHeatmapData={portfolioHeatmapData}
                benchmarkDefinitions={BENCHMARKS}
                benchmarkReturns={benchmarkData as Record<string, NonNullable<typeof benchmarkData[string]>>}
                selectedBenchmarkIds={readyBenchmarkIds}
                startDate={startDate}
                endDate={endDate}
                height={getChartHeight()}
                portfolioTWR={portfolioTWR}
                numberOfMonths={numberOfMonths}
                portfolioTotalGrowth={portfolioTotalGrowth}
                convertToEur={convertToEur}
                fxRates={fxRates}
              />
            ) : !hasPortfolioData ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Dati di portafoglio non disponibili per il periodo{' '}
                  {selectedPeriod === 'CUSTOM' ? 'personalizzato' : selectedPeriod} selezionato.
                  Seleziona un periodo con almeno 2 snapshot mensili.
                </span>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
