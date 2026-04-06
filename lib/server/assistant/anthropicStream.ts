import Anthropic from '@anthropic-ai/sdk';
import { AssistantMode, AssistantMonthContextBundle, AssistantMonthSelectorValue, AssistantPreferences } from '@/types/assistant';
import { buildChatPrompt, buildMonthAnalysisPrompt } from './prompts';

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
  enableWebSearch: boolean;
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
  preferences: AssistantPreferences
): string {
  if (mode === 'month_analysis' && contextBundle) {
    return buildMonthAnalysisPrompt(contextBundle, prompt, preferences);
  }

  // Chat mode: include the month label if one was selected, but no numeric data
  const MONTH_NAMES = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ];
  const monthLabel = month
    ? `${MONTH_NAMES[month.month - 1]} ${month.year}`
    : undefined;

  return buildChatPrompt(prompt, preferences, monthLabel);
}

export async function streamAssistantResponse({
  mode,
  prompt,
  contextBundle,
  month,
  preferences,
  enableWebSearch,
  onStatus,
  onText,
}: StreamAssistantResponseArgs): Promise<{ text: string; webSearchUsed: boolean }> {
  let aggregatedText = '';
  let webSearchUsed = false;

  try {
    onStatus(enableWebSearch ? 'searching' : 'writing');

    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      thinking: {
        type: 'enabled',
        budget_tokens: 2000,
      },
      ...(enableWebSearch
        ? {
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: mode === 'month_analysis' ? 2 : 3,
              } as any,
            ],
          }
        : {}),
      messages: [
        {
          role: 'user',
          content: buildPrompt(mode, prompt, contextBundle, month, preferences),
        },
      ],
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
