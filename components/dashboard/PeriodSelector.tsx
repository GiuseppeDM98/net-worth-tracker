'use client';

import { SegmentedPill, type SegmentedPillOption } from '@/components/ui/segmented-pill';

const PERIODS = ['3M', '6M', 'YTD', '1A', '3A', 'All'] as const;
export type SparklinePeriod = (typeof PERIODS)[number];

const OPTIONS: ReadonlyArray<SegmentedPillOption<SparklinePeriod>> = PERIODS.map((value) => ({ value, label: value }));

interface PeriodSelectorProps {
  value: SparklinePeriod;
  onChange: (p: SparklinePeriod) => void;
}

/**
 * The period of the hero sparkline — the ONE control on the Panoramica, so it is the shared
 * `SegmentedPill` and not a hand-rolled pill: `radio` semantics (it picks a VALUE the chart
 * reads, there is no tabpanel — AGENTS.md → Accessibility), roving tabindex, the 14px label of
 * every other pill instead of a 10,5px one nowhere on the ramp, 44px of height under `desktop:`
 * for the thumb. The spring (400/35) is the primitive's, the same as every other tab picker.
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <SegmentedPill
      options={OPTIONS}
      value={value}
      onChange={onChange}
      layoutId="period-pill"
      ariaLabel="Periodo del grafico"
      semantics="radio"
      optionClassName="min-h-11 flex-1 desktop:min-h-0 desktop:flex-none"
      className="w-full tablet:w-fit"
    />
  );
}
