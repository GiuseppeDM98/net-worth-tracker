/**
 * The shape every rule-generated sentence takes: a list of segments where prose stays prose
 * and figures are flagged `mono` (set in Geist Mono) and optionally signed (coloured as a gain
 * or a loss). Page modules (`overviewNarrative.ts`, the next `*Narrative.ts`) build these;
 * `components/ui/narrative-text.tsx` renders them. Kept SDK-free so a server can build one.
 */

export interface NarrativeSegment {
  text: string;
  /** Set the segment in the numeric face (Geist Mono). */
  mono?: boolean;
  /** Colour the segment as a gain or a loss; absent = inherit. */
  sign?: 'positive' | 'negative';
}

export type Narrative = NarrativeSegment[];

/** The tone of a page verdict — colours only the headline's full stop (DESIGN.md → Page Verdict). */
export type VerdictTone = 'positive' | 'neutral' | 'warning' | 'negative';

/** What every page's `build*Verdict` returns and `PageVerdict` renders. */
export interface PageVerdictModel {
  headline: string;
  tone: VerdictTone;
  sentence: Narrative;
}

/** Plain-text rendering, for tests and accessible names. */
export function narrativeToText(narrative: Narrative): string {
  return narrative.map((segment) => segment.text).join('');
}
