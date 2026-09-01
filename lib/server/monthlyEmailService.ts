/**
 * Periodic email summary service (monthly, quarterly, yearly)
 *
 * Responsibilities:
 *   - Detect end-of-period dates in Italy timezone
 *   - Query Admin SDK for snapshot, expense, and dividend data
 *   - Build self-contained HTML emails summarizing the period
 *   - Send emails via Resend
 *
 * This module is server-only: it imports firebase-admin and the Resend SDK.
 * Never import it from client components.
 */

import { EMAIL_ANALYSIS_MODEL } from '@/lib/constants/aiModels';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import {
  escapeHtml,
  emailShell,
  emailVerdict,
  emailTile,
  emailHero,
  emailKeyFigures,
  emailRankedRows,
  emailComparisonTable,
  emailAlertRows,
  emailProse,
  type EmailKeyFigure,
  type EmailRankedRow,
} from '@/lib/server/emailHtml';
import {
  buildPeriodEmailVerdict,
  describeNetWorthTile,
  describeMarketSplit,
  describeCompositionTile,
  describeClassMovesTile,
  describeCashflowTile,
  describeExpenseCategoriesTile,
  describeIncomeCategoriesTile,
  describeExpenseTypes,
  describeTopExpensesTile,
  describeDividendsTile,
  describeYearOverYearTile,
  describeBudgetAlertsTile,
  periodTitle as periodTitleOf,
  periodKindLabel,
  periodScopeLabel,
  periodEndLabel,
  periodBaselineHeading,
  yearEarlierHeading,
  type EmailPeriod,
  type PeriodEmailVerdictInput,
} from '@/lib/utils/emailNarrative';
import { printChartHexForAssetClass, PRINT_COLORS } from '@/lib/constants/printTokens';
import { cachedFormatCurrencyEUR, formatPercentageIt } from '@/lib/utils/formatters';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { AssetAllocationSettings } from '@/types/assets';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { getDefaultAssistantPreferences } from '@/lib/server/assistant/webSearchPolicy';
import { getAssistantMemoryDocument } from '@/lib/server/assistant/store';
import {
  formatMemoryForPrompt,
  formatBundleForPrompt,
  buildResponseStyleInstruction,
  ASSISTANT_SYSTEM_CORE,
  buildEmailPeriodicFormatContract,
  type AssistantPromptParts,
} from '@/lib/server/assistant/prompts';
import {
  buildAssistantPeriodRangeContext,
  type AssistantPeriodRange,
} from '@/lib/services/assistantMonthContextService';
import type {
  AssistantMemoryItem,
  AssistantMonthContextBundle,
  AssistantPreferences,
} from '@/types/assistant';
import { buildPeriodComparison, MAX_CATEGORY_DELTAS } from '@/lib/server/emailPeriodComparison';
import type { PeriodComparison, MetricDelta, ComparisonSet } from '@/lib/server/emailPeriodComparison';
import { evaluateBudgetAlerts } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import type { BudgetAlert, BudgetItem } from '@/types/budget';
import { type Expense, type ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { summarizeExpenseSplit, type ExpenseSplitSummary } from '@/lib/utils/expenseSplitSummary';
import { describeMemberBalance, describeSplitBasis } from '@/lib/utils/expenseSplitNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import {
  calculateMonthlyRecords,
  calculateYearlyRecords,
  rankPeriodByNetWorthGrowth,
  type PeriodGrowthRank,
} from '@/lib/utils/hallOfFameRecords';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailPeriodType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

interface AssetClassEntry {
  name: string;
  deltaPct: number;
  deltaAbs: number;
}

export interface AssetClassPerformers {
  bestPct: AssetClassEntry | null;
  worstPct: AssetClassEntry | null;
  bestAbs: AssetClassEntry | null;
  worstAbs: AssetClassEntry | null;
}

export interface MonthlyEmailData {
  periodType: EmailPeriodType;
  year: number;
  month: number;   // for monthly: 1-12; for quarterly: last month of quarter; for semiannual: 6 or 12; for yearly: 12
  quarter?: number; // 1-4, only set for quarterly
  semester?: number; // 1 (Jan-Jun) or 2 (Jul-Dec), only set for semiannual
  currentNetWorth: number;
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  previousByAssetClass: Record<string, number>;
  assetClassPerformers: AssetClassPerformers;
  totalIncome: number;
  totalExpenses: number; // always positive (raw amounts are negative)
  // Category identity travels as `key` (categoryId, name-fallback for legacy rows):
  // two same-named categories are two distinct entries, and cross-period lookups in
  // the comparison builder match by key, never by the display name.
  topExpenseCategories: Array<{ key: string; name: string; amount: number }>; // all expense categories sorted desc
  allIncomeCategories: Array<{ key: string; name: string; amount: number }>; // all income categories sorted desc
  topIndividualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>; // top transactions (5, or 10 for yearly)
  topIndividualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>; // top income transactions (used only in the yearly report)
  expensesByType: Array<{ type: ExpenseType; label: string; amount: number }>; // Fisse/Variabili/Debiti, sorted desc
  dividendTotal: number; // gross EUR
  dividendCount: number;
  // Hall of Fame standing of this period's net-worth change — only for monthly/yearly
  // (the Hall of Fame tracks months and years); undefined when not computable.
  hallOfFameRank?: PeriodGrowthRank & { scope: 'month' | 'year' };
  // AI-generated markdown comment; undefined when generation failed or AI key is absent
  aiComment?: string;
  // Threshold alerts for the period's expense budgets — monthly emails only,
  // empty/undefined when the user has no budgets or alerts are disabled.
  budgetAlerts?: BudgetAlert[];
  // How the household's shared spending divides over this window. Undefined when the feature is
  // off or the household is not configured — the section then simply does not exist, rather
  // than rendering an empty box. Built from the SAME pure modules as Cashflow › Divisione, so
  // the email and the page can never print two different splits.
  expenseSplit?: ExpenseSplitSummary;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when the Italy-local date of `now` is the last calendar day of its month.
 * Exported for testing.
 */
export function isLastDayOfMonthItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const lastDay = new Date(
    italyDate.getFullYear(),
    italyDate.getMonth() + 1,
    0
  ).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns true when the Italy-local date of `now` is the last day of a calendar quarter.
 * Quarter-end months: March (3), June (6), September (9), December (12).
 * Exported for testing.
 */
export function isLastDayOfQuarterItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const month = italyDate.getMonth() + 1;
  if (![3, 6, 9, 12].includes(month)) return false;
  const lastDay = new Date(italyDate.getFullYear(), italyDate.getMonth() + 1, 0).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns true when the Italy-local date of `now` is December 31.
 * Exported for testing.
 */
export function isLastDayOfYearItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  return italyDate.getMonth() === 11 && italyDate.getDate() === 31;
}

/**
 * Returns the quarter number (1-4) for a given month (1-12).
 * Exported for testing.
 */
export function monthToQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Returns the first month of the quarter that ends at `endMonth`.
 * e.g. 3→1, 6→4, 9→7, 12→10.
 * Exported for testing.
 */
export function getQuarterStartMonth(endMonth: number): number {
  return endMonth - 2;
}

/**
 * Returns the end-of-quarter {year, month} for the quarter immediately preceding
 * the given quarter-end month. Handles year wrap: Q1 → Q4 of the previous year.
 * Exported for testing.
 */
export function getPreviousQuarterEnd(
  year: number,
  month: number
): { year: number; month: number } {
  // month is always a quarter-end month (3, 6, 9, 12)
  if (month === 3) return { year: year - 1, month: 12 };
  return { year, month: month - 3 };
}

/**
 * Returns {year, month} of the most recently completed quarter end strictly before `now`.
 * e.g. April 19 2026 → { year: 2026, month: 3 }
 *      January 5 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedQuarterEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  const year = italyDate.getFullYear();
  const currentMonth = italyDate.getMonth() + 1;
  // Quarter-end months in reverse order
  const quarterEndMonths = [12, 9, 6, 3];
  for (const qMonth of quarterEndMonths) {
    const lastDayOfQ = new Date(year, qMonth, 0).getDate();
    const qEnd = new Date(year, qMonth - 1, lastDayOfQ);
    if (italyDate > qEnd) {
      return { year, month: qMonth };
    }
  }
  // Before March 31 of the current year → Q4 of the previous year
  return { year: year - 1, month: 12 };
}

/**
 * Returns {year, month: 12} of the most recently completed year (Dec 31 must be in the past).
 * e.g. April 19 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedYearEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  // Dec 31 of the current year is still "this year", so always use year - 1
  return { year: italyDate.getFullYear() - 1, month: 12 };
}

/**
 * Returns true when the Italy-local date of `now` is the last day of a calendar half-year.
 * Half-year-end months: June (6) and December (12).
 * Exported for testing.
 */
export function isLastDayOfHalfYearItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  const month = italyDate.getMonth() + 1;
  if (![6, 12].includes(month)) return false;
  const lastDay = new Date(italyDate.getFullYear(), italyDate.getMonth() + 1, 0).getDate();
  return italyDate.getDate() === lastDay;
}

/**
 * Returns the semester number (1 = Jan-Jun, 2 = Jul-Dec) for a half-year-end month (6 or 12).
 * Exported for testing.
 */
export function monthToSemester(endMonth: number): number {
  return endMonth === 6 ? 1 : 2;
}

/**
 * Returns the first month of the half-year that ends at `endMonth`.
 * 6 → 1 (H1 starts in January), 12 → 7 (H2 starts in July).
 * Exported for testing.
 */
export function getSemesterStartMonth(endMonth: number): number {
  return endMonth === 6 ? 1 : 7;
}

/**
 * Returns the end-of-half-year {year, month} immediately preceding the given half-year end.
 * H1 (June) → H2 of the previous year (Dec); H2 (Dec) → H1 of the same year (June).
 * Exported for testing.
 */
export function getPreviousHalfEnd(
  year: number,
  endMonth: number
): { year: number; month: number } {
  // endMonth is always a half-year-end month (6 or 12)
  if (endMonth === 6) return { year: year - 1, month: 12 };
  return { year, month: 6 };
}

/**
 * Returns {year, month} of the most recently completed half-year end strictly before `now`.
 * e.g. July 1 2026 → { year: 2026, month: 6 }
 *      February 2 2026 → { year: 2025, month: 12 }
 * Exported for testing.
 */
export function getMostRecentCompletedHalfYearEnd(now: Date): { year: number; month: number } {
  const italyDate = getItalyDate(now);
  const year = italyDate.getFullYear();
  // June 30 of the current year (if already past) → H1 this year; otherwise H2 of the previous year
  const juneEnd = new Date(year, 5, 30);
  if (italyDate > juneEnd) {
    return { year, month: 6 };
  }
  return { year: year - 1, month: 12 };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** The app's one EUR formatter, in its whole-euro form. */
function formatEur(amount: number): string {
  return cachedFormatCurrencyEUR(amount, true);
}

function signedPct(pct: number): string {
  return `${pct >= 0 ? '+' : '−'}${formatPercentageIt(Math.abs(pct), 1)}`;
}

/** EUR amount with an explicit leading "+" for non-negative values (formatEur already prefixes "-"). */
function signedEur(amount: number): string {
  return `${amount >= 0 ? '+' : '−'}${formatEur(Math.abs(amount))}`;
}

/** Renders a metric delta as "+1.234 € (+3,2%)", or "N/D" when the comparison is unavailable. */
function formatDelta(delta: MetricDelta | null): string {
  if (!delta) return 'N/D';
  const pct = delta.pctChange !== null ? ` (${signedPct(delta.pctChange)})` : '';
  return `${signedEur(delta.absChange)}${pct}`;
}

// ─── Period labels ────────────────────────────────────────────────────────────
//
// Every label the reader sees now comes from `lib/utils/emailNarrative.ts` — the same pure
// module that writes the verdict. The local `ASSET_CLASS_LABELS` that used to live here went
// with them: it had drifted from the app's own map ("Crypto" against "Criptovalute", "Materie
// prime" against "Materie Prime"), so the email named two classes differently from every
// screen that shows them.

/**
 * The email's period as the narrative layer sees it. `MonthlyEmailData` carries the same four
 * fields under different names, and this is the ONE place the two shapes meet.
 */
function emailPeriodOf(data: MonthlyEmailData): EmailPeriod {
  return {
    kind: data.periodType,
    year: data.year,
    month: data.month,
    quarter: data.quarter,
    semester: data.semester,
  };
}

/** "Agosto 2026", "Q3 2026" — the subject line and the header's scope. */
function periodTitle(data: MonthlyEmailData): string {
  return periodTitleOf(emailPeriodOf(data));
}

/**
 * First month of the window a period ending at `endMonth` covers.
 * Monthly windows are one month long; the others open at the start of their quarter,
 * semester or year.
 */
export function getPeriodWindowStartMonth(periodType: EmailPeriodType, endMonth: number): number {
  if (periodType === 'quarterly') return getQuarterStartMonth(endMonth);
  if (periodType === 'semiannual') return getSemesterStartMonth(endMonth);
  if (periodType === 'yearly') return 1;
  return endMonth;
}

/**
 * The context-bundle window for an email period: the very months the email's own figures
 * cover, under the name the email prints in its header.
 *
 * Keeping the two in lockstep is the point. The bundle's baseline is the snapshot of the
 * month before the window opens, which for every period type is the same snapshot the
 * email calls `previousNetWorth` — so the AI comment and the email table can never
 * disagree about Δ patrimonio.
 */
export function resolveEmailPeriodRange(data: MonthlyEmailData): AssistantPeriodRange {
  return {
    year: data.year,
    startMonth: getPeriodWindowStartMonth(data.periodType, data.month),
    endMonth: data.month,
    label: periodTitle(data),
  };
}

// ─── AI comment generation ────────────────────────────────────────────────────

/**
 * Converts Claude's markdown output to email-safe HTML.
 *
 * Handles the subset Claude produces in structured analysis responses:
 * bold, any-level headings, bullet lists, horizontal rules, and paragraph breaks.
 * --- separators are removed (section headings already provide visual separation).
 * Avoids adding a `marked` dependency — the output format is predictable and narrow.
 */
function simpleMarkdownToHtml(text: string): string {
  // Ordered list items use a placeholder so they can be collapsed and wrapped independently
  // from unordered items before the final <br/> conversion runs.
  const OLI_OPEN = '§OLI§';
  const OLI_CLOSE = '§/OLI§';

  return (
    text
      // Strip <details>/<summary> blocks — AI occasionally wraps content in collapsible HTML
      // which email clients render as interactive elements, breaking the static email layout
      .replace(/<summary[^>]*>[\s\S]*?<\/summary>/gi, '')
      .replace(/<\/?details[^>]*>/gi, '')
      // Remove horizontal rules (--- or ***) — headings already separate sections
      .replace(/^[-*]{3,}\s*$/gm, '')
      // Bold (must run before single-asterisk italic to avoid conflict)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic — single asterisk emphasis (e.g. *Limite del dato*)
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      // Any-level headings (# ## ###) → compact bold paragraph
      .replace(
        /^#{1,3}\s+(.+)$/gm,
        `<p style="margin:16px 0 2px;font-size:13px;font-weight:600;color:${PRINT_COLORS.foreground};">$1</p>`
      )
      // Ordered list items (1. 2. 3.) — must run before bullet items to avoid conflicts
      .replace(/^\d+\. (.+)$/gm, `${OLI_OPEN}$1${OLI_CLOSE}`)
      // Collapse blank lines between consecutive ordered items so they group into one <ol>
      .replace(new RegExp(`(${OLI_CLOSE})\\n\\n(${OLI_OPEN})`, 'g'), `$1\n$2`)
      // Wrap consecutive ordered item runs in <ol>, expand placeholders into <li>
      .replace(
        new RegExp(`(${OLI_OPEN}[\\s\\S]*?${OLI_CLOSE}\\n?)+`, 'g'),
        (match) =>
          `<ol style="margin:4px 0 4px 16px;padding:0;list-style:decimal;">${match
            .replace(new RegExp(OLI_OPEN, 'g'), '<li style="margin:5px 0;padding-left:0;">')
            .replace(new RegExp(OLI_CLOSE, 'g'), '</li>')}</ol>`
      )
      // Unordered bullet items
      .replace(/^- (.+)$/gm, '<li style="margin:1px 0;padding-left:0;">$1</li>')
      // Collapse blank lines between consecutive unordered items so they merge into one <ul>
      // (AI often emits blank lines between bullets, which would otherwise create separate <ul>s)
      .replace(/(<\/li>)\n\n(<li)/g, '$1\n$2')
      // Wrap consecutive <li> runs in a <ul>
      .replace(
        /(<li[^>]*>[\s\S]*?<\/li>\n?)+/g,
        '<ul style="margin:4px 0 4px 16px;padding:0;list-style:disc;">$&</ul>'
      )
      // Collapse 3+ newlines to 2 (avoid giant gaps left by removed ---)
      .replace(/\n{3,}/g, '\n\n')
      // Double newline → two line breaks (paragraph-like spacing without block-level margins)
      .replace(/\n\n/g, '<br/><br/>')
      // Single remaining newlines → line break
      .replace(/\n/g, '<br/>')
      // Tighten spacing around headings: heading <p> tags already carry their own margin,
      // so extra <br/> before/after them would double up the visual gap
      .replace(/(<br\/>)+(<p style="margin:\d+px)/g, '$2')
      .replace(/<\/p>(<br\/>)+/g, '</p>')
      // Reduce double <br/> around list blocks to single — lists already have their own margin,
      // so 2 × line-height gap is excessive before/after list groups
      .replace(/<\/(ul|ol)>(<br\/>){2}/g, '</$1><br/>')
      .replace(/(<br\/>){2}(<(ul|ol))/g, '<br/>$2')
  );
}

/**
 * Renders one comparison axis (NW / entrate / uscite / risparmio) as prompt lines.
 * Used inside the email AI prompt so Claude interprets the same deterministic deltas
 * that the email table displays.
 */
function formatComparisonForPrompt(title: string, set: ComparisonSet): string {
  return [
    `--- ${title} (${set.baselineLabel}) ---`,
    `Patrimonio netto: ${formatDelta(set.netWorth)}`,
    `Entrate: ${formatDelta(set.income)}`,
    `Uscite: ${formatDelta(set.expenses)}`,
    `Risparmio netto: ${formatDelta(set.savings)}`,
  ].join('\n');
}

/**
 * The market/valuation component of the period, as a prompt block.
 *
 * Δ patrimonio − risparmio netto, computed here rather than left to the model: the AI used
 * to call it "una stima residuale" every month, which is exactly what a number nobody
 * computed for it looks like. It is a STRUCTURAL decomposition, not a market return — it
 * also absorbs every patrimony movement that never passed through tracked cashflow — and
 * the block says so, or the comment would present it as pure market performance.
 *
 * Both inputs come from the bundle, so the figure agrees with the PATRIMONIO and CASHFLOW
 * blocks above it line for line. A missing snapshot at either end makes it unknowable, and
 * that is said out loud instead of falling back to a delta measured from zero.
 */
function formatMarketEffectForPrompt(bundle: AssistantMonthContextBundle): string[] {
  const lines = ['--- EFFETTO MERCATO (calcolato) ---'];
  const { delta } = bundle.netWorth;

  if (delta === null) {
    lines.push(
      'Non calcolabile: manca lo snapshot patrimoniale di inizio o di fine periodo, quindi la variazione del patrimonio non è nota. Non stimarla.'
    );
    lines.push('');
    return lines;
  }

  const netSavings = bundle.cashflow.netCashFlow;
  lines.push(
    `Variazione di mercato/valutativa = Δ patrimonio (${signedEur(delta)}) − risparmio netto (${signedEur(netSavings)}) = ${signedEur(delta - netSavings)}`
  );
  lines.push(
    'È una scomposizione strutturale già calcolata: usala così com\'è, non ricalcolarla e non presentarla come una stima. Oltre alla performance di mercato contiene ogni movimento patrimoniale che non passa dal cashflow tracciato (rivalutazioni immobiliari, versamenti da conti non tracciati, effetti di cambio).'
  );
  lines.push('');
  return lines;
}

/**
 * Per-category expense deltas, with the cap stated in the text the model reads.
 *
 * The selection is the largest categories BY SPEND in the period (that is the order
 * `buildPeriodComparison` slices), not by size of the variation — the header says so,
 * because a header that misdescribes the ordering is the same defect as an undeclared cap.
 */
function formatCategoryDeltasForPrompt(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison
): string[] {
  const lines = [
    `--- VARIAZIONE SPESE PER CATEGORIA (le prime ${MAX_CATEGORY_DELTAS} categorie per spesa del periodo) ---`,
  ];

  if (comparison.categoryDeltas.length === 0) {
    lines.push('Nessuna spesa categorizzata nel periodo.');
    lines.push('');
    return lines;
  }

  for (const category of comparison.categoryDeltas) {
    lines.push(
      `- ${category.name}: ${formatEur(category.current)} (vs periodo prec.: ${formatDelta(
        category.vsPrevious
      )}; vs anno prec.: ${formatDelta(category.vsYoy)})`
    );
  }

  const omittedCategories = emailData.topExpenseCategories.slice(comparison.categoryDeltas.length);
  if (omittedCategories.length > 0) {
    const omittedTotal = omittedCategories.reduce((sum, category) => sum + category.amount, 0);
    const omittedNoun =
      omittedCategories.length === 1 ? '1 categoria' : `${omittedCategories.length} categorie`;
    lines.push(
      `Le categorie oltre le prime ${MAX_CATEGORY_DELTAS} sono omesse da questo confronto: ${omittedNoun} per ${formatEur(omittedTotal)} complessivi. Il loro dettaglio è comunque nel blocco SPESE PER CATEGORIA E SOTTOCATEGORIA, che è completo.`
    );
  }

  lines.push('');
  return lines;
}

/** Hall of Fame standing — deterministic, so the comment can cite it without inventing. */
function formatHallOfFameForPrompt(emailData: MonthlyEmailData): string[] {
  const rank = emailData.hallOfFameRank;
  if (!rank) return [];

  const scopeNoun = rank.scope === 'month' ? 'mese' : 'anno';
  return [
    '--- HALL OF FAME ---',
    rank.trend === 'growth'
      ? `È il ${rank.rank}° ${scopeNoun} per crescita del patrimonio (su ${rank.total} con crescita).`
      : `${scopeNoun === 'mese' ? 'Mese' : 'Anno'} in calo del patrimonio: ${rank.rank}° calo più marcato su ${rank.total}.`,
    '',
  ];
}

/**
 * The month's budget alerts, the same rows the email already renders.
 *
 * Monthly only, because the alerts themselves are (`buildBudgetAlertsForMonth` runs for
 * that period alone): gating on the period type rather than on the array keeps a future
 * caller from quietly attaching month alerts to a quarterly email.
 */
function formatBudgetAlertsForPrompt(emailData: MonthlyEmailData): string[] {
  if (emailData.periodType !== 'monthly') return [];
  const alerts = emailData.budgetAlerts;
  if (!alerts || alerts.length === 0) return [];

  const lines = ['--- AVVISI BUDGET DEL MESE ---'];
  for (const alert of alerts) {
    const state = alert.level === 'exceeded' ? 'budget superato' : `soglia ${alert.threshold}% superata`;
    const forecast =
      alert.forecastedOverrun && alert.level !== 'exceeded' ? ' · sforamento previsto a fine mese' : '';
    lines.push(
      `- ${alert.label}: ${formatEur(alert.spent)} su ${formatEur(alert.budgetAmount)} (${Math.round(alert.usedRatio * 100)}%) — ${state}${forecast}`
    );
  }
  lines.push('');
  return lines;
}

/**
 * The household split, for the model.
 *
 * The window is NAMED in the header, as every figure in this prompt must be: the split is
 * measured over the email's own period, not over the month, and a model handed a bare
 * percentage next to a quarterly total will describe it as a monthly one.
 *
 * It also states what the residual is made of. «Restano 754 €» is a subtraction with two
 * subtrahends, and a model that does not know which ones will explain it wrong.
 */
function formatExpenseSplitForPrompt(emailData: MonthlyEmailData, label: string): string[] {
  const summary = emailData.expenseSplit;
  if (!summary || summary.basis.kind !== 'computed') return [];

  const lines = [
    `--- DIVISIONE DELLE SPESE IN COMUNE (${label}) ---`,
    `Spese in comune del periodo: ${formatEur(summary.common.total)}. Le quote sono proporzionali agli stipendi dello stesso periodo.`,
    'Per ogni persona: «resta» = stipendio − quota di spese in comune − spese personali.',
  ];
  for (const balance of summary.members) {
    if (balance.remaining === null || balance.share === null || balance.commonShare === null) continue;
    lines.push(
      `- ${balance.member.name}: stipendio ${formatEur(balance.salary)}, quota in comune ${formatEur(balance.commonShare)} ` +
        `(${Math.round(balance.share * 100)}%), spese personali ${formatEur(balance.personalSpending)}, resta ${formatEur(balance.remaining)}.`
    );
  }
  if (summary.unassigned.rowCount > 0) {
    lines.push(
      `Fuori dalla divisione: ${formatEur(summary.unassigned.total)} su ${summary.unassigned.rowCount} voci intestate a una persona non più configurata.`
    );
  }
  lines.push('');
  return lines;
}

/**
 * Builds the prompt for the email AI comment.
 *
 * The body IS the assistant's own numeric block (`formatBundleForPrompt`) over a bundle
 * built on the email's window: the two surfaces then read the same exhaustive data, every
 * future bundle field reaches the emails for free, and the "questo blocco è ESAUSTIVO"
 * guardrails in ASSISTANT_SYSTEM_CORE stop promising blocks the email never sent. Appended
 * to it are the sections only the email has — the precomputed market effect, the
 * deterministic comparisons, the per-category deltas, the Hall of Fame standing, the
 * month's budget alerts and the household split.
 *
 * The largest single expenses are deliberately NOT re-listed: the bundle already carries
 * them, with their date, in `--- SPESE SINGOLE PIU' GRANDI ---`.
 *
 * Exported for the prompt tests, and for the guided verification that reads the generated
 * userContent without sending anything.
 *
 * @returns { system, userContent }. `system` (role, domain, guardrails, period format
 *          contract) is byte-identical for every user and every run of a given period
 *          type; `userContent` carries everything per-request.
 */
export function buildEmailAiPrompt(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison,
  bundle: AssistantMonthContextBundle,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[]
): AssistantPromptParts {
  const label = periodTitle(emailData);

  const memoryBlock = preferences.memoryEnabled
    ? formatMemoryForPrompt(memoryItems)
    : 'Non fare affidamento su memoria persistente; usa solo il contesto esplicito di questo messaggio.';

  const userContent = [
    buildResponseStyleInstruction(preferences.responseStyle),
    memoryBlock,
    '',
    `Stai redigendo il commento di riepilogo per: ${label}.`,
    'Di seguito i dati del periodo, estratti in modo affidabile dal sistema. Le variazioni sono già calcolate: non ricalcolarle e non inventare numeri.',
    '',
    formatBundleForPrompt(bundle, label),
    ...formatMarketEffectForPrompt(bundle),
    // The dividend registry is a different source from the cashflow rows above (which only
    // see dividends the user also booked as income): naming the source is what keeps the
    // two figures from reading as a contradiction.
    `--- DIVIDENDI DEL PERIODO (registro dividendi) ---`,
    `Incassati: ${formatEur(emailData.dividendTotal)} lordi in ${emailData.dividendCount} pagament${emailData.dividendCount === 1 ? 'o' : 'i'}.`,
    '',
    formatComparisonForPrompt('CONFRONTO COL PERIODO PRECEDENTE', comparison.vsPrevious),
    '',
    ...(comparison.previousEqualsYoy
      ? []
      : [formatComparisonForPrompt("CONFRONTO CON LO STESSO PERIODO DELL'ANNO PRECEDENTE", comparison.vsYoy), '']),
    ...formatCategoryDeltasForPrompt(emailData, comparison),
    ...formatHallOfFameForPrompt(emailData),
    ...formatBudgetAlertsForPrompt(emailData),
    ...formatExpenseSplitForPrompt(emailData, label),
  ].join('\n');

  return {
    system: `${ASSISTANT_SYSTEM_CORE}\n\n${buildEmailPeriodicFormatContract(emailData.periodType)}`,
    userContent,
  };
}

/**
 * Output budget per period, thinking included (`max_tokens` covers thinking AND text).
 * It scales with the period because the format contract's word ceiling does: a 900-word
 * annual recap on the monthly budget would be cut off mid-section.
 */
const EMAIL_AI_MAX_TOKENS: Record<EmailPeriodType, number> = {
  monthly: 6000,
  quarterly: 8000,
  semiannual: 8000,
  yearly: 10000,
};

/**
 * Generates the AI comment for the period via a dedicated, email-specific prompt and a
 * direct Anthropic call.
 *
 * The comment interprets the same exhaustive bundle the in-app assistant reads, plus the
 * deterministic email-only sections (market effect, comparisons, category deltas, budget
 * alerts, Hall of Fame). Web search is offered only when the user's `includeMacroContext`
 * preference allows it, exactly as for the assistant's structured analyses — a tool that
 * is not declared cannot be called.
 *
 * `cache_control` is deliberately absent: a cache write costs 1,25× and only pays off
 * inside the 5-minute TTL, which a cron run sending a handful of emails never fills. The
 * `system` block is still built to be byte-identical per period type, so turning caching on
 * would be a one-line change if traffic ever justified it.
 *
 * Every failure (bundle build, Anthropic error, missing key) is caught and logged: the
 * email is always sent, with or without the comment.
 *
 * @returns The AI-generated markdown text, or null on failure.
 */
async function generateEmailAiComment(
  userId: string,
  emailData: MonthlyEmailData,
  comparison: PeriodComparison
): Promise<string | null> {
  try {
    // Load user's assistant preferences and active memory items for personalisation.
    // Falls back to defaults + empty memory on any Firestore failure.
    let preferences = getDefaultAssistantPreferences();
    let memoryItems: AssistantMemoryItem[] = [];

    try {
      const memoryDoc = await getAssistantMemoryDocument(userId);
      preferences = memoryDoc.preferences;
      memoryItems = memoryDoc.items.filter((i) => i.status === 'active');
    } catch {
      // Memory load is non-critical — proceed with defaults
    }

    // The same context pipeline the assistant uses, over the email's own window.
    const bundle = await buildAssistantPeriodRangeContext(
      userId,
      resolveEmailPeriodRange(emailData),
      preferences.includeDummySnapshots
    );

    const { system, userContent } = buildEmailAiPrompt(
      emailData,
      comparison,
      bundle,
      preferences,
      memoryItems
    );

    // Lazy import so a module-level `new Anthropic()` never breaks test environments
    // where ANTHROPIC_API_KEY is absent (same pattern as memoryExtraction).
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: EMAIL_ANALYSIS_MODEL,
      max_tokens: EMAIL_AI_MAX_TOKENS[emailData.periodType],
      system: system,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      // Macro context is the only thing the search is for (the system core scopes it to
      // market movements), so the preference that governs it governs the tool.
      ...(preferences.includeMacroContext
        ? {
            tools: [
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 3,
              } as any,
            ],
          }
        : {}),
      messages: [{ role: 'user', content: userContent }],
    });

    // Concatenate the text blocks of the (non-streamed) response (skips thinking/tool blocks).
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    return text || null;
  } catch (error) {
    // AI failure must never block email sending
    console.error(`[emailAiComment] Generation failed for user ${userId}:`, error);
    return null;
  }
}

// ─── Admin settings reader ────────────────────────────────────────────────────

/**
 * Read raw settings from Firestore Admin SDK.
 * Used inside cron handlers where the client SDK is unavailable.
 */
export async function getSettingsAdmin(
  userId: string
): Promise<AssetAllocationSettings | null> {
  const doc = await adminDb.collection('assetAllocationTargets').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    monthlyEmailEnabled: data.monthlyEmailEnabled,
    quarterlyEmailEnabled: data.quarterlyEmailEnabled,
    semiAnnualEmailEnabled: data.semiAnnualEmailEnabled,
    yearlyEmailEnabled: data.yearlyEmailEnabled,
    weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled,
    monthlyEmailRecipients: data.monthlyEmailRecipients,
    // Read by the Divisione section below. This mapper is an INDEPENDENT re-listing of the
    // settings document (getSettings on the client is the other one): a field missing here is
    // simply absent server-side, with no type error to catch it.
    expenseSplitEnabled: data.expenseSplitEnabled,
    familyMembers: data.familyMembers ?? [],
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    targets: data.targets,
  } as AssetAllocationSettings;
}

// ─── Asset class performer computation ───────────────────────────────────────

/**
 * Computes the best and worst performing asset classes by Δ% relative to the previous period.
 * Classes with zero or missing previous value are excluded (no meaningful % base).
 * Returns { best: null, worst: null } when there is insufficient data.
 * Exported for testing.
 */
export function computeAssetClassPerformers(
  current: Record<string, number>,
  previous: Record<string, number>
): AssetClassPerformers {
  const entries: AssetClassEntry[] = [];

  for (const [cls, value] of Object.entries(current)) {
    const prev = previous[cls];
    if (!prev || prev <= 0) continue; // can't compute % without a positive base
    const deltaAbs = value - prev;
    const deltaPct = (deltaAbs / prev) * 100;
    entries.push({ name: ASSET_CLASS_LABELS[cls] ?? cls, deltaPct, deltaAbs });
  }

  if (entries.length === 0) return { bestPct: null, worstPct: null, bestAbs: null, worstAbs: null };

  const byPct = [...entries].sort((a, b) => b.deltaPct - a.deltaPct);
  const byAbs = [...entries].sort((a, b) => b.deltaAbs - a.deltaAbs);

  return {
    bestPct: byPct[0],
    worstPct: byPct.length > 1 ? byPct[byPct.length - 1] : null,
    bestAbs: byAbs[0],
    worstAbs: byAbs.length > 1 ? byAbs[byAbs.length - 1] : null,
  };
}

// ─── Expense / dividend aggregation (pure helpers) ───────────────────────────

export interface CashflowAggregation {
  // Category lists carry `key` (categoryId, name-fallback) — see MonthlyEmailData.
  totalIncome: number;
  totalExpenses: number;
  topExpenseCategories: Array<{ key: string; name: string; amount: number }>;
  allIncomeCategories: Array<{ key: string; name: string; amount: number }>;
  topIndividualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>;
  topIndividualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }>;
  expensesByType: Array<{ type: ExpenseType; label: string; amount: number }>;
}

// The three real spending types, in the order shown in the email (structural first).
const EMAIL_EXPENSE_TYPE_ORDER: ExpenseType[] = ['fixed', 'variable', 'debt'];

/**
 * Aggregates a set of expense docs into income/expense totals and per-category /
 * per-type breakdowns plus the largest individual transactions.
 *
 * Classification is by expense TYPE (not by the sign of amount), mirroring the in-app
 * getMonthlyExpenseSummary/isCountableExpense so the email agrees with the Cashflow page:
 * type === 'transfer' is skipped (net-zero), type === 'income' is income, everything else
 * is expense via Math.abs (so a positive-amount refund still counts as spending).
 * Exported for reuse by the period-comparison builder.
 *
 * @param docs              The period's expense documents.
 * @param topIndividualLimit How many largest transactions to keep per side (default 5;
 *                           the yearly report passes 10). The Top-N income list is only
 *                           rendered for yearly emails but is always computed here.
 */
export function aggregateExpenses(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  topIndividualLimit = 5
): CashflowAggregation {
  let totalIncome = 0;
  let totalExpenses = 0;
  const expenseCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const incomeCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const expenseTypeTotals: Record<string, number> = {};
  const individualExpenses: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }> =
    [];
  const individualIncome: Array<{ description: string; categoryName: string; subCategoryName?: string; amount: number }> =
    [];

  for (const doc of docs) {
    const data = doc.data() as {
      amount: number;
      type?: ExpenseType;
      categoryName?: string;
      categoryId?: string;
      subCategoryName?: string;
      notes?: string;
    };
    const { amount } = data;

    const key = data.categoryId?.trim() || data.categoryName?.trim() || 'Altro';
    const categoryName = data.categoryName?.trim() || 'Altro';
    // Notes carry the human description; fall back to the category name.
    const description = data.notes?.trim() || categoryName;

    // Classify by TYPE, not by the sign of amount — this mirrors the in-app
    // getMonthlyExpenseSummary / isCountableExpense so email and Cashflow agree.
    // A refund (expense-type row with a POSITIVE amount) must count as expense,
    // otherwise the email under-reports "Uscite totali" (it was being routed to income).
    if (data.type === 'transfer') {
      // Transfers are internal movements — net-zero, not real income/expense.
      continue;
    } else if (data.type === 'income') {
      totalIncome += amount;
      if (!incomeCategoryTotals[key]) {
        incomeCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      incomeCategoryTotals[key].amount += amount;
      individualIncome.push({
        description,
        categoryName,
        subCategoryName: data.subCategoryName,
        amount,
      });
    } else {
      const absAmount = Math.abs(amount);
      totalExpenses += absAmount;

      if (!expenseCategoryTotals[key]) {
        expenseCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      expenseCategoryTotals[key].amount += absAmount;

      // Per-type totals — only the three real spending types contribute.
      if (data.type && EMAIL_EXPENSE_TYPE_ORDER.includes(data.type)) {
        expenseTypeTotals[data.type] = (expenseTypeTotals[data.type] ?? 0) + absAmount;
      }

      // Individual transaction — subCategoryName carried through so the AI cause
      // analysis has finer granularity.
      individualExpenses.push({
        description,
        categoryName,
        subCategoryName: data.subCategoryName,
        amount: absAmount,
      });
    }
  }

  // All categories sorted desc — no cap; callers display the full list.
  // The id-based key travels with each entry so downstream cross-period lookups
  // (emailPeriodComparison) never fall back to the collision-prone display name.
  const topExpenseCategories = Object.entries(expenseCategoryTotals)
    .map(([key, totals]) => ({ key, ...totals }))
    .sort((a, b) => b.amount - a.amount);

  const allIncomeCategories = Object.entries(incomeCategoryTotals)
    .map(([key, totals]) => ({ key, ...totals }))
    .sort((a, b) => b.amount - a.amount);

  const topIndividualExpenses = individualExpenses
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topIndividualLimit);

  const topIndividualIncome = individualIncome
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topIndividualLimit);

  // Keep canonical type order, dropping types with no spend in the period.
  const expensesByType = EMAIL_EXPENSE_TYPE_ORDER.filter((type) => (expenseTypeTotals[type] ?? 0) > 0).map(
    (type) => ({ type, label: EXPENSE_TYPE_LABELS[type], amount: expenseTypeTotals[type] })
  );

  return {
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
  };
}

interface DividendAggregation {
  dividendTotal: number;
  dividendCount: number;
}

function aggregateDividends(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): DividendAggregation {
  let dividendTotal = 0;
  let dividendCount = 0;
  for (const doc of docs) {
    const data = doc.data();
    // Prefer EUR-converted gross amount when available
    const amount = (data.grossAmountEur ?? data.grossAmount ?? 0) as number;
    dividendTotal += amount;
    dividendCount++;
  }
  return { dividendTotal, dividendCount };
}

/**
 * Evaluates the user's expense budget alerts for a completed month.
 *
 * Reads the budget config via the Admin SDK and reuses the same pure evaluator
 * as the in-app banner (evaluateBudgetAlerts), so the email and the UI never
 * disagree. Returns an empty array when alerts are disabled or no budgets exist.
 *
 * `now` is pinned to the period-end day so the forecast collapses to actuals for
 * the completed month (daysElapsed === daysInMonth → no extrapolation).
 */
async function buildBudgetAlertsForMonth(
  userId: string,
  year: number,
  month: number,
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<BudgetAlert[]> {
  const budgetSnap = await adminDb.collection('budgets').doc(userId).get();
  if (!budgetSnap.exists) return [];
  const data = budgetSnap.data() ?? {};

  if (data.alertsEnabled === false) return [];

  // Monthly email evaluates only monthly budgets: annual budgets are year-to-date
  // and the query window here is a single month.
  const items = ((data.items ?? []) as Array<BudgetItem & { monthlyAmount?: number }>)
    .map((item) => ({
      ...item,
      kind: item.kind ?? (item.scope === 'type' && item.expenseType === 'income' ? 'income' : 'expense'),
      period: item.period ?? 'monthly',
      amount: item.amount ?? item.monthlyAmount ?? 0,
    }))
    .filter((item) => item.kind === 'expense' && item.period === 'monthly');
  if (items.length === 0 && !data.overallMonthlyAmount) return [];

  const expenses: Expense[] = expenseDocs.map((doc) => {
    const e = doc.data();
    return {
      ...(e as Expense),
      date: e.date?.toDate ? e.date.toDate() : e.date,
    };
  });

  const thresholds = (data.alertThresholds as number[] | undefined) ?? DEFAULT_ALERT_THRESHOLDS;
  const periodNow = new Date(year, month - 1, new Date(year, month, 0).getDate(), 12);
  return evaluateBudgetAlerts(items, data.overallMonthlyAmount, expenses, thresholds, periodNow);
}

/**
 * Computes the Hall of Fame standing of a period's net-worth change, matching the
 * in-app ranking definition (same pure layer). Only monthly and yearly periods are
 * ranked — the Hall of Fame tracks months and years, not quarters/semesters.
 *
 * Reads all of the user's real snapshots once; ranking needs only net-worth deltas,
 * so expenses are not fetched here (passed empty to the record builders). Returns
 * undefined on any failure or when the period has no baseline — the mention is then
 * simply omitted and the email is unaffected.
 */
async function computeHallOfFameRank(
  userId: string,
  periodType: EmailPeriodType,
  year: number,
  month: number
): Promise<(PeriodGrowthRank & { scope: 'month' | 'year' }) | undefined> {
  if (periodType !== 'monthly' && periodType !== 'yearly') return undefined;

  try {
    const snapshots = (await getUserSnapshotsAdmin(userId)).filter((s) => !s.isDummy);

    if (periodType === 'yearly') {
      const records = calculateYearlyRecords(snapshots, []);
      const rank = rankPeriodByNetWorthGrowth(records, { year });
      return rank ? { ...rank, scope: 'year' } : undefined;
    }

    const records = calculateMonthlyRecords(snapshots, []);
    const rank = rankPeriodByNetWorthGrowth(records, { year, month });
    return rank ? { ...rank, scope: 'month' } : undefined;
  } catch (error) {
    console.error(`[hallOfFameRank] Computation failed for user ${userId}:`, error);
    return undefined;
  }
}

// ─── Core data builder ────────────────────────────────────────────────────────

/**
 * Fetches all data required for an email summary covering the given {year, month} period.
 *
 * - Monthly: compares against the previous month; expense window = that month.
 * - Quarterly: compares against the previous quarter end; expense window = full quarter.
 * - Yearly: compares against the previous December; expense window = full year.
 *
 * Returns null when no snapshot exists for the current period end.
 */
export async function buildPeriodEmailData(
  userId: string,
  year: number,
  month: number,
  periodType: EmailPeriodType = 'monthly'
): Promise<MonthlyEmailData | null> {
  // Determine previous-period snapshot coordinates
  let prevYear: number;
  let prevMonth: number;

  if (periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
  } else if (periodType === 'semiannual') {
    const prev = getPreviousHalfEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
  } else if (periodType === 'yearly') {
    prevYear = year - 1;
    prevMonth = 12;
  } else {
    // monthly
    prevMonth = month === 1 ? 12 : month - 1;
    prevYear = month === 1 ? year - 1 : year;
  }

  const windowStartMonth = getPeriodWindowStartMonth(periodType, month);
  const windowStart = new Date(year, windowStartMonth - 1, 1);
  // Last day of the period end month
  const windowEnd = new Date(year, month, 0, 23, 59, 59);

  const [currentSnap, prevSnap, expensesSnap, dividendsSnap] = await Promise.all([
    // isDummy filter omitted from query — handled in code to stay within 3 Firestore conditions
    adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .where('year', '==', year)
      .where('month', '==', month)
      .limit(1)
      .get(),

    adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .where('year', '==', prevYear)
      .where('month', '==', prevMonth)
      .limit(1)
      .get(),

    adminDb
      .collection('expenses')
      .where('userId', '==', userId)
      .where('date', '>=', Timestamp.fromDate(windowStart))
      .where('date', '<=', Timestamp.fromDate(windowEnd))
      .get(),

    adminDb
      .collection('dividends')
      .where('userId', '==', userId)
      .where('paymentDate', '>=', Timestamp.fromDate(windowStart))
      .where('paymentDate', '<=', Timestamp.fromDate(windowEnd))
      .get(),
  ]);

  const realCurrentDocs = currentSnap.docs.filter((d) => !d.data().isDummy);
  const realPrevDocs = prevSnap.docs.filter((d) => !d.data().isDummy);

  if (realCurrentDocs.length === 0) return null;

  const current = realCurrentDocs[0].data();
  const previous = realPrevDocs.length > 0 ? realPrevDocs[0].data() : null;

  const currentNetWorth: number = current.totalNetWorth ?? 0;
  const previousNetWorth: number = previous?.totalNetWorth ?? 0;
  const netWorthDelta = currentNetWorth - previousNetWorth;
  const netWorthDeltaPct =
    previousNetWorth !== 0 ? (netWorthDelta / Math.abs(previousNetWorth)) * 100 : 0;

  const byAssetClass: Record<string, number> = current.byAssetClass ?? {};
  const previousByAssetClass: Record<string, number> = previous?.byAssetClass ?? {};

  // The yearly report surfaces the Top 10 transactions; shorter periods keep 5.
  const topIndividualLimit = periodType === 'yearly' ? 10 : 5;
  const {
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
  } = aggregateExpenses(expensesSnap.docs, topIndividualLimit);
  const { dividendTotal, dividendCount } = aggregateDividends(dividendsSnap.docs);

  // Budget alerts are month-centric — only attach them to monthly emails.
  const budgetAlerts =
    periodType === 'monthly'
      ? await buildBudgetAlertsForMonth(userId, year, month, expensesSnap.docs)
      : undefined;

  // Hall of Fame standing (monthly/yearly only) — never blocks the email on failure.
  const hallOfFameRank = await computeHallOfFameRank(userId, periodType, year, month);

  const expenseSplit = await buildExpenseSplitForPeriod(userId, expensesSnap.docs, new Date());

  return {
    periodType,
    year,
    month,
    quarter: periodType === 'quarterly' ? monthToQuarter(month) : undefined,
    semester: periodType === 'semiannual' ? monthToSemester(month) : undefined,
    currentNetWorth,
    previousNetWorth,
    netWorthDelta,
    netWorthDeltaPct,
    liquidNetWorth: current.liquidNetWorth ?? 0,
    byAssetClass,
    previousByAssetClass,
    assetClassPerformers: computeAssetClassPerformers(byAssetClass, previousByAssetClass),
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    allIncomeCategories,
    topIndividualExpenses,
    topIndividualIncome,
    expensesByType,
    dividendTotal,
    dividendCount,
    hallOfFameRank,
    budgetAlerts,
    expenseSplit,
  };
}

/**
 * The household split over the email's own window, or undefined when there is nothing to say.
 *
 * It re-uses `summarizeExpenseSplit` rather than aggregating again: the email's figures and the
 * ones on Cashflow › Divisione have to be the same figures, and the only way to guarantee that
 * is for them to come out of the same function. `now` is the real clock, so a period already
 * closed has no scheduled part and a running one declares it exactly as the page does.
 *
 * Returns undefined — never an empty summary — when the feature is off or the household has
 * fewer than two people: the section is then absent instead of rendering a box with no answer.
 */
async function buildExpenseSplitForPeriod(
  userId: string,
  expenseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  now: Date
): Promise<ExpenseSplitSummary | undefined> {
  try {
    const settings = await getSettingsAdmin(userId);
    const members = settings?.familyMembers ?? [];
    if (!settings?.expenseSplitEnabled || members.length < 2) return undefined;

    const expenses = expenseDocs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        date: data.date?.toDate?.() ?? new Date(),
      } as Expense;
    });

    return summarizeExpenseSplit({
      expenses,
      members,
      laborIncomeCategoryIds: settings.laborIncomeCategoryIds ?? [],
      now,
    });
  } catch (error) {
    // Never block an email on this section, like every other optional block here.
    console.error('Failed to build the expense split section', { userId, error });
    return undefined;
  }
}

/** Backward-compatible wrapper — builds monthly email data. */
export async function buildMonthlyEmailData(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyEmailData | null> {
  return buildPeriodEmailData(userId, year, month, 'monthly');
}

// ─── Email HTML generator ─────────────────────────────────────────────────────
//
// The message is a verdict over tiles, the same shape every redesigned page takes: one
// rule-generated sentence that answers "how did the period go?" before any number, then one
// tile per question. The words all come from `lib/utils/emailNarrative.ts` and the chrome from
// `lib/server/emailHtml.ts`; nothing below writes copy or a colour of its own.

/** How many ranked rows a category tile prints before closing on a residual. */
const RANKED_ROWS_SHOWN = 6;

/**
 * `Δ patrimonio − risparmio netto` — the same structural residual the AI prompt is handed,
 * computed here from the email's own figures rather than from the assistant bundle (which
 * `generateEmailHtml` does not receive). Null when there is no earlier snapshot: without a
 * baseline the movement itself is unknown, and an unattributable effect is not a zero one.
 */
function marketEffectOf(data: MonthlyEmailData): number | null {
  if (data.previousNetWorth <= 0) return null;
  return data.netWorthDelta - (data.totalIncome - data.totalExpenses);
}

/** The Hall of Fame standing, in the shape the verdict expects. */
function verdictRank(data: MonthlyEmailData): PeriodEmailVerdictInput['rank'] {
  const rank = data.hallOfFameRank;
  if (!rank) return null;
  return { position: rank.rank, total: rank.total, scope: rank.scope, trend: rank.trend };
}

/** Ranked rows for a category list: the head, then everything else as one residual row. */
function rankedCategoryRows(
  entries: Array<{ name: string; amount: number }>,
  total: number,
): EmailRankedRow[] {
  const positive = entries.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
  if (positive.length === 0) return [];

  const largest = positive[0].amount;
  const shown = positive.slice(0, RANKED_ROWS_SHOWN);
  const rest = positive.slice(RANKED_ROWS_SHOWN);

  const share = (amount: number) => (total > 0 ? formatPercentageIt((amount / total) * 100, 1) : '—');

  const rows: EmailRankedRow[] = shown.map((entry) => ({
    label: entry.name,
    amount: formatEur(entry.amount),
    trailing: share(entry.amount),
    fill: largest > 0 ? entry.amount / largest : 0,
  }));

  // The residual closes the list so the shares visibly sum to 100% — a head-of-list whose
  // percentages stop at 81% reads as missing data rather than as a selection.
  if (rest.length > 0) {
    const restTotal = rest.reduce((sum, entry) => sum + entry.amount, 0);
    rows.push({
      label: `Altre ${rest.length} categorie`,
      amount: formatEur(restTotal),
      trailing: share(restTotal),
      residual: true,
    });
  }
  return rows;
}

/** The Composizione tile's rows — the one list where colour is an identity, not a rank. */
function assetClassRows(byAssetClass: Record<string, number>): { rows: EmailRankedRow[]; total: number } {
  const entries = Object.entries(byAssetClass)
    .filter(([, value]) => value > 0)
    .sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const largest = entries[0]?.[1] ?? 0;

  return {
    total,
    rows: entries.map(([assetClass, value]) => ({
      label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
      amount: formatEur(value),
      trailing: total > 0 ? formatPercentageIt((value / total) * 100, 1) : '—',
      fill: largest > 0 ? value / largest : 0,
      fillHex: printChartHexForAssetClass(assetClass),
    })),
  };
}

/** Best and worst by percent and by euro, as three at most non-repeating rows. */
function classMoveRows(performers: AssetClassPerformers): EmailRankedRow[] {
  const rows: EmailRankedRow[] = [];
  const push = (entry: AssetClassEntry | null, caption: string) => {
    if (!entry) return;
    if (rows.some((row) => row.label === entry.name && row.caption === caption)) return;
    rows.push({
      label: entry.name,
      caption,
      amount: signedEur(entry.deltaAbs),
      trailing: signedPct(entry.deltaPct),
      trailingSign: entry.deltaPct >= 0 ? 'positive' : 'negative',
    });
  };

  push(performers.bestPct, 'migliore in percentuale');
  if (performers.bestAbs && performers.bestAbs.name !== performers.bestPct?.name) {
    push(performers.bestAbs, 'migliore in euro');
  }
  // Only list a loser when one actually lost — a period in which every class gained has none.
  if (performers.worstPct && performers.worstPct.deltaPct < 0) {
    push(performers.worstPct, 'peggiore');
  }
  return rows;
}

/** Individual transactions: the category on the row, the note under it when it adds anything. */
function transactionRows(
  entries: Array<{ description: string; categoryName: string; subCategoryName?: string }>,
  amounts: number[],
  sign?: 'positive',
): EmailRankedRow[] {
  return entries.map((entry, index) => {
    // The note earns its place only when it says something the labels do not already say.
    const redundant = entry.description === entry.categoryName || entry.description === entry.subCategoryName;
    const caption = [entry.subCategoryName, redundant ? null : entry.description].filter(Boolean).join(' · ');
    return {
      label: entry.categoryName,
      caption: caption || undefined,
      amount: sign === 'positive' ? signedEur(amounts[index]) : formatEur(amounts[index]),
    };
  });
}

/**
 * «Rispetto a un anno fa» — the tile that carries the SECOND baseline.
 *
 * It exists only when the year-earlier window differs from the previous period. On a yearly
 * email the two coincide (`previousEqualsYoy`), and every figure in it would repeat what the
 * Patrimonio and Cashflow tiles already print: The One-Tile-One-Question Rule. The old
 * «Confronti» table printed both columns unconditionally, so a yearly email said everything
 * twice and a monthly one restated its own headline delta.
 */
function buildYearOverYearTile(data: MonthlyEmailData, comparison: PeriodComparison | undefined): string {
  if (!comparison || comparison.previousEqualsYoy) return '';
  const period = emailPeriodOf(data);
  const { vsYoy } = comparison;

  const reading = describeYearOverYearTile({
    period,
    netWorth: vsYoy.netWorth,
    income: vsYoy.income,
    expenses: vsYoy.expenses,
  });
  if (!reading) return '';

  const row = (label: string, delta: MetricDelta | null, baseline: number | null, higherIsBetter: boolean) => ({
    label,
    baseline: baseline === null ? 'N/D' : formatEur(baseline),
    change: delta === null ? 'N/D' : formatDelta(delta),
    favourable: delta === null ? null : higherIsBetter ? delta.absChange >= 0 : delta.absChange <= 0,
  });

  // The baseline column is reconstructed from the current figure and the change, because that
  // is the only pair the comparison set carries — and it is exact, not an approximation.
  const baselineOf = (current: number, delta: MetricDelta | null) =>
    delta === null ? null : current - delta.absChange;

  const savings = data.totalIncome - data.totalExpenses;
  const rows = [
    row('Patrimonio netto', vsYoy.netWorth, baselineOf(data.currentNetWorth, vsYoy.netWorth), true),
    row('Entrate', vsYoy.income, baselineOf(data.totalIncome, vsYoy.income), true),
    row('Uscite', vsYoy.expenses, baselineOf(data.totalExpenses, vsYoy.expenses), false),
    row('Risparmio netto', vsYoy.savings, baselineOf(savings, vsYoy.savings), true),
  ];

  return emailTile({
    eyebrow: 'Rispetto a un anno fa',
    scope: `vs ${yearEarlierHeading(period)}`,
    reading,
    body: emailComparisonTable(['Metrica', yearEarlierHeading(period), 'Variazione'], rows),
    footer:
      'Il patrimonio confronta due snapshot di fine periodo; entrate, uscite e risparmio confrontano due periodi interi.',
  });
}

/** Budget alerts — monthly emails only, and absent when nothing crossed a threshold. */
function buildBudgetTile(data: MonthlyEmailData): string {
  const alerts = data.budgetAlerts;
  if (!alerts || alerts.length === 0) return '';

  // `MonthlyEmailData` carries the alerts, not the roster: how many budgets did NOT raise one
  // is unknown here, so the reading simply omits that clause instead of inventing a total.
  const reading = describeBudgetAlertsTile(alerts.map((alert) => ({ label: alert.label, level: alert.level })));

  const rows = alerts.map((alert) => {
    const forecast = alert.forecastedOverrun && alert.level !== 'exceeded' ? ' · sforamento previsto a fine mese' : '';
    return {
      label: alert.label,
      caption: `${formatEur(alert.spent)} / ${formatEur(alert.budgetAmount)} · ${formatPercentageIt(alert.usedRatio * 100, 0)}${forecast}`,
      level: alert.level,
    };
  });

  return emailTile({
    eyebrow: 'Budget',
    scope: `${alerts.length} fuori linea`,
    reading,
    body: emailAlertRows(rows),
  });
}

/**
 * «Spese in comune» — the household split, one row per person.
 *
 * The words come from `expenseSplitNarrative.ts`, the same sentences the Divisione tab prints.
 * Absent whenever the split could not be computed: an email is a one-way message, so a section
 * saying «the shares are unavailable» would be a notification the reader cannot act on from
 * where they are reading it. The page is where that explanation belongs.
 */
function buildExpenseSplitTile(data: MonthlyEmailData): string {
  const summary = data.expenseSplit;
  if (!summary || summary.basis.kind !== 'computed') return '';

  const rows: EmailRankedRow[] = summary.members
    .filter((balance) => balance.remaining !== null)
    .map((balance) => ({
      label: balance.member.name,
      caption: narrativeToText(describeMemberBalance(balance)),
      amount: signedEur(balance.remaining as number),
      trailingSign: (balance.remaining as number) >= 0 ? 'positive' : 'negative',
    }));
  if (rows.length === 0) return '';

  return emailTile({
    eyebrow: 'Spese in comune',
    scope: periodScopeLabel(emailPeriodOf(data)),
    reading: describeSplitBasis(summary.basis),
    body: emailRankedRows(rows),
  });
}

/**
 * Renders one periodic email — monthly, quarterly, semiannual or yearly.
 *
 * There is ONE template for the four: they differ in their labels (which the narrative layer
 * resolves from the period) and in which tiles exist at all — Budget and the Hall of Fame
 * standing are monthly, the income Top 10 is yearly, and «Rispetto a un anno fa» disappears on
 * a yearly email because there the two baselines coincide.
 */
export function generateEmailHtml(data: MonthlyEmailData, comparisonData?: PeriodComparison): string {
  const period = emailPeriodOf(data);
  const title = periodTitle(data);
  const savings = data.totalIncome - data.totalExpenses;
  const marketEffect = marketEffectOf(data);

  const verdict = buildPeriodEmailVerdict({
    period,
    currentNetWorth: data.currentNetWorth,
    previousNetWorth: data.previousNetWorth,
    netWorthDelta: data.netWorthDelta,
    netWorthDeltaPct: data.netWorthDeltaPct,
    totalIncome: data.totalIncome,
    totalExpenses: data.totalExpenses,
    marketEffect,
    rank: verdictRank(data),
  });

  const tiles: string[] = [
    emailVerdict({
      eyebrow: `Net Worth Tracker · ${periodKindLabel(period.kind)}`,
      scope: title,
      verdict,
    }),
  ];

  // The AI comment is prose and sits SECOND: it can be absent (generation is non-blocking),
  // and an email whose first words can vanish has no opening at all.
  if (data.aiComment) {
    tiles.push(
      emailTile({
        eyebrow: 'Commento AI',
        scope: title,
        body: emailProse(simpleMarkdownToHtml(data.aiComment)),
        footer: 'Generato da Assistente AI — verifica sempre le informazioni prima di agire.',
        muted: true,
      }),
    );
  }

  // ── Patrimonio ──
  const netWorthFigures: EmailKeyFigure[] = [{ label: 'Liquido', value: formatEur(data.liquidNetWorth) }];
  if (data.previousNetWorth > 0) {
    netWorthFigures.push({
      label: periodBaselineHeading(period),
      value: formatEur(data.previousNetWorth),
      muted: true,
    });
  }
  tiles.push(
    emailTile({
      eyebrow: 'Patrimonio',
      scope: `al ${periodEndLabel(period)}`,
      reading: describeNetWorthTile({
        period,
        previousNetWorth: data.previousNetWorth,
        netWorthDelta: data.netWorthDelta,
        netWorthDeltaPct: data.netWorthDeltaPct,
      }),
      body: emailHero(formatEur(data.currentNetWorth)) + emailKeyFigures(netWorthFigures),
      footer: describeMarketSplit(marketEffect, savings),
    }),
  );

  // ── Composizione ──
  const composition = assetClassRows(data.byAssetClass);
  if (composition.rows.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Composizione',
        scope: `${composition.rows.length} class${composition.rows.length === 1 ? 'e' : 'i'}`,
        reading: describeCompositionTile(
          Object.entries(data.byAssetClass).map(([assetClass, value]) => ({ assetClass, value })),
        ),
        body: emailRankedRows(composition.rows),
      }),
    );
  }

  // ── Andamento per classe ──
  const moves = classMoveRows(data.assetClassPerformers);
  if (moves.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Andamento per classe',
        scope: periodScopeLabel(period),
        reading: describeClassMovesTile(data.assetClassPerformers),
        body: emailRankedRows(moves),
      }),
    );
  }

  // ── Cashflow ──
  tiles.push(
    emailTile({
      eyebrow: 'Cashflow',
      scope: periodScopeLabel(period),
      reading: describeCashflowTile({ totalIncome: data.totalIncome, totalExpenses: data.totalExpenses }),
      body: emailKeyFigures([
        { label: 'Entrate', value: formatEur(data.totalIncome), sign: 'positive' },
        { label: 'Uscite', value: `−${formatEur(data.totalExpenses)}`, sign: 'negative' },
        { label: 'Risparmio netto', value: formatEur(savings), sign: savings >= 0 ? 'positive' : 'negative' },
      ]),
      footer: 'Risparmio netto = entrate − uscite, sull’intero periodo.',
    }),
  );

  // ── Spese per categoria ──
  const expenseRows = rankedCategoryRows(data.topExpenseCategories, data.totalExpenses);
  if (expenseRows.length > 0) {
    // Legacy and imported rows can carry no expense type, and `aggregateExpenses` counts them
    // in totalExpenses while leaving them out of expensesByType — so the typed rows stopped
    // short of 100% with nothing explaining the gap. The residual keeps its own name.
    const typedTotal = data.expensesByType.reduce((sum, entry) => sum + entry.amount, 0);
    const unclassified = data.totalExpenses - typedTotal;
    const types = [...data.expensesByType.map((entry) => ({ label: entry.label, amount: entry.amount }))];
    if (unclassified > 0.005) types.push({ label: 'Non classificate', amount: unclassified });

    tiles.push(
      emailTile({
        eyebrow: 'Spese per categoria',
        scope: `${data.topExpenseCategories.length} categorie`,
        reading: describeExpenseCategoriesTile(data.topExpenseCategories, RANKED_ROWS_SHOWN),
        body: emailRankedRows(expenseRows),
        footer: describeExpenseTypes(types),
      }),
    );
  }

  // ── Entrate per categoria ──
  const incomeRows = rankedCategoryRows(data.allIncomeCategories, data.totalIncome);
  if (incomeRows.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Entrate per categoria',
        scope: `${data.allIncomeCategories.length} categorie`,
        reading: describeIncomeCategoriesTile(data.allIncomeCategories, RANKED_ROWS_SHOWN),
        body: emailRankedRows(incomeRows),
      }),
    );
  }

  // ── Spese maggiori ──
  if (data.topIndividualExpenses.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Spese maggiori',
        scope: `${data.topIndividualExpenses.length} voci`,
        reading: describeTopExpensesTile(data.topIndividualExpenses, data.totalExpenses),
        body: emailRankedRows(
          transactionRows(
            data.topIndividualExpenses,
            data.topIndividualExpenses.map((expense) => expense.amount),
          ),
        ),
      }),
    );
  }

  // ── Entrate maggiori — yearly only ──
  if (data.periodType === 'yearly' && data.topIndividualIncome.length > 0) {
    tiles.push(
      emailTile({
        eyebrow: 'Entrate maggiori',
        scope: `${data.topIndividualIncome.length} voci`,
        body: emailRankedRows(
          transactionRows(
            data.topIndividualIncome,
            data.topIndividualIncome.map((income) => income.amount),
            'positive',
          ),
        ),
      }),
    );
  }

  // ── Dividendi ──
  const dividendReading = describeDividendsTile(data.dividendTotal, data.dividendCount);
  if (dividendReading) {
    tiles.push(
      emailTile({
        eyebrow: 'Dividendi e cedole',
        scope: periodScopeLabel(period),
        reading: dividendReading,
        body: emailHero(cachedFormatCurrencyEUR(data.dividendTotal)),
      }),
    );
  }

  tiles.push(buildYearOverYearTile(data, comparisonData));
  tiles.push(buildBudgetTile(data));
  tiles.push(buildExpenseSplitTile(data));

  return emailShell({
    title: `Riepilogo ${title}`,
    // The inbox preview is the verdict: the reader knows how the period went before opening.
    preheader: verdict.headline,
    body: tiles.filter(Boolean).join('\n'),
    footer: `Generato automaticamente da Net Worth Tracker · ${escapeHtml(title)}`,
  });
}

// ─── Sender ───────────────────────────────────────────────────────────────────

/**
 * Send a periodic summary email to all configured recipients.
 * Throws if RESEND_API_KEY is not set or if Resend returns an error.
 */
export async function sendMonthlyEmail(
  recipients: string[],
  data: MonthlyEmailData,
  comparison?: PeriodComparison
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const title = periodTitle(data);
  const subjectPrefix =
    data.periodType === 'quarterly'
      ? 'Riepilogo Trimestrale'
      : data.periodType === 'semiannual'
      ? 'Riepilogo Semestrale'
      : data.periodType === 'yearly'
      ? 'Riepilogo Annuale'
      : 'Riepilogo';

  const subject = `${subjectPrefix} ${title} — Net Worth Tracker`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com',
    to: recipients,
    subject,
    html: generateEmailHtml(data, comparison),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

// ─── Convenience builders ─────────────────────────────────────────────────────

/**
 * Build and send for any period type.
 * Returns false when no snapshot exists for the period (email skipped).
 * Generates an AI comment and injects it into the email when possible;
 * AI failure is non-blocking — the email is sent without the comment.
 */
export async function buildAndSendForPeriod(
  userId: string,
  recipients: string[],
  periodType: EmailPeriodType,
  year: number,
  month: number
): Promise<boolean> {
  const emailData = await buildPeriodEmailData(userId, year, month, periodType);
  if (!emailData) return false;

  // Deterministic comparison dataset (vs previous period + YoY) — feeds both the email
  // table and the AI commentary. Failure must not block the email: fall back to no comparison.
  let comparison: PeriodComparison | undefined;
  try {
    comparison = await buildPeriodComparison(userId, emailData);
  } catch (error) {
    console.error(`[email] Comparison build failed for user ${userId}:`, error);
  }

  // Attempt to generate the AI comment — failure is silently swallowed inside generateEmailAiComment.
  // The comparison is required for the comparison-driven prompt; skip the comment if it's missing.
  if (comparison) {
    const aiComment = await generateEmailAiComment(userId, emailData, comparison);
    if (aiComment) {
      emailData.aiComment = aiComment;
    }
  }

  await sendMonthlyEmail(recipients, emailData, comparison);
  return true;
}

/** Build and send quarterly/yearly convenience aliases used by the cron handler. */
export async function buildAndSendQuarterly(
  userId: string,
  recipients: string[],
  year: number,
  quarter: number
): Promise<boolean> {
  const lastMonth = quarter * 3;
  return buildAndSendForPeriod(userId, recipients, 'quarterly', year, lastMonth);
}

export async function buildAndSendSemiAnnual(
  userId: string,
  recipients: string[],
  year: number,
  half: number
): Promise<boolean> {
  // half 1 → June (end month 6); half 2 → December (end month 12)
  const lastMonth = half === 1 ? 6 : 12;
  return buildAndSendForPeriod(userId, recipients, 'semiannual', year, lastMonth);
}

export async function buildAndSendYearly(
  userId: string,
  recipients: string[],
  year: number
): Promise<boolean> {
  return buildAndSendForPeriod(userId, recipients, 'yearly', year, 12);
}
