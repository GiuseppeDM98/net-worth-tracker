/**
 * The Consulente's run (lib/server/allocationAdvice/run.ts): the three model calls in order
 * with their models, efforts, tools and answer formats, the document persisted after every
 * stage, a proposal the schema refuses that fails the strategy, a `max_tokens` cut said in the
 * product's words, the review's proposal falling back to the strategy's, a paused turn resumed.
 * The SDK is answered by hand-written final messages (`beta.messages.stream(...).finalMessage()`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';

let firstWrite: unknown = null;
const { setMock, patchMock, getMock, ytdMock } = vi.hoisted(() => ({ setMock: vi.fn(), patchMock: vi.fn(), getMock: vi.fn(), ytdMock: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/server/allocationAdvice/store', () => ({
  setAllocationAdviceAdmin: setMock,
  patchAllocationAdviceAdmin: patchMock,
  getAllocationAdviceAdmin: getMock,
}));
vi.mock('@/lib/services/assistantMonthContextService', () => ({ buildAssistantYtdContext: ytdMock }));
vi.mock('@/lib/server/assistant/prompts', () => ({
  formatBundleForPrompt: () => 'DATI',
  formatPortfolioForPrompt: () => ['STRUMENTI'],
}));

import {
  runAllocationAdvice,
  runAllocationAdviceStage,
  AllocationAdviceStageError,
  ALLOCATION_ADVICE_MAX_CONTINUATIONS,
  ALLOCATION_ADVICE_MAX_TOKENS,
} from '@/lib/server/allocationAdvice/run';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import {
  ALLOCATION_ADVICE_INSTRUMENTS_EFFORT,
  ALLOCATION_ADVICE_INSTRUMENTS_MODEL,
  ALLOCATION_ADVICE_STRATEGY_EFFORT,
  ALLOCATION_ADVICE_STRATEGY_MODEL,
} from '@/lib/constants/aiModels';

const ANSWERS: AllocationAdviceAnswers = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'media',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: '',
  distributionPolicy: 'accumulazione',
  goals: [],
  goalsReflectReality: true,
  newGoalsNote: '',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'frozen',
  keepAssets: [],
  avoid: '',
  esg: false,
  notes: '',
};

const PROPOSAL = {
  summary: 'Strategia.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: '', subTargets: [] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: '', subTargets: [] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2028-10-20',
  reviewReason: '',
  risks: [],
};

/** A model's final message, as the SDK's stream accumulator hands it back. */
function message(text: string, stopReason = 'end_turn', model = 'answered-model', webSearch = false, extra: unknown[] = []) {
  return {
    model,
    stop_reason: stopReason,
    content: [
      ...(webSearch ? [{ type: 'server_tool_use', id: 't', name: 'web_search', input: {} }] : []),
      ...extra,
      ...(text ? [{ type: 'text', text, citations: null }] : []),
    ],
  };
}

const strategyText = (proposal: unknown) => JSON.stringify({ markdown: '# La situazione\nTesto strategia.', proposal });
const instrumentsText = '- All World: trovato.\n\n```instrument-candidates\n{"sleeves": [{"assetClass": "equity", "subTarget": "All World", "candidates": [{"name": "ETF Mondo", "exchange": "Borsa Italiana", "note": "ok"}]}]}\n```';
const reviewText = (proposal: unknown) => JSON.stringify({ markdown: '# In una frase\nReport.', proposal });

/** Answers each `beta.messages.stream` call, in order, with one final message. */
function answerWith(...messages: unknown[]) {
  const spy = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
  for (const m of messages) spy.mockReturnValueOnce({ finalMessage: async () => m } as never);
  return spy;
}

type Params = Record<string, unknown> & { output_config: { effort: string; format?: { type: string; schema: Record<string, unknown> } } };

describe('runAllocationAdvice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // The run mutates ONE document object as it goes: the mock keeps a copy of what it was handed.
    setMock.mockImplementation(async (document: unknown) => { firstWrite = structuredClone(document); });
    patchMock.mockResolvedValue(undefined);
    ytdMock.mockResolvedValue({ portfolio: {} });
  });

  it('runs the three stages in order, on their models, efforts and formats, with web search only for the instruments, and persists each', async () => {
    const reviewed = { ...PROPOSAL, summary: 'Rivista.' };
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'), message(instrumentsText, 'end_turn', 'sonnet', true), message(reviewText(reviewed), 'end_turn', 'opus'));
    const stages: string[] = [];

    const document = await runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: (stage) => stages.push(stage), now: new Date('2026-10-20T10:00:00.000Z') });

    expect(stages).toEqual(['context', 'strategy', 'instruments', 'review']);
    expect(calls).toHaveBeenCalledTimes(3);
    const [strategyCall, instrumentsCall, reviewCall] = calls.mock.calls.map((call) => call[0] as unknown as Params);
    expect(strategyCall.model).toBe(ALLOCATION_ADVICE_STRATEGY_MODEL);
    expect(strategyCall.max_tokens).toBe(ALLOCATION_ADVICE_MAX_TOKENS);
    expect(strategyCall.tools).toBeUndefined();
    expect(strategyCall.fallbacks).toBe('default');
    expect(strategyCall.output_config.effort).toBe(ALLOCATION_ADVICE_STRATEGY_EFFORT);
    // The strategy and the review answer as a structured output; the search cannot (citations).
    expect(strategyCall.output_config.format?.type).toBe('json_schema');
    expect(Object.keys(strategyCall.output_config.format?.schema.properties as object)).toEqual(['markdown', 'proposal']);
    expect(instrumentsCall.model).toBe(ALLOCATION_ADVICE_INSTRUMENTS_MODEL);
    expect((instrumentsCall.tools as { type: string }[])[0].type).toBe('web_search_20260209');
    expect(instrumentsCall.output_config.effort).toBe(ALLOCATION_ADVICE_INSTRUMENTS_EFFORT);
    expect(instrumentsCall.output_config.format).toBeUndefined();
    expect(reviewCall.model).toBe(ALLOCATION_ADVICE_STRATEGY_MODEL);
    expect(reviewCall.tools).toBeUndefined();
    expect(reviewCall.output_config.format?.type).toBe('json_schema');

    expect(document.status).toBe('ready');
    expect(document.strategy?.proposal?.summary).toBe('Strategia.');
    expect(document.strategy?.markdown).toBe('# La situazione\nTesto strategia.');
    expect(document.strategy?.model).toBe('opus');
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
    expect(document.report?.proposal?.summary).toBe('Rivista.');
    expect(document.report?.markdown).toBe('# In una frase\nReport.');

    // Persisted whole at the start, then stage by stage.
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(firstWrite).toMatchObject({ userId: 'u1', status: 'running', stage: 'context' });
    const patches = patchMock.mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(patches.map((patch) => Object.keys(patch)[0])).toEqual(['stage', 'strategy', 'stage', 'instruments', 'stage', 'report']);
    expect(patches[5]).toMatchObject({ status: 'ready' });
  });

  it("keeps the strategy's proposal when the review's breaks a sum, and its markdown", async () => {
    const broken = { ...PROPOSAL, summary: 'Rotta.', classes: [{ ...PROPOSAL.classes[0], targetPercentage: 50 }, PROPOSAL.classes[1]] };
    answerWith(message(strategyText(PROPOSAL)), message(instrumentsText), message(reviewText(broken)));
    const document = await runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() });
    expect(document.report?.proposal?.summary).toBe('Strategia.');
    expect(document.report?.markdown).toBe('# In una frase\nReport.');
  });

  it('fails the run when the strategy answers no readable proposal, and persists the failure', async () => {
    answerWith(message('Solo testo.'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true });
    const last = patchMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(last).toMatchObject({ status: 'failed', stage: 'strategy' });
    expect(String(last.error)).toMatch(/proposta leggibile/);
  });

  it('fails the strategy on a proposal whose classes do not sum to 100 (a bound the API does not enforce)', async () => {
    answerWith(message(strategyText({ ...PROPOSAL, classes: [PROPOSAL.classes[0]] })));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true, message: expect.stringMatching(/proposta leggibile/) });
  });

  it("says a max_tokens cut and a refusal in the product's words", async () => {
    answerWith(message(strategyText(PROPOSAL), 'max_tokens'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toSatisfy(
      (error: unknown) => error instanceof AllocationAdviceStageError && /limite di lunghezza/.test(error.message) && error.retryable
    );
    vi.restoreAllMocks();
    answerWith(message('', 'refusal'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toSatisfy(
      (error: unknown) => error instanceof AllocationAdviceStageError && /rifiutato/.test(error.message) && !error.retryable
    );
  });

  it("maps an overload to a retryable failure in the product's words", async () => {
    const envelope = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } };
    const overloaded = Anthropic.APIError.generate(529, envelope, 'Overloaded', new Headers());
    vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream').mockReturnValueOnce({ finalMessage: () => Promise.reject(overloaded) } as never);
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true, message: expect.stringMatching(/sovraccarichi/) });
  });

  it('names the model the final message names, after a mid-stream fallback (2026-10-23)', async () => {
    const fallback = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } };
    answerWith(message(strategyText(PROPOSAL), 'end_turn', 'claude-opus-5', false, [fallback]));
    const document = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn() });
    expect(document.strategy?.model).toBe('claude-opus-5');
  });
});

// ── One request per stage (Vercel Hobby's 300 s ceiling, 2026-10-20) ─────────────────────
describe('runAllocationAdviceStage', () => {
  const NOW = new Date('2026-10-20T10:00:00.000Z');
  const afterStrategy = (): AllocationAdviceDocument => ({
    userId: 'u1',
    status: 'running',
    answers: ANSWERS,
    stage: 'strategy',
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    strategy: { markdown: '# La situazione\nTesto strategia.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW },
    instruments: null,
    report: null,
    error: null,
    applied: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockResolvedValue(undefined);
    patchMock.mockResolvedValue(undefined);
    ytdMock.mockResolvedValue({ portfolio: {} });
  });

  it('the strategy creates the document and stops there; the instruments continue the persisted one from the store', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'), message(instrumentsText, 'end_turn', 'sonnet', true));
    const stages: string[] = [];

    const first = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: (stage) => stages.push(stage), now: NOW });
    expect(stages).toEqual(['context', 'strategy']);
    expect(first.status).toBe('running');
    expect(first.strategy?.proposal?.summary).toBe('Strategia.');
    expect(first.instruments).toBeNull();
    expect(calls).toHaveBeenCalledTimes(1);

    getMock.mockResolvedValue(afterStrategy());
    const second = await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(['context', 'strategy', 'instruments']);
    expect(getMock).toHaveBeenCalledWith('u1');
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(second.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
    // The stage is written before the model is called, with the run back to running.
    const entered = patchMock.mock.calls.map((call) => call[1] as Record<string, unknown>).find((patch) => patch.stage === 'instruments');
    expect(entered).toMatchObject({ stage: 'instruments', status: 'running', error: null });
  });

  it('the instruments resume a paused turn: the paused answer goes back as the assistant message, the texts are joined (2026-10-23)', async () => {
    const paused = message('- All World: ', 'pause_turn', 'sonnet', true);
    const calls = answerWith(paused, message('trovato.\n\n' + instrumentsText.split('\n\n')[1], 'end_turn', 'sonnet'));

    const document = await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: afterStrategy(), onStage: vi.fn() });

    expect(calls).toHaveBeenCalledTimes(2);
    const [first, second] = calls.mock.calls.map((call) => (call[0] as unknown as { messages: { role: string; content: unknown }[] }).messages);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[1]).toEqual({ role: 'assistant', content: paused.content });
    expect(document.instruments?.markdown).toBe('- All World: trovato.');
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
  });

  it(`fails a stage still paused after ${ALLOCATION_ADVICE_MAX_CONTINUATIONS} resumptions, retryable`, async () => {
    const calls = answerWith(...Array.from({ length: ALLOCATION_ADVICE_MAX_CONTINUATIONS + 1 }, () => message('ancora…', 'pause_turn', 'sonnet', true)));
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: afterStrategy(), onStage: vi.fn() })).rejects.toMatchObject({
      stage: 'instruments',
      retryable: true,
      message: expect.stringMatching(/interrotta/),
    });
    expect(calls).toHaveBeenCalledTimes(ALLOCATION_ADVICE_MAX_CONTINUATIONS + 1);
  });

  it('the review reads the strategy and the instruments with their blocks put back, and closes the run', async () => {
    const calls = answerWith(message(reviewText({ ...PROPOSAL, summary: 'Rivista.' })));
    const document = afterStrategy();
    document.instruments = { markdown: '- All World: trovato.', candidates: { sleeves: [{ assetClass: 'equity', subTarget: 'All World', candidates: [{ name: 'ETF Mondo', exchange: 'Borsa Italiana', note: 'ok' }] }] } as never, model: 'sonnet', webSearchUsed: true, finishedAt: NOW };

    const closed = await runAllocationAdviceStage({ userId: 'u1', stage: 'review', document, onStage: vi.fn() });

    expect(closed.status).toBe('ready');
    expect(closed.report?.proposal?.summary).toBe('Rivista.');
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('```allocation-proposal');
    expect(userContent).toContain('"summary":"Strategia."');
    expect(userContent).toContain('```instrument-candidates');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('the strategy reads the plan in force from the last document before replacing it (2026-10-20)', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'));
    const last = afterStrategy();
    last.status = 'applied';
    last.report = { markdown: '# Report\nIl piano di prima.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW };
    last.applied = { at: NOW, targetsWritten: true, rolesChanged: 0, goalsWritten: 0 };
    last.revisions = [{ request: 'meno cripto', at: NOW }];
    getMock.mockResolvedValue(last);

    const next = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });

    expect(getMock).toHaveBeenCalledWith('u1');
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('--- IL PIANO IN VIGORE E IL PERCHÉ (il report del percorso precedente, del 2026-10-20; applicato alle impostazioni il 2026-10-20; da rivedere entro il 2028-10-20) ---\n# Report\nIl piano di prima.');
    expect(userContent).toContain('1. meno cripto');
    // The new document starts clean: the old report is the prompt's, not the document's.
    expect(next.report).toBeNull();
    expect(next.revisions).toBeUndefined();
  });

  it('revise: the review again on a finished report, the request kept on the document (2026-10-20)', async () => {
    const calls = answerWith(message(reviewText({ ...PROPOSAL, summary: 'Rivista su richiesta.' })));
    const document = afterStrategy();
    document.instruments = { markdown: '- trovato.', candidates: null, model: 'sonnet', webSearchUsed: true, finishedAt: NOW };
    document.report = { markdown: '# Report\nPrima versione.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW };
    document.status = 'applied';
    document.revisions = [{ request: 'meno cripto', at: NOW }];

    const revised = await runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document, request: 'solo bond singoli', onStage: vi.fn() });

    expect(revised.status).toBe('ready');
    expect(revised.report?.proposal?.summary).toBe('Rivista su richiesta.');
    expect(revised.report?.markdown).toBe('# In una frase\nReport.');
    expect(revised.revisions?.map((row) => row.request)).toEqual(['meno cripto', 'solo bond singoli']);
    const params = calls.mock.calls[0][0] as unknown as Params & { messages: { content: string }[] };
    expect(params.output_config.format?.type).toBe('json_schema');
    const userContent = String(params.messages[0].content);
    expect(userContent).toContain('Prima versione.');
    expect(userContent).toContain('1. meno cripto\n2. solo bond singoli');
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'ready', revisions: [expect.objectContaining({ request: 'meno cripto' }), expect.objectContaining({ request: 'solo bond singoli' })] });
  });

  it('revise refuses a document with no report, and an empty request, without calling a model', async () => {
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: afterStrategy(), request: 'x', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'review', retryable: false, message: expect.stringMatching(/report finito/) });
    const withReport = { ...afterStrategy(), instruments: { markdown: '', candidates: null, model: 's', webSearchUsed: false, finishedAt: NOW }, report: { markdown: 'r', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW } };
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: withReport, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'review', retryable: false });
    expect(calls).not.toHaveBeenCalled();
  });

  it("refuses to continue what is not there, in the product's words, without calling a model", async () => {
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    getMock.mockResolvedValue(null);
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'instruments', retryable: false, message: expect.stringMatching(/Non trovo il percorso/) });

    const noStrategy = { ...afterStrategy(), strategy: null };
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: noStrategy, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'instruments', retryable: false });
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'failed', stage: 'instruments' });

    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: false });
    expect(calls).not.toHaveBeenCalled();
  });
});
