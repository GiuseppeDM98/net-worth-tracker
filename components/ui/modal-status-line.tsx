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
 *
 * The incoming `className` comes BEFORE the line's size and tone in the merge (after `m-0`, so
 * the modal's `mt-1` survives), the line's own classes last: shadcn's
 * `DialogDescription`/`DrawerDescription` hand down `text-sm text-muted-foreground` through the
 * slot, and with them last `tailwind-merge` dropped this line's `text-[13px]`, its
 * `leading-[1.45]` (a size utility conflicts with a leading one) and — on a refusal — its
 * `text-destructive`: every modal's reading was 14px muted and no refusal was ever red
 * (measured 2026-09-14 on the budget dialog, in place since 2026-08-31).
 */
export function ModalStatusLine({ reading, className, ...rest }: ModalStatusLineProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'm-0',
        className,
        'text-[13px] leading-[1.45]',
        reading.tone === 'negative' ? 'text-destructive' : 'text-foreground',
      )}
      {...rest}
    >
      <NarrativeSegments segments={reading.narrative} />
    </p>
  );
}
