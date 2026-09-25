'use client';

/**
 * VALORE PER STRUMENTO — «quanto valeva ogni strumento in un mese?»: the month picker as the
 * aside (only the months that carry `byAsset`), a reading line with the month's total and its
 * change attributed to prices and to quantities, then — from `desktop:` in two columns — the
 * table of instruments (value, share, Δ on the previous month split into price and quantity)
 * and the selection: tick instruments to sum them and follow their combined value over time.
 *
 * The table owns the tile's width until something is ticked: an empty Selezione panel used to
 * hold 5/12 of it for one sentence while the table needed 813px inside 671 and hid «di cui
 * prezzo / di cui quantità» — the two columns the reading is about (critique of 2026-09-20). With
 * a selection the panel takes its 5/12 and the table folds Quantità and Quota under their
 * neighbours through a CONTAINER query, so it fits either width by construction. A Δ moved mostly
 * by quantities is a flow and carries no sign colour (`isFlowDominated`).
 *
 * Values are read from the snapshot, never recomputed (`byAsset.totalValue` already went through
 * `calculateAssetValue`); every figure comes from `lib/utils/snapshotAssetBreakdown.ts`
 * (`buildMonthAssetBreakdown`, `summarizeSelection`, `buildSelectedAssetTrend`), the words from
 * `describeMonthBreakdown`. Below `desktop:` the table is a flat list of rows, 6 at a time.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Narrative } from '@/lib/utils/narrative';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import { describeEmptySelection, describePreviousMonthShort } from '@/lib/utils/storicoNarrative';
import { NarrativeText } from '@/components/ui/narrative-text';
import { isFlowDominated, type MonthAssetBreakdown, type MonthAssetRow, type SelectedAssetTrendPoint, type SelectionSummary, type SnapshotMonthOption } from '@/lib/utils/snapshotAssetBreakdown';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency, formatCurrencyCompact, formatNumber, formatPercentage } from '@/lib/services/chartService';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { useRovingFocus } from '@/lib/hooks/useRovingFocus';
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
            su {point.previousLabel?.toLowerCase()} <Effect value={point.delta} flow={isFlowDominated(point)} className="font-mono font-semibold tabular-nums" />
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

/** The props `useRovingFocus` hands to each row's checkbox: one Tab stop for the list, the arrows inside it. */
type RovingItemProps = ReturnType<ReturnType<typeof useRovingFocus>['itemProps']>;

interface RowProps {
  row: MonthAssetRow;
  ticker: string;
  selected: boolean;
  onToggle: () => void;
  roving: RovingItemProps;
}

// `@[760px]` is the container width from which Quantità and Quota are columns of their own; below
// it they fold under the name and the value. Written out in full: Tailwind reads class names as text.

function TableRow({ row, ticker, selected, onToggle, roving }: RowProps) {
  return (
    <tr className={cn('border-t border-border', selected && 'bg-muted/30')}>
      <td className="w-8 align-middle">
        {/* The label is the target (32px, the dense-list floor): a 16px square was the only way to tick. */}
        <label className="-ml-2 flex h-8 w-8 cursor-pointer items-center justify-center">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleziona ${row.name}`} {...roving} />
        </label>
      </td>
      <th scope="row" className="py-2 pr-1.5 text-left align-middle font-normal">
        {/* The cap sits on the block spans: a table cell ignores max-width, a block clamps its min-content. */}
        <span className="block max-w-[200px] truncate text-[13px] text-foreground @[760px]:max-w-[320px]">{row.name}</span>
        <span className="block max-w-[200px] truncate font-mono text-[11px] tabular-nums text-muted-foreground @[760px]:max-w-[320px]">
          {ticker}
          <span className="@[760px]:hidden">
            {ticker ? ' · ' : ''}
            {formatNumber(row.quantity)}
          </span>
        </span>
      </th>
      <td className={cn(CELL_CLASS, 'hidden text-[13px] text-muted-foreground @[760px]:table-cell')}>{formatNumber(row.quantity)}</td>
      <td className={cn(CELL_CLASS, 'text-[13px] text-foreground')}>
        {formatCurrency(row.totalValue)}
        <span className="block text-[11px] text-muted-foreground @[760px]:hidden">{formatPercentage(row.sharePct, 1)}</span>
      </td>
      <td className={cn(CELL_CLASS, 'hidden text-[11px] text-muted-foreground @[760px]:table-cell')}>{formatPercentage(row.sharePct, 1)}</td>
      <td className={cn(CELL_CLASS, 'text-[13px]')}>
        <Effect value={row.delta} flow={isFlowDominated(row)} />
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
function FlatRow({ row, ticker, selected, onToggle, roving }: RowProps) {
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-2.5 border-t border-border py-2', selected && 'bg-muted/30')}>
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleziona ${row.name}`} {...roving} />
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
              <Effect value={row.delta} flow={isFlowDominated(row)} /> ·{' '}
            </>
          )}
          <span className="text-muted-foreground">{formatPercentage(row.sharePct, 1)}</span>
        </span>
      </div>
    </label>
  );
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

type SortKey = 'totalValue' | 'delta' | 'priceEffect' | 'quantityEffect';
interface SortState {
  key: SortKey;
  descending: boolean;
}
/** The breakdown's own order: largest holding first. */
const DEFAULT_SORT: SortState = { key: 'totalValue', descending: true };

/** A column head that sorts: the first press ranks largest first, the second reverses it. */
function SortHead({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void; className?: string }) {
  const active = sort.key === sortKey;
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <th scope="col" aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'} className={cn(HEAD_CLASS, 'py-0', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex h-8 items-center gap-1 rounded-sm uppercase tracking-[inherit] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active && 'text-foreground')}
      >
        {label}
        {active && <Arrow className="h-2.5 w-2.5" aria-hidden="true" />}
      </button>
    </th>
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
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const prefersReducedMotion = useReducedMotion();
  const rows = useMemo(() => {
    const unsorted = breakdown?.rows ?? [];
    const direction = sort.descending ? -1 : 1;
    // A first month has no Δ: its nulls rank as zero, so the column still sorts.
    return [...unsorted].sort((a, b) => direction * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)));
  }, [breakdown, sort]);
  const handleSort = (key: SortKey) => setSort((previous) => (previous.key === key ? { key, descending: !previous.descending } : { key, descending: true }));
  const selectedInMonth = rows.filter((r) => selectedAssetIds.has(r.assetId)).length;
  const allSelected = rows.length > 0 && selectedInMonth === rows.length;
  const someSelected = selectedInMonth > 0 && !allSelected;
  const previousLabel = describePreviousMonthShort(breakdown);
  // Ticked somewhere, but none of them exists in this month: the panel says so, the trend still draws them.
  const hasSelectionElsewhere = selectedAssetIds.size > 0 && (selection?.count ?? 0) === 0;
  const tickerOf = (row: MonthAssetRow) => displayTickerByAssetId.get(row.assetId) ?? row.ticker ?? '';
  const flatRows = showAll ? rows : rows.slice(0, MOBILE_PAGE);
  // The panel earns its 5/12 only once something is ticked, in this month or another.
  const hasSelection = selectedAssetIds.size > 0;
  const tableRoving = useRovingFocus(rows.length);
  const flatRoving = useRovingFocus(flatRows.length);

  // The table fits both widths by construction; should a long number still widen it, the wrapper
  // scrolls — and a region that scrolls must be reachable by keyboard, so it becomes a Tab stop
  // only while it does (measured, like Strumenti's).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [tableScrolls, setTableScrolls] = useState(false);
  useEffect(() => {
    const measure = () => {
      const el = scrollerRef.current;
      setTableScrolls(!!el && el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [rows.length, hasSelection, activeMonthKey]);

  const aside =
    months.length > 0 ? (
      <div className="flex items-center gap-2">
        <span className="hidden whitespace-nowrap tablet:inline">
          <span className="font-mono tabular-nums">{months.length}</span> {months.length === 1 ? 'mese' : 'mesi'} con dettaglio
        </span>
        <Select value={activeMonthKey ?? undefined} onValueChange={onMonthChange}>
          {/* `size="sm"` sets `data-[size=sm]:h-8`, which beats a plain `h-11`: the override must carry the same variant. */}
          <SelectTrigger size="sm" className="gap-1.5 px-2.5 text-[11px] font-medium text-foreground data-[size=sm]:h-11 desktop:data-[size=sm]:h-8" aria-label="Mese del dettaglio">
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
                {' '}· su {previousLabel} <Effect value={selection.delta} flow={isFlowDominated(selection)} className="font-mono font-semibold tabular-nums" />
              </>
            )}
          </p>
        </>
      ) : hasSelectionElsewhere && breakdown ? (
        <NarrativeText segments={describeEmptySelection(breakdown.month)} className="mt-1.5 text-[13px] leading-[1.45] text-muted-foreground" />
      ) : null}
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
        <div className={cn('mt-3 grid grid-cols-1 gap-5', hasSelection && 'desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]')}>
          {/* Desktop: the table, a container of its own so its columns follow the width it is given. */}
          <div
            ref={scrollerRef}
            className="@container -mx-5 hidden overflow-x-auto px-5 desktop:block"
            {...(tableScrolls ? { tabIndex: 0, role: 'region', 'aria-label': 'Tabella degli strumenti, scorrevole in orizzontale' } : {})}
          >
            <p id="valore-roving-hint" className="sr-only">
              Nella colonna di selezione le frecce su e giù passano da uno strumento all&apos;altro.
            </p>
            <table className="w-full border-collapse" aria-describedby="valore-roving-hint">
              <thead>
                <tr>
                  <th scope="col" className="w-8 text-left">
                    <label className="-ml-2 flex h-8 w-8 cursor-pointer items-center justify-center">
                      <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={onToggleAllInMonth} aria-label="Seleziona tutti gli strumenti del mese" />
                    </label>
                  </th>
                  <th scope="col" className={cn(HEAD_CLASS, 'px-0 text-left')}>Strumento</th>
                  <th scope="col" className={cn(HEAD_CLASS, 'hidden @[760px]:table-cell')}>Quantità</th>
                  <SortHead label="Valore" sortKey="totalValue" sort={sort} onSort={handleSort} />
                  <th scope="col" className={cn(HEAD_CLASS, 'hidden @[760px]:table-cell')}>Quota</th>
                  <SortHead label={previousLabel ? `Δ su ${previousLabel}` : 'Δ'} sortKey="delta" sort={sort} onSort={handleSort} />
                  <SortHead label="di cui prezzo" sortKey="priceEffect" sort={sort} onSort={handleSort} />
                  <SortHead label="di cui quantità" sortKey="quantityEffect" sort={sort} onSort={handleSort} className="pr-0" />
                </tr>
              </thead>
              <tbody {...tableRoving.containerProps}>
                {rows.map((row, index) => (
                  <TableRow key={row.assetId} row={row} ticker={tickerOf(row)} selected={selectedAssetIds.has(row.assetId)} onToggle={() => onToggleAsset(row.assetId)} roving={tableRoving.itemProps(index)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below desktop: flat rows, six at a time. */}
          <div className="desktop:hidden" {...flatRoving.containerProps}>
            {/* The label carries the 44px target: the square alone measured 16×16 on a phone. */}
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
              <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={onToggleAllInMonth} aria-label="Seleziona tutti gli strumenti del mese" />
              <span className={TILE_SUB_EYEBROW_CLASS}>Strumento · valore · Δ · quota</span>
            </label>
            {flatRows.map((row, index) => (
              <FlatRow key={row.assetId} row={row} ticker={tickerOf(row)} selected={selectedAssetIds.has(row.assetId)} onToggle={() => onToggleAsset(row.assetId)} roving={flatRoving.itemProps(index)} />
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

          {/* Sticky beside a table of twenty-odd rows: the sum and its trend stay in sight while the reader ticks
              further down (`self-start`, or the stretched grid item leaves the sticky no room to travel). */}
          {hasSelection && <div className="border-t border-border pt-4 desktop:sticky desktop:top-4 desktop:self-start desktop:border-l desktop:border-t-0 desktop:pl-5 desktop:pt-0">{selectionPanel}</div>}
        </div>
      )}

      <TileMethodNote
        subject="Valore per strumento"
        summary={
          breakdown && rows.length > 0
            ? hasSelection
              ? 'Valori congelati nello snapshot del mese, mai ricalcolati.'
              : "Valori congelati nello snapshot del mese, mai ricalcolati. Spunta uno o più strumenti per sommarne il valore e seguirne l'andamento."
            : undefined
        }
      >
        <span>La quota è sul patrimonio del mese. Il Δ confronta con il mese precedente che ha il dettaglio.</span>
        <span>
          <strong className="font-medium text-foreground">Prezzo</strong> è il mercato sulla quantità di allora: un guadagno o una perdita, e ha il colore del segno.
        </span>
        <span>
          <strong className="font-medium text-foreground">Quantità</strong> sono acquisti, vendite e versamenti: un flusso, senza colore. Un Δ mosso soprattutto dalle quantità resta senza colore anche lui.
        </span>
        <span>Per liquidità e fondo pensione la quantità è il valore, quindi il loro Δ è tutto quantità.</span>
      </TileMethodNote>
    </Tile>
  );
}
