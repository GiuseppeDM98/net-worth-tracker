import { cn } from '@/lib/utils';
import type { Narrative } from '@/lib/utils/narrative';

interface NarrativeTextProps {
  segments: Narrative;
  className?: string;
  /** Weight applied to mono figures — the verdict sentence sets them semibold, tile readings too. */
  figureClassName?: string;
}

/**
 * Renders a `Narrative` (see lib/utils/narrative.ts): prose stays prose, figures are set in
 * the numeric face and coloured by sign through the theme tokens, so one sentence can mix
 * words and numbers without the numbers losing their financial authority.
 */
export function NarrativeText({ segments, className, figureClassName = 'font-semibold' }: NarrativeTextProps) {
  return (
    <p className={cn('m-0', className)}>
      <NarrativeSegments segments={segments} figureClassName={figureClassName} />
    </p>
  );
}

/**
 * A figure's unit («€», «pt», «pp») split from the figure at the space Intl writes before it: in
 * Geist Mono that no-break space is a whole cell, so «+11.967 €» read as a figure, a hole and a
 * sign (the owner, 2026-10-10, at 22px in the strip and at 14px in every verdict). The unit is
 * drawn as its own span at `ml-[0.2em]` and the space leaves the DOM — the segment's TEXT is
 * untouched (`narrativeToText`, the accessible names, the identities the tests hold); the unit span
 * carries `data-figure-unit`, which is how the first-screen census pairs it back with its figure
 * (`scripts/mobileCensus.mjs`, correction 3). A percentage has no space and is left alone.
 */
export function splitFigureUnit(text: string): { figure: string; unit: string | null } {
  const match = text.match(/^(.*?)[\u00a0\u202f ](€|pt|pp)$/);
  return match ? { figure: match[1], unit: match[2] } : { figure: text, unit: null };
}

/** The gap between a figure and its unit, in place of the monospace cell. */
export const FIGURE_UNIT_CLASS = 'ml-[0.2em]';

/**
 * The segments alone, without the paragraph around them — for the surfaces that own their own
 * element because it carries something else too (the modal's status line is a live region and
 * Radix's `Description` at once, and a `<p>` inside a `<p>` is not valid HTML).
 */
export function NarrativeSegments({
  segments,
  figureClassName = 'font-semibold',
}: Omit<NarrativeTextProps, 'className'>) {
  return (
    <>
      {segments.map((segment, i) => {
        if (!segment.mono) return <span key={i}>{segment.text}</span>;
        const { figure, unit } = splitFigureUnit(segment.text);
        return (
          <span
            key={i}
            className={cn(
              'font-mono tabular-nums',
              figureClassName,
              segment.sign === 'positive' && 'text-positive',
              segment.sign === 'negative' && 'text-destructive',
              !segment.sign && 'text-foreground',
            )}
          >
            {figure}
            {unit && (
              <span className={FIGURE_UNIT_CLASS} data-figure-unit="">
                {unit}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}
