'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the euro-by-euro decomposition behind the
 * TWR (6, only for the blocks whose return IS a measure — printing «Guadagno di mercato» under a
 * reading that says the difference is NOT market gain would contradict it) and how the fund's
 * value is kept current (6, or 12 when nothing is measured). Closed by default: the verdict and
 * the five tiles already answer «il fondo sta lavorando?».
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { PensionMemberBlock } from '@/lib/utils/pensionSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor, signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

interface PensionDettaglioProps {
  description: string;
  /** Every block; only the measured ones get a decomposition. */
  blocks: PensionMemberBlock[];
  crescitaFooter: Narrative;
  comeAggiornare: readonly string[];
}

const ROW_CLASS = 'flex items-baseline justify-between gap-3 py-2 text-[13px]';
const VALUE_CLASS = 'shrink-0 font-mono tabular-nums';

/** «+7,96%» / «−2,40%» — the typographic minus, the comma decimal. */
function signedPct(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatPercentage(Math.abs(value), 2)}`;
}

function signedCurrency(value: number): string {
  return `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value))}`;
}

function CrescitaBlock({ block, named }: { block: PensionMemberBlock; named: boolean }) {
  const result = block.return!;
  const paidIn = result.contributions.voluntary + result.contributions.tfr;
  return (
    <div>
      {named && <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1')}>{block.name ?? block.fundNames[0]}</p>}
      <div className="divide-y divide-border">
        <div className={ROW_CLASS}>
          <span className="text-foreground">
            Crescita del valore<span className="ml-2 text-[11px] text-muted-foreground">versamenti inclusi</span>
          </span>
          <span className={cn(VALUE_CLASS, 'text-foreground')}>{cachedFormatCurrencyEUR(result.valueGrowth)}</span>
        </div>
        <div className={ROW_CLASS}>
          <span className="text-muted-foreground">
            Versamenti registrati
            <span className="ml-2 text-[11px]">
              volontario {cachedFormatCurrencyEUR(result.contributions.voluntary)} · TFR {cachedFormatCurrencyEUR(result.contributions.tfr)}
            </span>
          </span>
          <span className={cn(VALUE_CLASS, 'text-muted-foreground')}>−{cachedFormatCurrencyEUR(paidIn)}</span>
        </div>
        <div className={ROW_CLASS}>
          <span className="text-muted-foreground">
            Contributo datoriale<span className="ml-2 text-[11px]">capitale ricevuto, non rendimento</span>
          </span>
          <span className={cn(VALUE_CLASS, 'text-muted-foreground')}>−{cachedFormatCurrencyEUR(result.contributions.employer)}</span>
        </div>
        <div className={ROW_CLASS}>
          <span className="font-medium text-foreground">Guadagno di mercato</span>
          <span className={cn(VALUE_CLASS, 'font-semibold', signTextClass(result.marketGain))}>{signedCurrency(result.marketGain)}</span>
        </div>
        {result.personalReturn !== null && (
          <div className={ROW_CLASS}>
            <span className="text-foreground">
              Ritorno sul tuo capitale<span className="ml-2 text-[11px] text-muted-foreground">mercato + datore, sul capitale che hai messo tu</span>
            </span>
            <span className={cn(VALUE_CLASS, 'font-semibold', getMetricValueColor(result.personalReturn, 'percentage'))}>{signedPct(result.personalReturn)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PensionDettaglio({ description, blocks, crescitaFooter, comeAggiornare }: PensionDettaglioProps) {
  const [open, setOpen] = useState(false);
  const measured = blocks.filter((block) => block.returnState === 'measured' && block.return);
  const hasCrescita = measured.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {hasCrescita && (
            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-6')}>
              <Tile eyebrow="Da dove viene la crescita" aside="euro per euro" ariaLabel="Da dove viene la crescita">
                <div className="mt-3 space-y-4">
                  {measured.map((block) => (
                    <CrescitaBlock key={block.key} block={block} named={measured.length > 1} />
                  ))}
                </div>
                <NarrativeText segments={crescitaFooter} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
              </Tile>
            </div>
          )}

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2', hasCrescita ? 'desktop:col-span-6' : 'desktop:col-span-12')}>
            <Tile eyebrow="Come aggiornare il valore" ariaLabel="Come aggiornare il valore del fondo">
              <div className="mt-3 space-y-3 text-[13px] leading-[1.5] text-muted-foreground">
                {comeAggiornare.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
