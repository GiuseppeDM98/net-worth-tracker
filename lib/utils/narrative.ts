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
  /**
   * A clause that changes the meaning of a figure already printed (the tax on a sale, the base
   * a return was measured on, a scheduled amount inside a total): it never goes behind a tap on
   * a phone, so a `binding` segment past the verdict's cut cancels the cut (The Binding-Clause
   * Rule, doc/mobile/README.md § 9).
   */
  binding?: boolean;
}

export type Narrative = NarrativeSegment[];

/** The tone of a page verdict — colours only the headline's full stop (DESIGN.md → Page Verdict). */
export type VerdictTone = 'positive' | 'neutral' | 'warning' | 'negative';

/** What every page's `build*Verdict` returns and `PageVerdict` renders. */
export interface PageVerdictModel {
  headline: string;
  tone: VerdictTone;
  sentence: Narrative;
  /**
   * How many segments of `sentence` make its FIRST sentence — what a phone shows under the title,
   * the rest going behind «Il perché». `0` = title only (the strip says it all); absent = no cut,
   * the whole paragraph at every width. A builder sets it only when the rest has at least one
   * segment, and only on a sentence boundary («; il» becomes «. Il», at 1440 too).
   */
  leadLength?: number;
  /** What the rest is about, for the button that opens it: «Il perché · l'anno e il mese in corso». */
  restLabel?: string;
}

export interface SplitVerdict {
  /** The first sentence (or the whole paragraph when there is no cut). */
  lead: Narrative;
  /** What goes behind «Il perché»; empty when there is nothing to hide. */
  rest: Narrative;
  /** The button's label; `null` when `rest` is empty — no button, no «Il perché». */
  restLabel: string | null;
}

/**
 * Where the phone cuts a verdict (The Binding-Clause Rule).
 *
 * Without a `leadLength` nothing is cut. With one, the lead is the first `leadLength` segments
 * and the rest follows — unless a `binding` segment sits past the cut: a clause that changes
 * the meaning of a printed figure is never hidden, so the cut is cancelled and the whole
 * paragraph is the lead. `leadLength: 0` is a real value (title only), never a missing one:
 * the check is on `undefined`, never on falsiness.
 */
export function splitVerdict(model: PageVerdictModel): SplitVerdict {
  const whole: SplitVerdict = { lead: model.sentence, rest: [], restLabel: null };
  if (model.leadLength === undefined) return whole;

  const lead = model.sentence.slice(0, model.leadLength);
  const rest = model.sentence.slice(model.leadLength);
  if (rest.length === 0) return whole;
  if (rest.some((segment) => segment.binding)) return whole;

  return { lead, rest, restLabel: model.restLabel ?? null };
}

/** Plain-text rendering, for tests and accessible names. */
export function narrativeToText(narrative: Narrative): string {
  return narrative.map((segment) => segment.text).join('');
}
