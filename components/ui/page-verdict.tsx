import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { splitVerdict, type PageVerdictModel, type VerdictTone } from '@/lib/utils/narrative';
import { sectionPanelId } from '@/lib/utils/mobileSections';
import { NarrativeSegments, NarrativeText } from '@/components/ui/narrative-text';
import type { TileCollapse } from '@/components/ui/tile';

interface PageVerdictProps {
  verdict: PageVerdictModel;
  /** Accessible name of the section — what the verdict is about ("Verdetto del mese"). */
  ariaLabel: string;
  /**
   * The page's axis below `desktop:` (a period picker), right under the title: at 1440 the page
   * mounts a second instance of the same control where it stands today (`hidden desktop:flex`,
   * the same state prop), as `PageHeader` does with its `actions`.
   */
  axis?: ReactNode;
  /** `<VerdictStrip>`: the figures of the first screen, hidden from `desktop:` by the strip itself. */
  strip?: ReactNode;
  /**
   * A caption that qualifies the figures (the scheduled amount inside a total), rendered at every
   * width: after the strip below `desktop:`, under the paragraph at 1440. A page that wants it on
   * a phone only passes it with `sections.compact`.
   */
  scope?: ReactNode;
  /**
   * The verdict's «Il perché» as a row of the page's controller
   * (`useMobileSections().collapse(VERDICT_REST_SECTION)`). Without it the whole `sentence` is
   * printed at every width and `leadLength`/`restLabel` are ignored (the Assistente).
   */
  restCollapse?: TileCollapse;
}

/**
 * The headline of a redesigned page (DESIGN.md → §5 Page Verdict): the verdict in one sentence,
 * the facts in the next. The tone only colours the headline's full stop — a whole coloured
 * headline would shout, and the figures in the sentence already carry their own sign colours.
 * Every page's narrative module (`overviewNarrative.ts`, `patrimonioNarrative.ts`) returns this
 * shape; no component writes copy.
 */
const TONE_DOT_CLASS: Record<VerdictTone, string> = {
  positive: 'text-positive',
  neutral: 'text-muted-foreground',
  warning: 'text-warning-foreground',
  negative: 'text-destructive',
};

const SENTENCE_CLASS = 'text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]';

/**
 * The verdict, in ONE DOM in reading order on every width — no `order-*`, no `contents`
 * (doc/mobile/README.md § 9, decisions 1 and 12): title → axis → first sentence → strip →
 * scope → «Il perché» → the rest. Below `desktop:` the first sentence stands alone and the rest
 * opens under the button (The Binding-Clause Rule, `splitVerdict`). At 1440 the controller hands
 * the page no `restCollapse` (`useMobileSections` answers `undefined` there), so the branch below
 * renders the one `<p>` of every width; the `desktop:` classes of the split branch keep it right
 * for a caller that passes `restCollapse` at any width (the strip and the button hidden, the two
 * inline spans reading as the paragraph).
 *
 * The scope is the one slot rendered twice: below `desktop:` it follows the strip, at 1440 it
 * closes the paragraph — and no single position in the sequence is both, since between the
 * first sentence and the rest it would split the paragraph at 1440. A caption, never a control,
 * so the duplicate carries no id and no focus.
 */
export function PageVerdict({ verdict, ariaLabel, axis, strip, scope, restCollapse }: PageVerdictProps) {
  const headline = verdict.headline.endsWith('.') ? verdict.headline.slice(0, -1) : verdict.headline;
  const split = restCollapse ? splitVerdict(verdict) : null;
  const restOpen = restCollapse?.open ?? false;
  const hasRest = split !== null && split.rest.length > 0;

  return (
    // `page-verdict` is the region a page scene morphs into the next page's verdict (globals.css →
    // Page scene); the loading skeleton reserves the same name so the morph has a target on landing.
    <section aria-label={ariaLabel} className="flex max-w-[920px] flex-col gap-2" style={{ viewTransitionName: 'page-verdict' }}>
      <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]">
        {headline}
        <span className={TONE_DOT_CLASS[verdict.tone]} aria-hidden="true">
          .
        </span>
      </h2>
      {axis && <div className="desktop:hidden">{axis}</div>}
      {split === null ? (
        <>
          <NarrativeText segments={verdict.sentence} className={SENTENCE_CLASS} />
          {strip}
          {scope && <div className="desktop:hidden">{scope}</div>}
          {scope && <div className="hidden desktop:block">{scope}</div>}
        </>
      ) : (
        // A `div`, not a `p`: the strip and the button are blocks inside the paragraph's flow.
        <div className={SENTENCE_CLASS}>
          {split.lead.length > 0 && (
            <span>
              <NarrativeSegments segments={split.lead} />
            </span>
          )}
          {strip}
          {scope && <div className="desktop:hidden">{scope}</div>}
          {hasRest && restCollapse && (
            <button
              type="button"
              aria-expanded={restOpen}
              aria-controls={sectionPanelId(restCollapse.id)}
              onClick={() => restCollapse.onOpenChange(!restOpen)}
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-[13px] font-medium text-foreground active:bg-muted desktop:hidden"
            >
              <span>Il perché{split.restLabel ? ` · ${split.restLabel}` : ''}</span>
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-spring', restOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          )}
          {hasRest && restCollapse && (
            // Inline at 1440 (the paragraph of today); a block under the button on a phone, and
            // hidden there while closed — the text is in the DOM at every width.
            <span
              id={sectionPanelId(restCollapse.id)}
              data-state={restOpen ? 'open' : 'closed'}
              className={restOpen ? 'max-desktop:mt-1 max-desktop:block' : 'max-desktop:hidden'}
            >
              <NarrativeSegments segments={split.rest} />
            </span>
          )}
          {scope && <div className="hidden desktop:block">{scope}</div>}
        </div>
      )}
    </section>
  );
}
