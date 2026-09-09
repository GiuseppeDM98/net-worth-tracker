'use client';

/**
 * PER CLASSE — «quanto è lontana ogni classe dal suo target?»: a reading line from
 * `describeClasses` (the largest gap in EURO — the verdict already reads the drifts in points,
 * so the two never print the same figure for the same class), then the class → sub-category →
 * specific-asset accordion as flat rows with a 3px tick each, and a footer.
 *
 * The tile has no axis and no toggle: a gap is a position, not a period, and the band that
 * classifies it lives in the Bilanciamento tile — one lever for the whole page, never a second
 * one here. The aside names the three columns («corrente · target · gap») instead of a scope,
 * because a list of aligned figures with no header is a list the reader has to guess at.
 *
 * The footer is where the orphaned targets go: a target whose whole value sits in excluded
 * assets can never be reached by any buy or sell, so the page strips it from the plans and from
 * these rows — and something must say so where the rows are, or the class simply vanishes.
 * Amber is a setting to fix, not a market signal. Without orphans the footer explains the one
 * convention the columns rely on, the sign of the gap.
 *
 * Nothing is computed here: the allocation is banded by the page, the words come from
 * `allocazioneNarrative.ts`, and `AllocationBreakdown` only renders what it is given.
 */

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { OrphanedTarget } from '@/lib/utils/allocationUtils';
import type { AllocationResult, AssetAllocationTarget } from '@/types/assets';
import { formatPercentage } from '@/lib/services/chartService';
import { Tile } from '@/components/ui/tile';
import { AllocationBreakdown } from '@/components/allocation/AllocationBreakdown';

interface PerClasseTileProps {
  /** `describeClasses(gaps, band)`; null without a class. */
  reading: Narrative | null;
  /** The column legend, «corrente · target · gap». */
  aside: string;
  /** Banded, with `bySubCategory` ALREADY stripped of orphaned sub-targets. */
  allocation: AllocationResult;
  targets: AssetAllocationTarget | null;
  /** The targets the exclusion stranded — the rows above no longer carry them. */
  orphans: OrphanedTarget[];
  className?: string;
}

/**
 * Assembled as a string, not interleaved with JSX expressions: mixing `{cond ? 'a' : 'b'}`
 * with adjacent prose swallows the separating spaces and silently mangles the plural arm.
 */
const ORPHAN_EXPLANATION = {
  singular: 'Questo target non è raggiungibile e viene escluso dai piani: tutto il suo valore è in asset esclusi.',
  plural: 'Questi target non sono raggiungibili e vengono esclusi dai piani: tutto il loro valore è in asset esclusi.',
} as const;

function OrphanWarning({ orphans }: { orphans: OrphanedTarget[] }) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">Target senza asset ribilanciabili</p>
        <p className="mt-0.5">
          {orphans.length === 1 ? ORPHAN_EXPLANATION.singular : ORPHAN_EXPLANATION.plural} Azzera il target in{' '}
          <Link href="/dashboard/settings" className="text-foreground underline-offset-2 hover:underline">
            Impostazioni
          </Link>{' '}
          oppure togli l&apos;esclusione dall&apos;asset.
        </p>
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {orphans.map((orphan) => (
            <li key={orphan.label}>
              <span className="text-foreground">{orphan.label}</span> — target{' '}
              <span className="font-mono tabular-nums">{formatPercentage(orphan.targetPercentage, 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PerClasseTile({ reading, aside, allocation, targets, orphans, className }: PerClasseTileProps) {
  return (
    <Tile eyebrow="Per classe" aside={aside} reading={reading} className={className} ariaLabel="Allocazione per classe">
      <AllocationBreakdown allocation={allocation} targets={targets} className="mt-3" />

      <div className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.5] text-muted-foreground">
        {orphans.length > 0 ? (
          <OrphanWarning orphans={orphans} />
        ) : (
          <p>
            Il segno del gap è quello dell&apos;operazione: + c&apos;è troppo, − manca. Una classe con sottocategorie si apre
            sulla riga.
          </p>
        )}
      </div>
    </Tile>
  );
}
