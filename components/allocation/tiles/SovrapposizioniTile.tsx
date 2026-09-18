'use client';

/**
 * SOVRAPPOSIZIONI — «quali strumenti detengono gli stessi titoli, e quanto?»: the ranked ETF
 * pairs by overlap (Σ min of the shared top-holdings weights) plus the directly-held stocks
 * that also sit in some ETF, one view at a time (the toggle as the aside), and — when a row
 * is opened — the shared titles with both weights, as a flat block under the list.
 *
 * The sibling of Esposizione on the same payload: it reads `/api/portfolio/exposure` through
 * the same `usePortfolioExposure` hook (one query key, so no second fetch), and shapes it
 * with `summarizeOverlap` (`overlapUtils.ts`). The words come from `describeOverlap` and its
 * aside/footer siblings (`allocazioneNarrative.ts`): this file only renders.
 *
 * Two views became one tile with a switch because the question is one — where do I hold the
 * same thing twice — and pairs vs duplicated stocks are two answers to it, not two tiles
 * (the One-Tile-One-Question Rule). No sign colour anywhere: an overlap is a share of the
 * portfolio, neither a gain nor a loss.
 */

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePortfolioExposure } from '@/lib/hooks/usePortfolioExposure';
import { Skeleton } from '@/components/ui/skeleton';
import {
  summarizeOverlap,
  summarizeOverlapHighlights,
  type OverlapInput,
  type OverlapRow,
  type OverlapRowSource,
  type OverlapViewKey,
} from '@/lib/utils/overlapUtils';
import { describeOverlap, describeOverlapAside, describeOverlapEmpty, describeOverlapFooter } from '@/lib/utils/allocazioneNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

interface SovrapposizioniTileProps {
  userId: string;
  className?: string;
}

/** Rows the tile ranks. */
const VISIBLE_ROWS = 6;

const VIEW_OPTIONS: ReadonlyArray<{ value: OverlapViewKey; label: string }> = [
  { value: 'pairs', label: 'Coppie' },
  { value: 'duplicates', label: 'Duplicati' },
];

/** Accessible name of the list, per view. */
const LIST_LABELS: Record<OverlapViewKey, string> = {
  pairs: 'Coppie di ETF sovrapposte',
  duplicates: 'Azioni detenute anche via ETF',
};

/**
 * The formula line is worth printing only when it says more than the amount: a direct leg
 * («100% di 6000 € = 6000 €») repeats the figure, and a missing base value is an old cached
 * document that never stored it.
 */
function canRenderFormula(source: OverlapRowSource): source is OverlapRowSource & { weight: number; baseValue: number } {
  return (
    typeof source.weight === 'number' &&
    source.weight > 0 &&
    source.weight < 1 &&
    typeof source.baseValue === 'number' &&
    source.baseValue > 0
  );
}

/** Mirrors the geometry of a `RankedRows` row, so nothing shifts when the data lands. */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-[9px]">
      <Skeleton className="h-3 w-[128px] shrink-0" />
      <Skeleton className="h-[3px] flex-1 rounded-full" />
      <Skeleton className="h-3 w-[64px] shrink-0" />
      <Skeleton className="h-3 w-[34px] shrink-0" />
    </div>
  );
}

/**
 * The titles behind one overlap row: both weights for a pair's shared title («4,2% di VWCE ·
 * 3,1% di SWDA»), the weight formula for an ETF leg of a duplicated stock. It mounts inside
 * the tile's persistent live region (see the body), never as one itself: a region created
 * together with its content is not announced.
 */
function SourcesBlock({ row }: { row: OverlapRow }) {
  const count = row.sources.length;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className={TILE_SUB_EYEBROW_CLASS}>
        {row.label} · {count} {count === 1 ? 'voce' : 'voci'}
      </p>
      <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`Dettaglio di ${row.label}`}>
        {row.sources.map((source, index) => (
          <li key={`${source.ticker}-${index}`} className="py-2 text-[12px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 font-medium text-foreground">{source.ticker}</span>
                <span className="min-w-0 truncate text-muted-foreground">{source.name}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(source.amount, true)}</span>
            </div>
            {source.detail && (
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">{source.detail}</p>
            )}
            {canRenderFormula(source) && (
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercentage(source.weight * 100, 2)} di {cachedFormatCurrencyEUR(source.baseValue, true)} ={' '}
                {cachedFormatCurrencyEUR(source.amount, true)}
              </p>
            )}
          </li>
        ))}
        {count > 1 && (
          <li className="flex items-baseline justify-between gap-3 py-2 text-[12px]">
            <span className="font-medium text-foreground">Totale {row.label}</span>
            <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(row.amount, true)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

export function SovrapposizioniTile({ userId, className }: SovrapposizioniTileProps) {
  const [view, setView] = useState<OverlapViewKey>('pairs');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Same query key as Esposizione: React Query serves the cached payload, no second fetch.
  const { data, isError, isFetching, refresh, refetch } = usePortfolioExposure(userId, true);
  const exposure = data?.exposure;
  const cached = data?.cached ?? false;
  // React Query keeps the last payload through a failed refresh, so "no data" and "error" are
  // two different states: a stale list beats an empty tile.
  const isLoading = !exposure && !isError;
  const isEmpty = !!exposure && exposure.analyzedAssets === 0;

  // Old cached documents predate the per-ETF vectors: without them there is no overlap.
  const input = useMemo<OverlapInput | null>(
    () =>
      exposure && exposure.etfHoldings != null
        ? {
            etfs: exposure.etfHoldings,
            stocks: exposure.directStocks ?? [],
            totalPortfolioValue: exposure.totalPortfolioValue,
          }
        : null,
    [exposure],
  );

  const reading = useMemo(() => (input ? describeOverlap(summarizeOverlapHighlights(input)) : null), [input]);
  const overlapView = useMemo(() => (input ? summarizeOverlap(input, view, VISIBLE_ROWS) : null), [input, view]);
  const rows = useMemo<RankedRow[]>(
    () =>
      (overlapView?.rows ?? []).map((row) => ({
        key: row.key,
        label: row.label,
        caption: row.caption,
        amount: row.amount,
        percentage: row.percentage,
      })),
    [overlapView],
  );
  const rowsByKey = useMemo(() => new Map((overlapView?.rows ?? []).map((row) => [row.key, row])), [overlapView]);

  // The open row must still be in the list AND have something to show; a key from another view
  // or a row without sources simply matches nothing.
  const activeRow = activeKey !== null ? (rowsByKey.get(activeKey) ?? null) : null;
  const openRow = activeRow && activeRow.sources.length > 0 ? activeRow : null;

  const handleViewChange = (next: OverlapViewKey) => {
    setView(next);
    setActiveKey(null);
  };

  // `RankedRows` takes one handler for every row: a row without sources is a dead end, so a click
  // on it changes nothing rather than opening an empty block.
  const handleRowClick = (row: RankedRow) => {
    const source = rowsByKey.get(row.key);
    if (!source || source.sources.length === 0) return;
    setActiveKey((current) => (current === row.key ? null : row.key));
  };

  const highlights = useMemo(() => (input ? summarizeOverlapHighlights(input) : null), [input]);
  const aside = (
    <div className="flex flex-wrap items-center gap-2">
      {highlights && <span>{describeOverlapAside({ etfCount: highlights.etfCount, pairCount: highlights.pairCount })}</span>}
      {!isEmpty && <AsideToggle options={VIEW_OPTIONS} value={view} onChange={handleViewChange} ariaLabel="Vista delle sovrapposizioni" />}
    </div>
  );

  return (
    <Tile eyebrow="Sovrapposizioni" aside={aside} reading={reading} className={className} ariaLabel="Sovrapposizione tra ETF">
      {isLoading && (
        <>
          <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">Sto confrontando i titoli degli ETF…</p>
          <div className="mt-3 flex flex-col divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </>
      )}

      {isError && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" role="alert">
          <p className="text-[13px] leading-[1.45] text-destructive">Errore nel caricamento delle sovrapposizioni.</p>
          <Button type="button" variant="outline" className="h-11 px-2.5 text-[11px] desktop:h-7" disabled={isFetching} onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}

      {isEmpty && <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">Nessun ETF o azione da analizzare.</p>}

      {input && overlapView && !isEmpty && (
        <div className="mt-2">
          {rows.length === 0 ? (
            <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{describeOverlapEmpty(view)}</p>
          ) : (
            <RankedRows
              rows={rows}
              color="var(--chart-2)"
              remainder={overlapView.remainder}
              onRowClick={handleRowClick}
              activeKey={openRow?.key ?? null}
              ariaLabel={LIST_LABELS[view]}
              labelClassName="min-w-[128px]"
            />
          )}
          {/* The live region is rendered with the list, before any row is opened, so a screen
              reader is already watching it when the sources land; an `aria-live` on the block
              itself would be inserted together with its content and announce nothing. */}
          <div aria-live="polite">{openRow && <SourcesBlock row={openRow} />}</div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5 text-[11px] leading-[1.5] text-muted-foreground">
        <p>
          {describeOverlapFooter(exposure?.computedAt ?? null)}
          {cached ? ' Dalla cache.' : ''}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 shrink-0 px-2 text-[11px] desktop:h-7"
          aria-label="Aggiorna le sovrapposizioni"
          disabled={isFetching}
          onClick={() => refresh()}
        >
          <RefreshCw className={cn('size-3', isFetching && 'animate-spin')} aria-hidden="true" />
          Aggiorna
        </Button>
      </div>
    </Tile>
  );
}
