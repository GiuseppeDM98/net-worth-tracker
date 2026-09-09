'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the holdings the allocation treats
 * specially, one tile per role — the NON NEGOZIABILI (inside the allocated total, out of every
 * plan) and the ESCLUSI (outside the total altogether, the reason it is smaller than the net
 * worth).
 *
 * Why down here and not in the grid: neither list answers the page's question. «Sono allineato
 * al piano?» is settled by the verdict and the tiles above; these rows are the reconciliation
 * behind two figures the Bilanciamento footer already states — «which ones?» is the reader's
 * next question, not the page's. The old page hid the same lists in two popovers under the hero
 * and, for the excluded ones, at the bottom of the breakdown card; a disclosure keeps them one
 * tap away without paying for them on every visit.
 *
 * Two tiles, never one: the two groups have OPPOSITE relationships to the number above. Frozen
 * wealth counts in every percentage and simply cannot move; excluded wealth counts in nothing on
 * this page. Merging them into a «non ribilanciabili» list would be the easy, wrong thing, so
 * each keeps its own eyebrow and its own reading (`describeFrozen` / `describeExcluded`), and
 * the wider cell goes to the frozen group because its rows carry a consequence for the plans.
 *
 * Closed by default. Nothing is computed here: the groups come from `summarizeHoldings`
 * through the page, the words from `allocazioneNarrative.ts`, so no figure can disagree with
 * the Bilanciamento footer.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AllocatableHolding } from '@/lib/utils/allocationUtils';
import type { HoldingsGroup } from '@/lib/utils/allocazioneSummary';
import { describeExcluded, describeFrozen } from '@/lib/utils/allocazioneNarrative';
import type { Narrative } from '@/lib/utils/narrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';

interface AllocazioneDettaglioProps {
  /** Role `frozen`: inside the allocated total, untouchable by the plans. */
  frozen: HoldingsGroup;
  /** Role `excluded`: outside the allocated total and every calculation of the page. */
  excluded: HoldingsGroup;
}

/** «Non negoziabili (1 asset, 42.000 €)» — the half of the trigger's description for one group. */
function describeGroup(label: string, group: HoldingsGroup): string {
  return `${label} (${group.count} asset, ${cachedFormatCurrencyEUR(group.total, true)})`;
}

/**
 * One holding: label with its ticker, the amount, its share of the GROUP's total (from
 * `summarizeHoldings`) — the share says how much of the frozen (or excluded) wealth one
 * instrument is, which is the question these rows answer; a share of the portfolio would
 * repeat the Per classe tile.
 */
function HoldingRow({ holding, sharePct }: { holding: AllocatableHolding; sharePct: number | null }) {
  const share = sharePct === null ? null : Math.round(sharePct);
  return (
    <li className="flex items-center gap-3 py-2 text-[13px]">
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="truncate text-foreground" title={holding.label}>
          {holding.label}
        </span>
        {holding.ticker && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{holding.ticker}</span>
        )}
      </span>
      <span className="shrink-0 text-right font-mono tabular-nums text-foreground">
        {cachedFormatCurrencyEUR(holding.value, true)}
      </span>
      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {share === null ? '—' : `${share}%`}
      </span>
    </li>
  );
}

function HoldingsTile({
  eyebrow,
  ariaLabel,
  reading,
  group,
}: {
  eyebrow: string;
  ariaLabel: string;
  reading: Narrative;
  group: HoldingsGroup;
}) {
  return (
    <Tile eyebrow={eyebrow} reading={reading} ariaLabel={ariaLabel}>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {group.rows.map(({ holding, sharePct }) => (
          <HoldingRow key={holding.id} holding={holding} sharePct={sharePct} />
        ))}
      </ul>
    </Tile>
  );
}

export function AllocazioneDettaglio({ frozen, excluded }: AllocazioneDettaglioProps) {
  const [open, setOpen] = useState(false);

  const hasFrozen = frozen.count > 0;
  const hasExcluded = excluded.count > 0;
  if (!hasFrozen && !hasExcluded) return null;

  // Only the non-empty halves: a «(0 asset, 0 €)» would be a placeholder, not a fact.
  const description = [
    hasFrozen ? describeGroup('Non negoziabili', frozen) : null,
    hasExcluded ? describeGroup("Esclusi dall'allocazione", excluded) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Radix names the trigger's `aria-expanded` and `aria-controls` (the content's id) itself. */}
      <CollapsibleTrigger
        className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left"
        aria-label="Dettaglio"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        {/* A lone tile takes the whole row at every width: a half-empty grid reads as a missing tile. */}
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {hasFrozen && (
            <div className={cn(TILE_CELL_CLASS, hasExcluded ? 'desktop:col-span-7' : 'tablet:col-span-2 desktop:col-span-12')}>
              <HoldingsTile
                eyebrow="Non negoziabili"
                ariaLabel="Asset non negoziabili"
                reading={describeFrozen(frozen)}
                group={frozen}
              />
            </div>
          )}
          {hasExcluded && (
            <div className={cn(TILE_CELL_CLASS, hasFrozen ? 'desktop:col-span-5' : 'tablet:col-span-2 desktop:col-span-12')}>
              <HoldingsTile
                eyebrow="Esclusi dall'allocazione"
                ariaLabel="Asset esclusi dall'allocazione"
                reading={describeExcluded(excluded)}
                group={excluded}
              />
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
