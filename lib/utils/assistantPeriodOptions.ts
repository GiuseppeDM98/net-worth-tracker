/**
 * Pure helpers for the assistant's single period axis: selectable month/year
 * options and the human-readable labels derived from the current selection.
 *
 * Extracted from AssistantPageClient so the page stays
 * an orchestrator and these date-window rules become unit-testable. All "now"
 * reads go through the Italy-timezone helpers — never Date.getMonth().
 */
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  AssistantChatContextType,
  AssistantMode,
  AssistantMonthSelectorValue,
  AssistantThread,
} from '@/types/assistant';

/**
 * Builds the list of selectable months (current month + 3 years back).
 * Uses Italy timezone for the current month so the default selection is always correct.
 */
export function buildMonthOptions(): AssistantMonthSelectorValue[] {
  const { year: currentYear, month: currentMonth } = getItalyMonthYear(new Date());
  const options: AssistantMonthSelectorValue[] = [];

  for (let year = currentYear; year >= currentYear - 3; year -= 1) {
    for (let month = 12; month >= 1; month -= 1) {
      if (year === currentYear && month > currentMonth) {
        continue;
      }
      options.push({ year, month });
    }
  }

  return options;
}

/**
 * Returns the previous completed month relative to Italy "now".
 *
 * Used as the default monthly selection: the current month is still in progress
 * (often without a snapshot yet), so analysing it greets the user with an empty
 * period. The last closed month always has data and is the natural review target.
 */
export function getPreviousCompletedMonth(): AssistantMonthSelectorValue {
  const { year, month } = getItalyMonthYear(new Date());
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/**
 * Builds the list of selectable years for year_analysis (current year + 4 years back).
 */
export function buildYearOptions(): number[] {
  const { year: currentYear } = getItalyMonthYear(new Date());
  const options: number[] = [];
  for (let y = currentYear; y >= currentYear - 4; y -= 1) {
    options.push(y);
  }
  return options;
}

/**
 * Returns a human-readable label for the current active period, shown in the
 * conversation header.
 */
export function getActivePeriodLabel(
  mode: AssistantMode,
  selectedMonth: AssistantMonthSelectorValue,
  selectedYear: number
): string {
  if (mode === 'month_analysis') return `Analisi · ${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  if (mode === 'year_analysis') return `Analisi annuale · ${selectedYear}`;
  if (mode === 'ytd_analysis') return `YTD · ${selectedMonth.year}`;
  if (mode === 'history_analysis') return 'Storico totale';
  return 'Domanda libera';
}

/**
 * Finds an existing thread pinned to the given mode + period, so a period
 * switch can resume the matching conversation instead of starting a duplicate.
 * chat (Libera) mode returns undefined by design — a free question always
 * starts fresh.
 */
export function findThreadForPeriod(
  threads: AssistantThread[],
  mode: AssistantMode,
  selectedMonth: AssistantMonthSelectorValue,
  selectedYear: number
): AssistantThread | undefined {
  if (mode === 'month_analysis') {
    return threads.find(
      (t) =>
        t.mode === 'month_analysis' &&
        t.pinnedMonth?.year === selectedMonth.year &&
        t.pinnedMonth?.month === selectedMonth.month
    );
  }
  if (mode === 'year_analysis') {
    return threads.find((t) => t.mode === 'year_analysis' && t.pinnedYear === selectedYear);
  }
  if (mode === 'ytd_analysis') {
    return threads.find((t) => t.mode === 'ytd_analysis');
  }
  if (mode === 'history_analysis') {
    return threads.find((t) => t.mode === 'history_analysis');
  }
  return undefined;
}

/**
 * Maps the live selection to the mode whose builder should feed the scheda
 * preview. In Libera mode an attached context maps to the matching analysis
 * builder, so the scheda shows that period's numbers before asking; with no
 * context attached it stays 'chat' (no numeric period — the "patrimonio oggi"
 * card stands in).
 */
export function resolveAssistantPreviewMode(
  mode: AssistantMode,
  chatContextType: AssistantChatContextType
): AssistantMode {
  if (mode !== 'chat') return mode;
  if (chatContextType === 'month') return 'month_analysis';
  if (chatContextType === 'year') return 'year_analysis';
  if (chatContextType === 'ytd') return 'ytd_analysis';
  if (chatContextType === 'history') return 'history_analysis';
  return 'chat';
}

/**
 * Composer placeholder reflecting the active period (the selector lives above it).
 * In Libera mode it hints the optionally attached context.
 */
export function buildComposerPlaceholder(
  mode: AssistantMode,
  chatContextType: AssistantChatContextType,
  selectedMonth: AssistantMonthSelectorValue,
  selectedYear: number
): string {
  const monthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  if (mode === 'month_analysis') return `Scrivi la tua domanda su ${monthLabel}…`;
  if (mode === 'year_analysis') return `Scrivi la tua domanda sull'anno ${selectedYear}…`;
  if (mode === 'ytd_analysis') return "Scrivi la tua domanda sull'andamento da inizio anno…";
  if (mode === 'history_analysis') return 'Scrivi la tua domanda sullo storico del portafoglio…';
  if (chatContextType === 'month') return `Scrivi la tua domanda — contesto: ${monthLabel}…`;
  if (chatContextType === 'year') return `Scrivi la tua domanda — contesto: anno ${selectedYear}…`;
  if (chatContextType === 'ytd') return 'Scrivi la tua domanda — contesto: da inizio anno…';
  if (chatContextType === 'history') return 'Scrivi la tua domanda — contesto: storico totale…';
  return 'Scrivi una domanda libera sul tuo portafoglio…';
}

/**
 * Empty-state heading phrased per period — explicit copy reads better than
 * string-surgery on the conversation-header label.
 */
export function buildEmptyStateQuestion(
  mode: AssistantMode,
  selectedMonth: AssistantMonthSelectorValue,
  selectedYear: number
): string {
  const monthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  if (mode === 'chat') return 'Cosa vuoi chiedere?';
  if (mode === 'month_analysis') return `Cosa vuoi sapere su ${monthLabel}?`;
  if (mode === 'year_analysis') return `Cosa vuoi sapere sul ${selectedYear}?`;
  if (mode === 'ytd_analysis') return "Cosa vuoi sapere sull'andamento da inizio anno?";
  return 'Cosa vuoi sapere sullo storico del portafoglio?';
}
