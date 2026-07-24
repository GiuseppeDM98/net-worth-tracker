/**
 * PensionAllocationCards — read-only previdenza views for the Allocazione page (spec
 * 2-pension-fund/04 §5, D1).
 *
 * The main allocation composition bar / plans (RebalancePanel etc.) stay UNTOUCHED and reflect
 * `tradable + frozen` as usual — a `pensionFund` defaults to `allocationRole: 'frozen'`, so it
 * already weighs in the denominator and the percentages via `partitionByAllocationRole` +
 * `compareAllocations`, with NO special-casing needed here (spec: "nessun codice di esclusione
 * nuovo"). It never appears in a plan because `buildRebalancePlan`/`buildContributionPlan`/
 * `buildWithdrawalPlan` all operate on the `tradable` slice only.
 *
 * This component is a SEPARATE, explicit look-through: behind a "Mostra previdenza complementare"
 * toggle, two read-only cards isolate the fund's contribution —
 *   - Card A — «Allocazione fondo pensione»: the fund(s)' own underlying mix (from `composition`,
 *     falling back to the fund's own `assetClass` for a fund with no composition entered yet).
 *   - Card B — «Portafoglio + previdenza»: the combined split of ALL assets (tradable + frozen +
 *     the funds), i.e. what "Portafoglio + previdenza" looks like together.
 * Neither card has targets or COMPRA/VENDI actions — the fund is read-only here, same as the main
 * page everywhere else.
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, PiggyBank } from 'lucide-react';
import type { Asset } from '@/types/assets';
import { calculateAssetValue } from '@/lib/services/assetService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { ASSET_CLASS_CHART_INDEX, ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { CHART_COLORS } from '@/lib/constants/colors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompositionBar, type CompositionBarSegment } from '@/components/ui/composition-bar';
import { CompositionList, type CompositionListItem } from '@/components/ui/composition-list';
import { cn } from '@/lib/utils';

interface ClassSlice {
  assetClass: string;
  value: number;
  percentage: number;
}

/** Split one asset into (assetClass, value) legs, looking through `composition` when present. */
function assetLegs(asset: Asset): { assetClass: string; value: number }[] {
  const value = calculateAssetValue(asset);
  if (value <= 0) return [];
  if (asset.composition && asset.composition.length > 0) {
    return asset.composition.map((comp) => ({
      assetClass: comp.assetClass,
      value: (value * comp.percentage) / 100,
    }));
  }
  return [{ assetClass: asset.assetClass, value }];
}

/** Aggregate the market value of a set of assets by asset class, as sorted slices summing to 100%. */
function toClassSlices(assets: Asset[]): ClassSlice[] {
  const byClass = new Map<string, number>();
  for (const asset of assets) {
    for (const leg of assetLegs(asset)) {
      if (leg.value <= 0) continue;
      byClass.set(leg.assetClass, (byClass.get(leg.assetClass) ?? 0) + leg.value);
    }
  }
  const total = Array.from(byClass.values()).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];
  return Array.from(byClass.entries())
    .map(([assetClass, value]) => ({ assetClass, value, percentage: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

function ReadOnlyAllocationCard({
  title,
  slices,
  chartColors,
}: {
  title: string;
  slices: ClassSlice[];
  chartColors: string[];
}) {
  const resolveColor = (assetClass: string) => {
    const index = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
    return chartColors[index] ?? CHART_COLORS[index] ?? CHART_COLORS[0];
  };

  const segments: CompositionBarSegment[] = slices.map((s) => ({
    key: s.assetClass,
    label: ASSET_CLASS_LABELS[s.assetClass] ?? s.assetClass,
    pct: s.percentage,
    color: resolveColor(s.assetClass),
  }));

  const items: CompositionListItem[] = slices.map((s) => ({
    id: s.assetClass,
    name: ASSET_CLASS_LABELS[s.assetClass] ?? s.assetClass,
    value: s.value,
    percentage: s.percentage,
    color: resolveColor(s.assetClass),
  }));

  if (slices.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CompositionBar
          segments={segments}
          ariaLabel={`${title}: ${segments.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(', ')}`}
          showLegend={false}
        />
        <CompositionList items={items} ariaLabel={title} />
      </CardContent>
    </Card>
  );
}

export function PensionAllocationCards({ assets }: { assets: Asset[] }) {
  const [open, setOpen] = useState(false);
  const chartColors = useChartColors();

  const pensionAssets = useMemo(() => assets.filter((a) => a.type === 'pensionFund'), [assets]);
  const fundSlices = useMemo(() => toClassSlices(pensionAssets), [pensionAssets]);
  const combinedSlices = useMemo(() => toClassSlices(assets), [assets]);

  // Nothing to show without a fondo pensione.
  if (pensionAssets.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/30"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Mostra previdenza complementare</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-3 grid gap-3 desktop:grid-cols-2">
          <ReadOnlyAllocationCard
            title="Allocazione fondo pensione"
            slices={fundSlices}
            chartColors={chartColors}
          />
          <ReadOnlyAllocationCard
            title="Portafoglio + previdenza"
            slices={combinedSlices}
            chartColors={chartColors}
          />
        </div>
      )}
    </div>
  );
}
