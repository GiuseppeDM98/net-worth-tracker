/**
 * AllocationBreakdown — the body of the Per classe tile: one flat list, inline accordion at
 * every depth.
 *
 * It used to be a Card of its own with a «Composizione» header and the excluded wealth at its
 * foot. On the redesigned page the Tile is the frame (the eyebrow asks the question, the
 * reading answers it) and the excluded assets have their own tile in the Dettaglio, so this
 * component is now only the rows: no chrome, no header, no second list. The interaction is
 * unchanged on every breakpoint — tap an asset class to reveal its sub-categories, tap a
 * tracked sub-category to reveal its theoretical specific-asset targets — and indentation, not
 * a tinted box, signals depth (a `bg-muted/20` band inside a tile is the box-in-box the tile
 * grid forbids).
 *
 * Classes follow `ASSET_CLASS_SEQUENCE`, the app-wide enumeration, so a class sits where
 * Storico and the Bilanciamento bars put it — and not `ASSET_CLASS_ORDER` from assetService,
 * which drags the Firebase SDK into a tile that never fetches.
 *
 * Expansion animates via `CollapseRegion`, a pure-CSS `grid-template-rows: 0fr → 1fr`
 * transition. AGENTS.md flags Framer `AnimatePresence` + `height:'auto'` as unreliable for
 * lists of sub-items (it left rows stuck at opacity 0); the grid technique needs no height
 * measurement and never gets stuck. Its content stays mounted, so collapsed regions are made
 * `inert` to keep them out of the focus order and the a11y tree.
 *
 * The action colours are resolved ONCE here and passed down — `useActionColors` reads the
 * computed styles after paint, and a hook per row would do that thirty times.
 */
'use client';

import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { useActionColors } from '@/lib/hooks/useActionColors';
import {
  ASSET_CLASS_LABELS,
  NO_SUBCATEGORY_LABEL,
  assetClassSequenceIndex,
  filterSpecificAssets,
  groupSubCategoriesByAssetClass,
  hasSpecificAssetTracking,
} from '@/lib/utils/allocationUtils';
import type { AllocationResult, AssetAllocationTarget } from '@/types/assets';
import { AllocationRow } from './AllocationRow';

interface AllocationBreakdownProps {
  /** Banded, with `bySubCategory` ALREADY stripped of orphaned sub-targets (the page does it). */
  allocation: AllocationResult;
  targets: AssetAllocationTarget | null;
  className?: string;
}

/**
 * Smooth height collapse via `grid-template-rows` (0fr ↔ 1fr). Content stays mounted so the
 * transition has something to size to; `inert` when closed removes the clipped content from
 * the focus order and the accessibility tree.
 */
function CollapseRegion({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

const toggleKey = (set: Set<string>, key: string): Set<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export function AllocationBreakdown({ allocation, targets, className }: AllocationBreakdownProps) {
  const actionColors = useActionColors();
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const subCategoriesByClass = groupSubCategoriesByAssetClass(allocation.bySubCategory);
  const assetClasses = Object.entries(allocation.byAssetClass).sort(([a], [b]) => assetClassSequenceIndex(a) - assetClassSequenceIndex(b));

  if (assetClasses.length === 0) {
    return (
      <p className={cn('text-[13px] leading-[1.45] text-muted-foreground', className)}>
        Nessuna classe da confrontare con un target.{' '}
        <Link href="/dashboard/assets" className="text-foreground underline-offset-2 hover:underline">
          Vai al Patrimonio
        </Link>
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col divide-y divide-border', className)}>
      {assetClasses.map(([assetClass, data]) => {
        const subs = subCategoriesByClass[assetClass];
        const hasSubs = !!subs && Object.keys(subs).length > 0;
        const isClassOpen = expandedClasses.has(assetClass);

        return (
          <div key={assetClass}>
            <AllocationRow
              name={ASSET_CLASS_LABELS[assetClass] ?? assetClass}
              data={data}
              actionColor={actionColors[data.action]}
              depth={0}
              expandable={hasSubs}
              expanded={isClassOpen}
              onToggle={hasSubs ? () => setExpandedClasses((s) => toggleKey(s, assetClass)) : undefined}
            />

            {hasSubs && (
              <CollapseRegion open={isClassOpen}>
                <div className="divide-y divide-border border-t border-border">
                  {Object.entries(subs)
                    // Alphabetical, except the residual sleeve, which closes the list: it is what
                    // is LEFT of the class, so reading it between two targeted sleeves would put a
                    // non-verdict in the middle of a column of verdicts.
                    .sort(([a], [b]) => {
                      if (a === NO_SUBCATEGORY_LABEL) return 1;
                      if (b === NO_SUBCATEGORY_LABEL) return -1;
                      return a.localeCompare(b);
                    })
                    .map(([subCategory, subData]) => {
                      const isUntargeted = subCategory === NO_SUBCATEGORY_LABEL;
                      const subKey = `${assetClass}:${subCategory}`;
                      const hasSpecific = hasSpecificAssetTracking(targets, assetClass, subCategory);
                      const isSubOpen = expandedSubs.has(subKey);
                      const specificAssets = hasSpecific ? filterSpecificAssets(allocation.bySpecificAsset, assetClass, subCategory) : {};
                      const specificEntries = Object.entries(specificAssets).sort(([a], [b]) => a.localeCompare(b));

                      return (
                        <div key={subCategory}>
                          <AllocationRow
                            name={subCategory}
                            data={subData}
                            actionColor={actionColors[subData.action]}
                            depth={1}
                            untargeted={isUntargeted}
                            expandable={hasSpecific}
                            expanded={isSubOpen}
                            onToggle={hasSpecific ? () => setExpandedSubs((s) => toggleKey(s, subKey)) : undefined}
                          />

                          {hasSpecific && (
                            <CollapseRegion open={isSubOpen}>
                              <div className="border-t border-border pb-1">
                                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pl-8 pt-2')}>Target teorici</p>
                                {specificEntries.length === 0 ? (
                                  <p className="py-2 pl-8 text-[12px] text-muted-foreground">Nessun asset specifico configurato.</p>
                                ) : (
                                  <div className="divide-y divide-border">
                                    {specificEntries.map(([assetName, assetData]) => (
                                      <AllocationRow
                                        key={assetName}
                                        name={assetName}
                                        data={assetData}
                                        actionColor={actionColors[assetData.action]}
                                        depth={2}
                                        theoretical
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CollapseRegion>
                          )}
                        </div>
                      );
                    })}
                </div>
              </CollapseRegion>
            )}
          </div>
        );
      })}
    </div>
  );
}
