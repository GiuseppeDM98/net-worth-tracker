'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBenchmarkReturns } from '@/lib/hooks/useBenchmarkReturns';
import { BenchmarkComparisonChart } from './BenchmarkComparisonChart';
import { BENCHMARKS } from '@/lib/constants/benchmarks';
import { MonthlyReturnHeatmapData, TimePeriod } from '@/types/performance';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

interface BenchmarkComparisonSectionProps {
  // From prepareMonthlyReturnsHeatmap — cash-flow adjusted monthly returns
  portfolioHeatmapData: MonthlyReturnHeatmapData[];
  startDate: Date;
  endDate: Date;
  selectedPeriod: TimePeriod;
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
}: BenchmarkComparisonSectionProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isOpen, setIsOpen] = useState(!isMobile);
  const [activeBenchmarkIds, setActiveBenchmarkIds] = useState<string[]>([BENCHMARKS[0].id]);

  // Fixed hooks — one per benchmark definition (4 total, stable call count).
  // enabled: false when the benchmark is not toggled on, so no fetch occurs.
  const b0 = useBenchmarkReturns(BENCHMARKS[0].id, activeBenchmarkIds.includes(BENCHMARKS[0].id));
  const b1 = useBenchmarkReturns(BENCHMARKS[1].id, activeBenchmarkIds.includes(BENCHMARKS[1].id));
  const b2 = useBenchmarkReturns(BENCHMARKS[2].id, activeBenchmarkIds.includes(BENCHMARKS[2].id));
  const b3 = useBenchmarkReturns(BENCHMARKS[3].id, activeBenchmarkIds.includes(BENCHMARKS[3].id));

  const hookResults = [b0, b1, b2, b3];

  // Build lookup maps: benchmarkId → data / loading / error
  const benchmarkData = useMemo(() => {
    const map: Record<string, ReturnType<typeof useBenchmarkReturns>['data']> = {};
    BENCHMARKS.forEach((b, i) => {
      if (hookResults[i].data) map[b.id] = hookResults[i].data;
    });
    return map;
  // hookResults is a new array every render, but its contents stabilise once loaded
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

  const anyLoading = activeBenchmarkIds.some((id) => {
    const idx = BENCHMARKS.findIndex(b => b.id === id);
    return idx >= 0 && hookResults[idx].isLoading;
  });

  const toggleBenchmark = (id: string) => {
    setActiveBenchmarkIds(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const getChartHeight = () => (isMobile ? 260 : 380);

  const hasPortfolioData = portfolioHeatmapData.some(y => y.months.some(m => m.return !== null));

  // Only pass data for benchmarks that are both active AND loaded
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
                  Crescita di 100 indicizzata al primo mese del periodo. Rendimenti benchmark in USD.
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
            {/* Benchmark toggle pills */}
            <div className="flex flex-wrap gap-2">
              {BENCHMARKS.map(benchmark => {
                const isActive = activeBenchmarkIds.includes(benchmark.id);
                const hasError = benchmarkErrors[benchmark.id];
                return (
                  <Button
                    key={benchmark.id}
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
                    title={benchmark.description}
                  >
                    {benchmark.name}
                    {hasError && ' ⚠'}
                  </Button>
                );
              })}
            </div>

            {/* Loading indicator while any active benchmark is still fetching */}
            {anyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                Caricamento dati benchmark...
              </div>
            )}

            {/* Chart — rendered once at least one benchmark has loaded */}
            {hasPortfolioData && readyBenchmarkIds.length > 0 ? (
              <BenchmarkComparisonChart
                portfolioHeatmapData={portfolioHeatmapData}
                benchmarkDefinitions={BENCHMARKS}
                benchmarkReturns={benchmarkData as Record<string, NonNullable<typeof benchmarkData[string]>>}
                selectedBenchmarkIds={readyBenchmarkIds}
                startDate={startDate}
                endDate={endDate}
                height={getChartHeight()}
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
