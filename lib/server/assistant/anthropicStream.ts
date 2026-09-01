import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_MODEL } from '@/lib/constants/aiModels';
import { AssistantMemoryItem, AssistantMessage, AssistantMode, AssistantMonthContextBundle, AssistantMonthSelectorValue, AssistantPreferences } from '@/types/assistant';
import {
  AssistantPromptParts,
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
 *
 * Returns { system, userContent } — system is the cacheable static block
 * (role, domain, guardrails, this mode's output contract); userContent is
 * everything specific to this request.
 */
function buildPrompt(
  mode: AssistantMode,
  prompt: string,
  contextBundle: AssistantMonthContextBundle | null,
  month: AssistantMonthSelectorValue | null | undefined,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[] = []
): AssistantPromptParts {
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
  return buildChatPrompt(prompt, preferences, monthLabel, memoryItems, contextBundle);
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

/**
 * Appended when generation stops at max_tokens. Markdown italics so it reads as an
 * annotation rather than as part of the answer; leading blank line so it lands in its
 * own paragraph after whatever half-finished sentence precedes it.
 */
const TRUNCATION_NOTICE =
  '\n\n_(Risposta interrotta: ho raggiunto il limite di lunghezza. Chiedimi di continuare o restringi la domanda.)_';

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
  let stopReason: string | null = null;

  try {
    onStatus(enableWebSearch ? 'searching' : 'writing');

    // max_tokens is a budget for thinking AND text together: with adaptive thinking the
    // model decides how much to reason, and whatever it spends there is gone from the
    // answer. A cap sized for the prose alone truncates mid-sentence.
    //
    // Raised on 2026-07-29 after the data block became exhaustive (chat was at 3000 and
    // started cutting real answers off), then doubled again on request to leave room for
    // long consultative replies. Note the ceiling is not purely free headroom: unused
    // tokens are never billed, but a larger budget also lets adaptive thinking reason
    // longer, which is billed and adds latency. These values stay well inside the
    // model's output limit and inside Vercel's 300s default function duration; if a
    // future bump goes materially higher, set an explicit `maxDuration` on the route.
    const isStructuredAnalysis = ['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis'].includes(mode);
    const chatMaxTokens = enableWebSearch ? 16000 : 12000;
    const { system, userContent } = buildPrompt(mode, prompt, contextBundle, month, preferences, memoryItems);
    const stream = await anthropic.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: isStructuredAnalysis ? 18000 : chatMaxTokens,
      // Static role/domain/guardrail/format instructions, identical for every user and
      // every request of this mode. No cache_control: this app's traffic pattern
      // (sporadic single-user requests) rarely lands two calls within the 5-minute
      // cache TTL, so caching would pay the 1.25x write premium without recouping it.
      system: system,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
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
      messages: buildMessagesArray(mode, userContent, conversationHistory),
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'server_tool_use') {
        webSearchUsed = true;
        onStatus('searching');
      }

      // The terminal message_delta carries why generation stopped. Without reading it a
      // truncated answer is indistinguishable from a finished one.
      if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) {
        stopReason = chunk.delta.stop_reason;
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

    // Hitting the ceiling leaves the answer cut off mid-sentence. Saying so turns a
    // response that looks broken into one the user knows how to continue — the same
    // reason the prompt's subcategory valve announces itself instead of truncating
    // quietly (AGENTS.md -> A Silent Cap in a Context Builder...).
    let text = aggregatedText.trim();
    if (stopReason === 'max_tokens' && text.length > 0) {
      onText(TRUNCATION_NOTICE);
      text += TRUNCATION_NOTICE;
    }

    onStatus('saving');
    return {
      text,
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
