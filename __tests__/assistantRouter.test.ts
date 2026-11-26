/**
 * Tests for `lib/server/assistant/router.ts` — the ONE forced-tool Haiku call that reads an
 * Assistente message sent with `mode: 'auto'` (2026-11). No test calls Anthropic: every case passes
 * a fake `RouterClient` whose `messages.create` is a `vi.fn()`.
 *
 * Seen RED on purpose: `todayIso` interpolated into the system prompt fails R1; `maxRetries: 2`
 * fails R2; the confidence check dropped fails R3 (0.4 is read as the router's); the previous
 * message's `slice` dropped fails R4.
 */
import { describe, expect, it, vi } from 'vitest';
import { APIConnectionTimeoutError } from '@anthropic-ai/sdk';
import {
  ASSISTANT_ROUTER_SYSTEM,
  ROUTER_TOOL_NAME,
  buildRouterRequest,
  buildRouterUserContent,
  routeAssistantMessage,
  type AssistantRouterInput,
  type RouterClient,
} from '@/lib/server/assistant/router';
import { ASSISTANT_ROUTER_MODEL } from '@/lib/constants/aiModels';
import type { AssistantRouteReading } from '@/types/assistant';

const TODAY = { year: 2026, month: 11 };

const PREVIOUS_READING: AssistantRouteReading = {
  route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 },
  source: 'router',
};

function input(overrides: Partial<AssistantRouterInput> = {}): AssistantRouterInput {
  return { prompt: 'com’è andato ottobre?', today: TODAY, todayIso: '2026-11-16', previous: null, ...overrides };
}

/** A fake client answering one message with `content`, or rejecting with `error`. */
function fakeClient(answer: { content?: unknown[]; error?: unknown }) {
  const create = answer.error !== undefined
    ? vi.fn().mockRejectedValue(answer.error)
    : vi.fn().mockResolvedValue({ content: answer.content });
  return { client: { messages: { create } } as unknown as RouterClient, create };
}

function toolUse(toolInput: unknown) {
  return { type: 'tool_use', id: 'toolu_1', name: ROUTER_TOOL_NAME, input: toolInput };
}

describe('the router\'s request', () => {
  it('R1: the system prompt is byte-identical for every input and holds none of its data', () => {
    const a = buildRouterRequest(input({ prompt: 'benzina 60 ornitorinco', todayIso: '2026-11-16' }));
    const b = buildRouterRequest(input({
      prompt: 'e a settembre? fenicottero',
      todayIso: '2027-02-03',
      today: { year: 2027, month: 2 },
      previous: { reading: PREVIOUS_READING, userMessage: 'com’è andato ottobre?' },
    }));
    expect(a.system).toBe(b.system);
    expect(a.system).toBe(ASSISTANT_ROUTER_SYSTEM);
    for (const data of ['ornitorinco', 'fenicottero', '2026-11-16', '2027-02-03']) {
      expect(ASSISTANT_ROUTER_SYSTEM).not.toContain(data);
    }
  });

  it('turns the web on for a rule of law: the system names fiscal norms and dependants', () => {
    // A tax or pension question needs a dated source (owner, 2026-11-23): the router asks for it.
    expect(ASSISTANT_ROUTER_SYSTEM).toContain('norma fiscale');
    expect(ASSISTANT_ROUTER_SYSTEM).toContain('familiari a carico');
  });

  it('R2: Haiku, 256 tokens, one tool forced, nothing else; the call takes 4 s and no retry', async () => {
    const request = buildRouterRequest(input());
    expect(request.model).toBe(ASSISTANT_ROUTER_MODEL);
    expect(ASSISTANT_ROUTER_MODEL).toBe('claude-haiku-5-5');
    expect(request.max_tokens).toBe(256);
    expect(request.tools).toHaveLength(1);
    expect(request.tool_choice).toEqual({ type: 'tool', name: ROUTER_TOOL_NAME });
    for (const key of ['thinking', 'fallbacks', 'output_config', 'cache_control', 'betas', 'stream']) {
      expect(request, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(request)).not.toContain('cache_control');

    const { client, create } = fakeClient({ content: [toolUse({ intent: 'chat', periodKind: 'none', webSearch: false, confidence: 0.9 })] });
    await routeAssistantMessage(input(), client);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual(request);
    expect(create.mock.calls[0][1]).toEqual({ timeout: 4000, maxRetries: 0 });
  });
});

describe('R3: the reading, and every failure as the fallback', () => {
  it('reads a month as the router\'s', async () => {
    const { client } = fakeClient({ content: [toolUse({ intent: 'month_analysis', periodKind: 'month', year: 2026, month: 10, webSearch: false, confidence: 0.9 })] });
    const reading = await routeAssistantMessage(input(), client);
    expect(reading).toMatchObject({ route: PREVIOUS_READING.route, source: 'router' });
    expect(reading).not.toHaveProperty('reason');
    expect(typeof reading.elapsedMs).toBe('number');
  });

  it('a confidence below 0.6 is the fallback, low-confidence, with the model\'s confidence', async () => {
    const { client } = fakeClient({ content: [toolUse({ intent: 'month_analysis', periodKind: 'month', year: 2026, month: 10, webSearch: false, confidence: 0.4 })] });
    const reading = await routeAssistantMessage(input(), client);
    expect(reading).toMatchObject({
      route: { intent: 'chat', period: { kind: 'none' }, webSearch: false, confidence: 0.4 },
      source: 'fallback',
      reason: 'low-confidence',
    });
  });

  it('text with no tool block, and a malformed input, are the fallback, invalid', async () => {
    for (const content of [
      [{ type: 'text', text: 'È un\'analisi mensile.' }],
      [toolUse({ intent: 'month_analysis', periodKind: 'month', webSearch: false, confidence: 0.9 })],
    ]) {
      const { client } = fakeClient({ content });
      await expect(routeAssistantMessage(input(), client)).resolves.toMatchObject({
        route: { intent: 'chat', period: { kind: 'none' }, confidence: 0 }, source: 'fallback', reason: 'invalid',
      });
    }
  });

  it('a timeout and any other error are the fallback, logged by class and status, never the prompt — and it never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timeout = fakeClient({ error: new APIConnectionTimeoutError() });
    await expect(routeAssistantMessage(input({ prompt: 'ornitorinco' }), timeout.client)).resolves.toMatchObject({ source: 'fallback', reason: 'timeout' });
    const broken = fakeClient({ error: Object.assign(new Error('boom'), { status: 400 }) });
    await expect(routeAssistantMessage(input({ prompt: 'ornitorinco' }), broken.client)).resolves.toMatchObject({ source: 'fallback', reason: 'error' });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]).toEqual(['[assistant/router] call failed', { name: 'Error', status: 400 }]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ornitorinco');
    warn.mockRestore();
  });
});

describe('R4: the user content', () => {
  it('holds the prompt only inside <messaggio>, the day in <oggi>, and «nessuna» without a previous turn', () => {
    const content = buildRouterUserContent(input({ prompt: 'benzina 60' }));
    expect(content).toBe('<oggi>2026-11-16</oggi>\n<lettura_precedente>nessuna</lettura_precedente>\n<messaggio>benzina 60</messaggio>');
  });

  it('describes the previous reading and cuts the previous message at 300 characters', () => {
    const content = buildRouterUserContent(input({
      prompt: 'e a settembre?',
      previous: { reading: PREVIOUS_READING, userMessage: 'a'.repeat(299) + 'bc' },
    }));
    expect(content).toContain('<lettura_precedente>intent=month_analysis period=month 2026-10 webSearch=false</lettura_precedente>');
    expect(content).toContain(`<messaggio_precedente>${'a'.repeat(299)}b</messaggio_precedente>`);
    expect(content).not.toContain('bc');
    expect(content.endsWith('<messaggio>e a settembre?</messaggio>')).toBe(true);
  });
});
