import {
  AssistantGoalEvaluationResult,
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantMonthContextBundle,
  AssistantStructuredGoal,
} from '@/types/assistant';

interface SuggestionIdFactoryArgs {
  itemId: string;
}

const ASSET_CLASS_PATTERNS: Array<{ pattern: string; assetClass: NonNullable<AssistantStructuredGoal['assetClass']> }> = [
  { pattern: 'equity|azioni|azionari|azionario|stock', assetClass: 'equity' },
  { pattern: 'obbligazioni|obbligazionari|obbligazionario|bond|bonds', assetClass: 'bonds' },
  { pattern: 'crypto|cripto|criptovalute|bitcoin|ethereum', assetClass: 'crypto' },
  { pattern: 'cash|liquidita|liquidità|cassa', assetClass: 'cash' },
  { pattern: 'real estate|immobili|immobiliare', assetClass: 'realestate' },
  { pattern: 'commodity|commodities|materie prime|oro|metalli', assetClass: 'commodity' },
];

function normalizeGoalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericToken(rawValue: string, suffix?: string): number | null {
  const normalized = rawValue.replace(/\./g, '').replace(/,/g, '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (suffix === 'k') return parsed * 1_000;
  if (suffix === 'm') return parsed * 1_000_000;
  return parsed;
}

function findAssetClassInText(text: string): AssistantStructuredGoal['assetClass'] | undefined {
  const normalized = normalizeGoalText(text);
  for (const { pattern, assetClass } of ASSET_CLASS_PATTERNS) {
    const regex = new RegExp(`\\b(?:${pattern})\\b`, 'i');
    if (regex.test(normalized)) {
      return assetClass;
    }
  }
  return undefined;
}

/**
 * Parses a free-form goal text into a structured, auto-evaluable goal when the
 * wording matches one of the supported numeric patterns for v1.
 */
export function parseStructuredGoalFromText(text: string): AssistantStructuredGoal | undefined {
  const normalized = normalizeGoalText(text);

  const liquidNetWorthMatch =
    normalized.match(
      /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?(?:\s+di)?\s+(?:patrimonio liquido|patrimonio liquidabile|asset liquidi|patrimonio pronto alluso)/
    ) ??
    normalized.match(
      /(?:patrimonio liquido|patrimonio liquidabile|asset liquidi|patrimonio pronto alluso)\D*(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?/
    );
  if (liquidNetWorthMatch) {
    const targetValue = parseNumericToken(liquidNetWorthMatch[1], liquidNetWorthMatch[2]);
    if (targetValue !== null) {
      return {
        kind: 'liquid_net_worth_target',
        targetValue,
        unit: 'eur',
      };
    }
  }

  const liquidityMatch =
    normalized.match(
      /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?(?:\s+di)?\s+(?:liquidita|liquidità|cash|cassa)/
    ) ??
    normalized.match(
    /(?:liquidita|liquidità|cash|cassa)\D*(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?/
    );
  if (liquidityMatch) {
    const targetValue = parseNumericToken(liquidityMatch[1], liquidityMatch[2]);
    if (targetValue !== null) {
      return {
        kind: 'cash_target',
        targetValue,
        unit: 'eur',
      };
    }
  }

  const netWorthMatch =
    normalized.match(
      /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?(?:\s+di)?\s+(?:patrimonio(?: netto)?|net worth)/
    ) ??
    normalized.match(
    /(?:patrimonio(?: netto)?|net worth)\D*(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?/
    );
  if (netWorthMatch) {
    const targetValue = parseNumericToken(netWorthMatch[1], netWorthMatch[2]);
    if (targetValue !== null) {
      return {
        kind: 'net_worth_target',
        targetValue,
        unit: 'eur',
      };
    }
  }

  const assetClassPctMatch = normalized.match(
    /(?:allocazione|peso|percentuale)\s+([a-z]+)\D*(\d+(?:\.\d+)?)\s*%/
  );
  if (assetClassPctMatch) {
    return {
      kind: 'asset_class_percentage_target',
      assetClass: findAssetClassInText(assetClassPctMatch[1]) ?? assetClassPctMatch[1],
      targetValue: Number(assetClassPctMatch[2]),
      unit: 'percent',
    };
  }

  for (const { pattern, assetClass } of ASSET_CLASS_PATTERNS) {
    const assetClassValueMatch =
      normalized.match(
        new RegExp(`(?:${pattern})\\s*(?:a|da|di|sopra|oltre)?\\s*(\\d+(?:\\.\\d+)?)\\s*(k|m)?\\s*(?:€|eur)?`, 'i')
      ) ??
      normalized.match(
        new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(k|m)?\\s*(?:€|eur)?\\s+(?:investiti\\s+in|in)\\s+(?:${pattern})`, 'i')
      ) ??
      normalized.match(
        new RegExp(`(?:portare|raggiungere|avere)\\s+(?:gli\\s+)?(?:investimenti\\s+)?(?:in\\s+)?(?:${pattern})\\s+(?:a|da|di|sopra|oltre)\\s*(\\d+(?:\\.\\d+)?)\\s*(k|m)?\\s*(?:€|eur)?`, 'i')
      );

    if (assetClassValueMatch) {
      const targetValue = parseNumericToken(assetClassValueMatch[1], assetClassValueMatch[2]);
      if (targetValue !== null) {
        return {
          kind: 'asset_class_value_target',
          assetClass,
          targetValue,
          unit: 'eur',
        };
      }
    }
  }

  const subCategoryValueMatch = normalized.match(
    /([a-z][a-z0-9 ]{2,})\s+(?:a|da|di|sopra|oltre)\s+(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:€|eur)?/
  );
  if (subCategoryValueMatch && /(usa|europa|emergenti|conto|pensione|etf|azioni)/.test(subCategoryValueMatch[1])) {
    const targetValue = parseNumericToken(subCategoryValueMatch[2], subCategoryValueMatch[3]);
    if (targetValue !== null) {
      return {
        kind: 'sub_category_value_target',
        subCategory: subCategoryValueMatch[1].trim(),
        targetValue,
        unit: 'eur',
      };
    }
  }

  return undefined;
}

function normalizeAssetClass(input: string): string | undefined {
  return findAssetClassInText(input);
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Evaluates one structured goal against the authoritative current portfolio bundle.
 * Missing data returns null so callers can skip suggestion generation safely.
 */
export function evaluateStructuredGoal(
  goal: AssistantStructuredGoal,
  bundle: AssistantMonthContextBundle
): AssistantGoalEvaluationResult | null {
  const snapshot = bundle.currentSnapshot;
  if (!snapshot) return null;

  if (goal.kind === 'cash_target') {
    const metricValue = roundMetric(snapshot.byAssetClass?.cash ?? 0);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'eur',
      evaluatedAgainst: 'cash',
      summary: `Cash attuale ${metricValue.toFixed(0)} EUR su target ${goal.targetValue.toFixed(0)} EUR`,
    };
  }

  if (goal.kind === 'liquid_net_worth_target') {
    const metricValue = roundMetric(snapshot.liquidNetWorth ?? 0);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'eur',
      evaluatedAgainst: 'liquid_net_worth',
      summary: `Patrimonio liquido attuale ${metricValue.toFixed(0)} EUR su target ${goal.targetValue.toFixed(0)} EUR`,
    };
  }

  if (goal.kind === 'net_worth_target') {
    const metricValue = roundMetric(snapshot.totalNetWorth ?? 0);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'eur',
      evaluatedAgainst: 'total_net_worth',
      summary: `Patrimonio attuale ${metricValue.toFixed(0)} EUR su target ${goal.targetValue.toFixed(0)} EUR`,
    };
  }

  if (goal.kind === 'asset_class_value_target') {
    if (!goal.assetClass) return null;
    const metricValue = roundMetric(snapshot.byAssetClass?.[goal.assetClass] ?? 0);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'eur',
      evaluatedAgainst: 'asset_class_value',
      summary: `Classe ${goal.assetClass} attuale ${metricValue.toFixed(0)} EUR su target ${goal.targetValue.toFixed(0)} EUR`,
    };
  }

  if (goal.kind === 'sub_category_value_target') {
    if (!goal.subCategory) return null;
    const match = Object.values(bundle.bySubCategoryAllocation ?? {}).reduce((sum, subCats) => {
      const found = Object.entries(subCats).find(
        ([name]) => normalizeGoalText(name) === normalizeGoalText(goal.subCategory!)
      );
      return sum + (found?.[1] ?? 0);
    }, 0);
    const metricValue = roundMetric(match);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'eur',
      evaluatedAgainst: 'sub_category_value',
      summary: `Sottocategoria ${goal.subCategory} attuale ${metricValue.toFixed(0)} EUR su target ${goal.targetValue.toFixed(0)} EUR`,
    };
  }

  if (goal.kind === 'asset_class_percentage_target') {
    if (!goal.assetClass || snapshot.totalNetWorth <= 0) return null;
    const value = snapshot.byAssetClass?.[goal.assetClass] ?? 0;
    const metricValue = roundMetric((value / snapshot.totalNetWorth) * 100);
    return {
      matched: metricValue >= goal.targetValue,
      metricValue,
      targetValue: goal.targetValue,
      unit: 'percent',
      evaluatedAgainst: 'asset_class_percentage',
      summary: `Allocazione ${goal.assetClass} attuale ${metricValue.toFixed(2)}% su target ${goal.targetValue.toFixed(2)}%`,
    };
  }

  return null;
}

/**
 * Builds completion suggestions for all active structured goals that now match
 * the current authoritative bundle. Existing pending suggestions are preserved.
 */
export function buildGoalCompletionSuggestions(
  userId: string,
  items: AssistantMemoryItem[],
  bundle: AssistantMonthContextBundle,
  existingSuggestions: AssistantMemorySuggestion[],
  createSuggestionId: (args: SuggestionIdFactoryArgs) => string
): AssistantMemorySuggestion[] {
  const pendingByItemId = new Map(
    existingSuggestions
      .filter((suggestion) => suggestion.status === 'pending')
      .map((suggestion) => [suggestion.itemId, suggestion])
  );

  const newSuggestions = items.flatMap((item) => {
    if (item.category !== 'goal' || item.status !== 'active' || !item.structuredGoal) {
      return [];
    }

    const evaluation = evaluateStructuredGoal(item.structuredGoal, bundle);
    if (!evaluation?.matched) {
      return [];
    }

    if (pendingByItemId.has(item.id)) {
      return [];
    }

    return [{
      id: createSuggestionId({ itemId: item.id }),
      userId,
      itemId: item.id,
      type: 'complete_goal' as const,
      status: 'pending' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      evidenceSummary: evaluation.summary,
      evaluation,
    }];
  });

  return newSuggestions;
}
