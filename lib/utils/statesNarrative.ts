/**
 * The words of an absence, and the one decision that keeps the three apart
 * (DESIGN.md → **The Absence-Has-Three-Names Rule**).
 *
 * A tile that cannot answer must say WHICH of three things happened — nothing is recorded ·
 * something is, and it is zero · the read failed — because the three ask the reader for three
 * different actions, and printing a zero for any of the other two is the one thing a tracker
 * must never do.
 *
 * What lives here is only what is CROSS-PAGE: the failed read (whose sentence is the same shape
 * on every surface) and the precedence between waiting and failing. The other two names are a
 * page's own words and stay in its `*Narrative.ts` — a shared module writing «Nessuno strumento
 * registrato» would be copy about Patrimonio living outside Patrimonio.
 *
 * Pure: no Firebase, no DOM, no `chartService`. Tested clause by clause.
 */

/** Which of the three absences a surface is in. Never widen this to a boolean. */
export type AbsenceKind = 'missing' | 'zero' | 'failed';

/** What a data-backed surface is doing right now. */
export type SurfaceState = 'loading' | 'failed' | 'ready';

export interface SurfaceStateInput {
  /** The query is in flight — a first fetch OR a retry. */
  loading: boolean;
  /** The query has settled on an error, or returned nothing where something was required. */
  failed: boolean;
}

/**
 * A wait is not a failure, and a failure is not a wait.
 *
 * The precedence matters: React Query re-enters `isLoading` while it retries, and a retry is an
 * attempt rather than a verdict — so `loading` wins. What this function exists to stop is the
 * opposite collapse, `loading || !data`, which renders the skeleton forever when the fetch has
 * failed (the Panoramica did exactly that until 2026-09-01).
 */
export function resolveSurfaceState({ loading, failed }: SurfaceStateInput): SurfaceState {
  if (loading) return 'loading';
  if (failed) return 'failed';
  return 'ready';
}

// ── A failed read ───────────────────────────────────────────────────────────

/** The eyebrow of a failure with no single subject — a whole page's one payload. */
export const READ_FAILURE_EYEBROW = 'Lettura fallita';

/** The default second sentence: what was not touched. */
export const READ_FAILURE_REASSURANCE =
  'Ricarica la pagina per riprovare. Nessun dato registrato è stato toccato.';

/** The label of the one action a failure can offer. */
export const RETRY_LABEL = 'Riprova';

export interface ReadFailureInput {
  /**
   * What could not be read, as the tile's eyebrow names it («Classi», «Rendimento»). Absent on
   * a failure that takes the verdict's place, where the page itself is the subject.
   */
  subject?: string;
  /**
   * What is missing because of it, in one sentence. REQUIRED, and deliberately so: a generic
   * fallback would have to guess the Italian agreement of a subject it does not know, and a
   * sentence that claims nothing is worse than no sentence at all. The caller knows what it lost.
   */
  consequence: string;
  /**
   * What was NOT touched, when the surface can name it more precisely than the default. This is
   * the sentence that stops a reader reaching for a backup.
   */
  untouched?: string;
  /** Whether the surface can actually re-run the query; without it no button is offered. */
  canRetry?: boolean;
}

export interface ReadFailureNotice {
  eyebrow: string;
  message: string;
  reassurance: string;
  /** `null` when the surface has nothing to retry — an action that does nothing is a lie. */
  retryLabel: string | null;
}

/** The two sentences every failed read speaks, in the product's own words. */
export function describeReadFailure({
  subject,
  consequence,
  untouched,
  canRetry = false,
}: ReadFailureInput): ReadFailureNotice {
  return {
    eyebrow: subject ? `${subject} · lettura fallita` : READ_FAILURE_EYEBROW,
    message: consequence,
    reassurance: untouched
      ? `Ricarica la pagina per riprovare. ${untouched}`
      : READ_FAILURE_REASSURANCE,
    retryLabel: canRetry ? RETRY_LABEL : null,
  };
}

const TIME_FORMAT = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const DAY_FORMAT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' });

/**
 * When the surface last held real figures — the footer of a failed read.
 *
 * `null` when there has never been a successful read: the clause disappears rather than
 * printing «mai» beside a failure, which reads as a second fault (the Narrative Honesty Rule).
 */
export function describeLastSuccessfulRead(at: Date | null, now: Date): string | null {
  if (!at) return null;

  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();

  const when = sameDay ? 'oggi' : DAY_FORMAT.format(at);
  return `Ultima lettura riuscita: ${when} alle ${TIME_FORMAT.format(at)}`;
}
