/**
 * Tests for `lib/utils/assistantRoute.ts` — the reading of a message as one of the app's modes
 * (2026-11): which pairings of intent and period exist, how the router's tool input becomes a
 * route, and how a route becomes today's request fields.
 *
 * Seen RED on purpose: `intent === 'chat' ||` written `intent === 'register' ||` (it type-checks)
 * fails «a free question may carry any period»; `chatContext: 'none'` hard-coded in
 * `routeToSelection` fails the chat rows; without the register coercion in `parseRouterToolInput`
 * a Registra reading keeps its month and its web flag.
 */
import { describe, expect, it } from 'vitest';
import {
  checkRouteConsistency,
  parseRouterToolInput,
  routeToSelection,
} from '@/lib/utils/assistantRoute';
import type { AssistantRouteOverride, AssistantRoutePeriod } from '@/types/assistant';

const TODAY = { year: 2026, month: 11 };
const MONTH: AssistantRoutePeriod = { kind: 'month', year: 2026, month: 10 };
const YEAR: AssistantRoutePeriod = { kind: 'year', year: 2025 };
const NONE: AssistantRoutePeriod = { kind: 'none' };
const YTD: AssistantRoutePeriod = { kind: 'ytd' };
const HISTORY: AssistantRoutePeriod = { kind: 'history' };
const PERIODS = [NONE, MONTH, YEAR, YTD, HISTORY];

function route(intent: AssistantRouteOverride['intent'], period: AssistantRoutePeriod, webSearch = false): AssistantRouteOverride {
  return { intent, period, webSearch };
}

describe('checkRouteConsistency — each analysis has its own period, Registra none', () => {
  it('accepts each intent on its own period', () => {
    expect(checkRouteConsistency(route('month_analysis', MONTH), TODAY)).toBe(true);
    expect(checkRouteConsistency(route('year_analysis', YEAR), TODAY)).toBe(true);
    expect(checkRouteConsistency(route('ytd_analysis', YTD), TODAY)).toBe(true);
    expect(checkRouteConsistency(route('history_analysis', HISTORY), TODAY)).toBe(true);
    expect(checkRouteConsistency(route('register', NONE), TODAY)).toBe(true);
  });

  it('refuses every wrong pairing of an analysis or Registra with a period', () => {
    const own = { month_analysis: MONTH, year_analysis: YEAR, ytd_analysis: YTD, history_analysis: HISTORY, register: NONE } as const;
    for (const [intent, ownPeriod] of Object.entries(own)) {
      for (const period of PERIODS.filter((p) => p !== ownPeriod)) {
        expect(checkRouteConsistency(route(intent as keyof typeof own, period), TODAY), `${intent} on ${period.kind}`).toBe(false);
      }
    }
  });

  it('a free question may carry any period', () => {
    for (const period of PERIODS) {
      expect(checkRouteConsistency(route('chat', period), TODAY), period.kind).toBe(true);
    }
  });

  it('refuses a month or a year after today, and before 2000', () => {
    expect(checkRouteConsistency(route('month_analysis', { kind: 'month', year: 2026, month: 12 }), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('month_analysis', { kind: 'month', year: 2027, month: 1 }), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('month_analysis', { kind: 'month', year: 2026, month: 11 }), TODAY), 'the running month').toBe(true);
    expect(checkRouteConsistency(route('chat', { kind: 'year', year: 2027 }), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('year_analysis', { kind: 'year', year: 1999 }), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('chat', { kind: 'month', year: 1999, month: 12 }), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('year_analysis', { kind: 'year', year: 2000 }), TODAY)).toBe(true);
  });

  it('refuses Registra with a web search', () => {
    expect(checkRouteConsistency(route('register', NONE, true), TODAY)).toBe(false);
    expect(checkRouteConsistency(route('chat', NONE, true), TODAY)).toBe(true);
  });
});

describe('parseRouterToolInput — the model\'s tool input as a route', () => {
  const base = { webSearch: false, confidence: 0.9 };

  it('reads a month', () => {
    expect(parseRouterToolInput({ ...base, intent: 'month_analysis', periodKind: 'month', year: 2026, month: 10 }, TODAY))
      .toEqual({ intent: 'month_analysis', period: MONTH, webSearch: false, confidence: 0.9 });
  });

  it('reads ytd with `year: null`, the flat fields of a period kind without them ignored', () => {
    expect(parseRouterToolInput({ ...base, intent: 'ytd_analysis', periodKind: 'ytd', year: null, month: null }, TODAY))
      .toEqual({ intent: 'ytd_analysis', period: YTD, webSearch: false, confidence: 0.9 });
  });

  it('is null for a month without its month, a year without its year, a confidence above 1, an unknown intent', () => {
    expect(parseRouterToolInput({ ...base, intent: 'month_analysis', periodKind: 'month', year: 2026 }, TODAY)).toBeNull();
    expect(parseRouterToolInput({ ...base, intent: 'year_analysis', periodKind: 'year' }, TODAY)).toBeNull();
    expect(parseRouterToolInput({ ...base, intent: 'chat', periodKind: 'none', confidence: 1.2 }, TODAY)).toBeNull();
    expect(parseRouterToolInput({ ...base, intent: 'weekly', periodKind: 'none' }, TODAY)).toBeNull();
    expect(parseRouterToolInput('not an object', TODAY)).toBeNull();
  });

  it('is null for an inconsistent or future reading', () => {
    expect(parseRouterToolInput({ ...base, intent: 'month_analysis', periodKind: 'year', year: 2025 }, TODAY)).toBeNull();
    expect(parseRouterToolInput({ ...base, intent: 'chat', periodKind: 'month', year: 2026, month: 12 }, TODAY)).toBeNull();
  });

  it('turns the web off for Registra, whatever the model says', () => {
    expect(parseRouterToolInput({ intent: 'register', periodKind: 'none', webSearch: true, confidence: 0.9 }, TODAY))
      .toEqual({ intent: 'register', period: NONE, webSearch: false, confidence: 0.9 });
  });

  it('keeps Registra and drops the period: a date in the sentence is the row\'s', () => {
    expect(parseRouterToolInput({ ...base, intent: 'register', periodKind: 'month', year: 2026, month: 10 }, TODAY))
      .toEqual({ intent: 'register', period: NONE, webSearch: false, confidence: 0.9 });
  });
});

describe('routeToSelection — a reading as today\'s request fields', () => {
  it.each([
    [route('month_analysis', MONTH), { mode: 'month_analysis', month: { year: 2026, month: 10 } }],
    [route('year_analysis', YEAR), { mode: 'year_analysis', year: 2025 }],
    [route('ytd_analysis', YTD), { mode: 'ytd_analysis' }],
    [route('history_analysis', HISTORY), { mode: 'history_analysis' }],
    [route('register', NONE), { mode: 'register' }],
    [route('chat', NONE), { mode: 'chat', chatContext: 'none' }],
    [route('chat', MONTH), { mode: 'chat', chatContext: 'month', month: { year: 2026, month: 10 } }],
    [route('chat', YEAR), { mode: 'chat', chatContext: 'year', year: 2025 }],
    [route('chat', YTD), { mode: 'chat', chatContext: 'ytd' }],
    [route('chat', HISTORY), { mode: 'chat', chatContext: 'history' }],
  ])('%o → %o', (reading, selection) => {
    expect(routeToSelection(reading)).toEqual(selection);
  });
});
