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
      {segments.map((segment, i) =>
        segment.mono ? (
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
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}
