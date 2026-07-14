/**
 * AllocationBreakdown — the unified composition view.
 *
 * One Card, one flat `divide-y` list, inline accordion at every depth. This replaces
 * the previous split (desktop = a stack of N+1 tables/cards; mobile = a bottom sheet
 * with its own state machine). The same interaction now holds on every breakpoint:
 * tap an asset class to reveal its sub-categories; tap a tracked sub-category to reveal
 * its theoretical specific-asset targets. Indentation, not a new surface, signals depth.
 *
 * Expansion animates via `CollapseRegion`, a pure-CSS `grid-template-rows: 0fr → 1fr`
 * transition. AGENTS.md flags Framer `AnimatePresence` + `height:'auto'` as unreliable
 * for lists of sub-items (it left rows stuck at opacity 0); the grid technique needs no
 * height measurement and never gets stuck. Its content stays mounted, so collapsed
 * regions are made `inert` to keep them out of the focus order and the a11y tree.
 */
'use client';

import { ReactNode, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ASSET_CLASS_ORDER } from '@/lib/services/assetService';
import { formatCurrency } from '@/lib/services/chartService';
import { AllocationResult, AssetAllocationTarget } from '@/types/assets';
import {
  ASSET_CLASS_LABELS,
  groupSubCategoriesByAssetClass,
  filterSpecificAssets,
  hasSpecificAssetTracking,
  type AllocatableHolding,
} from '@/lib/utils/allocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { AllocationRow } from './AllocationRow';

interface AllocationBreakdownProps {
  allocation: AllocationResult;
  targets: AssetAllocationTarget | null;
  /** Assets flagged non-rebalanceable — reported at the bottom, never scored against a target. */
  excludedHoldings: AllocatableHolding[];
}

const byAssetClassOrder = (a: string, b: string) =>
  (ASSET_CLASS_ORDER[a] ?? 999) - (ASSET_CLASS_ORDER[b] ?? 999);

/**
 * Smooth height collapse via `grid-template-rows` (0fr ↔ 1fr). Content stays mounted so
 * the transition has something to size to; `inert` when closed removes the clipped content
 * from focus order and the accessibility tree.
 */
function CollapseRegion({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

export function AllocationBreakdown({
  allocation,
  targets,
  excludedHoldings,
}: AllocationBreakdownProps) {
  const actionColors = useActionColors();
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());

  const subCategoriesByClass = groupSubCategoriesByAssetClass(allocation.bySubCategory);
  const excludedTotal = excludedHoldings.reduce((sum, holding) => sum + holding.value, 0);

  const toggle = (set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const assetClasses = Object.entries(allocation.byAssetClass).sort(([a], [b]) =>
    byAssetClassOrder(a, b)
  );

  if (assetClasses.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <LayoutGrid className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nessun asset presente.</p>
        <Link
          href="/dashboard/assets"
          className="text-xs text-muted-foreground/70 underline underline-offset-2"
        >
          Aggiungi asset per vedere l&apos;allocazione
        </Link>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="border-b border-border px-4 py-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Composizione
        </p>
      </div>

      <div className="divide-y divide-border/50">
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
                onToggle={hasSubs ? () => setExpandedClasses((s) => toggle(s, assetClass)) : undefined}
              />

              {hasSubs && (
                <CollapseRegion open={isClassOpen}>
                  <div className="divide-y divide-border/40 bg-muted/20">
                    {Object.entries(subs)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([subCategory, subData]) => {
                        const subKey = `${assetClass}:${subCategory}`;
                        const hasSpecific = hasSpecificAssetTracking(targets, assetClass, subCategory);
                        const isSubOpen = expandedSubs.has(subKey);
                        const specificAssets = hasSpecific
                          ? filterSpecificAssets(allocation.bySpecificAsset, assetClass, subCategory)
                          : {};

                        return (
                          <div key={subCategory}>
                            <AllocationRow
                              name={subCategory}
                              data={subData}
                              actionColor={actionColors[subData.action]}
                              depth={1}
                              expandable={hasSpecific}
                              expanded={isSubOpen}
                              onToggle={
                                hasSpecific ? () => setExpandedSubs((s) => toggle(s, subKey)) : undefined
                              }
                            />

                            {hasSpecific && (
                              <CollapseRegion open={isSubOpen}>
                                <div className="divide-y divide-border/30 bg-muted/40">
                                  <p className="px-12 pt-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                                    Target teorici
                                  </p>
                                  {Object.keys(specificAssets).length === 0 ? (
                                    <p className="px-12 py-3 text-xs text-muted-foreground">
                                      Nessun asset specifico configurato.
                                    </p>
                                  ) : (
                                    Object.entries(specificAssets)
                                      .sort(([a], [b]) => a.localeCompare(b))
                                      .map(([assetName, assetData]) => (
                                        <AllocationRow
                                          key={assetName}
                                          name={assetName}
                                          data={assetData}
                                          actionColor={actionColors[assetData.action]}
                                          depth={2}
                                          theoretical
                                        />
                                      ))
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

      {/* Wealth OUTSIDE the allocation (role `excluded` — the home you live in). Deliberately
          outside the divide-y list above and visually quieter: it carries no target, no chip and no
          action. It exists here only so the page total reconciles with the Patrimonio one instead of
          silently disagreeing with it. Note this is NOT the `frozen` role — those assets ARE in the
          class rows above, because they are part of the allocation; they simply never move. */}
      {excludedHoldings.length > 0 && (
        <div className="border-t border-border bg-muted/20">
          <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Esclusi dall&apos;allocazione
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatCurrency(excludedTotal)}
            </p>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground/70">
            Nel patrimonio, fuori dai calcoli di questa pagina.
          </p>
          <div className="divide-y divide-border/40">
            {[...excludedHoldings]
              .sort((a, b) => b.value - a.value)
              .map((holding) => (
                <div
                  key={holding.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="truncate text-xs text-muted-foreground" title={holding.label}>
                    {holding.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(holding.value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </Card>
  );
}
