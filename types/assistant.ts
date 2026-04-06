export type AssistantMode = 'month_analysis' | 'chat';

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
}

// Full numeric context bundle for a selected month, built server-side.
// Client sends the month selector; server regenerates this from Firestore — never trust client-supplied numbers.
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
  dataQuality: {
    hasSnapshot: boolean;
    hasPreviousBaseline: boolean;
    hasCashflowData: boolean;
    isPartialMonth: boolean;
    notes: string[];
  };
}

export interface AssistantStreamRequest {
  userId: string;
  mode: AssistantMode;
  prompt: string;
  threadId?: string;
  month?: AssistantMonthSelectorValue;
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
