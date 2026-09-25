'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { FlowSource, PerformanceChartData } from '@/types/performance';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { SeriesLegend, type SeriesLegendItem } from '@/components/ui/series-legend';
import { CapitalMarketChart, CAPITAL_BASE_COLOR, CAPITAL_NET_WORTH_COLOR } from '@/components/performance/CapitalMarketChart';

interface CapitaleMercatoTileProps {
  aside: string;
  reading: Narrative | null;
  data: PerformanceChartData[];
  /** The pension channel of the period: when it carries money the method says the area includes it. */
  pensionFlow: number;
  /** Where the flows under the area came from: the method names THAT source, never the cashflow by default. */
  flowSource: FlowSource;
  className?: string;
}

const LEGEND: readonly SeriesLegendItem[] = [
  { label: 'Patrimonio', colors: [CAPITAL_NET_WORTH_COLOR] },
  { label: 'Capitale immesso', colors: [CAPITAL_BASE_COLOR] },
];

/**
 * What «capitale immesso» adds to the starting valuation, by flow source. The series is
 * `externalFlowOf`: on a subset base (the default) those are the flows MEASURED on the base's
 * boundary, not the cashflow's savings — the footer said «versamenti netti registrati in Cashflow»
 * whatever the source, which was false on the default base (critique of 2026-09-20).
 */
const FLOW_METHOD: Record<FlowSource, string> = {
  cashflow: 'Capitale immesso = valore a inizio periodo più i contributi netti del Cashflow (entrate meno uscite), cumulati mese per mese.',
  portfolio:
    'Capitale immesso = valore a inizio periodo più il capitale misurato al confine della base, cumulato mese per mese: acquisti meno vendite dal registro operazioni e variazioni di quantità degli altri strumenti.',
  mixed:
    'Capitale immesso = valore a inizio periodo più il capitale entrato, cumulato mese per mese: misurato al confine della base (registro operazioni e variazioni di quantità) nei mesi con il dettaglio per strumento, il risparmio del Cashflow negli altri.',
};

/**
 * «Quanto è tuo e quanto è mercato?» — the invested base (the period's starting valuation plus
 * the net capital that entered since) under the net worth, month by month; the gap is the market's
 * return. Not the ledger's «capitale investito»: that is buys minus sells alone, this starts from
 * the period's opening valuation and adds what crossed into the measured base since.
 */
export function CapitaleMercatoTile({ aside, reading, data, pensionFlow, flowSource, className }: CapitaleMercatoTileProps) {
  const hasPensionFlow = Math.round(pensionFlow) !== 0;
  return (
    <Tile eyebrow="Capitale e mercato" aside={aside} reading={reading} className={className}>
      {data.length >= 2 && (
        <>
          <SeriesLegend items={LEGEND} className="mt-3 justify-end" />
          <CapitalMarketChart data={data} minHeight={140} className="mt-2 flex-1" />
        </>
      )}
      <TileMethodNote subject="Capitale e mercato" summary="La distanza tra la linea e l&apos;area è il mercato.">
        <span className="block">{FLOW_METHOD[flowSource]}</span>
        {hasPensionFlow && (
          <span className="block">
            Sono inclusi i flussi dei fondi pensione del periodo (<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(pensionFlow, true)}</span>).
          </span>
        )}
        <span className="block">Patrimonio meno capitale immesso è il guadagno di mercato del periodo.</span>
        <span className="block">Non è il «capitale investito» del registro operazioni, che conta solo acquisti meno vendite: qui si parte dal valore a inizio periodo.</span>
      </TileMethodNote>
    </Tile>
  );
}
