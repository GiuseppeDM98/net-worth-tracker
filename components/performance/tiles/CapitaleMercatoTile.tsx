'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { PerformanceChartData } from '@/types/performance';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile } from '@/components/ui/tile';
import { CapitalMarketChart } from '@/components/performance/CapitalMarketChart';

interface CapitaleMercatoTileProps {
  aside: string;
  reading: Narrative | null;
  data: PerformanceChartData[];
  /** The pension channel of the period: when it carries money the footer says the area includes it. */
  pensionFlow: number;
  className?: string;
}

/**
 * «Quanto è tuo e quanto è mercato?» — the invested base (the period's starting valuation plus
 * the net cash paid in since) under the net worth, month by month; the gap is the market's
 * return. Not the ledger's «capitale investito»: that counts buys minus sells, this counts what
 * entered the portfolio from outside.
 */
export function CapitaleMercatoTile({ aside, reading, data, pensionFlow, className }: CapitaleMercatoTileProps) {
  const hasPensionFlow = Math.round(pensionFlow) !== 0;
  return (
    <Tile eyebrow="Capitale e mercato" aside={aside} reading={reading} className={className}>
      {data.length >= 2 && (
        <>
          <div className="mt-3 flex justify-end gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
              Capitale immesso
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-3)' }} />
              Patrimonio
            </span>
          </div>
          <CapitalMarketChart data={data} minHeight={140} className="mt-2 flex-1" />
        </>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Capitale immesso = patrimonio all&apos;inizio del periodo più i versamenti netti registrati in Cashflow
        {hasPensionFlow && (
          <>
            {' '}
            e i flussi dei fondi pensione (<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(pensionFlow, true)}</span>)
          </>
        )}
        ; la distanza dalla linea è il mercato. Non è il «capitale investito» del registro operazioni.
      </p>
    </Tile>
  );
}
