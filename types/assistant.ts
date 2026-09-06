// WARNING: If you add a mode here, also update:
// - AssistantComposer.tsx (mode selector options) — skip for email-only modes
// - anthropicStream.ts (buildPrompt routing, isStructured/isStructuredAnalysis arrays)
// - prompts.ts (add prompt builder, getPeriodLabel)
// - assistantMonthContextService.ts (context builder)
// - webSearchPolicy.ts (STRUCTURED_ANALYSIS_MODES)
// - store.ts (getDefaultThreadTitle)
// - assistantFollowUps.ts (CURATED_FOLLOW_UPS, a Record<AssistantMode, ...>)
export type AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat';

export interface AssistantPromptChip {
  id: string;
  label: string;
  prompt: string;
  mode: AssistantMode;
  requiresMonthContext: boolean;
  webContextHint?: 'none' | 'optional' | 'macro';
}

export interface AssistantMonthSelectorValue {
  year: number;
  month: number;
}

export interface AssistantPreferences {
  responseStyle: 'balanced' | 'concise' | 'deep';
  includeMacroContext: boolean;
  memoryEnabled: boolean;
  // When enabled, dummy (test fixture) snapshots are included in context bundles.
  // Off by default — intended for test accounts only.
  includeDummySnapshots: boolean;
}

export interface AssistantThread {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessagePreview: string;
  messageCount: number;
  mode: AssistantMode;
  pinnedMonth?: AssistantMonthSelectorValue | null;
  // Used for year_analysis threads to identify which year is pinned.
  // null for all other modes.
  pinnedYear?: number | null;
}

export interface AssistantMessage {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  mode: AssistantMode;
  monthContext?: AssistantMonthSelectorValue | null;
  webSearchUsed?: boolean;
}

export interface AssistantMemoryItem {
  id: string;
  userId: string;
  category: 'goal' | 'preference' | 'risk' | 'fact';
  text: string;
  structuredGoal?: AssistantStructuredGoal;
  sourceThreadId?: string;
  sourceMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  derivedFromContext?: boolean;
  evidenceSummary?: string;
  lastEvaluationAt?: Date;
  lastEvaluationResult?: AssistantGoalEvaluationResult;
  status: 'active' | 'completed' | 'archived';
}

export type AssistantStructuredGoalKind =
  | 'cash_target'
  | 'liquid_net_worth_target'
  | 'net_worth_target'
  | 'asset_class_value_target'
  | 'sub_category_value_target'
  | 'asset_class_percentage_target';

/**
 * The machine-evaluable half of a memory goal. Produced by the Haiku extraction
 * tool (never parsed from free text) and evaluated against the CURRENT month.
 *
 * A goal without this object is legitimate — it is simply not auto-trackable,
 * and the memory panel says so rather than leaving it indistinguishable from a
 * goal that is one euro short.
 */
export interface AssistantStructuredGoal {
  kind: AssistantStructuredGoalKind;
  targetValue: number;
  // Derived from `kind`, never asked of the model: only the percentage kind is 'percent'.
  unit: 'eur' | 'percent';
  // Which side of the target satisfies the goal. Optional for backwards compatibility:
  // legacy goals stored without one read as 'at_least', the only semantics the old >= had.
  direction?: 'at_least' | 'at_most';
  assetClass?: import('@/types/assets').AssetClass;
  subCategory?: string;
  // YYYY-MM-DD. A passed deadline never changes whether the goal is matched —
  // it only makes the evaluation summary say so.
  deadlineIso?: string;
}

export interface AssistantGoalEvaluationResult {
  matched: boolean;
  metricValue: number | null;
  targetValue: number;
  unit: 'eur' | 'percent';
  evaluatedAgainst: 'cash' | 'liquid_net_worth' | 'total_net_worth' | 'asset_class_value' | 'sub_category_value' | 'asset_class_percentage';
  // Which period the metric was read from — the evaluation is always run against
  // the current month, never the period the user happened to be looking at.
  evaluatedPeriod?: { year: number; month: number };
  deadlinePassed?: boolean;
  summary: string;
}

export interface AssistantMemorySuggestion {
  id: string;
  userId: string;
  itemId: string;
  type: 'complete_goal';
  status: 'pending' | 'ignored' | 'accepted';
  createdAt: Date;
  updatedAt: Date;
  evidenceSummary: string;
  evaluation: AssistantGoalEvaluationResult;
}

export interface AssistantThreadDetail {
  thread: AssistantThread;
  messages: AssistantMessage[];
}

export interface AssistantMemoryDocument {
  preferences: AssistantPreferences;
  items: AssistantMemoryItem[];
  suggestions: AssistantMemorySuggestion[];
  updatedAt: Date | null;
  // Computed server-side, GET only (queries monthly-snapshots — store.ts's write
  // helpers have no way to know this). Absent, never fabricated as `false`, on
  // documents returned from PATCH/DELETE. Used to conditionally show the
  // "Snapshot di test" toggle in the UI.
  hasDummySnapshots?: boolean;
}

export interface AssistantThreadsResponse {
  threads: AssistantThread[];
}

// Extends the memory document with computed fields returned only by the GET endpoint.
// hasDummySnapshots is computed server-side to conditionally show the test toggle in the UI.
export interface AssistantMemoryResponse extends AssistantMemoryDocument {
  hasDummySnapshots: boolean;
}

// The GET endpoint returns the thread detail as-is; the alias keeps the wire type nameable.
export type AssistantThreadResponse = AssistantThreadDetail;

export interface AssistantCreateThreadInput {
  userId: string;
  mode?: AssistantMode;
  pinnedMonth?: AssistantMonthSelectorValue | null;
  // Used for year_analysis threads
  pinnedYear?: number | null;
}

// Full numeric context bundle for a selected period, built server-side.
// Client sends the period selector; server regenerates this from Firestore — never trust client-supplied numbers.
//
// The `selector.month` field encodes the period type:
//   month > 0  → monthly analysis (standard)
//   month === 0 → full-year analysis (pinnedYear = selector.year)
//   month === -1 → YTD (Jan 1 → latest month of current year)
//   month === -2 → total history (from cashflowHistoryStartYear → now)
export interface AssistantMonthContextBundle {
  selector: { year: number; month: number };
  currentSnapshot: import('@/types/assets').MonthlySnapshot | null;
  previousSnapshot: import('@/types/assets').MonthlySnapshot | null;
  // Shape matches CashflowBreakdown['totals'] exactly — the service spreads it across.
  cashflow: {
    totalIncome: number;
    totalExpenses: number;
    totalDividends: number;
    netCashFlow: number;
    transactionCount: number; // rows that fed the totals (transfers excluded)
    expenseTransactionCount: number; // rows classified as spending
  };
  netWorth: {
    start: number | null;
    end: number | null;
    delta: number | null;
    deltaPct: number | null;
  };
  allocationChanges: {
    assetClass: string;
    previousValue: number | null;
    currentValue: number | null;
    absoluteChange: number;
    percentagePointsChange: number | null;
  }[];
  // EXHAUSTIVE spending tree for the period: every category, every subcategory used.
  // Replaced a top-5 flat list that made the assistant answer "N/D" on subcategories
  // sitting in Firestore all along — a model cannot tell "missing from my data" from
  // "missing from the world" unless the data block says which one it is.
  expensesByCategory: import('@/types/expenses').ExpenseCategoryBreakdown[];
  // Income per category, dividends excluded (they are already in cashflow.totalDividends,
  // so leaving them out keeps Σ incomeByCategory === cashflow.totalIncome).
  incomeByCategory: import('@/types/expenses').IncomeCategoryBreakdown[];
  // Fisse / Variabili / Debiti (plus a "Non classificate" bucket for typeless legacy rows).
  expensesByType: {
    type: import('@/types/expenses').ExpenseBreakdownType;
    label: string;
    total: number; // negative
  }[];
  // Largest individual expenses; the count scales with the period length. Carries
  // subcategory, note and date so Claude can attribute a spike to a specific event.
  topIndividualExpenses: import('@/types/expenses').IndividualExpenseRow[];
  // Sub-category breakdown within each asset class, built from live asset records.
  // Only populated when assets have subCategory set; empty object when no breakdown exists.
  // Claude uses this to cite specific sub-allocations (e.g. "Azioni USA €42.000").
  bySubCategoryAllocation: {
    [assetClass: string]: {
      [subCategory: string]: number; // EUR value from snapshot
    };
  };
  // Target allocation the app itself is measuring against.
  // null when the user has not configured any targets.
  // subTargets percentages are relative to the asset class (not total portfolio):
  //   e.g. equity 60% total, US Stocks 70% of equity → 42% of portfolio.
  targetAllocation: {
    [assetClass: string]: {
      targetPercentage: number; // % of total portfolio
      subTargets?: { [subCategory: string]: number }; // % relative to this asset class
    };
  } | null;
  // Where targetAllocation came from. With goalDrivenAllocationEnabled on, the
  // Allocazione page overrides the manual targets with ones derived from the goals,
  // so reporting the manual numbers would have the assistant reasoning about targets
  // the app stopped using. Stated in the prompt so Claude can name the source.
  targetAllocationSource: 'manual' | 'goal_driven';
  // Goal-Based Investing (goalBasedInvesting/{userId}) — a DIFFERENT thing from the
  // assistant's own memory goals (AssistantMemoryItem.category === 'goal').
  // null when the feature is off or the user has no goal document at all.
  goals: {
    enabled: boolean; // settings.goalBasedInvestingEnabled
    goalDrivenAllocationEnabled: boolean;
    // EXHAUSTIVE: every configured goal, never a top-N.
    items: {
      name: string;
      targetAmount?: number;
      targetDateIso?: string;
      priority: import('@/types/goals').GoalPriority;
      currentValue: number; // assigned portfolio value, composite assets included
      monthlyContribution?: number;
      recommendedAllocation?: Partial<Record<import('@/types/assets').AssetClass, number>>;
      // Trajectory verdict; absent when it is not computable for that goal.
      verdict?: import('@/lib/utils/goalTrajectory').GoalVerdict;
      // The three trajectory numbers, present only for a goal that has BOTH a target
      // and a deadline — there is nothing to project otherwise. They are projections,
      // not measurements: assumedAnnualReturn travels with them precisely so the prompt
      // can say what they rest on. Without it the other two are unfalsifiable.
      requiredMonthlyContribution?: number;
      projectedValueAtDeadline?: number;
      assumedAnnualReturn?: number; // % nominal, derived from recommendedAllocation
    }[];
  } | null;
  // Full category/subcategory taxonomy configured by the user (Settings → Categorie),
  // independent of the analysis period. Lets Claude suggest where to file a new
  // expense or whether a new category is warranted, instead of only seeing the
  // top-5 categories actually used in this period.
  expenseCategories: {
    name: string;
    type: import('@/types/expenses').ExpenseType;
    subCategories: string[];
  }[];
  dataQuality: {
    hasSnapshot: boolean;
    hasPreviousBaseline: boolean;
    hasCashflowData: boolean;
    // True when the analysis period is in progress (current month, current year, YTD with current month, etc.)
    isPartialMonth: boolean;
    notes: string[];
  };
}

// Context type for chat mode. Determines which period bundle is built server-side.
// 'none' → no numeric context; 'month' → monthly bundle; 'year/ytd/history' → respective builders.
export type AssistantChatContextType = 'none' | 'month' | 'year' | 'ytd' | 'history';

export interface AssistantStreamRequest {
  userId: string;
  mode: AssistantMode;
  prompt: string;
  threadId?: string;
  // Used for month_analysis and chat modes
  month?: AssistantMonthSelectorValue;
  // Used for year_analysis mode and chat mode with year context
  year?: number;
  // Used only in chat mode to specify the context period type
  chatContext?: AssistantChatContextType;
  preferences?: AssistantPreferences;
}

export type AssistantStreamEvent =
  | { type: 'meta'; threadId?: string; title?: string }
  // Sent once before text streaming starts, carrying the server-built context bundle.
  // Client uses this to render the numeric panel without a separate fetch.
  | { type: 'context'; bundle: AssistantMonthContextBundle }
  | { type: 'text'; text: string }
  | { type: 'status'; status: 'searching' | 'writing' | 'saving' }
  | { type: 'done'; threadId?: string; messageId?: string; webSearchUsed: boolean }
  | { type: 'error'; error: string; retryable?: boolean };
