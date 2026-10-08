/**
 * The Anthropic model ids this app calls, in ONE place.
 *
 * Why a constants file for four string literals: the AI analysis modal used to print
 * «Generato da Claude Sonnet 4.6» as hand-written copy beside the report. A claim about the
 * tool typed into the copy outlives the tool the moment the route changes model — the same
 * failure as the landing's «6 classi di asset», which stayed on screen for ten days after the
 * union grew to eight. Any surface that NAMES the model reads it from here.
 *
 * ONE generation since 2026-10-08 (owner's decision): the three prose surfaces run on the
 * current Sonnet, the structured extraction on the current Haiku. Until then the performance
 * analysis sat on Sonnet 4.6 while the assistant and the emails had moved to Sonnet 5 — a
 * divergence the separate constants made visible, which is why they stay separate: a surface
 * that needs a different model changes its own line and leaves the others alone.
 *
 * WARNING (Checklist Comment): every call reads content blocks by `type` and sends
 * `thinking: { type: 'adaptive' }` with an `effort`; the memory extraction forces
 * `tool_choice`, which Haiku accepts and Sonnet 5.5 / Opus 5.5 refuse (400) — moving the
 * extraction up a tier means `tool_choice: 'auto'` plus `strict: true` on the tool.
 */

/** The performance report of Rendimenti → «Analizza con AI». */
export const PERFORMANCE_ANALYSIS_MODEL = 'claude-sonnet-5-5';

/** The conversational assistant. */
export const ASSISTANT_MODEL = 'claude-sonnet-5-5';

/** The prose of the monthly and weekly emails. */
export const EMAIL_ANALYSIS_MODEL = 'claude-sonnet-5-5';

/** Structured extraction (assistant memory): a small, fast model on purpose. */
export const MEMORY_EXTRACTION_MODEL = 'claude-haiku-5-5';
