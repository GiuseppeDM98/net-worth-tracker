import type { Narrative } from '@/lib/utils/narrative';
import type { SpendingAnomaly } from '@/lib/utils/cashflowComposition';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { articleForPercent } from '@/lib/utils/patrimonioNarrative';
import { Tile } from '@/components/ui/tile';

interface FuoriScalaTileProps {
  anomalies: SpendingAnomaly[];
  /** The month the anomalies were measured on («agosto 2026») — the tile's own window, named. */
  monthLabel: string;
  reading: Narrative;
  /** Whether the page's period IS this month; when not, the footer says the window is the tile's own. */
  followsPeriod: boolean;
  /**
   * Receives the whole anomaly, not just a name: two same-named categories of different types
   * produce two distinct rows that must lead to two distinct Schede.
   */
  onSelect: (anomaly: SpendingAnomaly) => void;
  className?: string;
}

/**
 * «Cosa è fuori scala questo mese?» — the spending categories that ran hot against their own
 * six-month average, as rows a click opens. The tile is measured on ONE month whatever the
 * period is (an Off-Axis tile): the aside names it, and the page omits the tile when no month
 * can be meant (a past year without a month, the history).
 */
export function FuoriScalaTile({ anomalies, monthLabel, reading, followsPeriod, onSelect, className }: FuoriScalaTileProps) {
  return (
    <Tile eyebrow="Fuori scala" aside={<span>{monthLabel}</span>} reading={reading} className={className}>
      {anomalies.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border" aria-label={`Categorie fuori scala, ${monthLabel}`}>
          {anomalies.map((anomaly) => (
            <li key={anomaly.key}>
              <button
                type="button"
                onClick={() => onSelect(anomaly)}
                aria-label={`${anomaly.categoryLabel}, ${articleForPercent(anomaly.deltaPercent, 0)}${formatPercentage(anomaly.deltaPercent, 0)} sopra la media: da ${cachedFormatCurrencyEUR(anomaly.referenceAverage, true)} a ${cachedFormatCurrencyEUR(anomaly.currentTotal, true)}`}
                className="flex min-h-[44px] w-full items-center gap-2.5 py-[9px] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{anomaly.categoryLabel}</span>
                <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-destructive">
                  +{formatPercentage(anomaly.deltaPercent, 0)}
                </span>
                <span className="shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                  {cachedFormatCurrencyEUR(anomaly.referenceAverage, true)} → {cachedFormatCurrencyEUR(anomaly.currentTotal, true)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        Media dei 6 mesi precedenti → mese. Sopra la media di oltre il 25% e di 50 €{anomalies.length > 0 ? '; una riga apre la scheda' : ''}.
        {!followsPeriod && <> Misurato su {monthLabel}, non sul periodo scelto.</>}
      </p>
    </Tile>
  );
}
