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

import { ASSISTANT_REGISTER_MAX_TOKENS, streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';
import { buildRegisterPrompt } from '@/lib/server/assistant/prompts';
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

  it('runs on Opus 5.5 at effort medium, with the fallback and no forced tool', async () => {
    // Opus 5.5 since 2026-11-23 (owner's decision); the model refuses a forced `tool_choice`.
    async function* empty() {}
    const create = vi
      .spyOn(Anthropic.Beta.Messages.prototype, 'create')
      .mockResolvedValue(empty() as never);

    await streamAssistantResponse({
      mode: 'chat',
      prompt: 'Quanto costa l’asilo?',
      contextBundle: null,
      preferences,
      enableWebSearch: true,
      onStatus: vi.fn(),
      onText: vi.fn(),
    });

    const request = create.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(request).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'medium' }, fallbacks: 'default' });
    expect(request).not.toHaveProperty('tool_choice');
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

  it('hands it to the chat too, in the user turn only (since 2026-11-07)', async () => {
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

describe('streamAssistantResponse — Registra (2026-11)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function* empty() {}

  it('sends the register prompt with its own token ceiling and no tool, whatever the web-search flag', async () => {
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(empty() as never);

    await streamAssistantResponse({
      mode: 'register',
      prompt: 'ho fatto spesa per 103 euro',
      contextBundle: null,
      registerBlock: 'BLOCCO REGISTRA',
      cashflowBlock: 'BLOCCO',
      preferences,
      // The flag is ON: Registra sends no tool even so (seen red on 2026-11-11 — until then this case
      // passed `false`, and the spread alone could not send one in any mode).
      enableWebSearch: true,
      onStatus: vi.fn(),
      onText: vi.fn(),
    });

    const expected = buildRegisterPrompt('ho fatto spesa per 103 euro', preferences, [], 'BLOCCO REGISTRA', 'BLOCCO');
    const params = create.mock.calls[0][0] as unknown as { system: unknown; max_tokens: number; tools?: unknown; messages: { content: unknown }[] };
    expect(ASSISTANT_REGISTER_MAX_TOKENS).toBe(16000);
    expect(params.max_tokens).toBe(16000);
    expect(params.tools).toBeUndefined();
    // The builder's `system`, whole: nothing before it, nothing after.
    expect(params.system).toBe(expected.system);
    expect(JSON.stringify(params.messages)).toContain('BLOCCO REGISTRA');
    expect(JSON.stringify(params.system)).not.toContain('BLOCCO REGISTRA');
  });
});

// The status says what the server is doing NOW (owner, 2026-11-16: an answer stood still for a minute
// on its first sentence while the model searched the web, and the status never came back to writing).
describe('streamAssistantResponse — the status follows the stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const text = (t: string) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } });
  const search = { type: 'content_block_start', index: 1, content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } };

  async function run(chunks: unknown[]) {
    async function* stream() { for (const chunk of chunks) yield chunk; }
    vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(stream() as never);
    const onStatus = vi.fn();
    await streamAssistantResponse({
      mode: 'chat', prompt: 'Com è andato ottobre?', contextBundle: null, preferences, enableWebSearch: true, onStatus, onText: vi.fn(),
    });
    return onStatus.mock.calls.map((call) => call[0]);
  }

  it('says writing until a search starts, even with the web allowed', async () => {
    expect(await run([text('Ottobre.')])).toEqual(['writing', 'saving']);
  });

  it('starts a new paragraph where the text resumes after a search', async () => {
    async function* stream() { for (const chunk of [text('Cerco il contesto.'), search, text('**In sintesi**')]) yield chunk; }
    vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(stream() as never);
    const onText = vi.fn();
    const result = await streamAssistantResponse({
      mode: 'chat', prompt: 'Com è andato ottobre?', contextBundle: null, preferences, enableWebSearch: true, onStatus: vi.fn(), onText,
    });
    expect(result.text).toBe('Cerco il contesto.\n\n**In sintesi**');
    expect(onText.mock.calls.map((call) => call[0]).join('')).toBe(result.text);
  });

  it('logs what the web search returned, an error by its code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failed = { type: 'content_block_start', index: 2, content_block: { type: 'web_search_tool_result', tool_use_id: 's1', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } } };
    await run([search, failed, text('Senza web.')]);
    expect(warn).toHaveBeenCalledWith('[assistant] web search failed: unavailable');
  });

  it('comes back to writing when the text resumes after a search', async () => {
    expect(await run([text('Cerco il contesto. '), search, text('Ecco ottobre.'), text(' Fine.')])).toEqual(['writing', 'searching', 'writing', 'saving']);
  });
});
