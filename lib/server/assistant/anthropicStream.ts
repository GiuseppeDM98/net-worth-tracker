import Anthropic from '@anthropic-ai/sdk';
import { AssistantMode, AssistantMonthSelectorValue, AssistantPreferences } from '@/types/assistant';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface StreamAssistantResponseArgs {
  mode: AssistantMode;
  prompt: string;
  month?: AssistantMonthSelectorValue | null;
  preferences: AssistantPreferences;
  enableWebSearch: boolean;
  onStatus: (status: 'searching' | 'writing' | 'saving') => void;
  onText: (text: string) => void;
}

function buildAssistantPrompt(
  mode: AssistantMode,
  prompt: string,
  month: AssistantMonthSelectorValue | null | undefined,
  preferences: AssistantPreferences
): string {
  const responseStyleInstruction =
    preferences.responseStyle === 'concise'
      ? 'Rispondi in modo sintetico, con punti chiari e pochi fronzoli.'
      : preferences.responseStyle === 'deep'
        ? 'Rispondi con maggiore profondità, esplicitando ipotesi e limiti.'
        : 'Rispondi in modo equilibrato: chiaro, concreto e leggibile.';

  const monthContext = month
    ? `Il contesto mensile selezionato è ${String(month.month).padStart(2, '0')}/${month.year}.`
    : 'Non è stato selezionato un mese di riferimento.';

  const modeInstruction =
    mode === 'month_analysis'
      ? 'Stai aiutando l’utente a interpretare un mese del proprio patrimonio.'
      : 'Stai rispondendo a una conversazione generale sul portafoglio dell’utente.';

  return [
    'Sei l’Assistente AI di Net Worth Tracker per un investitore italiano.',
    'Rispondi sempre in italiano.',
    responseStyleInstruction,
    modeInstruction,
    monthContext,
    preferences.memoryEnabled
      ? 'Puoi riutilizzare preferenze e fatti salvati quando sono pertinenti.'
      : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito del messaggio.',
    '',
    `Richiesta utente: ${prompt.trim()}`,
  ].join('\n');
}

export async function streamAssistantResponse({
  mode,
  prompt,
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
          content: buildAssistantPrompt(mode, prompt, month, preferences),
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
