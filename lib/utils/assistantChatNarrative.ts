/**
 * Every sentence of the Assistente as a chat (2026-11-12): the page is a conversation and a
 * composer, every message goes as `mode: 'auto'`, and the router's reading comes back with the
 * answer. This module names a reading («analisi di ottobre 2026»), writes the line under an answer
 * («Ho letto: …») and builds the four suggestions of an empty chat from what the account holds.
 *
 * Pure: the suggestions read the Panoramica's payload as the page already holds it, and a
 * category named in a sentence comes from that payload at runtime, never from here.
 */
import { MONTH_NAMES } from '@/lib/constants/months';
import type { AssistantRouteOverride, AssistantRouteReading } from '@/types/assistant';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

export const EMPTY_CHAT_QUESTION = 'Cosa vuoi sapere, o cosa vuoi registrare?';
export const CHAT_COMPOSER_PLACEHOLDER = 'Chiedi del tuo patrimonio o scrivi una spesa…';
export const CHANGE_READING_LABEL = 'cambia';
export const CHANGE_READING_ARIA = 'Cambia come ho letto la domanda';
export const EMPTY_CHAT_SUGGESTIONS_MAX = 4;
// A longer category name would make the suggestion a paragraph: the generic row takes its place.
const CATEGORY_IN_SENTENCE_MAX = 40;

const monthName = (month: number) => MONTH_NAMES[month - 1].toLowerCase();

/** «analisi di ottobre 2026», «domanda libera, sui dati di oggi», «un movimento da registrare». */
export function describeRoute({ intent, period }: AssistantRouteOverride): string {
  if (intent === 'register') return 'un movimento da registrare';
  if (intent === 'month_analysis' && period.kind === 'month') {
    return `analisi di ${monthName(period.month)} ${period.year}`;
  }
  if (intent === 'year_analysis' && period.kind === 'year') return `analisi del ${period.year}`;
  if (intent === 'ytd_analysis') return 'analisi da inizio anno';
  if (intent === 'history_analysis') return 'analisi di tutto lo storico';
  if (period.kind === 'month') return `domanda su ${monthName(period.month)} ${period.year}`;
  if (period.kind === 'year') return `domanda sul ${period.year}`;
  if (period.kind === 'ytd') return "domanda sull'andamento da inizio anno";
  if (period.kind === 'history') return 'domanda su tutto lo storico';
  return 'domanda libera, sui dati di oggi';
}

/**
 * The line under an answer, without « · cambia» (a button the component appends). A carried
 * reading reads «Ho letto» like the router's: «Hai scelto» is only what the owner picked with
 * «cambia» (2026-11-12). The web is what the answer DID (`webSearchUsed`), the reading's flag only
 * when the answer does not say.
 */
export function describeReadingLine(reading: AssistantRouteReading, webSearchUsed: boolean | undefined): string {
  const what = describeRoute(reading.route);
  const head = reading.source === 'fallback' ? `Non ne sono sicuro: l'ho letta come ${what}`
    : reading.source === 'override' ? `Hai scelto: ${what}` : `Ho letto: ${what}`; // 'router' and 'carried'
  return (webSearchUsed ?? reading.route.webSearch) ? `${head} · con ricerca web` : head;
}

/** A row of an empty chat: `text` is what pressing it writes in the composer; a register row is a sentence to finish. */
export interface EmptyChatSuggestion { id: string; label: string; text: string; register: boolean }
export type EmptyChatState = 'unknown' | 'nothing' | 'assets-only' | 'cashflow';

const SPENT: EmptyChatSuggestion = { id: 'spent', label: 'Oggi ho speso…', text: 'Oggi ho speso ', register: true };
const SALARY: EmptyChatSuggestion = { id: 'salary', label: 'Ho ricevuto lo stipendio di…',
  text: 'Ho ricevuto lo stipendio di ', register: true };
const MOVED: EmptyChatSuggestion = { id: 'moved', label: 'Ho spostato…', text: 'Ho spostato ', register: true };
const ask = (id: string, text: string): EmptyChatSuggestion => ({ id, label: text, text, register: false });

/** What the account holds, as the suggestions read it: no payload yet, nothing, assets only, a cashflow this or last month. */
export function readEmptyChatState(overview: DashboardOverviewPayload | null | undefined): EmptyChatState {
  if (!overview) return 'unknown';
  const stats = overview.expenseStats;
  const moved = stats ? [stats.currentMonth, stats.previousMonth].some((m) => m.income !== 0 || m.expenses !== 0)
    : false;
  if (moved) return 'cashflow';
  return overview.flags.assetCount > 0 ? 'assets-only' : 'nothing';
}

/** Four rows for an empty chat, from what the account holds; `registerFirst` for `?mode=registra`. */
export function buildEmptyChatSuggestions(input: { overview: DashboardOverviewPayload | null | undefined;
  today: { year: number; month: number }; registerFirst: boolean }): EmptyChatSuggestion[] {
  const previousMonth = input.today.month === 1 ? 12 : input.today.month - 1;
  const lastMonth = ask('last-month', `Com'è andato ${monthName(previousMonth)}?`);
  const ytd = ask('ytd', 'Come sto andando da inizio anno?');
  const growth = ask('history', 'Come sono cresciuto negli anni?');
  const top = input.overview?.expenseStats?.topExpenseCategories[0]?.category;
  const byState: Record<EmptyChatState, EmptyChatSuggestion[]> = {
    unknown: [lastMonth, ytd, growth, SPENT],
    nothing: [ask('start', 'Da dove comincio a tenere traccia del patrimonio?'), SPENT, SALARY,
      ask('skills', 'Cosa sai fare per me?')],
    'assets-only': [ask('composition', "Com'è composto il mio patrimonio oggi?"),
      ask('allocation', "Sono allineato all'allocazione obiettivo?"), growth, SPENT],
    cashflow: [lastMonth, top && top.length <= CATEGORY_IN_SENTENCE_MAX
      ? ask('top-category', `Quanto ho speso in ${top} questo mese?`)
      : ask('where', 'Dove sono andati i soldi questo mese?'), ytd, SPENT],
  };
  const rows = byState[readEmptyChatState(input.overview)];
  if (!input.registerFirst) return rows.slice(0, EMPTY_CHAT_SUGGESTIONS_MAX);
  const firstQuestion = rows.find((row) => !row.register) ?? lastMonth;
  return [SPENT, SALARY, MOVED, firstQuestion];
}

/** The server's stream status, as the waiting phrases read it. */
export type AssistantWaitingStatus = 'searching' | 'writing' | 'computing' | 'saving' | null;

/** «ottobre 2026», «il 2025», «l'anno fino a oggi», «tutto lo storico»: an analysis's period after «Apro». */
function openedPeriod({ intent, period }: AssistantRouteOverride): string | null {
  if (intent === 'month_analysis' && period.kind === 'month') return `${monthName(period.month)} ${period.year}`;
  if (intent === 'year_analysis' && period.kind === 'year') return `il ${period.year}`;
  if (intent === 'ytd_analysis') return "l'anno fino a oggi";
  if (intent === 'history_analysis') return 'tutto lo storico';
  return null;
}

/**
 * What the answer's place says while no text has arrived (owner, 2026-11-16), one phrase at a time:
 * the question being read until the router's `route` event, the web while the server searches it,
 * the sums while its tools compute, then what the server is doing for THIS reading — the period
 * opened, the row prepared. Never an operation the server is not doing: the web only on its
 * `searching` status, where a search can last a minute and two true phrases take turns (owner,
 * 2026-11-16); the sums only on its `computing` status (the tools, 2026-11-26).
 */
export function buildWaitingPhrases(reading: AssistantRouteReading | null | undefined, status: AssistantWaitingStatus): string[] {
  if (status === 'searching') return ['Sto cercando sul web…', 'Leggo i risultati…'];
  // The tools at work on the user's data (2026-11-26): true whatever the reading.
  if (status === 'computing') return ['Faccio i conti sui tuoi dati…', 'Controllo le cifre…'];
  if (!reading) return ['Sto leggendo la domanda…'];
  if (reading.route.intent === 'register') return ['Cerco la categoria giusta…', 'Controllo i conti…', 'Preparo la riga…'];
  const period = openedPeriod(reading.route);
  if (period) return [`Apro ${period}…`, 'Confronto entrate e spese…', 'Guardo cosa ha mosso il patrimonio…'];
  return ['Ci sto ragionando…', 'Rileggo il portafoglio…', 'Metto in fila i numeri…'];
}
