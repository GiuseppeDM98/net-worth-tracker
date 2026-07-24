/**
 * Horizontal stacked bars comparing actual vs recommended asset class allocation.
 * Chart colors sourced from useChartColors() so they adapt to the active theme.
 *
 * Commodity uses color-mix() to derive a 6th distinct color from the 5-slot palette
 * (blend of equity[0] and bonds[1]).
 */

'use client';

import { useChartColors } from '@/lib/hooks/useChartColors';
import { AssetClass } from '@/types/assets';

interface AllocationComparisonBarProps {
  actualAllocation: Partial<Record<AssetClass, number>>;
  recommendedAllocation: Partial<Record<AssetClass, number>>;
}

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Crypto',
  realestate: 'Immobili',
  cash: 'Liquidita',
  commodity: 'Materie Prime',
  trendFollowing: 'Trend Following',
  carry: 'Carry',
};

function AllocationBar({
  label,
  allocation,
  colorMap,
}: {
  label: string;
  allocation: Partial<Record<AssetClass, number>>;
  colorMap: Record<AssetClass, string>;
}) {
  const entries = Object.entries(allocation).filter(
    ([, pct]) => pct && pct > 0
  ) as [AssetClass, number][];

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex h-5 w-full rounded-full overflow-hidden bg-muted">
        {entries.map(([cls, pct]) => (
          <div
            key={cls}
            className="h-full flex items-center justify-center text-[10px] text-white font-medium"
            style={{
              width: `${pct}%`,
              backgroundColor: colorMap[cls],
              minWidth: pct > 5 ? undefined : '2px',
            }}
            title={`${ASSET_CLASS_LABELS[cls]}: ${pct.toFixed(1)}%`}
          >
            {pct >= 15 ? `${Math.round(pct)}%` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AllocationComparisonBar({
  actualAllocation,
  recommendedAllocation,
}: AllocationComparisonBarProps) {
  const chartColors = useChartColors();

  // Map asset classes to themed chart colors.
  // Commodity blends equity+bonds to produce a 6th distinct hue without extending the palette.
  const colorMap: Record<AssetClass, string> = {
    equity: chartColors[0] || '#3B82F6',
    bonds: chartColors[1] || '#22C55E',
    realestate: chartColors[2] || '#8B5CF6',
    crypto: chartColors[3] || '#F59E0B',
    cash: chartColors[4] || '#6B7280',
    commodity:
      chartColors[0] && chartColors[1]
        ? `color-mix(in srgb, ${chartColors[0]} 70%, ${chartColors[1]})`
        : '#F97316',
    // No dedicated chart slot yet (only 5) — blend the other two pairs, mirroring commodity's approach.
    trendFollowing:
      chartColors[2] && chartColors[3]
        ? `color-mix(in srgb, ${chartColors[2]} 70%, ${chartColors[3]})`
        : '#8B5CF6',
    carry:
      chartColors[1] && chartColors[4]
        ? `color-mix(in srgb, ${chartColors[1]} 70%, ${chartColors[4]})`
        : '#EC4899',
  };

  const hasActual = Object.values(actualAllocation).some((v) => v && v > 0);
  const hasRecommended = Object.values(recommendedAllocation).some((v) => v && v > 0);

  if (!hasActual && !hasRecommended) return null;

  const allClasses = new Set<AssetClass>();
  for (const cls of Object.keys(actualAllocation) as AssetClass[]) {
    if (actualAllocation[cls] && actualAllocation[cls]! > 0) allClasses.add(cls);
  }
  for (const cls of Object.keys(recommendedAllocation) as AssetClass[]) {
    if (recommendedAllocation[cls] && recommendedAllocation[cls]! > 0)
      allClasses.add(cls);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Confronto Allocazione</p>

      {hasActual && (
        <AllocationBar
          label="Effettiva"
          allocation={actualAllocation}
          colorMap={colorMap}
        />
      )}

      {hasRecommended && (
        <AllocationBar
          label="Consigliata"
          allocation={recommendedAllocation}
          colorMap={colorMap}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1">
        {Array.from(allClasses).map((cls) => (
          <div key={cls} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: colorMap[cls] }}
            />
            <span className="text-[10px] text-muted-foreground">
              {ASSET_CLASS_LABELS[cls]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
