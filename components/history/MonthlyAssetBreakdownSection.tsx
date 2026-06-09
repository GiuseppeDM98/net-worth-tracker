/**
 * "Valore per strumento" section for the Storico page.
 *
 * Answers: "in a given month, how much was each instrument in my portfolio worth?" — and lets the
 * user select a subset of instruments to see their combined value, both for the chosen month and as
 * a trend across every month with data.
 *
 * The values come straight from MonthlySnapshot.byAsset (frozen at snapshot time via
 * calculateAssetValue) — no value is recomputed here. All aggregation lives in the tested pure layer
 * lib/utils/snapshotAssetBreakdown.ts.
 *
 * PATTERNS (AGENTS.md / sibling AndamentoStoricoSection):
 * - Self-contained: only `snapshots` is passed in; selection state is local.
 * - Colours come exclusively from useChartColors() — no hardcoded hex.
 * - Derived values use useMemo (never useEffect + setState).
 * - Recharts tooltips are styled via CSS vars.
 */
'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import type { MonthlySnapshot } from '@/types/assets';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/services/chartService';
import {
  getAvailableSnapshotMonths,
  sortAssetsByValue,
  sumSelectedValues,
  buildSelectedAssetTrend,
  type SelectedAssetTrendPoint,
} from '@/lib/utils/snapshotAssetBreakdown';

// Shared tooltip style (mirrors AndamentoStoricoSection) — theme-aware via CSS vars.
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: 'var(--card-foreground)' } as const;

// Signed EUR, with an explicit "+" for gains so the direction reads at a glance ("-" is built in).
function formatSignedCurrency(value: number): string {
  const formatted = formatCurrency(value);
  return value > 0 ? `+${formatted}` : formatted;
}

// ── TrendTooltip ────────────────────────────────────────────────────────────────
// Custom tooltip: the selected subset's value in the hovered month plus, from the second month on,
// the change vs the previous month split into price vs quantity (see attributeSelectedChange).
// Module-level for the React Compiler. Colours use the positive/negative semantic tokens.

// Recharts passes the hovered data point under payload[0].payload (local props type — the library's
// TooltipProps no longer exposes payload directly, matching the codebase's other custom tooltips).
interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SelectedAssetTrendPoint }>;
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const point = payload[0].payload;

  return (
    <div style={TOOLTIP_CONTENT_STYLE} className="px-3 py-2">
      <p style={TOOLTIP_LABEL_STYLE}>{point.label}</p>
      <p className="text-[var(--chart-1)]">
        Valore selezionato: {formatCurrency(point.total)}
      </p>
      {point.delta !== null && (
        <div className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
          <p className="text-muted-foreground">
            Δ vs {point.previousLabel}:{' '}
            <span className={point.delta >= 0 ? 'text-positive' : 'text-destructive'}>
              {formatSignedCurrency(point.delta)}
            </span>
          </p>
          <p className="text-muted-foreground">
            • da prezzo:{' '}
            <span className={(point.priceEffect ?? 0) >= 0 ? 'text-positive' : 'text-destructive'}>
              {formatSignedCurrency(point.priceEffect ?? 0)}
            </span>
          </p>
          <p className="text-muted-foreground">
            • da quantità:{' '}
            <span
              className={(point.quantityEffect ?? 0) >= 0 ? 'text-positive' : 'text-destructive'}
            >
              {formatSignedCurrency(point.quantityEffect ?? 0)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── SelectedAssetTrendChart ─────────────────────────────────────────────────────
// Combined value of the selected instruments across every month. Module-level (React Compiler).

function SelectedAssetTrendChart({
  data,
  color,
  height,
}: {
  data: ReturnType<typeof buildSelectedAssetTrend>;
  color: string;
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
        />
        <Tooltip
          content={<TrendTooltip />}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '5 5' }}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface MonthlyAssetBreakdownSectionProps {
  snapshots: MonthlySnapshot[];
}

export function MonthlyAssetBreakdownSection({ snapshots }: MonthlyAssetBreakdownSectionProps) {
  const chartColors = useChartColors();
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Months that actually carry a per-asset breakdown (newest first).
  const months = useMemo(() => getAvailableSnapshotMonths(snapshots), [snapshots]);

  // Default to the most recent month; track explicit selection on top.
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  // Selected instruments, identified by assetId. Default: none selected.
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  // Resolve the active month: the explicit selection if still available, else the latest.
  const activeMonthKey = useMemo(() => {
    if (selectedMonthKey && months.some((m) => m.key === selectedMonthKey)) {
      return selectedMonthKey;
    }
    return months[0]?.key ?? null;
  }, [selectedMonthKey, months]);

  const activeSnapshot = useMemo(
    () => snapshots.find((s) => `${s.year}-${s.month}` === activeMonthKey) ?? null,
    [snapshots, activeMonthKey]
  );

  const sortedAssets = useMemo(
    () => (activeSnapshot ? sortAssetsByValue(activeSnapshot.byAsset) : []),
    [activeSnapshot]
  );

  const selectedSum = useMemo(
    () => sumSelectedValues(sortedAssets, selectedAssetIds),
    [sortedAssets, selectedAssetIds]
  );

  const selectedCountInMonth = useMemo(
    () => sortedAssets.filter((a) => selectedAssetIds.has(a.assetId)).length,
    [sortedAssets, selectedAssetIds]
  );

  const trendData = useMemo(
    () => buildSelectedAssetTrend(snapshots, selectedAssetIds),
    [snapshots, selectedAssetIds]
  );

  const monthTotal = activeSnapshot?.totalNetWorth ?? 0;
  const selectedPct = monthTotal > 0 ? (selectedSum / monthTotal) * 100 : 0;

  const allInMonthSelected = sortedAssets.length > 0 && selectedCountInMonth === sortedAssets.length;
  const someInMonthSelected = selectedCountInMonth > 0 && !allInMonthSelected;

  const toggleAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  // Master checkbox toggles only the instruments of the active month, preserving any selection
  // made in other months (those ids still drive the trend chart).
  const toggleAllInMonth = () => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (allInMonthSelected) {
        sortedAssets.forEach((a) => next.delete(a.assetId));
      } else {
        sortedAssets.forEach((a) => next.add(a.assetId));
      }
      return next;
    });
  };

  // Empty state: no snapshot carries a per-asset breakdown yet.
  if (months.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
          Nessuno snapshot con dettaglio per strumento disponibile. Il dettaglio viene salvato negli
          snapshot mensili più recenti.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg sm:text-xl">Valore per Strumento</CardTitle>
              <p className="text-xs text-muted-foreground">
                Valori congelati nello snapshot del mese selezionato. Spunta gli strumenti per
                sommarne il valore.
              </p>
            </div>
            <Select
              value={activeMonthKey ?? undefined}
              onValueChange={(value) => setSelectedMonthKey(value)}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Seleziona mese" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sortedAssets.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Nessuno strumento registrato per questo mese.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          allInMonthSelected ? true : someInMonthSelected ? 'indeterminate' : false
                        }
                        onCheckedChange={toggleAllInMonth}
                        aria-label="Seleziona tutti gli strumenti del mese"
                      />
                    </TableHead>
                    <TableHead>Strumento</TableHead>
                    <TableHead className="text-right">Quantità</TableHead>
                    <TableHead className="text-right">Valore</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAssets.map((asset) => {
                    const isSelected = selectedAssetIds.has(asset.assetId);
                    return (
                      <TableRow
                        key={asset.assetId}
                        data-state={isSelected ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => toggleAsset(asset.assetId)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAsset(asset.assetId)}
                            aria-label={`Seleziona ${asset.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{asset.name}</p>
                            {asset.ticker && (
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {asset.ticker}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatNumber(asset.quantity)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-foreground">
                          {formatCurrency(asset.totalValue)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Selection summary */}
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedCountInMonth === 0 ? (
                    'Nessuno strumento selezionato in questo mese'
                  ) : (
                    <>
                      {selectedCountInMonth}{' '}
                      {selectedCountInMonth === 1 ? 'strumento selezionato' : 'strumenti selezionati'}
                      {' · '}
                      {selectedPct.toFixed(1)}% del patrimonio del mese
                    </>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Totale selezionato </span>
                  <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                    {formatCurrency(selectedSum)}
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Combined-value trend of the selected instruments across all months */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Andamento Strumenti Selezionati</CardTitle>
          <p className="text-xs text-muted-foreground">
            Somma del valore degli strumenti selezionati in ogni mese disponibile.
          </p>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">
              Seleziona uno o più strumenti per vederne l&apos;andamento nel tempo.
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              <SelectedAssetTrendChart
                data={trendData}
                color={chartColors[0] ?? '#6366f1'}
                height={isMobile ? 240 : 320}
              />
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
