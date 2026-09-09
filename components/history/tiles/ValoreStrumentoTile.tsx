'use client';

/**
 * VALORE PER STRUMENTO — «quanto valeva ogni strumento in un mese?»: the month picker as the
 * aside (only the months that carry `byAsset`), a reading line with the month's total and its
 * change attributed to prices and to quantities, then — from `desktop:` in two columns — the
 * table of instruments (value, share, Δ on the previous month split into price and quantity)
 * and the selection: tick instruments to sum them and follow their combined value over time.
 *
 * Values are read from the snapshot, never recomputed (`byAsset.totalValue` already went through
 * `calculateAssetValue`); every figure comes from `lib/utils/snapshotAssetBreakdown.ts`
 * (`buildMonthAssetBreakdown`, `summarizeSelection`, `buildSelectedAssetTrend`), the words from
 * `describeMonthBreakdown`. Below `desktop:` the table is a flat list of rows, 6 at a time.
 */

import { useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Narrative } from '@/lib/utils/narrative';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import { describeEmptySelection, describePreviousMonthShort } from '@/lib/utils/storicoNarrative';
import { NarrativeText } from '@/components/ui/narrative-text';
import type { MonthAssetBreakdown, MonthAssetRow, SelectedAssetTrendPoint, SelectionSummary, SnapshotMonthOption } from '@/lib/utils/snapshotAssetBreakdown';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency, formatCurrencyCompact, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

interface ValoreStrumentoTileProps {
  reading: Narrative | null;
  months: SnapshotMonthOption[];
  activeMonthKey: string | null;
  onMonthChange: (key: string) => void;
  breakdown: MonthAssetBreakdown | null;
  /** The live `displayTicker` by asset id; the snapshot only froze the raw ticker. */
  displayTickerByAssetId: Map<string, string>;
  selectedAssetIds: Set<string>;
  onToggleAsset: (assetId: string) => void;
  onToggleAllInMonth: () => void;
  selection: SelectionSummary | null;
  trend: SelectedAssetTrendPoint[];
  className?: string;
}

const MOBILE_PAGE = 6;
const HEAD_CLASS = cn(TILE_SUB_EYEBROW_CLASS, 'whitespace-nowrap px-1.5 py-2 text-right font-semibold');
const CELL_CLASS = 'whitespace-nowrap px-1.5 py-2 text-right align-middle font-mono tabular-nums';

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;

/**
 * A signed effect; a zero is a dash (nothing moved), never «+0 €». A `flow` (the quantity effect:
 * buys, sells, deposits) keeps the typographic sign but no colour — it is neither a gain nor a loss.
 */
function Effect({ value, className, flow = false }: { value: number | null; className?: string; flow?: boolean }) {
  if (value === null || Math.abs(value) < 0.5) return <span className={cn('text-muted-foreground', className)}>—</span>;
  return <span className={cn(flow ? 'text-foreground' : signTextClass(value), className)}>{signed(value)}</span>;
}

/** `2026-7` → «lug 26», the trend axis' tick; the tooltip keeps the full label. */
function shortTick(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES_SHORT[month - 1].toLowerCase()} ${String(year).slice(2)}`;
}

// ─── The selection's trend (Recharts, module-level tooltip) ───────────────────

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
} as const;

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SelectedAssetTrendPoint }>;
}

/** The selection's value in the hovered month and, from the second month on, its change split into price and quantity. */
function TrendTooltip({ active, payload }: TrendTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div style={TOOLTIP_CONTENT_STYLE} className="flex flex-col gap-1 text-[11px]">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{point.label}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-card-foreground">{formatCurrency(point.total)}</span>
      {point.delta !== null && (
        <div className="flex flex-col gap-0.5 border-t border-border pt-1 text-muted-foreground">
          <span>
            su {point.previousLabel?.toLowerCase()} <Effect value={point.delta} className="font-mono font-semibold tabular-nums" />
          </span>
          <span>
            prezzo <Effect value={point.priceEffect} className="font-mono tabular-nums" /> · quantità <Effect value={point.quantityEffect} flow className="font-mono tabular-nums" />
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

interface RowProps {
  row: MonthAssetRow;
  ticker: string;
  selected: boolean;
  onToggle: () => void;
}

function TableRow({ row, ticker, selected, onToggle }: RowProps) {
  return (
    <tr className={cn('border-t border-border', selected && 'bg-muted/30')}>
      <td className="w-8 py-2 pr-1.5 align-middle">
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleziona ${row.name}`} />
      </td>
      <th scope="row" className="py-2 pr-1.5 text-left align-middle font-normal">
        {/* The cap sits on the block spans: a table cell ignores max-width, a block clamps its min-content. */}
        <span className="block max-w-[240px] truncate text-[13px] text-foreground">{row.name}</span>
        {ticker && <span className="block max-w-[240px] truncate font-mono text-[11px] tabular-nums text-muted-foreground">{ticker}</span>}
      </th>
      <td className={cn(CELL_CLASS, 'text-[13px] text-muted-foreground')}>{formatNumber(row.quantity)}</td>
      <td className={cn(CELL_CLASS, 'text-[13px] text-foreground')}>{formatCurrency(row.totalValue)}</td>
      <td className={cn(CELL_CLASS, 'text-[11px] text-muted-foreground')}>{formatPercentage(row.sharePct, 1)}</td>
      <td className={cn(CELL_CLASS, 'text-[13px]')}>
        <Effect value={row.delta} />
      </td>
      <td className={cn(CELL_CLASS, 'text-[11px]')}>
        <Effect value={row.priceEffect} />
      </td>
      <td className={cn(CELL_CLASS, 'pr-0 text-[11px]')}>
        <Effect value={row.quantityEffect} flow />
      </td>
    </tr>
  );
}

/** The whole row is the tap target: a `<label>` around the checkbox, so a 16px square is never the only way to tick on a phone. */
function FlatRow({ row, ticker, selected, onToggle }: RowProps) {
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-2.5 border-t border-border py-2', selected && 'bg-muted/30')}>
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleziona ${row.name}`} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-foreground">{row.name}</span>
        <span className="block truncate font-mono text-[11px] tabular-nums text-muted-foreground">
          {ticker ? `${ticker} · ` : ''}
          {formatNumber(row.quantity)}
        </span>
        {row.delta !== null && (
          <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
            prezzo <Effect value={row.priceEffect} /> · quantità <Effect value={row.quantityEffect} flow />
          </span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className="block font-mono text-[13px] tabular-nums text-foreground">{formatCurrency(row.totalValue)}</span>
        <span className="block font-mono text-[11px] tabular-nums">
          {row.delta !== null && (
            <>
              <Effect value={row.delta} /> ·{' '}
            </>
          )}
          <span className="text-muted-foreground">{formatPercentage(row.sharePct, 1)}</span>
        </span>
      </div>
    </label>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

export function ValoreStrumentoTile({
  reading,
  months,
  activeMonthKey,
  onMonthChange,
  breakdown,
  displayTickerByAssetId,
  selectedAssetIds,
  onToggleAsset,
  onToggleAllInMonth,
  selection,
  trend,
  className,
}: ValoreStrumentoTileProps) {
  const [showAll, setShowAll] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const rows = breakdown?.rows ?? [];
  const selectedInMonth = rows.filter((r) => selectedAssetIds.has(r.assetId)).length;
  const allSelected = rows.length > 0 && selectedInMonth === rows.length;
  const someSelected = selectedInMonth > 0 && !allSelected;
  const previousLabel = describePreviousMonthShort(breakdown);
  // Ticked somewhere, but none of them exists in this month: the panel says so, the trend still draws them.
  const hasSelectionElsewhere = selectedAssetIds.size > 0 && (selection?.count ?? 0) === 0;
  const tickerOf = (row: MonthAssetRow) => displayTickerByAssetId.get(row.assetId) ?? row.ticker ?? '';
  const flatRows = showAll ? rows : rows.slice(0, MOBILE_PAGE);

  const aside =
    months.length > 0 ? (
      <div className="flex items-center gap-2">
        <span className="hidden whitespace-nowrap tablet:inline">
          <span className="font-mono tabular-nums">{months.length}</span> {months.length === 1 ? 'mese' : 'mesi'} con dettaglio
        </span>
        <Select value={activeMonthKey ?? undefined} onValueChange={onMonthChange}>
          {/* `size="sm"` sets `data-[size=sm]:h-8`, which beats a plain `h-11`: the override must carry the same variant. */}
          <SelectTrigger size="sm" className="gap-1.5 px-2.5 text-[11px] font-medium text-foreground data-[size=sm]:h-11 desktop:data-[size=sm]:h-7" aria-label="Mese del dettaglio">
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
    ) : undefined;

  const selectionPanel = (
    <div className="flex min-w-0 flex-col">
      <p className={TILE_SUB_EYEBROW_CLASS}>
        Selezione{selection && selection.count > 0 && (
          <>
            {' '}· <span className="font-mono tabular-nums">{selection.count}</span> {selection.count === 1 ? 'strumento' : 'strumenti'}
          </>
        )}
      </p>
      {selection && selection.count > 0 ? (
        <>
          <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">{formatCurrency(selection.value)}</p>
          <p className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground">
            {articleForPercent(selection.sharePct, 1)}
            <span className="font-mono tabular-nums">{formatPercentage(selection.sharePct, 1)}</span> del patrimonio di {breakdown?.month.label.toLowerCase()}
            {selection.delta !== null && previousLabel && (
              <>
                {' '}· su {previousLabel} <Effect value={selection.delta} className="font-mono font-semibold tabular-nums" />
              </>
            )}
          </p>
        </>
      ) : hasSelectionElsewhere && breakdown ? (
        <NarrativeText segments={describeEmptySelection(breakdown.month)} className="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground" />
      ) : (
        <p className="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground">Spunta uno o più strumenti per sommarne il valore e seguirne l&apos;andamento in ogni mese con dettaglio.</p>
      )}
      {trend.length >= 2 && (
        <div className="mt-3 h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 24, left: 0, bottom: 0 }} role="img" aria-label={`Andamento del valore degli strumenti selezionati, da ${trend[0].label} a ${trend[trend.length - 1].label}: da ${cachedFormatCurrencyEUR(trend[0].total, true)} a ${cachedFormatCurrencyEUR(trend[trend.length - 1].total, true)}.`} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="key" tickFormatter={shortTick} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
              <YAxis tickFormatter={(value: number) => formatCurrencyCompact(value)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25, strokeWidth: 1 }} />
              <Line type="monotone" dataKey="total" name="Selezione" stroke="var(--chart-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 1.5, stroke: 'var(--foreground)', fill: 'var(--chart-1)' }} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  return (
    <Tile eyebrow="Valore per strumento" aside={aside} reading={reading} className={className} ariaLabel="Valore per strumento">
      {!breakdown ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          Nessuno snapshot con il dettaglio per strumento: viene salvato negli snapshot più recenti, dal prossimo in poi.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">Nessuno strumento registrato in questo mese.</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* Desktop: the table, scrolling inside its own wrapper to the tile's edge. */}
          <div className="-mx-5 hidden overflow-x-auto px-5 desktop:block">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="w-8 py-2 pr-1.5 text-left">
                    <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={onToggleAllInMonth} aria-label="Seleziona tutti gli strumenti del mese" />
                  </th>
                  <th scope="col" className={cn(HEAD_CLASS, 'px-0 text-left')}>Strumento</th>
                  <th scope="col" className={HEAD_CLASS}>Quantità</th>
                  <th scope="col" className={HEAD_CLASS}>Valore</th>
                  <th scope="col" className={HEAD_CLASS}>Quota</th>
                  <th scope="col" className={HEAD_CLASS}>{previousLabel ? `Δ su ${previousLabel}` : 'Δ'}</th>
                  <th scope="col" className={HEAD_CLASS}>di cui prezzo</th>
                  <th scope="col" className={cn(HEAD_CLASS, 'pr-0')}>di cui quantità</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TableRow key={row.assetId} row={row} ticker={tickerOf(row)} selected={selectedAssetIds.has(row.assetId)} onToggle={() => onToggleAsset(row.assetId)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below desktop: flat rows, six at a time. */}
          <div className="desktop:hidden">
            <div className="flex items-center gap-2.5 pb-2">
              <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={onToggleAllInMonth} aria-label="Seleziona tutti gli strumenti del mese" />
              <span className={TILE_SUB_EYEBROW_CLASS}>Strumento · valore · Δ · quota</span>
            </div>
            {flatRows.map((row) => (
              <FlatRow key={row.assetId} row={row} ticker={tickerOf(row)} selected={selectedAssetIds.has(row.assetId)} onToggle={() => onToggleAsset(row.assetId)} />
            ))}
            {rows.length > MOBILE_PAGE && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 h-11 w-full rounded-md border border-border text-[13px] text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showAll ? 'Mostra meno' : `Mostra altri ${rows.length - MOBILE_PAGE} strumenti`}
              </button>
            )}
          </div>

          <div className="border-t border-border pt-4 desktop:border-l desktop:border-t-0 desktop:pl-5 desktop:pt-0">{selectionPanel}</div>
        </div>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Valori congelati nello snapshot del mese, mai ricalcolati; la quota è sul patrimonio del mese. Il Δ confronta con il mese precedente che ha il dettaglio: «prezzo» è il mercato sulla quantità di allora, «quantità» sono acquisti, vendite e versamenti. Per liquidità e fondo pensione la quantità è il valore, quindi il loro Δ è tutto quantità.
      </p>
    </Tile>
  );
}
