// WARNING: If you add a mode here, also update:
// - AssistantComposer.tsx (mode selector options)
// - anthropicStream.ts (buildPrompt routing)
// - prompts.ts (add prompt builder)
// - assistantMonthContextService.ts (context builder)
// - store.ts (getDefaultThreadTitle)
export type AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat';

export type AssistantWebContextMode = 'portfolio_only' | 'hybrid';

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
}

export interface AssistantMonthContext {
  year: number;
  month: number;
  monthLabel: string;
  hasSnapshot: boolean;
  hasPreviousBaseline: boolean;
  hasCashflowData: boolean;
  summary: {
    startNetWorth: number | null;
    endNetWorth: number | null;
    netWorthDelta: number | null;
    netWorthDeltaPct: number | null;
    totalIncome: number;
    totalExpenses: number;
    totalDividends: number;
    netCashFlow: number;
  };
  topChanges: {
    assetClass: string;
    absoluteChange: number;
    percentagePointsChange: number | null;
  }[];
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
  sourceThreadId?: string;
  sourceMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived';
}

export interface AssistantThreadDetail {
  thread: AssistantThread;
  messages: AssistantMessage[];
}

export interface AssistantMemoryDocument {
  preferences: AssistantPreferences;
  items: AssistantMemoryItem[];
  updatedAt: Date | null;
}

export interface AssistantThreadsResponse {
  threads: AssistantThread[];
}

export interface AssistantMemoryResponse extends AssistantMemoryDocument {}

export interface AssistantThreadResponse extends AssistantThreadDetail {}

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
  cashflow: {
    totalIncome: number;
    totalExpenses: number;
    totalDividends: number;
    netCashFlow: number;
    transactionCount: number;
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
  // Top expense categories by absolute total, sorted descending. Gives Claude
  // enough detail to cite specific spending drivers without flooding the prompt.
  topExpensesByCategory: {
    categoryName: string;
    total: number; // negative (expense sign convention)
    transactionCount: number;
  }[];
  // Top 5 individual expenses by absolute amount. Lets Claude cite specific
  // large outlier transactions (e.g. "Canone mutuo -€1.200").
  topIndividualExpenses: {
    categoryName: string;
    amount: number; // negative
    notes?: string;
  }[];
  // Sub-category breakdown within each asset class, built from live asset records.
  // Only populated when assets have subCategory set; empty object when no breakdown exists.
  // Claude uses this to cite specific sub-allocations (e.g. "Azioni USA €42.000").
  bySubCategoryAllocation: {
    [assetClass: string]: {
      [subCategory: string]: number; // EUR value from snapshot
    };
  };
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
