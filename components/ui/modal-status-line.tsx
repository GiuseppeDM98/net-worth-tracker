'use client';

import { cn } from '@/lib/utils';
import { NarrativeSegments } from '@/components/ui/narrative-text';
import type { ModalReading } from '@/lib/utils/dialogNarrative';

interface ModalStatusLineProps extends React.ComponentProps<'p'> {
  reading: ModalReading;
}

/**
 * A modal's reading line, which on a form IS the status line: what the form wants, then what
 * it is doing, then how it went (DESIGN.md → The Status-Is-The-Reading Rule).
 *
 * Two things are load-bearing. The element is a **single stable node** in every phase —
 * `role="status" aria-live="polite" aria-atomic="true"` — because a container that swapped
 * `status` for `alert` on failure is a different node to the accessibility tree, and some
 * screen readers announce nothing across that swap; the words carry the severity instead, with
 * the negative tone painting them `text-destructive` (never `text-red-500`, which stays literal
 * on the themes whose destructive is not red). And it takes the props Radix's
 * `Dialog.Description` hands down through `asChild`, so the live region and the modal's
 * accessible description are the same element rather than two paragraphs saying one thing.
 */
export function ModalStatusLine({ reading, className, ...rest }: ModalStatusLineProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'm-0 text-[13px] leading-[1.45]',
        reading.tone === 'negative' ? 'text-destructive' : 'text-foreground',
        className,
      )}
      {...rest}
    >
      <NarrativeSegments segments={reading.narrative} />
    </p>
  );
}
