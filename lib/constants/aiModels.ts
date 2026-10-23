/**
 * The Anthropic model ids this app calls, in ONE place.
 *
 * Why a constants file for four string literals: the AI analysis modal used to print
 * «Generato da Claude Sonnet 4.6» as hand-written copy beside the report. A claim about the
 * tool typed into the copy outlives the tool the moment the route changes model — the same
 * failure as the landing's «6 classi di asset», which stayed on screen for ten days after the
 * union grew to eight. Any surface that NAMES the model reads it from here — or, since the
 * server-side fallback, from the response that says which model answered.
 *
 * ONE generation since 2026-10-08 (owner's decision): the three prose surfaces run on the
 * current Sonnet, the structured extraction on the current Haiku. Until then the performance
 * analysis sat on Sonnet 4.6 while the assistant and the emails had moved to Sonnet 5 — a
 * divergence the separate constants made visible, which is why they stay separate: a surface
 * that needs a different model changes its own line and leaves the others alone.
 *
 * WARNING (Checklist Comment): every call reads content blocks by `type`; the three prose
 * surfaces send `thinking: { type: 'adaptive' }` with an `effort` (`high`, Sonnet 5.5's default,
 * kept without an effort sweep: owner's decision of 2026-10-23), the memory
 * extraction sends neither and forces `tool_choice` — Haiku 5.5 accepts it and then skips
 * thinking, so its `max_tokens` holds the tool input alone; Sonnet 5.5 / Opus 5.5 refuse a forced
 * `tool_choice` (400), so moving the extraction up a tier means `tool_choice: 'auto'` plus
 * `strict: true` on the tool and room for thinking in `max_tokens`. A Sonnet 5.5
 * decline is an HTTP 200 with `stop_reason: 'refusal'` and often no text. Every Sonnet call opts
 * into the server-side fallback (`SERVER_SIDE_FALLBACK_BETA` below, 2026-10-12), which rescues
 * only some declines, so every prose surface still reads `stop_reason` and says so — the
 * assistant (`REFUSAL_NOTICE`), Rendimenti's analysis (an `{ error }` before `[DONE]`, for a
 * refusal and for a `max_tokens` cut alike) — and the emails drop any comment that did not end on
 * `end_turn`. A new surface on these models owes the same branch.
 */

/**
 * The beta that opts a Sonnet 5.5 request into the server-side fallback, sent beside
 * `fallbacks: 'default'` on `anthropic.beta.messages` (owner's decision, 2026-10-12; sdk ≥ 0.115
 * types the `'default'` form). On a policy decline the API re-runs the SAME request on the model
 * Anthropic routes that refusal category to, inside the same call: for Sonnet 5.5 the `cyber` and
 * `frontier_llm` declines go to Sonnet 5; `bio`, `reasoning_extraction` and `general_harms` stay
 * declined — hence the refusal branch above. The response's `model` (on a stream, `message_start`
 * and the `fallback` content block) names the model that answered, so a surface that prints the
 * model prints that one. Claude API only (not Bedrock, Vertex or Foundry); never on the Haiku
 * extraction — Haiku 5.5 has no server-side fallback.
 */
export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** The performance report of Rendimenti → «Analizza con AI». */
export const PERFORMANCE_ANALYSIS_MODEL = 'claude-sonnet-5-5';

/** The conversational assistant. */
export const ASSISTANT_MODEL = 'claude-sonnet-5-5';

/** The prose of the monthly and weekly emails. */
export const EMAIL_ANALYSIS_MODEL = 'claude-sonnet-5-5';

/** Structured extraction (assistant memory): a small, fast model on purpose. */
export const MEMORY_EXTRACTION_MODEL = 'claude-haiku-5-5';

/**
 * The Consulente of the Allocazione page (2026-10-20, owner's decision): the strategy and the
 * final review on the current Opus — «le cose più difficili e importanti» — and the instrument
 * search, which is reading and verifying listings with web search, on the current Sonnet. Both
 * opt into the server-side fallback (`SERVER_SIDE_FALLBACK_BETA`), both read `stop_reason`.
 */
export const ALLOCATION_ADVICE_STRATEGY_MODEL = 'claude-opus-5-5';
export const ALLOCATION_ADVICE_INSTRUMENTS_MODEL = 'claude-sonnet-5-5';

/**
 * The effort of each Consulente model. Opus 5.5 defaults to `medium`, thinks more per turn than
 * Opus 5 at the same level, and at `medium` matches Opus 5 at `high` on long analyses with fewer
 * tokens; the strategy took 210 s of a 300 s function at `high`. The search stays on Sonnet 5.5's
 * default `high` (owner, 2026-10-23: no effort sweep). Lower effort, not prose, is the lever for
 * less thinking.
 */
export const ALLOCATION_ADVICE_STRATEGY_EFFORT = 'medium' as const;
export const ALLOCATION_ADVICE_INSTRUMENTS_EFFORT = 'high' as const;
