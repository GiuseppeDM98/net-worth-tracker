/**
 * The Anthropic model ids this app calls, in ONE place.
 *
 * Why a constants file for four string literals: the AI analysis modal used to print
 * «Generato da Claude Sonnet 4.6» as hand-written copy beside the report. A claim about the
 * tool typed into the copy outlives the tool the moment the route changes model — the same
 * failure as the landing's «6 classi di asset», which stayed on screen for ten days after the
 * union grew to eight. Any surface that NAMES the model reads it from here.
 *
 * WARNING (Checklist Comment): these four ids are not all the same generation, and that is
 * currently a fact rather than an intention — the performance analysis runs on Sonnet 4.6
 * while the assistant and the periodic emails run on Sonnet 5. Changing one is a product
 * decision (cost and output change with it), so they are listed separately rather than
 * collapsed into one constant that would hide the divergence.
 */

/** The performance report of Rendimenti → «Analizza con AI». */
export const PERFORMANCE_ANALYSIS_MODEL = 'claude-sonnet-4-6';

/** The conversational assistant. */
export const ASSISTANT_MODEL = 'claude-sonnet-5';

/** The prose of the monthly and weekly emails. */
export const EMAIL_ANALYSIS_MODEL = 'claude-sonnet-5';

/** Structured extraction (assistant memory): a small, fast model on purpose. */
export const MEMORY_EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';
