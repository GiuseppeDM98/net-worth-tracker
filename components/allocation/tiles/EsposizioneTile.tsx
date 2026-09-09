'use client';

/**
 * ESPOSIZIONE — «a cosa sono esposto davvero, attraverso gli ETF?»: the six heaviest holdings,
 * sectors or issuers of the look-through as ranked rows closed by the residual of the portfolio,
 * one view at a time (the toggle as the aside), and — when a row is opened — the instruments that
 * carry that exposure, as a flat block under the list.
 *
 * This is the one tile of the page that owns its data. Every other tile reads the assets the page
 * already holds; the look-through comes from `/api/portfolio/exposure` (Yahoo Finance behind a
 * 24h server cache), so it is fetched here, on mount — the old collapsible waited for a click,
 * but a tile is always visible and its reading line needs the payload to say anything at all.
 * The figures come from `summarizeExposure` / `summarizeExposureHighlights`
 * (`allocazioneSummary.ts`), the words from `describeExposure` and its aside/footer siblings
 * (`allocazioneNarrative.ts`): this file only renders.
 *
 * Three tabs became one list with a view switch because the question is one — what am I really
 * exposed to — and the three cuts are three answers to it, not three tiles (the
 * One-Tile-One-Question Rule). The drill-down is a single block under the list rather than a
 * panel inside each row: one row was ever open at a time in the old card too, and keeping the
 * sources out of the rows leaves the ranked columns aligned. No sign colour anywhere: an
 * exposure is a share of the portfolio, neither a gain nor a loss.
 */

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePortfolioExposure } from '@/lib/hooks/usePortfolioExposure';
import { Skeleton } from '@/components/ui/skeleton';
import {
  summarizeExposure,
  summarizeExposureHighlights,
  type ExposureRow,
  type ExposureRowSource,
  type ExposureViewKey,
} from '@/lib/utils/allocazioneSummary';
import { describeExposure, describeExposureAside, describeExposureEmpty, describeExposureFooter } from '@/lib/utils/allocazioneNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

interface EsposizioneTileProps {
  userId: string;
  className?: string;
}

/** Rows the tile ranks; the rest folds into the residual so the shares still add up. */
const VISIBLE_ROWS = 6;

const VIEW_OPTIONS: ReadonlyArray<{ value: ExposureViewKey; label: string }> = [
  { value: 'holdings', label: 'Titoli' },
  { value: 'sectors', label: 'Settori' },
  { value: 'issuers', label: 'Emittenti' },
];

/** Accessible name of the list, per view. */
const LIST_LABELS: Record<ExposureViewKey, string> = {
  holdings: 'Titoli più pesanti',
  sectors: 'Settori',
  issuers: 'Emittenti degli ETF',
};

/**
 * The formula line is worth printing only when it says more than the amount: a weight of 1 is a
 * direct stock («100% di 6000 € = 6000 €» repeats the figure) and a missing base value is a v1
 * cached document that never stored it.
 */
function canRenderFormula(source: ExposureRowSource): source is ExposureRowSource & { weight: number; baseValue: number } {
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
 * The instruments behind one exposure: ticker, name, contribution, and the formula when it is
 * known. It mounts inside the tile's persistent live region (see the body), never as one itself:
 * a region created together with its content is not announced.
 */
function SourcesBlock({ row }: { row: ExposureRow }) {
  const count = row.sources.length;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className={TILE_SUB_EYEBROW_CLASS}>
        {row.label} · {count} {count === 1 ? 'fonte' : 'fonti'}
      </p>
      <ul className="mt-1 flex flex-col divide-y divide-border" aria-label={`Fonti di ${row.label}`}>
        {row.sources.map((source, index) => (
          <li key={`${source.ticker}-${index}`} className="py-2 text-[12px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 font-medium text-foreground">{source.ticker}</span>
                <span className="min-w-0 truncate text-muted-foreground">{source.name}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(source.amount, true)}</span>
            </div>
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

export function EsposizioneTile({ userId, className }: EsposizioneTileProps) {
  const [view, setView] = useState<ExposureViewKey>('holdings');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Fetched on mount: the server answers from its 24h cache unless `refresh()` forces a recompute.
  const { data, isError, isFetching, refresh, refetch } = usePortfolioExposure(userId, true);
  const exposure = data?.exposure;
  const cached = data?.cached ?? false;
  // React Query keeps the last payload through a failed refresh, so "no data" and "error" are
  // two different states: a stale list beats an empty tile.
  const isLoading = !exposure && !isError;
  const isEmpty = !!exposure && exposure.analyzedAssets === 0;

  const reading = useMemo(() => (exposure ? describeExposure(summarizeExposureHighlights(exposure)) : null), [exposure]);
  const exposureView = useMemo(() => (exposure ? summarizeExposure(exposure, view, VISIBLE_ROWS) : null), [exposure, view]);
  const rows = useMemo<RankedRow[]>(
    () =>
      (exposureView?.rows ?? []).map((row) => ({
        key: row.key,
        label: row.label,
        caption: row.caption,
        amount: row.amount,
        percentage: row.percentage,
      })),
    [exposureView],
  );
  const rowsByKey = useMemo(() => new Map((exposureView?.rows ?? []).map((row) => [row.key, row])), [exposureView]);

  // The open row must still be in the list AND have something to show; a key from another view
  // or a row without sources simply matches nothing.
  const activeRow = activeKey !== null ? (rowsByKey.get(activeKey) ?? null) : null;
  const openRow = activeRow && activeRow.sources.length > 0 ? activeRow : null;

  const handleViewChange = (next: ExposureViewKey) => {
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

  const aside = (
    <div className="flex flex-wrap items-center gap-2">
      {exposure && <span>{describeExposureAside(exposure)}</span>}
      {!isEmpty && <AsideToggle options={VIEW_OPTIONS} value={view} onChange={handleViewChange} ariaLabel="Vista dell'esposizione" />}
    </div>
  );

  return (
    <Tile eyebrow="Esposizione" aside={aside} reading={reading} className={className} ariaLabel="Esposizione del portafoglio">
      {isLoading && (
        <>
          <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">Sto leggendo la composizione degli ETF…</p>
          <div className="mt-3 flex flex-col divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </>
      )}

      {isError && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" role="alert">
          <p className="text-[13px] leading-[1.45] text-destructive">Errore nel caricamento dell&apos;esposizione.</p>
          <Button type="button" variant="outline" className="h-11 px-2.5 text-[11px] desktop:h-7" disabled={isFetching} onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}

      {isEmpty && <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">Nessun ETF o azione da analizzare.</p>}

      {exposure && exposureView && !isEmpty && (
        <div className="mt-2">
          {rows.length === 0 ? (
            <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{describeExposureEmpty(view)}</p>
          ) : (
            <RankedRows
              rows={rows}
              color="var(--chart-1)"
              remainder={exposureView.remainder}
              onRowClick={handleRowClick}
              activeKey={openRow?.key ?? null}
              ariaLabel={LIST_LABELS[view]}
              labelClassName="w-[128px]"
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
          {describeExposureFooter(exposure?.computedAt ?? null)}
          {cached ? ' Dalla cache.' : ''}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-11 shrink-0 px-2 text-[11px] desktop:h-7"
          aria-label="Aggiorna l'esposizione"
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
