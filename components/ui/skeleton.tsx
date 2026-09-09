import { cn } from '@/lib/utils';

/**
 * The ONE muted placeholder of the app: a block of `--muted` that pulses while the figure it
 * stands for is in flight.
 *
 * Two things it fixes over the bare `animate-pulse rounded bg-muted` that was hand-written in
 * eight files. **The pulse is motion-safe**: Tailwind's `animate-pulse` carries no
 * `prefers-reduced-motion` guard, so every skeleton in the app breathed at a reader who had
 * asked the OS for stillness — the only piece of motion in the product that ignored the
 * setting. And it is **`aria-hidden`**: the wait is announced ONCE, by the `role="status"` on
 * the block that owns it (`TileGridSkeleton`), not by a dozen empty boxes.
 *
 * A wait is not an absence: when the query has FAILED, the surface owes the reader an
 * `ErrorNotice`, never a skeleton that never lifts (see `resolveSurfaceState`).
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('motion-safe:animate-pulse rounded bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
