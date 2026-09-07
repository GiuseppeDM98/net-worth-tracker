'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { ReturnAttribution } from '@/lib/utils/performanceAttribution';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';

interface AttribuzioneTileProps {
  aside: string;
  reading: Narrative;
  attribution: ReturnAttribution;
  className?: string;
}

/** How many instruments the tile lists before folding the rest into «Altri strumenti». */
const MAX_ROWS = 6;

function signedEuro(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
}

/** A figure under a euro is neither a gain nor a loss: no sign, no colour. */
function isPrintedZero(value: number): boolean {
  return Math.abs(Math.round(value)) < 1;
}

/**
 * «Da dove viene il rendimento?» — the period's market gain instrument by instrument, in euro:
 * the price effect on what was held at the start of each month, summed over the months with a
 * per-instrument breakdown (a pension fund net of its contributions, a property gross of its
 * debt). The bar is the instrument's magnitude against the largest, signed by colour; the list
 * closes on what no instrument explains, so the rows visibly add up to the market's figure
 * (DESIGN.md → Ranked Rows with Residual, The Narrative Honesty Rule).
 */
export function AttribuzioneTile({ aside, reading, attribution, className }: AttribuzioneTileProps) {
  const shown = attribution.rows.slice(0, MAX_ROWS);
  const others = attribution.rows.slice(MAX_ROWS).reduce((sum, row) => sum + row.total, 0);
  const maxAbs = Math.max(...shown.map((row) => Math.abs(row.total)), 1);
  const hasRows = shown.length > 0;

  return (
    <Tile eyebrow="Da dove viene il rendimento" aside={aside} reading={reading} className={className}>
      {hasRows && (
        <ul className="mt-3 flex flex-col divide-y divide-border" aria-label="Contributo di ogni strumento al rendimento del periodo">
          {shown.map((row) => (
            <li key={row.assetId} className="grid grid-cols-[minmax(0,1fr)_72px_96px] items-center gap-3 py-[9px]">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[13px] text-foreground">{row.name}</span>
                {row.isPensionFund && <span className="shrink-0 text-[11px] text-muted-foreground">al netto dei versamenti</span>}
                {!row.isPensionFund && row.dividends !== 0 && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{signedEuro(row.dividends)} dividendi</span>
                )}
              </span>
              <span className="h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(Math.abs(row.total) / maxAbs) * 100}%`, background: row.total < 0 ? 'var(--destructive)' : 'var(--positive)' }}
                />
              </span>
              <span className={cn('text-right font-mono text-[13px] font-semibold tabular-nums', isPrintedZero(row.total) ? 'text-foreground' : signTextClass(row.total))}>
                {signedEuro(row.total)}
              </span>
            </li>
          ))}
          {attribution.rows.length > MAX_ROWS && (
            <li className="grid grid-cols-[minmax(0,1fr)_72px_96px] items-center gap-3 py-[9px]">
              <span className="text-[13px] text-muted-foreground">Altri {attribution.rows.length - MAX_ROWS} strumenti</span>
              <span />
              <span className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">{signedEuro(others)}</span>
            </li>
          )}
          {!isPrintedZero(attribution.unattributed) && (
            <li className="grid grid-cols-[minmax(0,1fr)_72px_96px] items-center gap-3 py-[9px]">
              <span className="text-[13px] text-muted-foreground">Non attribuito</span>
              <span />
              <span className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">{signedEuro(attribution.unattributed)}</span>
            </li>
          )}
          <li className="grid grid-cols-[minmax(0,1fr)_72px_96px] items-center gap-3 py-[9px]">
            <span className="text-[13px] font-semibold text-foreground">Mercato</span>
            <span />
            <span className={cn('text-right font-mono text-[13px] font-bold tabular-nums', isPrintedZero(attribution.gain) ? 'text-foreground' : signTextClass(attribution.gain))}>
              {signedEuro(attribution.gain)}
            </span>
          </li>
        </ul>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Effetto prezzo sulla quantità detenuta a inizio mese, sommato sui mesi con il dettaglio per strumento; i dividendi
        incassati sono aggiunti al loro strumento. «Non attribuito» sono interessi, dividendi non registrati e movimenti che
        nessuna spesa spiega. La lista completa è nel Dettaglio.
      </p>
    </Tile>
  );
}
