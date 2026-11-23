/**
 * Pure helpers for the assistant's periods: the selectable month/year options of the chooser
 * «cambia» opens, the label of a thread's mode, and the composer's length cap. The period axis
 * and its derived labels left with the chat-only page (2026-11-12). All "now" reads go through
 * the Italy-timezone helpers — never Date.getMonth().
 */
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { AssistantMode, AssistantMonthSelectorValue } from '@/types/assistant';

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
  if (mode === 'register') return 'Registra · senza periodo';
  return 'Domanda libera';
}

/**
 * The badge of a thread's mode in the thread list. «chat» reads «Libera» — the period axis
 * renamed the former Chat mode.
 */
export function getModeBadgeLabel(mode: AssistantMode): string {
  if (mode === 'month_analysis') return 'Mese';
  if (mode === 'year_analysis') return 'Anno';
  if (mode === 'ytd_analysis') return 'YTD';
  if (mode === 'history_analysis') return 'Storico';
  if (mode === 'register') return 'Registra';
  return 'Libera';
}

/** The longest message the composer sends and the stream route accepts, in every mode (2026-11). */
export const ASSISTANT_PROMPT_MAX_LENGTH = 4000;
/** From this length the composer prints its counter: silent until the cap is in sight. */
const PROMPT_COUNTER_FROM = 3800;

/** «3.812 / 4.000 caratteri» from 3800 characters, null below: the counter under the composer. */
export function describePromptLength(length: number): string | null {
  if (length < PROMPT_COUNTER_FROM) return null;
  // `useGrouping: 'always'`: it-IT leaves a four-digit number ungrouped («3812») by default.
  const format = (value: number) => new Intl.NumberFormat('it-IT', { useGrouping: 'always' }).format(value);
  return `${format(length)} / ${format(ASSISTANT_PROMPT_MAX_LENGTH)} caratteri`;
}
