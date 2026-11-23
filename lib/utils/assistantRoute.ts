/**
 * The reading of an Assistente message as one of the app's modes (2026-11): the pairings of intent
 * and period that exist, the router's tool input turned into a route, and a route turned into
 * today's request fields — so the pipeline after a reading is the one an explicit mode runs.
 *
 * Pure and client-safe (zod only): the server validates the request's override and the router's
 * answer with it, the page (later) builds its override from the same shapes.
 *
 * WARNING (Checklist Comment): a new `AssistantMode` is added to `ASSISTANT_MODES` (the router
 * tool's enum), to `PERIOD_OF` below and to the intents of `ASSISTANT_ROUTER_SYSTEM`
 * (lib/server/assistant/router.ts) — the router never invents a mode.
 */
import { z } from 'zod';
import type {
  AssistantChatContextType,
  AssistantMode,
  AssistantMonthSelectorValue,
  AssistantRoute,
  AssistantRouteOverride,
  AssistantRoutePeriod,
} from '@/types/assistant';

export const ASSISTANT_MODES = [
  'month_analysis',
  'year_analysis',
  'ytd_analysis',
  'history_analysis',
  'chat',
  'register',
] as const satisfies readonly AssistantMode[];

/** Below it a reading is not trusted: the message is answered as a free question with no period. */
export const ASSISTANT_ROUTER_MIN_CONFIDENCE = 0.6;

// The first year a reading may name; the last is today's (the app has no data before it).
const FIRST_YEAR = 2000;

/** A free question with no period — today's portfolio — never a guessed analysis. */
export const FALLBACK_ROUTE: AssistantRoute = {
  intent: 'chat',
  period: { kind: 'none' },
  webSearch: false,
  confidence: 0,
};

export const assistantRoutePeriodSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('ytd') }),
  z.object({ kind: z.literal('history') }),
  z.object({ kind: z.literal('month'), year: z.number().int(), month: z.number().int().min(1).max(12) }),
  z.object({ kind: z.literal('year'), year: z.number().int() }),
]);

export const assistantRouteOverrideSchema = z.object({
  intent: z.enum(ASSISTANT_MODES),
  period: assistantRoutePeriodSchema,
  webSearch: z.boolean(),
});

/** A reading as stored on a message: what `mapMessage` accepts back from Firestore. */
export const assistantRouteReadingSchema = z.object({
  route: assistantRouteOverrideSchema.extend({ confidence: z.number().min(0).max(1) }),
  source: z.enum(['router', 'override', 'carried', 'fallback']),
  reason: z.enum(['error', 'timeout', 'invalid', 'low-confidence']).optional(),
});

/** The tool's input as the model writes it: flat, the period's fields optional. */
const routerToolInputSchema = z.object({
  intent: z.enum(ASSISTANT_MODES),
  periodKind: z.enum(['none', 'month', 'year', 'ytd', 'history']),
  year: z.number().int().nullish(),
  month: z.number().int().nullish(),
  webSearch: z.boolean(),
  confidence: z.number().min(0).max(1),
});

type Today = { year: number; month: number };

const PERIOD_OF: Record<Exclude<AssistantMode, 'chat'>, AssistantRoutePeriod['kind']> = {
  month_analysis: 'month',
  year_analysis: 'year',
  ytd_analysis: 'ytd',
  history_analysis: 'history',
  register: 'none',
};

/**
 * Each analysis has its own period; Registra has none and never searches; a free question may
 * carry any period. A month or a year is valid from 2000 to today's (Italian) month or year.
 */
export function checkRouteConsistency(route: AssistantRouteOverride, today: Today): boolean {
  const { intent, period } = route;
  if (period.kind === 'month' && (period.year < FIRST_YEAR || period.year > today.year
    || (period.year === today.year && period.month > today.month))) return false;
  if (period.kind === 'year' && (period.year < FIRST_YEAR || period.year > today.year)) return false;
  if (intent === 'register' && route.webSearch) return false;
  return intent === 'chat' || period.kind === PERIOD_OF[intent];
}

/** The router's tool input as a route, or null when it is malformed, inconsistent or in the future. */
export function parseRouterToolInput(raw: unknown, today: Today): AssistantRoute | null {
  const parsed = routerToolInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { intent, periodKind, year, month, confidence } = parsed.data;
  let period: AssistantRoutePeriod;
  if (periodKind === 'month') {
    if (year == null || month == null || month < 1 || month > 12) return null;
    period = { kind: 'month', year, month };
  } else if (periodKind === 'year') {
    if (year == null) return null;
    period = { kind: 'year', year };
  } else {
    period = { kind: periodKind };
  }
  // Registra has no period: a date the model read in the sentence belongs to the row, not to the reading.
  if (intent === 'register') period = { kind: 'none' };
  // Registra never searches, whatever the model says (the rule of webSearchPolicy.ts).
  const route: AssistantRoute = {
    intent,
    period,
    webSearch: intent !== 'register' && parsed.data.webSearch,
    confidence,
  };
  return checkRouteConsistency(route, today) ? route : null;
}

export interface AssistantRouteSelection {
  mode: AssistantMode;
  month?: AssistantMonthSelectorValue;
  year?: number;
  chatContext?: AssistantChatContextType;
}

/** What the chooser «cambia» opens asks (2026-11-12): what the message is, and on which period. */
export type RouteChooserKind = 'question' | 'analysis' | 'register';
export interface RouteChooserDraft { kind: RouteChooserKind; period: AssistantRoutePeriod['kind'];
  month: AssistantMonthSelectorValue; year: number; webSearch: boolean }

/**
 * A reading as the chooser's draft. The month and the year are always there, so switching the
 * period never leaves a picker empty: the reading's own, else last month and this year.
 */
export function routeToChooserDraft(route: AssistantRouteOverride, today: Today): RouteChooserDraft {
  const { intent, period } = route;
  const previous = today.month === 1 ? { year: today.year - 1, month: 12 }
    : { year: today.year, month: today.month - 1 };
  return {
    kind: intent === 'register' ? 'register' : intent === 'chat' ? 'question' : 'analysis',
    period: period.kind,
    month: period.kind === 'month' ? { year: period.year, month: period.month } : previous,
    year: period.kind === 'year' ? period.year : today.year,
    webSearch: route.webSearch,
  };
}

/** The draft as the route «Rileggi» sends. Null for an analysis without a period: «Rileggi» stays off. */
export function chooserDraftToOverride(draft: RouteChooserDraft): AssistantRouteOverride | null {
  if (draft.kind === 'register') return { intent: 'register', period: { kind: 'none' }, webSearch: false };
  const period: AssistantRoutePeriod = draft.period === 'month' ? { kind: 'month', ...draft.month }
    : draft.period === 'year' ? { kind: 'year', year: draft.year } : { kind: draft.period };
  if (draft.kind === 'question') return { intent: 'chat', period, webSearch: draft.webSearch };
  const intent = ({ month: 'month_analysis', year: 'year_analysis', ytd: 'ytd_analysis', history: 'history_analysis',
    none: null } as const)[draft.period];
  return intent ? { intent, period, webSearch: draft.webSearch } : null;
}

/** A reading as today's request fields: the pipeline after it is the one an explicit mode runs. */
export function routeToSelection(route: AssistantRouteOverride): AssistantRouteSelection {
  const { intent, period } = route;
  const fields = {
    ...(period.kind === 'month' ? { month: { year: period.year, month: period.month } } : {}),
    ...(period.kind === 'year' ? { year: period.year } : {}),
  };
  // `chatContext` takes the period's kind whole: the five kinds are AssistantChatContextType's five.
  return intent === 'chat' ? { mode: 'chat', chatContext: period.kind, ...fields } : { mode: intent, ...fields };
}
