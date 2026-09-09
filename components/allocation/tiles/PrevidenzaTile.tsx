'use client';

/**
 * PREVIDENZA — «cosa aggiunge il fondo pensione al quadro?»: the fund's own mix beside the whole
 * account's, each as a stacked bar (the shape) over ranked rows (the magnitudes).
 *
 * Two columns, because the question has two halves. The first is what `composition` says the
 * fund holds: a pension fund is `frozen` by default, so it already weighs in the allocated total
 * and in every percentage above — but no plan ever moves it, which is why this tile carries no
 * target, no gap and no COMPRA/VENDI chip. There is nothing to do here, only something to know,
 * and an action colour would assert a decision the page cannot offer. The second column is the
 * ONE place on the page where the wealth the allocation excludes (a house, a stake) is part of
 * the picture; its heading says so («esclusi compresi») whenever it is, so this total is never
 * mistaken for the allocated one the tiles above are measured on.
 *
 * Every figure comes from `buildPensionLookThrough` (allocazioneSummary.ts), the reading from
 * `describePension` (allocazioneNarrative.ts); this file only renders. A class takes its hue
 * from `ASSET_CLASS_CHART_INDEX` through `useChartColors()` — the slot Bilanciamento and Storico
 * use — so «Obbligazioni» is one colour across the app. The rows are a `CompositionList`, not
 * `RankedRows`: bar and list share one set of slices and one colour per class, and the primitive
 * already keeps width = rank, trailing figure = share. No footer: the reading says whether the
 * fund sits inside the allocated total, and the two headings name each column's scope.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { ClassSlice, PensionLookThrough } from '@/lib/utils/allocazioneSummary';
import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';
import { CHART_COLORS } from '@/lib/constants/colors';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { CompositionBar, type CompositionBarSegment } from '@/components/ui/composition-bar';
import { CompositionList, type CompositionListItem } from '@/components/ui/composition-list';

interface PrevidenzaTileProps {
  /** `describePension(...)` — the fund's mix, its role in the total, the whole account's top classes. */
  reading: Narrative;
  /** «Fondo Cometa · 42.000 € · non negoziabile» — built by the page. */
  aside: string;
  lookThrough: PensionLookThrough;
  className?: string;
}

/**
 * The theme resolves slots 0-4; a class past them (Materie Prime, Trend Following, Carry) falls
 * back to the static palette at the SAME index, so the hue still matches Storico's.
 */
function resolveClassColor(assetClass: string, chartColors: string[]): string {
  const index = ASSET_CLASS_CHART_INDEX[assetClass] ?? 0;
  return chartColors[index] ?? CHART_COLORS[index] ?? CHART_COLORS[0];
}

/** Compact euro, no cents: these are shares of a picture, not a ledger. */
const formatCompact = (value: number): string => cachedFormatCurrencyEUR(value, true);

interface MixColumnProps {
  heading: string;
  /** Largest first, every `percentage` > 0 — the summary layer guarantees both. */
  slices: ClassSlice[];
  chartColors: string[];
}

/** One scope of the look-through: the sub-eyebrow, the stacked bar, the ranked rows. */
function MixColumn({ heading, slices, chartColors }: MixColumnProps) {
  if (slices.length === 0) {
    return (
      <div className="min-w-0">
        <p className={TILE_SUB_EYEBROW_CLASS}>{heading}</p>
        <p className="mt-2.5 text-[13px] leading-[1.45] text-muted-foreground">Nessun valore da ripartire.</p>
      </div>
    );
  }

  // One colour per class, resolved once, so the bar segment and its row can never disagree.
  const coloured = slices.map((slice) => ({ slice, color: resolveClassColor(slice.assetClass, chartColors) }));
  const segments: CompositionBarSegment[] = coloured.map(({ slice, color }) => ({
    key: slice.assetClass,
    label: slice.label,
    pct: slice.percentage,
    color,
  }));
  const items: CompositionListItem[] = coloured.map(({ slice, color }) => ({
    id: slice.assetClass,
    name: slice.label,
    value: slice.value,
    percentage: slice.percentage,
    color,
  }));
  const barLabel = `${heading}: ${segments.map((seg) => `${seg.label} ${formatPercentage(seg.pct, 1)}`).join(', ')}`;

  return (
    <div className="flex min-w-0 flex-col">
      <p className={TILE_SUB_EYEBROW_CLASS}>{heading}</p>
      <div className="mt-2.5">
        <CompositionBar segments={segments} ariaLabel={barLabel} showLegend={false} />
      </div>
      <div className="mt-3">
        <CompositionList items={items} formatValue={formatCompact} ariaLabel={`${heading}, per classe`} />
      </div>
    </div>
  );
}

export function PrevidenzaTile({ reading, aside, lookThrough, className }: PrevidenzaTileProps) {
  // Resolved once per tile and passed down (the hook reads CSS variables after paint).
  const chartColors = useChartColors();

  const fundHeading = lookThrough.fundCount > 1 ? 'I fondi' : 'Il fondo';
  const combinedHeading = lookThrough.hasExcluded ? 'Tutto il patrimonio, esclusi compresi' : 'Tutto il patrimonio';

  return (
    <Tile eyebrow="Previdenza" aside={aside} reading={reading} className={className} ariaLabel="Previdenza complementare">
      <div className="mt-3.5 grid grid-cols-1 gap-6 desktop:grid-cols-2">
        <MixColumn heading={fundHeading} slices={lookThrough.fundSlices} chartColors={chartColors} />
        <MixColumn heading={combinedHeading} slices={lookThrough.combinedSlices} chartColors={chartColors} />
      </div>
    </Tile>
  );
}
