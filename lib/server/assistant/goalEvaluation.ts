/**
 * Pure evaluation layer for the assistant's structured goals.
 *
 * Two rules govern this file and are the reason the previous version never
 * completed a goal in practice:
 *
 * 1. **Structure never comes from text here.** A goal arrives already structured
 *    from the Haiku extraction tool (`memoryExtraction.ts`). The Italian regex
 *    cascade that used to live here is gone: it silently produced `undefined`
 *    for most real phrasings, so the goal was never evaluated at all.
 * 2. **A goal has a direction.** `at_least` completes on `metric >= target`,
 *    `at_most` on `metric <= target`. Without it, "porta la liquidità sotto il
 *    10%" was reported as already achieved the moment it was written down.
 *
 * The bundle passed in must be the CURRENT month's — that is the caller's
 * responsibility (`goalEvaluationService.ts`), not something this file can check.
 */

import {
  AssistantGoalEvaluationResult,
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantMonthContextBundle,
  AssistantStructuredGoal,
} from '@/types/assistant';
import { formatCurrency } from '@/lib/utils/formatters';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

interface SuggestionIdFactoryArgs {
  itemId: string;
}

/** One metric read off the bundle, ready to be compared with a target. */
interface GoalMetric {
  value: number;
  evaluatedAgainst: AssistantGoalEvaluationResult['evaluatedAgainst'];
  /** Italian subject of the summary sentence, e.g. "Liquidità", "Classe equity". */
  label: string;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Loose comparison key for a subcategory name: the user says "azioni usa", the
 * asset is filed as "Azioni USA". Case and spacing only — nothing that could
 * merge two genuinely different subcategories.
 */
function normalizeSubCategoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Sums a subcategory's value across every asset class in the bundle. A user
 * naming a subcategory does not know (or care) which class it sits under.
 */
function sumSubCategoryValue(bundle: AssistantMonthContextBundle, subCategory: string): number {
  const wanted = normalizeSubCategoryName(subCategory);

  return Object.values(bundle.bySubCategoryAllocation ?? {}).reduce((sum, subCategories) => {
    const found = Object.entries(subCategories).find(
      ([name]) => normalizeSubCategoryName(name) === wanted
    );
    return sum + (found?.[1] ?? 0);
  }, 0);
}

/**
 * Reads the metric a goal is measured on out of the bundle.
 *
 * Returns null when the metric cannot be computed at all — no snapshot, a goal
 * missing the asset class or subcategory it refers to, a percentage goal on a
 * zero portfolio. Callers must treat null as "not evaluated", never as "not met".
 */
function resolveGoalMetric(
  goal: AssistantStructuredGoal,
  bundle: AssistantMonthContextBundle
): GoalMetric | null {
  const snapshot = bundle.currentSnapshot;
  if (!snapshot) return null;

  switch (goal.kind) {
    case 'cash_target':
      return {
        value: roundMetric(snapshot.byAssetClass?.cash ?? 0),
        evaluatedAgainst: 'cash',
        label: 'Liquidità',
      };

    case 'liquid_net_worth_target':
      return {
        value: roundMetric(snapshot.liquidNetWorth ?? 0),
        evaluatedAgainst: 'liquid_net_worth',
        label: 'Patrimonio liquido',
      };

    case 'net_worth_target':
      return {
        value: roundMetric(snapshot.totalNetWorth ?? 0),
        evaluatedAgainst: 'total_net_worth',
        label: 'Patrimonio',
      };

    case 'asset_class_value_target':
      if (!goal.assetClass) return null;
      return {
        value: roundMetric(snapshot.byAssetClass?.[goal.assetClass] ?? 0),
        evaluatedAgainst: 'asset_class_value',
        label: `Classe ${ASSET_CLASS_LABELS[goal.assetClass] ?? goal.assetClass}`,
      };

    case 'asset_class_percentage_target': {
      if (!goal.assetClass || snapshot.totalNetWorth <= 0) return null;
      const value = snapshot.byAssetClass?.[goal.assetClass] ?? 0;
      return {
        value: roundMetric((value / snapshot.totalNetWorth) * 100),
        evaluatedAgainst: 'asset_class_percentage',
        label: `Allocazione ${ASSET_CLASS_LABELS[goal.assetClass] ?? goal.assetClass}`,
      };
    }

    case 'sub_category_value_target':
      if (!goal.subCategory) return null;
      return {
        value: roundMetric(sumSubCategoryValue(bundle, goal.subCategory)),
        evaluatedAgainst: 'sub_category_value',
        label: `Sottocategoria ${goal.subCategory}`,
      };

    default:
      return null;
  }
}

function formatGoalValue(value: number, unit: AssistantStructuredGoal['unit']): string {
  return unit === 'percent' ? `${value.toFixed(2)}%` : formatCurrency(value, 'EUR', 0);
}

/**
 * True when the goal carried a deadline and today (Italian wall clock) is past
 * it. ISO dates compare correctly as strings, which is why the format is fixed.
 */
function isDeadlinePassed(deadlineIso: string | undefined, now: Date): boolean {
  if (!deadlineIso) return false;
  return getItalyDateIso(now) > deadlineIso;
}

/**
 * Evaluates one structured goal against a context bundle.
 *
 * The caller must pass the CURRENT month's bundle: evaluating against the period
 * the user happens to be reading would answer "did you hit this target in March
 * 2023", which is never the question a goal asks.
 *
 * A passed deadline does not change `matched` — an objective reached late is
 * still reached. It only shows up in the summary, so the banner can say so.
 *
 * Returns null when the metric is not computable (missing snapshot or missing
 * goal operand), so callers can skip suggestion generation safely.
 */
export function evaluateStructuredGoal(
  goal: AssistantStructuredGoal,
  bundle: AssistantMonthContextBundle,
  now: Date = new Date()
): AssistantGoalEvaluationResult | null {
  const metric = resolveGoalMetric(goal, bundle);
  if (!metric) return null;

  // Goals stored before the structured-goals rework have no direction: '>=' was the only semantics they had.
  const direction = goal.direction ?? 'at_least';
  const matched =
    direction === 'at_least' ? metric.value >= goal.targetValue : metric.value <= goal.targetValue;
  const deadlinePassed = isDeadlinePassed(goal.deadlineIso, now);

  const comparison = direction === 'at_least' ? 'target minimo' : 'tetto massimo';
  const summary =
    `${metric.label}: ${formatGoalValue(metric.value, goal.unit)} su ${comparison} ` +
    `${formatGoalValue(goal.targetValue, goal.unit)}` +
    (deadlinePassed && !matched ? ' — scadenza superata' : '');

  return {
    matched,
    metricValue: metric.value,
    targetValue: goal.targetValue,
    unit: goal.unit,
    evaluatedAgainst: metric.evaluatedAgainst,
    evaluatedPeriod: { year: bundle.selector.year, month: bundle.selector.month },
    deadlinePassed,
    summary,
  };
}

/**
 * True when an existing suggestion still speaks for a goal, so a new one must
 * not be emitted.
 *
 * `pending` blocks because the banner is already showing it. `ignored` blocks
 * because the user said no — previously only `pending` was checked, so every
 * re-evaluation overwrote the ignored suggestion back to `pending` and the
 * banner returned forever.
 *
 * The block lifts when the goal itself was edited afterwards (`item.updatedAt >
 * suggestion.updatedAt`): the user changed what they are aiming at, so the old
 * decision no longer applies. This is why `mergeMemoryItem` keeps `updatedAt` on
 * the last CONTENT change — if a daily re-evaluation bumped it, every ignore
 * would expire on the next cron run.
 */
function isSuggestionStillBinding(
  suggestion: AssistantMemorySuggestion,
  item: AssistantMemoryItem
): boolean {
  if (suggestion.status !== 'pending' && suggestion.status !== 'ignored') return false;
  return item.updatedAt.getTime() <= suggestion.updatedAt.getTime();
}

/**
 * Builds completion suggestions for the active structured goals that the bundle
 * now satisfies. Goals with no `structuredGoal` are skipped entirely: they are
 * not auto-trackable and the memory panel says so rather than pretending.
 */
export function buildGoalCompletionSuggestions(
  userId: string,
  items: AssistantMemoryItem[],
  bundle: AssistantMonthContextBundle,
  existingSuggestions: AssistantMemorySuggestion[],
  createSuggestionId: (args: SuggestionIdFactoryArgs) => string,
  now: Date = new Date()
): AssistantMemorySuggestion[] {
  const suggestionsByItemId = new Map(
    existingSuggestions.map((suggestion) => [suggestion.itemId, suggestion])
  );

  return items.flatMap((item) => {
    if (item.category !== 'goal' || item.status !== 'active' || !item.structuredGoal) {
      return [];
    }

    const evaluation = evaluateStructuredGoal(item.structuredGoal, bundle, now);
    if (!evaluation?.matched) {
      return [];
    }

    const existing = suggestionsByItemId.get(item.id);
    if (existing && isSuggestionStillBinding(existing, item)) {
      return [];
    }

    return [{
      id: createSuggestionId({ itemId: item.id }),
      userId,
      itemId: item.id,
      type: 'complete_goal' as const,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      evidenceSummary: evaluation.summary,
      evaluation,
    }];
  });
}
