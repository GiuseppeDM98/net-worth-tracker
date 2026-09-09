'use client';

import { NarrativeText } from '@/components/ui/narrative-text';
import { cn } from '@/lib/utils';
import type { AuthReading } from '@/lib/utils/authNarrative';

/**
 * The tile's reading line, which on these two pages IS the form's status line: what the
 * form wants, then what it is doing, then how it went. One sentence in one place, instead
 * of a reading at the top of the tile and a separate status paragraph under the button.
 *
 * The container's role never changes between renders — a node that swapped `status` for
 * `alert` is a new node to the accessibility tree, and some screen readers announce
 * nothing at all across that swap. It stays a polite live region and the words carry the
 * severity, with the negative tone painting them `text-destructive` (never `text-red-500`,
 * which stays literal on the themes whose destructive is not red).
 */
export function AuthStatusLine({ reading }: { reading: AuthReading }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="mt-2">
      <NarrativeText
        segments={reading.narrative}
        className={cn(
          'text-[13px] leading-[1.45]',
          reading.tone === 'negative' ? 'text-destructive' : 'text-foreground',
        )}
      />
    </div>
  );
}
