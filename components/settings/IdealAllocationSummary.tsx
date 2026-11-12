'use client';

/**
 * IdealAllocationSummary — Impostazioni › Allocazione's read-only view of the weight optimizer's
 * objectives. The editor moved to Allocazione › Accumulo, next to the
 * tools that use it (with a «Prova» that writes nothing); here the objectives are read and the
 * link takes the reader to where they change — never a second place to edit them.
 */
import Link from 'next/link';
import type { IdealAllocationSettings } from '@/types/assets';
import { buildIdealAllocationInput, describeIdealAllocation, listIdealObjectives } from '@/lib/utils/settingsNarrative';
import { OBJECTIVES_LINK_FROM_SETTINGS, OBJECTIVES_SETTINGS_EYEBROW, OPTIMIZER_OBJECTIVES_HREF } from '@/lib/utils/weightOptimizerNarrative';
import { Tile, TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';

interface IdealAllocationSummaryProps {
  value: IdealAllocationSettings;
  /** deriveTargetLeverageRatio(targets) — the leva target the leverage objective aims at. */
  targetLeverageRatio: number;
}

export function IdealAllocationSummary({ value, targetLeverageRatio }: IdealAllocationSummaryProps) {
  const input = buildIdealAllocationInput(value, targetLeverageRatio);
  const objectives = value.enabled ? listIdealObjectives(input) : [];
  return (
    <Tile eyebrow={OBJECTIVES_SETTINGS_EYEBROW} reading={describeIdealAllocation(input)}>
      {objectives.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {objectives.map((objective) => (
            <li key={objective} className="py-2 text-[13px] text-foreground">
              {objective}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto border-t border-border pt-3.5 text-[11px]">
        <Link href={OPTIMIZER_OBJECTIVES_HREF} className={TILE_FOOTER_ACTION_CLASS}>
          {OBJECTIVES_LINK_FROM_SETTINGS}
        </Link>
      </div>
    </Tile>
  );
}
