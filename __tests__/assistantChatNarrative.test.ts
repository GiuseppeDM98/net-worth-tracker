/**
 * `lib/utils/assistantChatNarrative.ts` — every sentence of the Assistente as a chat (2026-11-12):
 * how a reading is named, the line under an answer, and the four suggestions of an empty chat built
 * from what the account holds. Invented categories («Spesa», «Viaggi») and round figures.
 *
 * Seen RED on purpose: `describeRoute` without `toLowerCase()` («analisi di Ottobre 2026»); the
 * `top.length <= CATEGORY_IN_SENTENCE_MAX` guard dropped (the 41-character category enters the sentence).
 */
import { describe, expect, it } from 'vitest';
import {
  buildEmptyChatSuggestions,
  buildWaitingPhrases,
  describeReadingLine,
  describeRoute,
  readEmptyChatState,
} from '@/lib/utils/assistantChatNarrative';
import type { AssistantRouteOverride, AssistantRoutePeriod, AssistantRouteReading } from '@/types/assistant';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

const OCTOBER: AssistantRoutePeriod = { kind: 'month', year: 2026, month: 10 };
const route = (intent: AssistantRouteOverride['intent'], period: AssistantRoutePeriod, webSearch = false): AssistantRouteOverride => ({
  intent,
  period,
  webSearch,
});
const reading = (source: AssistantRouteReading['source'], r: AssistantRouteOverride = route('month_analysis', OCTOBER)): AssistantRouteReading => ({
  route: { ...r, confidence: source === 'fallback' ? 0 : 1 },
  source,
  ...(source === 'fallback' ? { reason: 'low-confidence' as const } : {}),
});

/** A Panoramica payload with only the fields the suggestions read. */
function overview(input: { assets?: number; income?: number; expenses?: number; previousIncome?: number; top?: string | null; noStats?: boolean }): DashboardOverviewPayload {
  const month = (income: number, expenses: number) => ({ income, expenses, net: income + expenses });
  return {
    flags: { assetCount: input.assets ?? 0, hasCostBasisTracking: false, hasTERTracking: false, hasStampDuty: false, currentMonthSnapshotExists: false },
    expenseStats: input.noStats
      ? null
      : {
          currentMonth: month(input.income ?? 0, input.expenses ?? 0),
          previousMonth: month(input.previousIncome ?? 0, 0),
          delta: month(0, 0),
          topExpenseCategories: input.top ? [{ category: input.top, amount: 500 }] : [],
          topIncomeCategories: [],
        },
  } as unknown as DashboardOverviewPayload;
}

const NOVEMBER = { year: 2026, month: 11 };
const labels = (rows: { label: string }[]) => rows.map((row) => row.label);

describe('describeRoute — the ten readings', () => {
  it('names the four analyses on their period', () => {
    expect(describeRoute(route('month_analysis', OCTOBER))).toBe('analisi di ottobre 2026');
    expect(describeRoute(route('year_analysis', { kind: 'year', year: 2025 }))).toBe('analisi del 2025');
    expect(describeRoute(route('ytd_analysis', { kind: 'ytd' }))).toBe('analisi da inizio anno');
    expect(describeRoute(route('history_analysis', { kind: 'history' }))).toBe('analisi di tutto lo storico');
  });

  it('names a registration, whatever the period', () => {
    expect(describeRoute(route('register', { kind: 'none' }))).toBe('un movimento da registrare');
  });

  it('names a question on each of the five periods', () => {
    expect(describeRoute(route('chat', OCTOBER))).toBe('domanda su ottobre 2026');
    expect(describeRoute(route('chat', { kind: 'year', year: 2025 }))).toBe('domanda sul 2025');
    expect(describeRoute(route('chat', { kind: 'ytd' }))).toBe("domanda sull'andamento da inizio anno");
    expect(describeRoute(route('chat', { kind: 'history' }))).toBe('domanda su tutto lo storico');
    expect(describeRoute(route('chat', { kind: 'none' }))).toBe('domanda libera, sui dati di oggi');
  });
});

describe('describeReadingLine — the line under an answer', () => {
  it('reads «Ho letto» for the router and for a carried reading', () => {
    expect(describeReadingLine(reading('router'), false)).toBe('Ho letto: analisi di ottobre 2026');
    expect(describeReadingLine(reading('carried'), false)).toBe('Ho letto: analisi di ottobre 2026');
  });

  it('reads «Hai scelto» for an override and «Non ne sono sicuro» for a fallback', () => {
    expect(describeReadingLine(reading('override', route('register', { kind: 'none' })), false)).toBe('Hai scelto: un movimento da registrare');
    expect(describeReadingLine(reading('fallback', route('chat', { kind: 'none' })), false)).toBe(
      "Non ne sono sicuro: l'ho letta come domanda libera, sui dati di oggi",
    );
  });

  it('says the web from `webSearchUsed` over the reading, and from the reading when the answer says nothing', () => {
    const asked = reading('router', route('chat', { kind: 'none' }, true));
    expect(describeReadingLine(asked, false)).toBe('Ho letto: domanda libera, sui dati di oggi');
    expect(describeReadingLine(reading('router'), true)).toBe('Ho letto: analisi di ottobre 2026 · con ricerca web');
    expect(describeReadingLine(asked, undefined)).toBe('Ho letto: domanda libera, sui dati di oggi · con ricerca web');
  });
});

describe('buildEmptyChatSuggestions — four rows from what the account holds', () => {
  it('reads the four states', () => {
    expect(readEmptyChatState(undefined)).toBe('unknown');
    expect(readEmptyChatState(overview({}))).toBe('nothing');
    expect(readEmptyChatState(overview({ assets: 3 }))).toBe('assets-only');
    expect(readEmptyChatState(overview({ assets: 3, noStats: true }))).toBe('assets-only');
    expect(readEmptyChatState(overview({ previousIncome: 2500 }))).toBe('cashflow');
    expect(readEmptyChatState(overview({ expenses: -50 }))).toBe('cashflow');
  });

  it('gives each state its exact labels', () => {
    const build = (o: DashboardOverviewPayload | undefined) => labels(buildEmptyChatSuggestions({ overview: o, today: NOVEMBER, registerFirst: false }));
    expect(build(undefined)).toEqual(["Com'è andato ottobre?", 'Come sto andando da inizio anno?', 'Come sono cresciuto negli anni?', 'Oggi ho speso…']);
    expect(build(overview({}))).toEqual([
      'Da dove comincio a tenere traccia del patrimonio?',
      'Oggi ho speso…',
      'Ho ricevuto lo stipendio di…',
      'Cosa sai fare per me?',
    ]);
    expect(build(overview({ assets: 2 }))).toEqual([
      "Com'è composto il mio patrimonio oggi?",
      "Sono allineato all'allocazione obiettivo?",
      'Come sono cresciuto negli anni?',
      'Oggi ho speso…',
    ]);
    expect(build(overview({ assets: 2, income: 2500, expenses: -1120, top: 'Spesa' }))).toEqual([
      "Com'è andato ottobre?",
      'Quanto ho speso in Spesa questo mese?',
      'Come sto andando da inizio anno?',
      'Oggi ho speso…',
    ]);
    expect(build(overview({ income: 2500 }))[1]).toBe('Dove sono andati i soldi questo mese?');
  });

  it('writes a register row as the start of a sentence, a question whole', () => {
    const [lastMonth, , , spent] = buildEmptyChatSuggestions({ overview: undefined, today: NOVEMBER, registerFirst: false });
    expect(spent).toEqual({ id: 'spent', label: 'Oggi ho speso…', text: 'Oggi ho speso ', register: true });
    expect(lastMonth).toEqual({ id: 'last-month', label: "Com'è andato ottobre?", text: "Com'è andato ottobre?", register: false });
  });

  it('puts the three register rows first for `?mode=registra`, then the state’s first question', () => {
    const rows = buildEmptyChatSuggestions({ overview: overview({ assets: 2 }), today: NOVEMBER, registerFirst: true });
    expect(labels(rows)).toEqual(['Oggi ho speso…', 'Ho ricevuto lo stipendio di…', 'Ho spostato…', "Com'è composto il mio patrimonio oggi?"]);
    expect(rows.map((row) => row.register)).toEqual([true, true, true, false]);
    expect(labels(buildEmptyChatSuggestions({ overview: undefined, today: NOVEMBER, registerFirst: true }))[3]).toBe("Com'è andato ottobre?");
  });

  it('names a category of 40 characters, never one of 41', () => {
    const forty = 'Viaggi'.padEnd(40, 'x');
    const fortyOne = 'Viaggi'.padEnd(41, 'x');
    const second = (top: string) =>
      buildEmptyChatSuggestions({ overview: overview({ income: 2500, top }), today: NOVEMBER, registerFirst: false })[1].label;
    expect(second(forty)).toBe(`Quanto ho speso in ${forty} questo mese?`);
    expect(second(fortyOne)).toBe('Dove sono andati i soldi questo mese?');
  });

  it('asks about December in January', () => {
    expect(buildEmptyChatSuggestions({ overview: undefined, today: { year: 2027, month: 1 }, registerFirst: false })[0].label).toBe(
      "Com'è andato dicembre?",
    );
  });
});

// While the answer has not started (owner, 2026-11-16: «come fai tu su Claude Code»): phrases that say
// what the server is doing for THIS reading, never an operation it is not doing.
describe('buildWaitingPhrases', () => {
  it('should read the question until the router has answered', () => {
    expect(buildWaitingPhrases(undefined, null)).toEqual(['Sto leggendo la domanda…']);
  });

  it('should say only the web while the server searches it', () => {
    // A search can last a minute (owner, 2026-11-16): two phrases, both true while it runs.
    expect(buildWaitingPhrases(reading('router'), 'searching')).toEqual(['Sto cercando sul web…', 'Leggo i risultati…']);
  });

  it('should name the period of an analysis, in its words', () => {
    expect(buildWaitingPhrases(reading('router'), null)[0]).toBe('Apro ottobre 2026…');
    expect(buildWaitingPhrases(reading('router', route('year_analysis', { kind: 'year', year: 2025 })), null)[0]).toBe('Apro il 2025…');
    expect(buildWaitingPhrases(reading('router', route('ytd_analysis', { kind: 'ytd' })), null)[0]).toBe("Apro l'anno fino a oggi…");
    expect(buildWaitingPhrases(reading('router', route('history_analysis', { kind: 'history' })), null)[0]).toBe('Apro tutto lo storico…');
    expect(buildWaitingPhrases(reading('router'), 'writing')).toEqual([
      'Apro ottobre 2026…',
      'Confronto entrate e spese…',
      'Guardo cosa ha mosso il patrimonio…',
    ]);
  });

  it('should prepare a row for a registration, and reason for a free question', () => {
    expect(buildWaitingPhrases(reading('router', route('register', { kind: 'none' })), null)).toEqual([
      'Cerco la categoria giusta…',
      'Controllo i conti…',
      'Preparo la riga…',
    ]);
    expect(buildWaitingPhrases(reading('fallback', route('chat', { kind: 'none' })), null)).toEqual([
      'Ci sto ragionando…',
      'Rileggo il portafoglio…',
      'Metto in fila i numeri…',
    ]);
  });
});
