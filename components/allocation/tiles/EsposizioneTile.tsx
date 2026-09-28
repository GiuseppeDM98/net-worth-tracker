'use client';

/**
 * ESPOSIZIONE — «a cosa sono esposto davvero?»: the six heaviest holdings, sectors or issuers of
 * the look-through as ranked rows, one view at a time (the toggle as the aside), closed by
 * «Resto letto» and «Non letto» so the list adds up to 100, under a coverage line that says
 * where EVERY euro of the view's base went — read, unread with the instrument's name, not
 * applicable by nature, out of this view (the bond sleeves). When a row is opened, the
 * instruments that carry that exposure show as a flat block under the list.
 *
 * The tile receives the assets from the page like every other tile and owns only the Yahoo
 * profiles of the tickers in view (`usePortfolioExposure`: the route answers profiles from one
 * cache per ticker, the weighing runs here in the browser — doc/guide/allocazione.md § Esposizione). The figures come
 * from `summarizeExposure` / `summarizeExposureHighlights` (`allocazioneSummary.ts`), the words
 * from `describeExposure` and its siblings (`allocazioneNarrative.ts`): this file only renders.
 *
 * Titoli and Settori weigh the NOTIONAL of the equity sleeves (a 2× fund moves twice), Emittenti
 * the market value of every quoted instrument once; the aside names the base of the percentage
 * column. An unread slice is not a failed read: `isError` and the red notice are the query's
 * alone. No sign colour anywhere: an exposure is a share, neither a gain nor a loss.
 */

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePortfolioExposure } from '@/lib/hooks/usePortfolioExposure';
import { Skeleton } from '@/components/ui/skeleton';
import { summarizeExposure, summarizeExposureHighlights, type ExposureRow, type ExposureRowSource, type ExposureViewKey } from '@/lib/utils/allocazioneSummary';
import {
  describeExposure,
  describeExposureBase,
  describeExposureCoverage,
  describeExposureEmpty,
  describeExposureFooter,
  describeExposureMethod,
} from '@/lib/utils/allocazioneNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { NarrativeText } from '@/components/ui/narrative-text';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

interface EsposizioneTileProps {
  /** Whose portfolio: the route reads the OWNER's instruments, a delegate included. */
  ownerId: string;
  /** The page's whole asset list; the role and the base are the engine's business. */
  assets: Asset[];
  className?: string;
}

/** Rows the tile ranks; the rest folds into «Resto letto» so the shares still add up. */
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
  issuers: 'Emittenti degli strumenti quotati',
};

/**
 * The formula line is worth printing only when it says more than the amount: a weight of 1 is a
 * direct stock («100% di 6000 € = 6000 €» repeats the figure) and the engine leaves it out.
 */
function canRenderFormula(source: ExposureRowSource): source is ExposureRowSource & { weight: number; baseValue: number } {
  return typeof source.weight === 'number' && source.weight > 0 && source.weight < 1 && typeof source.baseValue === 'number' && source.baseValue > 0;
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

export function EsposizioneTile({ ownerId, assets, className }: EsposizioneTileProps) {
  const [view, setView] = useState<ExposureViewKey>('holdings');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { exposure, profiles, oldestFetchedAt, isError, isFetching, refresh, refetch } = usePortfolioExposure(ownerId, assets);
  // React Query keeps the last profiles through a failed refresh, so "no data" and "error" are two
  // different states: a stale list beats an empty tile.
  const isWaiting = !exposure && !isError;
  const isEmpty = !!exposure && exposure.quotedCount === 0;

  const highlights = useMemo(() => (exposure ? summarizeExposureHighlights(exposure) : null), [exposure]);
  // The reading follows the VIEW: opening on the heaviest holding while the list ranks issuers
  // answered a question nobody asked — the only reading on the page that ignored its own state.
  const reading = useMemo(() => (highlights ? describeExposure(highlights, view) : null), [highlights, view]);
  const exposureView = useMemo(() => (exposure ? summarizeExposure(exposure, view, VISIBLE_ROWS) : null), [exposure, view]);
  const coverage = useMemo(() => (exposureView ? describeExposureCoverage(exposureView.coverage, view) : null), [exposureView, view]);
  const rows = useMemo<RankedRow[]>(
    () => (exposureView?.rows ?? []).map((row) => ({ key: row.key, label: row.label, caption: row.caption, amount: row.amount, percentage: row.percentage })),
    [exposureView],
  );
  const rowsByKey = useMemo(() => new Map((exposureView?.rows ?? []).map((row) => [row.key, row])), [exposureView]);
  // The funds whose holding weights Yahoo could not bring to the sleeve: the method note says so.
  const fundBasisTickers = useMemo(
    () => Object.values(profiles ?? {}).filter((profile) => profile.fund?.holdingsBasis === 'fund' && profile.fund.holdings?.length).map((profile) => profile.ticker),
    [profiles],
  );

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
      {!isEmpty && <span>{describeExposureBase(view)}</span>}
      {!isEmpty && <AsideToggle options={VIEW_OPTIONS} value={view} onChange={handleViewChange} ariaLabel="Vista dell'esposizione" />}
    </div>
  );

  const hasList = (exposureView?.rows.length ?? 0) + (exposureView?.remainders.length ?? 0) > 0;

  return (
    <Tile eyebrow="Esposizione" aside={aside} reading={reading} className={className} ariaLabel="Esposizione del portafoglio">
      {isWaiting && (
        <>
          <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">Sto leggendo le composizioni degli strumenti quotati…</p>
          <div className="mt-3 flex flex-col divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </>
      )}

      {isError && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" role="alert">
          <p className="text-[13px] leading-[1.45] text-destructive">Errore nel caricamento delle composizioni.</p>
          <Button type="button" variant="outline" className="h-11 px-2.5 text-[11px] desktop:h-8" disabled={isFetching} onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}

      {isEmpty && <p className="mt-2 text-[13px] leading-[1.45] text-muted-foreground">{describeExposureEmpty()}</p>}

      {exposure && exposureView && coverage && !isEmpty && (
        <div className="mt-2">
          {/* The coverage line, over the list: where every euro of this view's base went. */}
          <NarrativeText segments={coverage} className="text-[13px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
          {hasList && (
            <RankedRows
              rows={rows}
              color="var(--chart-1)"
              remainders={exposureView.remainders}
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

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <TileMethodNote className="mt-0 min-w-0 border-t-0 pt-0" subject="Esposizione" summary={describeExposureFooter(oldestFetchedAt)}>
          {describeExposureMethod(fundBasisTickers).map((paragraph) => (
            <span key={paragraph}>{paragraph}</span>
          ))}
        </TileMethodNote>
        <Button
          type="button"
          variant="ghost"
          className="h-11 shrink-0 px-2 text-[11px] desktop:h-8"
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
