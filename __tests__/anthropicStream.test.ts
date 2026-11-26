import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantPreferences } from '@/types/assistant';
import type { AssistantToolContext } from '@/lib/server/assistant/tools/registry';
import { queryClockOf } from '@/lib/utils/assistantExpenseQueries';

vi.mock('server-only', () => ({}));

// The real tools, watched: the loop's tests count what ran (DATI-09).
vi.mock('@/lib/server/assistant/tools/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/assistant/tools/registry')>();
  return { ...actual, runAssistantTool: vi.fn(actual.runAssistantTool) };
});

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
import { ASSISTANT_TOOL_DEFINITIONS, runAssistantTool } from '@/lib/server/assistant/tools/registry';
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
    // Opus 5.5 since 2026-11-25 (the owner's decision of 2026-11-23); the model refuses a forced
    // `tool_choice`. Seen RED with the effort left at `high`.
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

// ── The tool loop (DATI-09) ─────────────────────────────────────────────────────────────────
// The SDK's real `stream()` cannot be fed through the `create` mock above (it reads `withResponse()`
// and the controller): each request gets a fake `{ on, finalMessage }` that replays its text as
// `streamEvent`s, then resolves the recorded message. The requests are cloned when sent, because the
// loop goes on appending to the same `messages` array.
describe('streamAssistantResponse — the tool loop (DATI-09)', () => {
  const TOOL_NAMES = ['cashflow_totali', 'cashflow_confronto', 'cashflow_righe', 'budget_stato', 'centri_di_costo'];
  const TOOL_LIMIT_RESULT = 'Limite di calcoli raggiunto: rispondi adesso con i dati che hai, senza chiedere altri strumenti.';
  const TOOL_LIMIT_NOTICE = '*Non sono riuscito a chiudere i conti: riprova con una domanda più stretta.*';
  const TODAY = '2026-11-15';

  type Block = Record<string, unknown>;
  type SentRequest = { tools: { name: string }[]; toolsRef: unknown[]; messages: { role: string; content: unknown }[] };

  const toolContext: AssistantToolContext = {
    userId: 'user-1',
    todayIso: TODAY,
    now: new Date(`${TODAY}T11:00:00Z`),
    clock: queryClockOf(TODAY, undefined),
    expenses: [],
    categories: [],
    costCenters: [],
    budgetConfig: null,
    costCentersEnabled: false,
  };
  const call = (id: string): Block => ({
    type: 'tool_use', id, name: 'cashflow_totali',
    input: { kind: 'spending', from: '2026-11-01', to: '2026-11-30', groupBy: 'category' },
  });
  const thinking: Block = { type: 'thinking', thinking: 'Mi serve il totale di novembre.', signature: 'sig-1' };
  const text = (value: string): Block => ({ type: 'text', text: value, citations: null });
  const turn = (stop_reason: string, content: Block[], onDone?: () => void) => ({ stop_reason, content, onDone });

  let sent: SentRequest[] = [];

  /** Spies `stream` with one recorded turn per request; a request past the script fails the test. */
  function script(turns: ReturnType<typeof turn>[]) {
    sent = [];
    vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream').mockImplementation(((params: { tools: { name: string }[]; messages: unknown[] }) => {
      const recorded = turns[sent.length];
      sent.push({ ...structuredClone(params), toolsRef: params.tools } as unknown as SentRequest);
      if (!recorded) throw new Error(`request ${sent.length} was not expected`);
      let listener: ((event: unknown) => void) | undefined;
      const fake = {
        on(event: string, handler: (event: unknown) => void) {
          if (event === 'streamEvent') listener = handler;
          return fake;
        },
        async finalMessage() {
          recorded.content.forEach((block, index) => {
            if (block.type === 'text') listener?.({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } });
          });
          recorded.onDone?.();
          return { id: 'msg', type: 'message', role: 'assistant', model: ASSISTANT_MODEL, content: recorded.content, stop_reason: recorded.stop_reason, stop_sequence: null, usage: {} };
        },
      };
      return fake;
    }) as never);
  }

  function answer(extra: Partial<Parameters<typeof streamAssistantResponse>[0]> = {}) {
    const onStatus = vi.fn();
    const onText = vi.fn();
    const result = streamAssistantResponse({
      mode: 'chat', prompt: 'Quanto ho speso a novembre?', contextBundle: null, preferences, enableWebSearch: false,
      toolContext, onStatus, onText, ...extra,
    });
    return { result, onStatus, onText };
  }

  const toolResults = (request: SentRequest) => request.messages.at(-1)!.content as { type: string; tool_use_id: string; content: string; is_error?: boolean }[];

  beforeEach(() => {
    vi.mocked(runAssistantTool).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a chat with a context sends the five tools, beside the web when it is on; Registra sends none (L1)', async () => {
    script([turn('end_turn', [text('Uno.')]), turn('end_turn', [text('Due.')])]);
    await answer().result;
    await answer({ enableWebSearch: true }).result;
    expect(sent[0].tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(sent[1].tools.map((tool) => tool.name)).toEqual(['web_search', ...TOOL_NAMES]);
    // The definitions are one module constant: the same objects in every request.
    sent[0].toolsRef.forEach((definition, index) => expect(sent[1].toolsRef[index + 1]).toBe(definition));
    expect(sent[0].toolsRef).toEqual(ASSISTANT_TOOL_DEFINITIONS);

    async function* empty() {}
    const create = vi.spyOn(Anthropic.Beta.Messages.prototype, 'create').mockResolvedValue(empty() as never);
    await answer({ mode: 'register', registerBlock: 'BLOCCO REGISTRA', enableWebSearch: true }).result;
    expect(sent).toHaveLength(2);
    expect((create.mock.calls[0][0] as { tools?: unknown }).tools).toBeUndefined();
  });

  it('runs both calls of a round and answers them in ONE user message, the assistant turn pushed back whole (L2)', async () => {
    script([turn('tool_use', [thinking, call('c1'), call('c2')]), turn('end_turn', [text('Hai speso zero euro.')])]);
    const { result } = answer();
    const done = await result;
    expect(runAssistantTool).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(2);
    const [assistantTurn, userTurn] = sent[1].messages.slice(-2);
    expect(assistantTurn).toEqual({ role: 'assistant', content: [thinking, call('c1'), call('c2')] });
    expect(userTurn.role).toBe('user');
    expect(toolResults(sent[1]).map((block) => [block.type, block.tool_use_id, block.is_error])).toEqual([
      ['tool_result', 'c1', undefined],
      ['tool_result', 'c2', undefined],
    ]);
    expect(JSON.parse(toolResults(sent[1])[0].content)).toMatchObject({ period: { from: '2026-11-01', to: '2026-11-30' } });
    expect(done).toMatchObject({ text: 'Hai speso zero euro.', toolCalls: 2, toolRounds: 1 });
  });

  it('caps the rounds at eight: two closing requests answered «stop», then the notice, the tools never dropped (L3)', async () => {
    script(Array.from({ length: 11 }, (_, index) => turn('tool_use', [call(`c${index + 1}`)])));
    const { result } = answer();
    const done = await result;
    // Requests 1–8 run their call; the calls of 9 and 10 are answered «stop»; 11 asks again and the loop ends.
    expect(sent).toHaveLength(11);
    expect(runAssistantTool).toHaveBeenCalledTimes(8);
    for (const request of sent.slice(1, 9)) expect(toolResults(request)[0].is_error).toBeUndefined();
    for (const request of sent.slice(9)) expect(toolResults(request)).toEqual([expect.objectContaining({ content: TOOL_LIMIT_RESULT, is_error: true })]);
    for (const request of sent) expect(request.tools.map((tool) => tool.name)).toEqual(TOOL_NAMES);
    expect(done).toMatchObject({ text: TOOL_LIMIT_NOTICE, toolCalls: 8, toolRounds: 8 });
  });

  it('never runs the call of a truncated or refused turn (L4)', async () => {
    script([turn('max_tokens', [thinking, call('c1')])]);
    const truncated = answer();
    expect((await truncated.result).text).toBe('_(Risposta interrotta: ho raggiunto il limite di lunghezza. Chiedimi di continuare o restringi la domanda.)_');
    expect(truncated.onText).toHaveBeenCalledTimes(1);

    script([turn('refusal', [call('c1')])]);
    expect((await answer().result).text).toBe('_(Non posso rispondere a questa richiesta. Riformula la domanda sui tuoi dati finanziari.)_');
    expect(runAssistantTool).not.toHaveBeenCalled();
  });

  it('sends a paused turn back as it is, three times at most (L5)', async () => {
    const paused = [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'BCE' } }];
    script([turn('pause_turn', paused), turn('end_turn', [text('Ripreso.')])]);
    expect((await answer({ enableWebSearch: true }).result).text).toBe('Ripreso.');
    expect(sent[1].messages).toHaveLength(sent[0].messages.length + 1);
    expect(sent[1].messages.at(-1)).toEqual({ role: 'assistant', content: paused });

    script(Array.from({ length: 4 }, () => turn('pause_turn', paused)));
    expect((await answer({ enableWebSearch: true }).result).text).toBe(TOOL_LIMIT_NOTICE);
    expect(sent).toHaveLength(4);
  });

  it('says computing while the tools run and writing at the text that follows (L6)', async () => {
    script([turn('tool_use', [call('c1')]), turn('end_turn', [text('Fatto.')])]);
    const { result, onStatus } = answer();
    await result;
    expect(onStatus.mock.calls.map((args) => args[0])).toEqual(['writing', 'computing', 'writing', 'saving']);
  });

  it('past 200 s from the start the call is answered «stop» and the next text is the answer (L7)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    script([
      turn('tool_use', [call('c1')], () => vi.setSystemTime(new Date('2026-11-15T10:03:21Z'))),
      turn('end_turn', [text('Chiudo con quello che ho.')]),
    ]);
    const done = await answer().result;
    expect(runAssistantTool).not.toHaveBeenCalled();
    expect(toolResults(sent[1])).toEqual([expect.objectContaining({ tool_use_id: 'c1', content: TOOL_LIMIT_RESULT, is_error: true })]);
    expect(done).toMatchObject({ text: 'Chiudo con quello che ho.', toolCalls: 0, toolRounds: 0 });
  });
});
