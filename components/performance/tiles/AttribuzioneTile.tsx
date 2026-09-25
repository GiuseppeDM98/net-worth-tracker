'use client';

import { LayoutGroup, motion } from 'framer-motion';
import type { Narrative } from '@/lib/utils/narrative';
import type { ReturnAttribution } from '@/lib/utils/performanceAttribution';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';

interface AttribuzioneTileProps {
  aside: string;
  reading: Narrative;
  attribution: ReturnAttribution;
  className?: string;
}

/** How many instruments the tile lists before folding the rest into «Altri strumenti». */
const MAX_ROWS = 6;

/** The one spring of the app (DESIGN.md → Segmented Pill Control): the rows re-rank on it. */
const RERANK_SPRING = { type: 'spring', stiffness: 400, damping: 35 } as const;

/**
 * One row of the list. The bar column exists only from a 420px list (`@container` on the `ul`):
 * on a phone the fixed bar (72px) and amount (96px) left the name 124px and it was truncated — two
 * rows both read «WisdomTree Physi…» (2026-09-20). Below that width the signed, coloured amount
 * already carries direction and size, so the bar leaves and the name takes its room; the name
 * wraps on two lines and is never cut short of that (AGENTS.md → Hierarchy, Density and Disclosure).
 */
const ROW_GRID_CLASS = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[9px] @[420px]:grid-cols-[minmax(0,1fr)_72px_96px]';
/** The bar's cell, and the empty cell the closing rows keep in its place. */
const BAR_CELL_CLASS = 'hidden @[420px]:block';

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
 *
 * On a period switch the rows re-rank in place and every bar slides to its new length: an
 * instrument that climbs the list is seen climbing, not replaced by a stranger in its slot.
 */
export function AttribuzioneTile({ aside, reading, attribution, className }: AttribuzioneTileProps) {
  const shown = attribution.rows.slice(0, MAX_ROWS);
  const others = attribution.rows.slice(MAX_ROWS).reduce((sum, row) => sum + row.total, 0);
  const maxAbs = Math.max(...shown.map((row) => Math.abs(row.total)), 1);
  const hasRows = shown.length > 0;

  return (
    <Tile eyebrow="Da dove viene il rendimento" aside={aside} reading={reading} className={className}>
      {hasRows && (
        <LayoutGroup id="attribuzione">
        <ul className="@container mt-3 flex flex-col divide-y divide-border" aria-label="Contributo di ogni strumento al rendimento del periodo">
          {shown.map((row) => (
            <motion.li key={row.assetId} layout="position" transition={RERANK_SPRING} className={ROW_GRID_CLASS}>
              {/* The caption sits UNDER the name, not beside it: as a `shrink-0` sibling it took its width first and the name paid for it. */}
              <span className="min-w-0">
                <span className="line-clamp-2 break-words text-[13px] leading-[1.35] text-foreground">{row.name}</span>
                {row.isPensionFund && <span className="block text-[11px] text-muted-foreground">al netto dei versamenti</span>}
                {!row.isPensionFund && row.dividends !== 0 && (
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{signedEuro(row.dividends)} dividendi</span>
                )}
              </span>
              <span className={cn(BAR_CELL_CLASS, 'h-[3px] overflow-hidden rounded-full bg-muted')} aria-hidden="true">
                <span
                  className="block h-full rounded-full motion-safe:transition-[width,background-color] motion-safe:duration-300 motion-safe:ease-out"
                  style={{ width: `${(Math.abs(row.total) / maxAbs) * 100}%`, background: row.total < 0 ? 'var(--destructive)' : 'var(--positive)' }}
                />
              </span>
              <span className={cn('text-right font-mono text-[13px] font-semibold tabular-nums', isPrintedZero(row.total) ? 'text-foreground' : signTextClass(row.total))}>
                {signedEuro(row.total)}
              </span>
            </motion.li>
          ))}
          {attribution.rows.length > MAX_ROWS && (
            <li className={ROW_GRID_CLASS}>
              <span className="text-[13px] text-muted-foreground">Altri {attribution.rows.length - MAX_ROWS} strumenti</span>
              <span className={BAR_CELL_CLASS} />
              <span className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">{signedEuro(others)}</span>
            </li>
          )}
          {!isPrintedZero(attribution.unattributed) && (
            <li className={ROW_GRID_CLASS}>
              <span className="text-[13px] text-muted-foreground">Non attribuito</span>
              <span className={BAR_CELL_CLASS} />
              <span className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">{signedEuro(attribution.unattributed)}</span>
            </li>
          )}
          <li className={ROW_GRID_CLASS}>
            <span className="text-[13px] font-semibold text-foreground">Mercato</span>
            <span className={BAR_CELL_CLASS} />
            <span className={cn('text-right font-mono text-[13px] font-bold tabular-nums', isPrintedZero(attribution.gain) ? 'text-foreground' : signTextClass(attribution.gain))}>
              {signedEuro(attribution.gain)}
            </span>
          </li>
        </ul>
        </LayoutGroup>
      )}
      <TileMethodNote subject="Da dove viene il rendimento" summary="Guadagno di mercato in euro, strumento per strumento.">
        <span className="block">Per ogni mese con il dettaglio per strumento: effetto prezzo sulla quantità detenuta a inizio mese, sommato sul periodo. I dividendi incassati sono aggiunti al loro strumento.</span>
        <span className="block">Un fondo pensione vale la sua variazione al netto dei versamenti.</span>
        <span className="block">«Non attribuito» è ciò che nessuno strumento spiega: interessi, dividendi non registrati, movimenti che nessuna spesa spiega. Con questa riga la lista chiude sul guadagno di mercato.</span>
        <span className="block">La lista completa è nel Dettaglio, in fondo alla pagina.</span>
      </TileMethodNote>
    </Tile>
  );
}
