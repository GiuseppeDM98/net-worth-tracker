'use client';

/**
 * COMPOSIZIONE — «di cosa è fatto il patrimonio, e come cambia il mix?»: the 100%-stacked area
 * of shares on one axis of choice (Asset class | Liquidità, the toggle as the aside), the
 * breakdown list that IS the legend (swatch, value, share, drift in points), the footer.
 *
 * This is the Storico chapter of 2026-08 brought to the tile's cadence: an eyebrow, a reading
 * line from `describeComposition`, then the figures. The maths is untouched and lives in
 * `lib/utils/historyComposition.ts` — the stack is pre-normalised (no `stackOffset`), the
 * residual is a named band, the Previdenza carve-out is measured or estimated per month.
 * This file only renders.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tile } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import type { AssetClassHistoryPoint } from '@/lib/services/chartService';
import { describeComposition } from '@/lib/utils/storicoNarrative';
import {
  buildAssetClassComposition,
  buildChartAriaLabel,
  buildLiquidityComposition,
  formatPeriodLabel,
  shareKey,
  valueKey,
  PENSION_BAND_KEY,
  RESIDUAL_BAND_KEY,
  type CompositionBand,
  type CompositionBreakdownEntry,
  type CompositionCut,
  type CompositionRow,
  type CompositionSeries,
  type LiquidityHistoryPoint,
} from '@/lib/utils/historyComposition';

/** The toggle's options, typed to the domain rather than to its own labels. */
const COMPOSITION_CUTS: ReadonlyArray<{ value: CompositionCut; label: string }> = [
  { value: 'assetClass', label: 'Asset class' },
  { value: 'liquidity', label: 'Liquidità' },
];

/**
 * A band with no palette slot is the unattributed remainder, which must read as absence rather
 * than as one more holding — hence a neutral fill instead of the next hue in the ramp.
 */
function resolveBandColor(band: CompositionBand, chartColors: string[]): string {
  if (band.colorIndex === null) return 'var(--muted-foreground)';
  return chartColors[band.colorIndex] ?? `var(--chart-${(band.colorIndex % 5) + 1})`;
}

/** Tooltip surface tokens. Module-level `as const`: a fresh literal per render re-mounts it. */
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
} as const;

interface CompositionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: CompositionRow }>;
  bands: CompositionBand[];
  chartColors: string[];
}

/**
 * The month's balance sheet, not a list of series: the total first, the rows ranked by share,
 * empty bands dropped, both units on every row.
 */
function CompositionTooltip({ active, payload, bands, chartColors }: CompositionTooltipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const entries = bands
    .map((band) => ({ band, share: (row[shareKey(band.key)] as number) ?? 0, value: (row[valueKey(band.key)] as number) ?? 0 }))
    .filter((entry) => entry.share > 0.05)
    .sort((a, b) => b.share - a.share);

  return (
    <div style={TOOLTIP_CONTENT_STYLE}>
      <p className="text-[13px] font-semibold text-card-foreground">{formatPeriodLabel(row.month as number, row.year as number)}</p>
      <p className="mt-0.5 font-mono text-[13px] tabular-nums text-card-foreground">{formatCurrency(row.totalNetWorth as number)}</p>
      <div className="mt-2 space-y-1 border-t border-border pt-2">
        {entries.map(({ band, share, value }) => (
          <div key={band.key} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: resolveBandColor(band, chartColors) }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{band.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-card-foreground">{formatCurrency(value)}</span>
            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{formatPercentage(share, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Italian separators: every other number in the row is `Intl('it-IT')`. */
const PP_FORMATTER = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Drift in percentage points — NOT in the sign tokens: a class gaining share is neither a gain
 * nor a loss, and colouring it would assert a judgement only Allocazione (with its targets) can make.
 */
function DriftAnnotation({ deltaPp }: { deltaPp: number | null }) {
  if (deltaPp === null) return <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/60">–</span>;
  const sign = deltaPp > 0 ? '+' : deltaPp < 0 ? '−' : '';
  return (
    <span className="w-[72px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
      {sign}
      {PP_FORMATTER.format(Math.abs(deltaPp))} pp
    </span>
  );
}

/**
 * One breakdown row, in two layouts: below `tablet:` identity and share on top, euro and drift
 * beneath — the WORDS stay identical to desktop, only the arrangement changes.
 */
function BreakdownRow({ entry, chartColors }: { entry: CompositionBreakdownEntry; chartColors: string[] }) {
  const swatch = (
    <span
      className="h-2 w-2 shrink-0 rounded-[2px]"
      style={{ background: resolveBandColor({ key: entry.key, label: entry.label, colorIndex: entry.colorIndex }, chartColors) }}
    />
  );
  return (
    <div className="py-2">
      <div className="tablet:hidden">
        <div className="flex items-center gap-2.5">
          {swatch}
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.label}</span>
          <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">{formatPercentage(entry.sharePct, 1)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between pl-[18px]">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{formatCurrency(entry.valueEur)}</span>
          <DriftAnnotation deltaPp={entry.deltaPp} />
        </div>
      </div>
      <div className="hidden items-center gap-2.5 tablet:flex">
        {swatch}
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{entry.label}</span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">{formatCurrency(entry.valueEur)}</span>
        <span className="w-16 shrink-0 text-right font-mono text-[13px] tabular-nums text-muted-foreground">{formatPercentage(entry.sharePct, 1)}</span>
        <DriftAnnotation deltaPp={entry.deltaPp} />
      </div>
    </div>
  );
}

interface ComposizioneTileProps {
  assetClassHistory: AssetClassHistoryPoint[];
  liquidityHistory: LiquidityHistoryPoint[];
  /** True when the user holds at least one `pensionFund` asset — gates the method note. */
  hasPensionFunds: boolean;
  className?: string;
}

export function ComposizioneTile({ assetClassHistory, liquidityHistory, hasPensionFunds, className }: ComposizioneTileProps) {
  const [cut, setCut] = useState<CompositionCut>('assetClass');
  const chartColors = useChartColors();
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const assetClassSeries = useMemo(() => buildAssetClassComposition(assetClassHistory), [assetClassHistory]);
  const liquiditySeries = useMemo(() => buildLiquidityComposition(liquidityHistory), [liquidityHistory]);
  const series: CompositionSeries = cut === 'assetClass' ? assetClassSeries : liquiditySeries;

  const hasData = series.rows.length > 0;
  const showsPensionBand = hasPensionFunds && series.bands.some((band) => band.key === PENSION_BAND_KEY);
  const showsResidualBand = series.bands.some((band) => band.key === RESIDUAL_BAND_KEY);

  // Where the exact Previdenza carve-out begins: naming the month beats a blanket "estimate".
  const firstMeasuredPension = useMemo(() => {
    const point = assetClassHistory.find((row) => row.pensionSource === 'measured');
    return point ? formatPeriodLabel(point.month, point.year) : null;
  }, [assetClassHistory]);
  const hasEstimatedPension = useMemo(() => assetClassHistory.some((row) => row.pensionSource === 'estimated'), [assetClassHistory]);

  const reading = useMemo(() => describeComposition(series, cut), [series, cut]);
  const aside = (
    <div className="flex items-center gap-2">
      <AsideToggle options={COMPOSITION_CUTS} value={cut} onChange={setCut} ariaLabel="Taglio della composizione" />
      {showsPensionBand && (
        <Popover>
          <PopoverTrigger
            aria-label="Come viene calcolata la banda Previdenza"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:h-7 desktop:w-7"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent className="w-80 text-sm">
            <p className="font-semibold text-foreground">Previdenza</p>
            <p className="mt-1.5 text-muted-foreground">
              Il fondo pensione compare come banda a sé e viene scorporato dalle classi in cui era stato ripartito. Il suo valore mensile è sempre un dato salvato, mai una stima: quello che può variare è quanto viene tolto ad Azioni e Obbligazioni.
            </p>
            {firstMeasuredPension && (
              <p className="mt-2 text-muted-foreground">
                Da <strong className="text-foreground">{firstMeasuredPension}</strong> lo scorporo è <strong className="text-foreground">misurato</strong>: ogni rilevamento salva la composizione del fondo in quel momento, quindi ribilanciarlo oggi non cambia il passato.
              </p>
            )}
            {hasEstimatedPension && (
              <p className="mt-2 text-muted-foreground">
                Sui mesi precedenti la composizione storica non era ancora salvata: lì lo scorporo applica la composizione <strong className="text-foreground">attuale</strong> del fondo, ed è una stima.
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  return (
    <Tile eyebrow="Composizione" aside={aside} reading={reading} className={className} ariaLabel="Composizione del patrimonio">
      {!hasData ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          Nessuno storico disponibile: la composizione compare dal primo rilevamento.
        </p>
      ) : (
        <>
          <div className="mt-3 h-[200px] desktop:h-[240px]">
            <ResponsiveContainer key={cut} width="100%" height="100%">
              <AreaChart
                data={series.rows}
                // `right` reserves room for the last tick, centred on the plot's right edge; `left`
                // stays at 0 — a negative margin clips "100%" to "0%", a wrong number, not a cropped one.
                margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                role="img"
                aria-label={buildChartAriaLabel(cut, series)}
                accessibilityLayer={false}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={isMobile ? 40 : 24} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value: number) => `${value}%`} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={isMobile ? 44 : 48} />
                <Tooltip cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} content={<CompositionTooltip bands={series.bands} chartColors={chartColors} />} />
                {series.bands.map((band) => {
                  const color = resolveBandColor(band, chartColors);
                  return (
                    <Area
                      key={band.key}
                      type="monotone"
                      dataKey={shareKey(band.key)}
                      name={band.label}
                      // The stack is what makes this a composition; safe because no band can be negative.
                      stackId="composition"
                      stroke={color}
                      fill={color}
                      fillOpacity={0.75}
                      strokeWidth={1}
                      isAnimationActive={!prefersReducedMotion}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* The legend, carrying the numbers the chart cannot. Same words at every breakpoint. */}
          <div className="mt-3 divide-y divide-border border-t border-border">
            {series.breakdown.map((entry) => (
              <BreakdownRow key={entry.key} entry={entry} chartColors={chartColors} />
            ))}
          </div>
        </>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        {hasData && (
          <>
            Valori e quote di {series.latestPeriodLabel?.toLowerCase()}; l&apos;ultima colonna è la variazione della quota in un anno, in punti.
            {showsResidualBand && (
              <>
                {' '}
                <span className="font-medium text-foreground">Non attribuito</span> è la parte che gli snapshot non ripartiscono in questo taglio.
              </>
            )}{' '}
          </>
        )}
        <Link href="/dashboard/allocation" className="text-foreground underline-offset-2 hover:underline">
          Vai all&apos;Allocazione
        </Link>
      </p>
    </Tile>
  );
}
