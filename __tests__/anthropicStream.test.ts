import { afterEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantPreferences } from '@/types/assistant';

vi.mock('server-only', () => ({}));

// The four analysis builders: what each receives is what the route handed over.
const { analysisPromptMocks } = vi.hoisted(() => ({
  analysisPromptMocks: { month_analysis: vi.fn(), year_analysis: vi.fn(), ytd_analysis: vi.fn(), history_analysis: vi.fn() },
}));
vi.mock('@/lib/server/assistant/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/assistant/prompts')>();
  return {
    ...actual,
    buildMonthAnalysisPrompt: analysisPromptMocks.month_analysis,
    buildYearAnalysisPrompt: analysisPromptMocks.year_analysis,
    buildYtdAnalysisPrompt: analysisPromptMocks.ytd_analysis,
    buildHistoryAnalysisPrompt: analysisPromptMocks.history_analysis,
  };
});

import { streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';
import { ASSISTANT_MODEL, SERVER_SIDE_FALLBACK_BETA } from '@/lib/constants/aiModels';

const OVERLOADED_MESSAGE = 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.';

const preferences: AssistantPreferences = {
  responseStyle: 'balanced',
  includeMacroContext: false,
  memoryEnabled: false,
  includeDummySnapshots: false,
};

// The envelope the API returns on a 529, exactly as the SDK receives it.
const OVERLOADED_ENVELOPE = {
  type: 'error',
  error: { type: 'overloaded_error', message: 'Overloaded' },
};

/**
 * Runs a chat turn whose upstream call rejects with `failure`. The SDK client is built at
 * module load, so the rejection is injected on the shared `Beta.Messages.prototype.create` (every Sonnet call goes through the beta endpoint for the server-side fallback).
 */
function streamWithUpstreamFailure(failure: unknown) {
  vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockRejectedValue(failure);
  return streamAssistantResponse({
    mode: 'chat',
    prompt: 'Come sta andando il mese?',
    contextBundle: null,
    preferences,
    enableWebSearch: false,
    onStatus: vi.fn(),
    onText: vi.fn(),
  });
}

describe('streamAssistantResponse upstream failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps the real SDK overload error to a retryable 503', async () => {
    // Regression: with sdk 0.110 the inner type lives on `error.type` and `error.error` is
    // the whole envelope, so a read of `error.error.type` saw 'error' and never matched.
    const sdkError = Anthropic.APIError.generate(529, OVERLOADED_ENVELOPE, 'Overloaded', new Headers());
    expect(sdkError).toBeInstanceOf(Anthropic.APIError);

    await expect(streamWithUpstreamFailure(sdkError)).rejects.toMatchObject({
      message: OVERLOADED_MESSAGE,
      retryable: true,
      status: 503,
    });
  });

  it('still maps the raw envelope shape the mocks throw', async () => {
    const rawEnvelope = { error: { type: 'overloaded_error', message: 'Overloaded' } };

    await expect(streamWithUpstreamFailure(rawEnvelope)).rejects.toMatchObject({
      message: OVERLOADED_MESSAGE,
      retryable: true,
      status: 503,
    });
  });

  it('rethrows any other SDK failure untouched', async () => {
    const sdkError = Anthropic.APIError.generate(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Boom' } },
      undefined,
      new Headers()
    );

    await expect(streamWithUpstreamFailure(sdkError)).rejects.toBe(sdkError);
  });
});

describe('streamAssistantResponse server-side fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the beta endpoint for the default server-side fallback', async () => {
    async function* empty() {}
    const create = vi
      .spyOn(Anthropic.Beta.Messages.prototype, 'create')
      .mockResolvedValue(empty() as never);

    await streamAssistantResponse({
      mode: 'chat',
      prompt: 'Come sta andando il mese?',
      contextBundle: null,
      preferences,
      enableWebSearch: false,
      onStatus: vi.fn(),
      onText: vi.fn(),
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      model: ASSISTANT_MODEL,
      betas: [SERVER_SIDE_FALLBACK_BETA],
      fallbacks: 'default',
      stream: true,
    });
  });
});

describe('streamAssistantResponse — the CASHFLOW 12 MESI block (2026-11)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function* empty() {}

  it.each(['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis'] as const)('%s: forwards the block to its builder, as the last argument', async (mode) => {
    const promptMock = analysisPromptMocks[mode];
    promptMock.mockReset().mockReturnValue({ system: 'S', userContent: 'U' });
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(empty() as never);

    await streamAssistantResponse({
      mode,
      month: { year: 2026, month: 3 },
      prompt: 'Come va?',
      contextBundle: {} as never,
      cashflowBlock: 'BLOCCO',
      preferences,
      enableWebSearch: false,
      onStatus: vi.fn(),
      onText: vi.fn(),
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(promptMock.mock.calls[0].at(-1)).toBe('BLOCCO');
    expect(create.mock.calls[0][0]).toMatchObject({ system: 'S' });
  });

  it('hands it to the chat too, in the user turn only (decision 81, 2026-11-07)', async () => {
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(empty() as never);

    await streamAssistantResponse({
      mode: 'chat',
      prompt: 'Come va?',
      contextBundle: null,
      cashflowBlock: 'BLOCCO',
      preferences,
      enableWebSearch: false,
      onStatus: vi.fn(),
      onText: vi.fn(),
    });

    const params = create.mock.calls[0][0] as unknown as { system: string; messages: { content: string }[] };
    expect(JSON.stringify(params.messages)).toContain('BLOCCO');
    expect(JSON.stringify(params.system)).not.toContain('BLOCCO');
  });
});
