/**
 * Horizontal stacked bars comparing actual vs recommended asset class allocation.
 * Shows two bars: "Effettiva" (actual) and "Consigliata" (recommended), each segmented
 * by asset class with matching colors.
 */

'use client';

import { AssetClass } from '@/types/assets';

interface AllocationComparisonBarProps {
  actualAllocation: Partial<Record<AssetClass, number>>;
  recommendedAllocation: Partial<Record<AssetClass, number>>;
}

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  equity: '#3B82F6',     // blue
  bonds: '#22C55E',      // green
  crypto: '#F59E0B',     // amber
  realestate: '#8B5CF6', // violet
  cash: '#6B7280',       // gray
  commodity: '#F97316',  // orange
};

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Crypto',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie Prime',
};

function AllocationBar({
  label,
  allocation,
}: {
  label: string;
  allocation: Partial<Record<AssetClass, number>>;
}) {
  const entries = Object.entries(allocation).filter(
    ([, pct]) => pct && pct > 0
  ) as [AssetClass, number][];

  return (
    <div className="space-y-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="flex h-5 w-full rounded-full overflow-hidden bg-gray-100">
        {entries.map(([cls, pct]) => (
          <div
            key={cls}
            className="h-full flex items-center justify-center text-[10px] text-white font-medium"
            style={{
              width: `${pct}%`,
              backgroundColor: ASSET_CLASS_COLORS[cls],
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
  const hasActual = Object.values(actualAllocation).some((v) => v && v > 0);
  const hasRecommended = Object.values(recommendedAllocation).some(
    (v) => v && v > 0
  );

  if (!hasActual && !hasRecommended) return null;

  // Collect all asset classes present in either bar for the legend
  const allClasses = new Set<AssetClass>();
  for (const cls of Object.keys(actualAllocation) as AssetClass[]) {
    if (actualAllocation[cls] && actualAllocation[cls]! > 0) allClasses.add(cls);
  }
  for (const cls of Object.keys(recommendedAllocation) as AssetClass[]) {
    if (recommendedAllocation[cls] && recommendedAllocation[cls]! > 0) allClasses.add(cls);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-600">Confronto Allocazione</p>

      {hasActual && (
        <AllocationBar label="Effettiva" allocation={actualAllocation} />
      )}

      {hasRecommended && (
        <AllocationBar label="Consigliata" allocation={recommendedAllocation} />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-1">
        {Array.from(allClasses).map((cls) => (
          <div key={cls} className="flex items-center gap-1">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: ASSET_CLASS_COLORS[cls] }}
            />
            <span className="text-[10px] text-gray-500">
              {ASSET_CLASS_LABELS[cls]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
