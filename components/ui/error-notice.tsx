import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS, TileRowShell, type TileCollapse } from '@/components/ui/tile';
import type { ReadFailureNotice } from '@/lib/utils/statesNarrative';

interface ErrorNoticeProps {
  /** The words, from `describeReadFailure` — never typed in a component. */
  notice: ReadFailureNotice;
  /** Wired only where the surface can genuinely re-run the query. */
  onRetry?: () => void;
  /** A fact under the rule — usually `describeLastSuccessfulRead`; absent drops the line. */
  footNote?: string | null;
  /**
   * Drop the "what was not touched" line, for a cell too narrow to carry three lines without
   * the notice growing taller than the tiles beside it — in practice a span of 4 of 12 or less.
   * A wider cell keeps it: it is the sentence that stops a reader reaching for a backup, and on
   * any page where several queries fail together at least one of them is wide. Not the width of
   * the composition: that one is `sections.compact`, and it drives `live` and `collapse`.
   */
  compact?: boolean;
  /**
   * Below `desktop:` the notice IS the tile's row (The Closed-Row Rule): the red eyebrow is the
   * trigger, open on every visit until the reader closes it; message, reassurance and «Riprova»
   * sit in the panel. From `useMobileSections().collapse(id)` with `failed: true` on the section.
   */
  collapse?: TileCollapse;
  /**
   * `role="alert"` on this notice. A page passes `live={!sections.compact}`: below `desktop:` the
   * ONE live node is `PageRest`'s announcement, so three failed reads are one sentence and not
   * three alerts (AGENTS.md § Accessibility, one live region per list).
   */
  live?: boolean;
  className?: string;
}

/**
 * A failed read, in the tile's own material (DESIGN.md → **The Absence-Has-Three-Names Rule**).
 *
 * A fetch that failed is not an empty set. Every query on this app defaults to `[]` or
 * `undefined`, so without this the page renders zeros in `font-mono` — indistinguishable from
 * the truthful case, which is the one thing a tracker must never be. The tile that depended on
 * the missing data is OMITTED and replaced by this, in the same grid cell, so the grid keeps
 * its shape and nothing else on the page moves.
 *
 * Two placements, one component: at the verdict's place (`max-w-[920px]`, set by the caller)
 * when a whole payload failed, or inside a cell when one query did. The severity lives in the
 * eyebrow and the icon — never in a number, because there is no number.
 *
 * Supersedes `PensionErrorNotice` and `CostCenterErrorNotice`, which were the same component
 * written twice, and the two inline copies on Patrimonio.
 */
export function ErrorNotice({ notice, onRetry, footNote, compact = false, collapse, live = true, className }: ErrorNoticeProps) {
  const hasFooter = Boolean(onRetry && notice.retryLabel) || Boolean(footNote);

  const footer = hasFooter && (
    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
      {onRetry && notice.retryLabel && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-7 items-center rounded-md border border-border px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted max-desktop:h-11"
        >
          {notice.retryLabel}
        </button>
      )}
      {footNote && <span>{footNote}</span>}
    </div>
  );

  if (collapse) {
    // The eyebrow already says «· lettura fallita»: no second `sr-only` here, unlike a `Tile`.
    const eyebrow = (
      <span className={cn(TILE_EYEBROW_CLASS, 'flex min-w-0 items-center gap-1.5 text-destructive')}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{notice.eyebrow}</span>
      </span>
    );
    return (
      <TileRowShell collapse={collapse} eyebrow={eyebrow} ariaLabel={notice.eyebrow} role={live ? 'alert' : undefined} className={className}>
        <div className="space-y-1.5">
          <p className="text-[13px] leading-[1.45] text-foreground">{notice.message}</p>
          {!compact && <p className="text-[11px] leading-[1.45] text-muted-foreground">{notice.reassurance}</p>}
        </div>
        {footer}
      </TileRowShell>
    );
  }

  return (
    <section role={live ? 'alert' : undefined} aria-label={live ? undefined : notice.eyebrow} className={cn(TILE_SURFACE_CLASS, 'p-5', className)}>
      <div className="flex gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 space-y-1.5">
          <p className={cn(TILE_EYEBROW_CLASS, 'text-destructive')}>{notice.eyebrow}</p>
          <p className="text-[13px] leading-[1.45] text-foreground">{notice.message}</p>
          {!compact && (
            <p className="text-[11px] leading-[1.45] text-muted-foreground">{notice.reassurance}</p>
          )}
        </div>
      </div>

      {footer}
    </section>
  );
}
