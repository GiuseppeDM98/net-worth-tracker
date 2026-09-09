/**
 * Scheduled and on-demand re-evaluation of the assistant's structured goals.
 *
 * This is the one place that decides WHICH period a goal is measured against, and
 * the answer is always the same: the current month. Evaluation used to piggyback
 * on whatever bundle the chat request happened to build, so asking about March
 * 2023 evaluated every goal against March 2023 — and a chat with no period
 * context evaluated nothing at all.
 *
 * Two callers:
 * - the chat turn (`extractAndSaveMemory`), which passes the items it has just
 *   extracted so the whole turn stays inside ONE Firestore transaction;
 * - the daily cron, which is what makes a goal reached "by itself" (the market
 *   moved) surface without anyone opening the assistant.
 */

import {
  AssistantMemoryItem,
  AssistantStructuredGoal,
} from '@/types/assistant';
import { buildAssistantMonthContext } from '@/lib/services/assistantMonthContextService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import {
  AssistantMemoryMutation,
  applyAssistantMemoryMutations,
  getAssistantMemoryDocument,
} from './store';
import { buildGoalCompletionSuggestions, evaluateStructuredGoal } from './goalEvaluation';

/**
 * Suggestion ids are deterministic per goal: one goal never accumulates a pile of
 * suggestions across re-evaluations. Durability of an "Ignora" therefore depends
 * on the status guard in `buildGoalCompletionSuggestions`, not on the id.
 */
function buildGoalSuggestionId({ itemId }: { itemId: string }): string {
  return `goal_suggestion_${itemId}`;
}

export interface GoalEvaluationRunResult {
  /** Goals whose metric could be computed and whose evaluation was persisted. */
  evaluatedGoals: number;
  /** Completion suggestions emitted by this run. */
  suggestionsCreated: number;
  /** Set when nothing was evaluated, and why — the cron reports these as skips. */
  skippedReason?: 'memory_disabled' | 'no_active_goals' | 'no_snapshot';
}

interface EvaluateActiveGoalsOptions {
  /**
   * Items extracted in this same turn and not yet persisted. They are evaluated
   * together with the stored ones and written by the same transaction, so a chat
   * turn costs one transaction instead of two.
   */
  pendingItems?: AssistantMemoryItem[];
  now?: Date;
}

function isTrackableGoal(
  item: AssistantMemoryItem
): item is AssistantMemoryItem & { structuredGoal: AssistantStructuredGoal } {
  return item.category === 'goal' && item.status === 'active' && Boolean(item.structuredGoal);
}

/**
 * Evaluates every active structured goal of one user against the current month
 * and persists the outcome (evaluation stamps + completion suggestions) in a
 * single transaction.
 *
 * Never throws for business reasons: a user with memory off, without goals, or
 * without a snapshot for the current month returns a `skippedReason`. Infrastructure
 * failures do propagate — callers run this fire-and-forget or inside a per-user
 * try/catch.
 */
export async function evaluateActiveGoals(
  userId: string,
  options: EvaluateActiveGoalsOptions = {}
): Promise<GoalEvaluationRunResult> {
  const { pendingItems = [], now = new Date() } = options;

  const memory = await getAssistantMemoryDocument(userId);

  // Respect the user's memoryEnabled toggle — no evaluation, and nothing written
  if (!memory.preferences.memoryEnabled) {
    return { evaluatedGoals: 0, suggestionsCreated: 0, skippedReason: 'memory_disabled' };
  }

  const mutations: AssistantMemoryMutation[] = pendingItems.map((item) => ({ kind: 'item', item }));
  const goals = [...memory.items, ...pendingItems].filter(isTrackableGoal);

  if (goals.length === 0) {
    // Still persist whatever the caller handed over — it just has nothing to evaluate.
    if (mutations.length > 0) await applyAssistantMemoryMutations(userId, mutations);
    return { evaluatedGoals: 0, suggestionsCreated: 0, skippedReason: 'no_active_goals' };
  }

  // The period selector is derived here, never taken from the caller: the whole
  // point of this function is that a goal is measured against today.
  const { year, month } = getItalyMonthYear(now);
  const bundle = await buildAssistantMonthContext(
    userId,
    { year, month },
    memory.preferences.includeDummySnapshots
  );

  if (!bundle.currentSnapshot) {
    if (mutations.length > 0) await applyAssistantMemoryMutations(userId, mutations);
    return { evaluatedGoals: 0, suggestionsCreated: 0, skippedReason: 'no_snapshot' };
  }

  let evaluatedGoals = 0;
  // Suggestions accumulate as we go: two goals cannot both emit for the same item,
  // and a suggestion emitted in this run must block the next goal's re-emission.
  let suggestionsSoFar = memory.suggestions;

  for (const goal of goals) {
    const evaluation = evaluateStructuredGoal(goal.structuredGoal, bundle, now);
    if (!evaluation) continue;

    evaluatedGoals += 1;
    mutations.push({
      kind: 'item',
      item: { ...goal, lastEvaluationAt: now, lastEvaluationResult: evaluation },
    });

    const [suggestion] = buildGoalCompletionSuggestions(
      userId,
      [goal],
      bundle,
      suggestionsSoFar,
      buildGoalSuggestionId,
      now
    );

    if (suggestion) {
      mutations.push({ kind: 'suggestion', suggestion });
      suggestionsSoFar = [suggestion, ...suggestionsSoFar];
    }
  }

  const suggestionsCreated = mutations.filter((mutation) => mutation.kind === 'suggestion').length;

  if (mutations.length > 0) {
    await applyAssistantMemoryMutations(userId, mutations);
  }

  return { evaluatedGoals, suggestionsCreated };
}
