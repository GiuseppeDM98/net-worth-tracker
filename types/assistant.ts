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
  | { type: 'text'; text: string }
  | { type: 'status'; status: 'searching' | 'writing' | 'saving' }
  | { type: 'done'; threadId?: string; messageId?: string; webSearchUsed: boolean }
  | { type: 'error'; error: string; retryable?: boolean };
