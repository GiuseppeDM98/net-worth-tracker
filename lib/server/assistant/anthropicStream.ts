import Anthropic from '@anthropic-ai/sdk';
import { AssistantMemoryItem, AssistantMessage, AssistantMode, AssistantMonthContextBundle, AssistantMonthSelectorValue, AssistantPreferences } from '@/types/assistant';
import {
  buildChatPrompt,
  buildHistoryAnalysisPrompt,
  buildMonthAnalysisPrompt,
  buildYearAnalysisPrompt,
  buildYtdAnalysisPrompt,
} from './prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface StreamAssistantResponseArgs {
  mode: AssistantMode;
  prompt: string;
  // Context bundle is required for month_analysis mode; null for chat mode.
  // Built server-side so the prompt always reflects authoritative Firestore data.
  contextBundle: AssistantMonthContextBundle | null;
  month?: AssistantMonthSelectorValue | null;
  preferences: AssistantPreferences;
  // Active memory items for this user, injected into the prompt so Claude can
  // reference declared goals, preferences, and facts across conversations.
  memoryItems?: AssistantMemoryItem[];
  enableWebSearch: boolean;
  // Prior messages in the thread, loaded before the new user message is appended.
  // Injected as a multi-turn history so Claude can follow-up coherently.
  conversationHistory?: AssistantMessage[];
  onStatus: (status: 'searching' | 'writing' | 'saving') => void;
  onText: (text: string) => void;
}

/**
 * Selects the appropriate prompt builder based on the assistant mode.
 *
 * For month_analysis: uses the full structured bundle so Claude has reliable
 * numbers and knows exactly what data is/isn't available.
 * For chat: uses a lighter prompt without numeric context.
 */
function buildPrompt(
  mode: AssistantMode,
  prompt: string,
  contextBundle: AssistantMonthContextBundle | null,
  month: AssistantMonthSelectorValue | null | undefined,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = [],
  enableWebSearch = false
): string {
  const MONTH_NAMES = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ];
  const monthLabel = month
    ? `${MONTH_NAMES[month.month - 1]} ${month.year}`
    : undefined;

  if (mode === 'month_analysis' && contextBundle) {
    return buildMonthAnalysisPrompt(contextBundle, prompt, preferences, memoryItems);
  }

  // Year, YTD, and history modes all use their own structured prompt builder with context.
  // Falls through to chat if context is somehow unavailable.
  if (mode === 'year_analysis' && contextBundle) {
    return buildYearAnalysisPrompt(contextBundle, prompt, preferences, memoryItems);
  }

  if (mode === 'ytd_analysis' && contextBundle) {
    return buildYtdAnalysisPrompt(contextBundle, prompt, preferences, memoryItems);
  }

  if (mode === 'history_analysis' && contextBundle) {
    return buildHistoryAnalysisPrompt(contextBundle, prompt, preferences, memoryItems);
  }

  // Chat mode: pass the bundle when available so Claude has real numbers.
  // The prompt builder uses it without forcing a fixed response structure.
  return buildChatPrompt(prompt, preferences, monthLabel, memoryItems, contextBundle, enableWebSearch);
}

/**
 * Builds the multi-turn messages array for the Anthropic API call.
 *
 * Prior messages are injected verbatim so Claude can reference earlier exchanges.
 * Caps vary by mode: chat allows more history (10 pairs) because prompts are
 * lighter; structured analysis modes are capped at 3 pairs because they include
 * large numeric context bundles that already consume significant token budget.
 *
 * The new user turn always uses the full buildPrompt output (with context + memory).
 * History messages use raw stored content — no re-injection of context bundles.
 */
function buildMessagesArray(
  mode: AssistantMode,
  currentUserContent: string,
  history: AssistantMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const isStructured = ['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis'].includes(mode);
  // Structured modes cap at 3 pairs (6 msgs); chat allows 10 pairs (20 msgs).
  const maxMessages = isStructured ? 6 : 20;

  const trimmedHistory = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-maxMessages)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  return [...trimmedHistory, { role: 'user', content: currentUserContent }];
}

export async function streamAssistantResponse({
  mode,
  prompt,
  contextBundle,
  month,
  preferences,
  memoryItems = [],
  enableWebSearch,
  conversationHistory = [],
  onStatus,
  onText,
}: StreamAssistantResponseArgs): Promise<{ text: string; webSearchUsed: boolean }> {
  let aggregatedText = '';
  let webSearchUsed = false;

  try {
    onStatus(enableWebSearch ? 'searching' : 'writing');

    // Structured analysis modes (month/year/ytd/history) use extended thinking (budget 2000)
    // and more tokens for the structured breakdown. Chat without web search is light (1500).
    // When chat triggers web search (macro/geopolitical question) the response
    // is naturally longer — raise the cap to avoid mid-sentence truncation.
    const isStructuredAnalysis = ['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis'].includes(mode);
    const chatMaxTokens = enableWebSearch ? 2500 : 1500;
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: isStructuredAnalysis ? 3500 : chatMaxTokens,
      ...(isStructuredAnalysis
        ? { thinking: { type: 'enabled', budget_tokens: 2000 } }
        : {}),
      ...(enableWebSearch
        ? {
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: isStructuredAnalysis ? 2 : 3,
              } as any,
            ],
          }
        : {}),
      messages: buildMessagesArray(
        mode,
        buildPrompt(mode, prompt, contextBundle, month, preferences, memoryItems, enableWebSearch),
        conversationHistory
      ),
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'server_tool_use') {
        webSearchUsed = true;
        onStatus('searching');
      }

      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        if (!aggregatedText.length) {
          onStatus('writing');
        }

        aggregatedText += chunk.delta.text;
        onText(chunk.delta.text);
      }
    }

    onStatus('saving');
    return {
      text: aggregatedText.trim(),
      webSearchUsed,
    };
  } catch (error: any) {
    if (error?.error?.type === 'overloaded_error') {
      const overloadedError = new Error(
        'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.'
      ) as Error & { retryable?: boolean; status?: number };
      overloadedError.retryable = true;
      overloadedError.status = 503;
      throw overloadedError;
    }

    throw error;
  }
}
