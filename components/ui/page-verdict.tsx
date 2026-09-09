import type { PageVerdictModel, VerdictTone } from '@/lib/utils/narrative';
import { NarrativeText } from '@/components/ui/narrative-text';

interface PageVerdictProps {
  verdict: PageVerdictModel;
  /** Accessible name of the section — what the verdict is about ("Verdetto del mese"). */
  ariaLabel: string;
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

export function PageVerdict({ verdict, ariaLabel }: PageVerdictProps) {
  const headline = verdict.headline.endsWith('.') ? verdict.headline.slice(0, -1) : verdict.headline;

  return (
    <section aria-label={ariaLabel} className="flex max-w-[920px] flex-col gap-2">
      <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]">
        {headline}
        <span className={TONE_DOT_CLASS[verdict.tone]} aria-hidden="true">
          .
        </span>
      </h2>
      <NarrativeText
        segments={verdict.sentence}
        className="text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]"
      />
    </section>
  );
}
