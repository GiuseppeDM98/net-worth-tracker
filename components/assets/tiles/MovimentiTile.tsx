'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Asset } from '@/types/assets';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { describeMonthTrades, monthWithPrepositionA } from '@/lib/utils/patrimonioNarrative';
import type { MonthTradesSummary } from '@/lib/utils/patrimonioSummary';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';

/** Rows shown by default; beyond these the footer expands to the whole month in place. */
const MAX_ROWS = 5;

const DAY_MONTH = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });

interface MovimentiTileProps {
  summary: MonthTradesSummary;
  /** Current calendar month, 1-12 — the tile's scope. */
  month: number;
  /** Whether the trade ledger exists for this account (the migration has run). */
  ledgerReady: boolean;
  /** The ledger is still being fetched: say so instead of "Nessuna operazione". */
  loading?: boolean;
  assetsById: Map<string, Asset>;
  /** A row opens the instrument's movements (AssetMovementsDialog). */
  onOpenMovements: (asset: Asset) => void;
  className?: string;
}

/**
 * "Cosa ho mosso questo mese?" — the month's buys and sells from the trade ledger, newest
 * first, and the net money that went into the portfolio. Adjustments and migration baselines
 * are not trades and never appear (see summarizeMonthTrades).
 */
export function MovimentiTile({ summary, month, ledgerReady, loading = false, assetsById, onOpenMovements, className }: MovimentiTileProps) {
  // The month's trades, the latest five by default — the footer expands to all of them in place.
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? summary.rows : summary.rows.slice(0, MAX_ROWS);
  const monthName = MONTH_NAMES[month - 1].toLowerCase();

  return (
    <Tile
      eyebrow="Movimenti del mese"
      aside={
        ledgerReady ? (
          <span>
            {monthName} · <span className="font-mono tabular-nums">{summary.count}</span>{' '}
            {summary.count === 1 ? 'operazione' : 'operazioni'}
          </span>
        ) : (
          monthName
        )
      }
      reading={ledgerReady && !loading ? describeMonthTrades(summary.bought, summary.sold, month) : null}
      className={className}
    >
      {!ledgerReady ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Il registro delle operazioni non è ancora attivo.</p>
      ) : loading ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Lettura del registro…</p>
      ) : rows.length > 0 ? (
        <div className="mt-2.5 flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const asset = assetsById.get(row.assetId);
            const isBuy = row.type === 'buy';
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => asset && onOpenMovements(asset)}
                disabled={!asset}
                className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-[9px] text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
                aria-label={`${DAY_MONTH.format(row.date)}, ${asset ? getAssetDisplayTicker(asset) : 'strumento eliminato'}, ${isBuy ? 'acquisto' : 'vendita'}, ${cachedFormatCurrencyEUR(row.amountEur)}`}
              >
                <span className="w-[38px] shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {DAY_MONTH.format(row.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {asset ? getAssetDisplayTicker(asset) : <span className="text-muted-foreground">Strumento eliminato</span>}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-[7px] px-[7px] py-[3px] text-[10px] font-semibold leading-none',
                    isBuy ? 'bg-positive/10 text-positive' : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {isBuy ? 'Compra' : 'Vendi'}
                </span>
                <span className="w-[84px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(row.amountEur)}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
      {ledgerReady && !loading && summary.count > 0 && (
        <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
          Netto{' '}
          <span className="font-mono tabular-nums text-foreground">
            {summary.net >= 0 ? '+' : '−'}
            {cachedFormatCurrencyEUR(Math.abs(summary.net), true)}
          </span>{' '}
          {summary.net >= 0 ? 'investiti' : 'disinvestiti'} {monthWithPrepositionA(month)}
          {summary.count > MAX_ROWS && (
            <>
              {' · '}
              {showAll ? `tutte le ${summary.count}` : `qui le ultime ${MAX_ROWS} di ${summary.count}`}
              {' · '}
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="text-foreground underline-offset-2 hover:underline"
              >
                {showAll ? `Mostra le ultime ${MAX_ROWS}` : 'Mostra tutte'}
              </button>
            </>
          )}
        </p>
      )}
    </Tile>
  );
}
