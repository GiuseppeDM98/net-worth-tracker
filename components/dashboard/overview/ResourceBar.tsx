'use client';

import { useThemeCostume } from '@/contexts/ColorThemeContext';
import { cn } from '@/lib/utils';
import { formatStripFigure } from '@/lib/utils/verdictStrip';
import type { ResourceFigure } from '@/lib/utils/overviewSummary';
import { NarrativeSegments } from '@/components/ui/narrative-text';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';

/**
 * The resource bar of a costume theme that has one (DESIGN.md → The Costume Rule): four figures
 * under the Panoramica's header, at ≥ 1440 only (`hidden desktop:flex`). It opens nothing and
 * adds no figure the tiles do not print.
 */
export function ResourceBar({ figures }: { figures: readonly ResourceFigure[] }) {
  const costume = useThemeCostume();
  if (!costume?.resourceBar || figures.length === 0) return null;
  return (
    <dl aria-label="Quadro rapido" className="hidden gap-px border border-border bg-border desktop:flex">
      {figures.map((figure) => {
        const segment = formatStripFigure({ ...figure, opens: '' });
        return (
          <div key={figure.label} className="min-w-0 flex-1 bg-card px-3.5 py-2.5">
            <dt className={cn(TILE_EYEBROW_CLASS, 'tracking-[0.12em] text-muted-foreground')}>{figure.label}</dt>
            <dd className="mt-1 text-[18px] leading-none">
              {segment ? <NarrativeSegments segments={[segment]} /> : <span className="text-[12px] text-muted-foreground">{figure.reason}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
