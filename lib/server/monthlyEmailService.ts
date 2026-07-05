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

import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { AssetAllocationSettings } from '@/types/assets';
import { getDefaultAssistantPreferences } from '@/lib/server/assistant/webSearchPolicy';
import { getAssistantMemoryDocument } from '@/lib/server/assistant/store';
import {
  formatMemoryForPrompt,
  buildResponseStyleInstruction,
  ASSISTANT_SYSTEM_CORE,
  EMAIL_PERIODIC_FORMAT_CONTRACT,
  type AssistantPromptParts,
} from '@/lib/server/assistant/prompts';
import type { AssistantMemoryItem, AssistantPreferences } from '@/types/assistant';
import { buildPeriodComparison } from '@/lib/server/emailPeriodComparison';
import type { PeriodComparison, MetricDelta, ComparisonSet } from '@/lib/server/emailPeriodComparison';
import { evaluateBudgetAlerts } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import type { BudgetAlert, BudgetItem } from '@/types/budget';
import { type Expense, type ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import {
  calculateMonthlyRecords,
  calculateYearlyRecords,
  rankPeriodByNetWorthGrowth,
  type PeriodGrowthRank,
} from '@/lib/utils/hallOfFameRecords';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailPeriodType = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export interface AssetClassEntry {
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
  topExpenseCategories: Array<{ name: string; amount: number }>; // all expense categories sorted desc
  allIncomeCategories: Array<{ name: string; amount: number }>; // all income categories sorted desc
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

function formatEur(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function signedPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** EUR amount with an explicit leading "+" for non-negative values (formatEur already prefixes "-"). */
function signedEur(amount: number): string {
  const sign = amount >= 0 ? '+' : '';
  return `${sign}${formatEur(amount)}`;
}

/** Renders a metric delta as "+1.234 € (+3,2%)", or "N/D" when the comparison is unavailable. */
function formatDelta(delta: MetricDelta | null): string {
  if (!delta) return 'N/D';
  const pct = delta.pctChange !== null ? ` (${signedPct(delta.pctChange)})` : '';
  return `${signedEur(delta.absChange)}${pct}`;
}

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Crypto',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie prime',
};

// ─── Period label helpers (pure) ──────────────────────────────────────────────

/** Human-readable semester label, e.g. "1° Semestre 2026". */
function semesterTitle(data: MonthlyEmailData): string {
  return `${data.semester}° Semestre ${data.year}`;
}

function periodTitle(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return `Q${data.quarter} ${data.year}`;
  if (data.periodType === 'semiannual') return semesterTitle(data);
  if (data.periodType === 'yearly') return `Anno ${data.year}`;
  return `${MONTH_NAMES[data.month - 1]} ${data.year}`;
}

function comparisonLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(data.year, data.month);
    return `Q${monthToQuarter(prev.month)} ${prev.year}`;
  }
  if (data.periodType === 'semiannual') {
    const prev = getPreviousHalfEnd(data.year, data.month);
    return `${monthToSemester(prev.month)}° Semestre ${prev.year}`;
  }
  if (data.periodType === 'yearly') return `${data.year - 1}`;
  return 'mese precedente';
}

function cashflowSectionLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Cashflow del Trimestre';
  if (data.periodType === 'semiannual') return 'Cashflow del Semestre';
  if (data.periodType === 'yearly') return "Cashflow dell'Anno";
  return 'Cashflow del Mese';
}

function expenseCategoryLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Spese per Categoria (Trimestre)';
  if (data.periodType === 'semiannual') return 'Spese per Categoria (Semestre)';
  if (data.periodType === 'yearly') return 'Spese per Categoria (Anno)';
  return 'Spese per Categoria';
}

function incomeCategoryLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Entrate per Categoria (Trimestre)';
  if (data.periodType === 'semiannual') return 'Entrate per Categoria (Semestre)';
  if (data.periodType === 'yearly') return 'Entrate per Categoria (Anno)';
  return 'Entrate per Categoria';
}

function expenseTypeLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Spese per Tipo (Trimestre)';
  if (data.periodType === 'semiannual') return 'Spese per Tipo (Semestre)';
  if (data.periodType === 'yearly') return 'Spese per Tipo (Anno)';
  return 'Spese per Tipo';
}

function topExpenseTransactionLabel(data: MonthlyEmailData): string {
  // The yearly report widens the list to Top 10 (see buildPeriodEmailData).
  if (data.periodType === 'quarterly') return 'Top 5 Spese del Trimestre';
  if (data.periodType === 'semiannual') return 'Top 5 Spese del Semestre';
  if (data.periodType === 'yearly') return "Top 10 Spese dell'Anno";
  return 'Top 5 Spese del Mese';
}

/** Yearly-only — the income Top 10 is not rendered for shorter periods. */
function topIncomeTransactionLabel(): string {
  return "Top 10 Entrate dell'Anno";
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
        '<p style="margin:16px 0 2px;font-size:13px;font-weight:600;color:#0f172a;">$1</p>'
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
 * Builds the period-specific prompt for the email AI comment.
 *
 * Deliberately independent from the interactive assistant's mode-specific prompt builders:
 * the email needs a comparison-driven structure (vs previous period + YoY + cause analysis)
 * and a period label that includes the semi-annual case, neither of which the shared
 * builders provide. Reuses ASSISTANT_SYSTEM_CORE for the role/domain/guardrail text so the
 * two surfaces don't drift, plus its own EMAIL_PERIODIC_FORMAT_CONTRACT for the 5-section
 * structure. All figures come from `emailData` + the deterministic `comparison`.
 *
 * Returns { system, userContent }: system is byte-identical across every user's email in
 * a given cron run (role, domain, guardrails, format contract) — cache_control on it lets
 * the run's many back-to-back calls share one cached prefix instead of re-paying for it
 * per user. userContent carries the period label, comparison data, and memory.
 */
function buildEmailAiPrompt(
  emailData: MonthlyEmailData,
  comparison: PeriodComparison,
  preferences: AssistantPreferences,
  memoryItems: AssistantMemoryItem[]
): AssistantPromptParts {
  const label = periodTitle(emailData);
  const savedAmount = emailData.totalIncome - emailData.totalExpenses;
  const savingsRate =
    emailData.totalIncome > 0
      ? ((savedAmount / emailData.totalIncome) * 100).toFixed(1)
      : 'N/D';

  // Top expense categories with their deltas vs both baselines — the raw material for cause analysis.
  const categoryLines = comparison.categoryDeltas.length
    ? comparison.categoryDeltas
        .map(
          (c) =>
            `- ${c.name}: ${formatEur(c.current)} (vs periodo prec.: ${formatDelta(
              c.vsPrevious
            )}; vs anno prec.: ${formatDelta(c.vsYoy)})`
        )
        .join('\n')
    : '- Nessuna spesa categorizzata nel periodo.';

  // Largest individual transactions with subcategory + note — gives the AI the granular "why"
  // behind category movements (e.g. a one-off purchase vs a structural increase).
  const topExpenseDetailLines = emailData.topIndividualExpenses.length
    ? emailData.topIndividualExpenses
        .map((e) => {
          const sub = e.subCategoryName ? ` › ${e.subCategoryName}` : '';
          // description carries the note when it differs from the category name.
          const note = e.description && e.description !== e.categoryName ? ` — "${e.description}"` : '';
          return `- ${e.categoryName}${sub}${note}: ${formatEur(e.amount)}`;
        })
        .join('\n')
    : '- Nessuna spesa individuale di rilievo nel periodo.';

  // Spending mix by type — lets the comment reason about structural (fisse) vs
  // compressible (variabili) vs debt, which the per-category lines don't capture.
  const typeLines = emailData.expensesByType.length
    ? emailData.expensesByType
        .map((t) => {
          const pct = emailData.totalExpenses > 0 ? ((t.amount / emailData.totalExpenses) * 100).toFixed(1) : '0.0';
          return `- ${t.label}: ${formatEur(t.amount)} (${pct}% delle uscite)`;
        })
        .join('\n')
    : '- Nessuna spesa categorizzata per tipo nel periodo.';

  // Hall of Fame standing — deterministic, so the comment can cite it without inventing.
  const hallOfFameLine = emailData.hallOfFameRank
    ? emailData.hallOfFameRank.trend === 'growth'
      ? `Hall of Fame: è il ${emailData.hallOfFameRank.rank}° ${emailData.hallOfFameRank.scope === 'month' ? 'mese' : 'anno'} per crescita del patrimonio (su ${emailData.hallOfFameRank.total} con crescita).`
      : `Hall of Fame: ${emailData.hallOfFameRank.scope === 'month' ? 'mese' : 'anno'} in calo del patrimonio.`
    : null;

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
    '--- DATI DEL PERIODO CORRENTE ---',
    `Patrimonio netto: ${formatEur(emailData.currentNetWorth)}`,
    `Entrate totali: ${formatEur(emailData.totalIncome)}`,
    `Uscite totali: ${formatEur(emailData.totalExpenses)}`,
    `Risparmio netto (Entrate − Uscite): ${formatEur(savedAmount)} (${savingsRate}% del reddito)`,
    `Dividendi e cedole: ${formatEur(emailData.dividendTotal)} (${emailData.dividendCount} pagamenti)`,
    ...(hallOfFameLine ? [hallOfFameLine] : []),
    '',
    '--- SPESE PER TIPO (Fisse / Variabili / Debiti) ---',
    typeLines,
    '',
    formatComparisonForPrompt('CONFRONTO COL PERIODO PRECEDENTE', comparison.vsPrevious),
    '',
    ...(comparison.previousEqualsYoy
      ? []
      : [formatComparisonForPrompt('CONFRONTO CON LO STESSO PERIODO DELL\'ANNO PRECEDENTE', comparison.vsYoy), '']),
    '--- VARIAZIONE SPESE PER CATEGORIA ---',
    categoryLines,
    '',
    '--- SPESE PIÙ RILEVANTI DEL PERIODO (categoria › sottocategoria — nota) ---',
    topExpenseDetailLines,
  ].join('\n');

  return { system: `${ASSISTANT_SYSTEM_CORE}\n\n${EMAIL_PERIODIC_FORMAT_CONTRACT}`, userContent };
}

/**
 * Generates the AI comment for the period via a dedicated, email-specific prompt and a
 * direct Anthropic call (web search enabled for macro context).
 *
 * Unlike the interactive assistant, the email comment is comparison-driven: it interprets the
 * deterministic previous-period and year-over-year deltas computed in `comparison`.
 *
 * The comment is injected into the email HTML when available. Any failure (Anthropic API error,
 * missing key, prompt error) is caught and logged; the email is always sent regardless.
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

    const { system, userContent } = buildEmailAiPrompt(emailData, comparison, preferences, memoryItems);

    // Lazy import so a module-level `new Anthropic()` never breaks test environments
    // where ANTHROPIC_API_KEY is absent (same pattern as memoryExtraction).
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 5000,
      // No cache_control — see anthropicStream.ts for why caching stays off app-wide.
      system: system,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3,
        } as any,
      ],
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
  totalIncome: number;
  totalExpenses: number;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  allIncomeCategories: Array<{ name: string; amount: number }>;
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

    const key = data.categoryId ?? data.categoryName ?? 'Altro';
    const categoryName = data.categoryName ?? 'Altro';
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

  // All categories sorted desc — no cap; callers display the full list
  const topExpenseCategories = Object.values(expenseCategoryTotals)
    .sort((a, b) => b.amount - a.amount);

  const allIncomeCategories = Object.values(incomeCategoryTotals)
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
  // Determine expense window start month
  let windowStartMonth: number;

  if (periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
    windowStartMonth = getQuarterStartMonth(month);
  } else if (periodType === 'semiannual') {
    const prev = getPreviousHalfEnd(year, month);
    prevYear = prev.year;
    prevMonth = prev.month;
    windowStartMonth = getSemesterStartMonth(month);
  } else if (periodType === 'yearly') {
    prevYear = year - 1;
    prevMonth = 12;
    windowStartMonth = 1;
  } else {
    // monthly
    prevMonth = month === 1 ? 12 : month - 1;
    prevYear = month === 1 ? year - 1 : year;
    windowStartMonth = month;
  }

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
  };
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

/**
 * Renders one comparison delta as an email table cell, coloured by whether the change is
 * favourable. For net worth / income / savings higher is better; for expenses lower is better.
 */
function comparisonCell(delta: MetricDelta | null, higherIsBetter: boolean): string {
  const base = 'padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;';
  if (!delta) {
    return `<td style="${base}color:#94a3b8;">N/D</td>`;
  }
  const isFavourable = higherIsBetter ? delta.absChange >= 0 : delta.absChange <= 0;
  const color = isFavourable ? '#16a34a' : '#dc2626';
  return `<td style="${base}color:${color};font-weight:600;">${formatDelta(delta)}</td>`;
}

/**
 * Builds the "Confronti" section: a deterministic table of how net worth, income, expenses and
 * savings changed vs the previous period and (when distinct) vs the same period one year earlier.
 * For yearly emails the two axes coincide, so a single comparison column is rendered.
 */
function buildComparisonSectionHtml(comparison: PeriodComparison): string {
  const { vsPrevious, vsYoy, previousEqualsYoy } = comparison;
  const showYoy = !previousEqualsYoy;

  const headerCell = (label: string) =>
    `<th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">${label}</th>`;

  // Each row: [metric label, vs-previous cell, optional vs-YoY cell]. `higherIsBetter` drives colour.
  const row = (
    label: string,
    prev: MetricDelta | null,
    yoy: MetricDelta | null,
    higherIsBetter: boolean
  ) =>
    `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${label}</td>
          ${comparisonCell(prev, higherIsBetter)}
          ${showYoy ? comparisonCell(yoy, higherIsBetter) : ''}
        </tr>`;

  return `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Confronti</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Metrica</th>
                  ${headerCell(`vs ${vsPrevious.baselineLabel}`)}
                  ${showYoy ? headerCell(`vs ${vsYoy.baselineLabel}`) : ''}
                </tr>
              </thead>
              <tbody>
                ${row('Patrimonio netto', vsPrevious.netWorth, vsYoy.netWorth, true)}
                ${row('Entrate', vsPrevious.income, vsYoy.income, true)}
                ${row('Uscite', vsPrevious.expenses, vsYoy.expenses, false)}
                ${row('Risparmio netto', vsPrevious.savings, vsYoy.savings, true)}
              </tbody>
            </table>
            <p style="margin:10px 0 0;font-size:11px;color:#94a3b8;line-height:1.5;">
              <strong style="color:#64748b;">Patrimonio netto</strong>: confronto tra gli snapshot di fine periodo.
              <strong style="color:#64748b;">Entrate</strong>, <strong style="color:#64748b;">Uscite</strong> e <strong style="color:#64748b;">Risparmio netto</strong>: totali dell'intero periodo a confronto (Risparmio netto = Entrate − Uscite).
            </p>
          </td>
        </tr>`;
}

/** Exported for unit testing only — callers should use sendMonthlyEmail. */
/**
 * Renders the budget alerts section. Each alert is one row: label, spent/budget,
 * a percentage, and a sign-aware colour (red = exceeded, amber = warning).
 * Inline hex colours are intentional — email clients don't support CSS tokens.
 * Returns '' when there are no alerts so the section disappears cleanly.
 */
function buildBudgetAlertsSectionHtml(alerts: BudgetAlert[] | undefined): string {
  if (!alerts || alerts.length === 0) return '';

  const rows = alerts
    .map((alert) => {
      const color = alert.level === 'exceeded' ? '#dc2626' : '#d97706';
      const pct = Math.round(alert.usedRatio * 100);
      const badge = alert.level === 'exceeded' ? 'Superato' : `${alert.threshold}%`;
      const forecastNote = alert.forecastedOverrun && alert.level !== 'exceeded'
        ? ' · sforamento previsto a fine mese'
        : '';
      return `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="display:inline-block;font-size:11px;font-weight:700;color:#ffffff;background:${color};border-radius:4px;padding:2px 6px;margin-right:8px;">${badge}</span>
            <span style="font-size:13px;color:#0f172a;">${alert.label}</span>
            <div style="font-size:12px;color:#64748b;margin-top:2px;font-family:'Geist Mono', ui-monospace, monospace;">
              ${formatEur(alert.spent)} / ${formatEur(alert.budgetAmount)} &nbsp;·&nbsp; <span style="color:${color};font-weight:600;">${pct}%</span>${forecastNote}
            </div>
          </td>
        </tr>`;
    })
    .join('');

  return `
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Avvisi Budget</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              ${rows}
            </table>
          </td>
        </tr>`;
}

/**
 * Builds the Hall of Fame mention shown under the Net Worth KPI.
 *
 * Growth → "🏆 È il N° miglior mese/anno per crescita del patrimonio (su M)".
 * Decline → "📉 Mese/Anno in calo" (with the decline rank when more than one).
 * Returns '' when there is no ranking (first period, flat change, or scope absent),
 * so the badge simply disappears rather than rendering an empty box.
 */
function buildHallOfFameLineHtml(data: MonthlyEmailData): string {
  const rank = data.hallOfFameRank;
  if (!rank) return '';

  const periodNoun = rank.scope === 'month' ? 'mese' : 'anno';
  const periodNounCap = rank.scope === 'month' ? 'Mese' : 'Anno';

  const text =
    rank.trend === 'growth'
      ? `🏆 È il ${rank.rank}° miglior ${periodNoun} per crescita del patrimonio${rank.total > 1 ? ` (su ${rank.total})` : ''}`
      : `📉 ${periodNounCap} in calo${rank.total > 1 ? ` — ${rank.rank}° calo più marcato` : ''}`;

  const bg = rank.trend === 'growth' ? '#f0fdf4' : '#fef2f2';
  const fg = rank.trend === 'growth' ? '#16a34a' : '#dc2626';

  return `<p style="margin:10px 0 0;display:inline-block;font-size:12px;font-weight:600;color:${fg};background:${bg};border-radius:6px;padding:4px 10px;">${text}</p>`;
}

export function generateEmailHtml(data: MonthlyEmailData, comparisonData?: PeriodComparison): string {
  const title = periodTitle(data);
  const comparison = comparisonLabel(data);

  const deltaPositive = data.netWorthDelta >= 0;
  const deltaColor = deltaPositive ? '#16a34a' : '#dc2626';
  const deltaArrow = deltaPositive ? '▲' : '▼';
  const hallOfFameLine = buildHallOfFameLineHtml(data);

  // Asset class table — with % column and Δ% delta
  const totalValue = Object.values(data.byAssetClass).reduce(
    (s, v) => s + (v > 0 ? v : 0),
    0
  );
  const assetRows = Object.entries(data.byAssetClass)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cls, value]) => {
      const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0.0';
      const label = ASSET_CLASS_LABELS[cls] ?? cls;
      return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${label}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(value)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#64748b;font-size:12px;">${pct}%</td>
        </tr>`;
    })
    .join('');

  // Performance spotlight (best/worst Δ%)
  const { bestPct, worstPct, bestAbs, worstAbs } = data.assetClassPerformers;
  const hasPctRows = bestPct && worstPct && bestPct.name !== worstPct.name;
  const hasAbsRows = bestAbs && worstAbs && bestAbs.name !== worstAbs.name;

  const perfRow = (
    arrow: string,
    label: string,
    entry: AssetClassEntry,
    color: string
  ) =>
    `<tr>
      <td style="padding:5px 0;"><span style="color:${color};font-weight:600;">${arrow} ${label}:</span> ${entry.name}</td>
      <td style="padding:5px 0;text-align:right;color:${color};font-weight:600;">
        ${signedPct(entry.deltaPct)}
        <span style="font-weight:400;color:#64748b;margin-left:6px;">(${entry.deltaAbs >= 0 ? '+' : ''}${formatEur(entry.deltaAbs)})</span>
      </td>
    </tr>`;

  const performanceSection =
    hasPctRows || hasAbsRows
      ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Performance Asset Class</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              ${hasPctRows ? `
              <tr><td colspan="2" style="padding:4px 0 2px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Variazione %</td></tr>
              ${perfRow('▲', 'Migliore', bestPct!, '#16a34a')}
              ${perfRow('▼', 'Peggiore', worstPct!, '#dc2626')}
              ` : ''}
              ${hasAbsRows ? `
              <tr><td colspan="2" style="padding:${hasPctRows ? '12px' : '4px'} 0 2px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Variazione assoluta</td></tr>
              ${perfRow('▲', 'Migliore', bestAbs!, '#16a34a')}
              ${perfRow('▼', 'Peggiore', worstAbs!, '#dc2626')}
              ` : ''}
            </table>
          </td>
        </tr>`
      : '';

  // Expenses by type (Fisse/Variabili/Debiti) with % of total — the spending-mix view.
  const typeRows = data.expensesByType
    .map((entry) => {
      const pct = data.totalExpenses > 0 ? ((entry.amount / data.totalExpenses) * 100).toFixed(1) : '0.0';
      return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${entry.label}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(entry.amount)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#64748b;font-size:12px;">${pct}%</td>
        </tr>`;
    })
    .join('');

  // All expense categories with % of total
  const categoryRows = data.topExpenseCategories
    .map((cat) => {
      const pct = data.totalExpenses > 0 ? ((cat.amount / data.totalExpenses) * 100).toFixed(1) : '0.0';
      return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${cat.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(cat.amount)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#64748b;font-size:12px;">${pct}%</td>
        </tr>`;
    })
    .join('');

  // All income categories with % of total
  const incomeCategoryRows = data.allIncomeCategories
    .map((cat) => {
      const pct = data.totalIncome > 0 ? ((cat.amount / data.totalIncome) * 100).toFixed(1) : '0.0';
      return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${cat.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(cat.amount)}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;color:#64748b;font-size:12px;">${pct}%</td>
        </tr>`;
    })
    .join('');

  // Top individual expense transactions (5, or 10 for the yearly report)
  const individualExpenseRows = data.topIndividualExpenses
    .map((exp) => {
      // Show category prominently; note below in muted text only when it differs from category
      const hasNote = exp.description && exp.description !== exp.categoryName;
      return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">
            <span style="display:block;">${exp.categoryName}</span>
            ${hasNote ? `<span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px;">${exp.description}</span>` : ''}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;vertical-align:top;">${formatEur(exp.amount)}</td>
        </tr>`;
    })
    .join('');

  // Top 10 individual income transactions — yearly report only.
  const individualIncomeRows =
    data.periodType === 'yearly'
      ? data.topIndividualIncome
          .map((inc) => {
            const hasNote = inc.description && inc.description !== inc.categoryName;
            return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">
            <span style="display:block;">${inc.categoryName}</span>
            ${hasNote ? `<span style="display:block;font-size:11px;color:#94a3b8;margin-top:2px;">${inc.description}</span>` : ''}
          </td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;vertical-align:top;color:#16a34a;">${formatEur(inc.amount)}</td>
        </tr>`;
          })
          .join('')
      : '';

  const savedAmount = data.totalIncome - data.totalExpenses;
  const savingsColor = savedAmount >= 0 ? '#16a34a' : '#dc2626';
  const savingsRate =
    data.totalIncome > 0 ? ((savedAmount / data.totalIncome) * 100).toFixed(1) : null;

  // "rispetto al mese precedente" vs "rispetto al Q4 2025" vs "rispetto al 2025"
  const comparisonPhrase =
    data.periodType === 'monthly'
      ? `rispetto al ${comparison}`
      : data.periodType === 'quarterly'
      ? `rispetto al ${comparison}`
      : `rispetto al ${comparison}`;

  const comparisonPrevLabel =
    data.periodType === 'monthly'
      ? 'Mese precedente'
      : data.periodType === 'quarterly'
      ? `Trimestre precedente (${comparison})`
      : data.periodType === 'semiannual'
      ? `Semestre precedente (${comparison})`
      : `Anno precedente (${comparison})`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Riepilogo ${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Net Worth Tracker</p>
            <h1 style="margin:8px 0 0;color:#f8fafc;font-size:22px;font-weight:700;">Riepilogo ${title}</h1>
          </td>
        </tr>

        <!-- Net Worth KPI -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Patrimonio Netto</p>
            <p style="margin:0;font-size:32px;font-weight:700;color:#0f172a;">${formatEur(data.currentNetWorth)}</p>
            <p style="margin:8px 0 0;font-size:14px;color:${deltaColor};font-weight:600;">
              ${deltaArrow} ${formatEur(Math.abs(data.netWorthDelta))} (${signedPct(data.netWorthDeltaPct)})
              <span style="color:#94a3b8;font-weight:400;"> ${comparisonPhrase}</span>
            </p>
            ${
              data.previousNetWorth > 0
                ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${comparisonPrevLabel}: ${formatEur(data.previousNetWorth)} &nbsp;·&nbsp; Liquido: ${formatEur(data.liquidNetWorth)}</p>`
                : ''
            }
            ${hallOfFameLine ? `<br />${hallOfFameLine}` : ''}
          </td>
        </tr>

        <!-- Asset class breakdown -->
        ${
          assetRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Allocazione per Asset Class</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Classe</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Valore</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">%</th>
                </tr>
              </thead>
              <tbody>${assetRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Performance spotlight -->
        ${performanceSection}

        <!-- Cashflow summary -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${cashflowSectionLabel(data)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <tr>
                <td style="padding:6px 0;">Entrate totali</td>
                <td style="padding:6px 0;text-align:right;color:#16a34a;font-weight:600;">${formatEur(data.totalIncome)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;">Uscite totali</td>
                <td style="padding:6px 0;text-align:right;color:#dc2626;font-weight:600;">-${formatEur(data.totalExpenses)}</td>
              </tr>
              <tr style="border-top:1px solid #e2e8f0;">
                <td style="padding:8px 0 0;font-weight:600;">
                  Risparmio netto
                  <span style="display:block;font-size:11px;color:#94a3b8;font-weight:400;">Entrate − Uscite</span>
                </td>
                <td style="padding:8px 0 0;text-align:right;vertical-align:top;color:${savingsColor};font-weight:700;">${formatEur(savedAmount)}${savingsRate !== null ? `<span style="font-size:11px;color:#64748b;font-weight:400;margin-left:4px;">(${savingsRate}% del reddito)</span>` : ''}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Income by category -->
        ${
          incomeCategoryRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${incomeCategoryLabel(data)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Categoria</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Totale</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">%</th>
                </tr>
              </thead>
              <tbody>${incomeCategoryRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Expenses by type (Fisse/Variabili/Debiti) -->
        ${
          typeRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${expenseTypeLabel(data)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Tipo</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Totale</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">%</th>
                </tr>
              </thead>
              <tbody>${typeRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Expense categories -->
        ${
          categoryRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${expenseCategoryLabel(data)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Categoria</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Totale</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">%</th>
                </tr>
              </thead>
              <tbody>${categoryRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Top individual expense transactions (5, or 10 for yearly) -->
        ${
          individualExpenseRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${topExpenseTransactionLabel(data)}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Spesa</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Importo</th>
                </tr>
              </thead>
              <tbody>${individualExpenseRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Top 10 individual income transactions (yearly report only) -->
        ${
          individualIncomeRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">${topIncomeTransactionLabel()}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Entrata</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Importo</th>
                </tr>
              </thead>
              <tbody>${individualIncomeRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Dividends -->
        ${
          data.dividendCount > 0
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">Dividendi & Cedole</p>
            <p style="margin:0;font-size:22px;font-weight:700;color:#0f172a;">${formatEur(data.dividendTotal)}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${data.dividendCount} pagament${data.dividendCount === 1 ? 'o' : 'i'} ricevut${data.dividendCount === 1 ? 'o' : 'i'}</p>
          </td>
        </tr>`
            : ''
        }

        <!-- Comparisons (vs previous period + YoY) -->
        ${comparisonData ? buildComparisonSectionHtml(comparisonData) : ''}

        <!-- Budget alerts (monthly only) -->
        ${buildBudgetAlertsSectionHtml(data.budgetAlerts)}

        <!-- AI Comment -->
        ${
          data.aiComment
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;background:#f8fafc;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Commento AI</p>
            <div style="font-size:13px;color:#374151;line-height:1.7;">${simpleMarkdownToHtml(data.aiComment)}</div>
            <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;">Generato da Assistente AI — verifica sempre le informazioni prima di agire.</p>
          </td>
        </tr>`
            : ''
        }

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Generato automaticamente da Net Worth Tracker &nbsp;·&nbsp; ${title}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

/** Build and send the monthly email for the current Italy month. */
export async function buildAndSendForCurrentMonth(
  userId: string,
  recipients: string[]
): Promise<boolean> {
  const { year, month } = getItalyMonthYear(new Date());
  return buildAndSendForPeriod(userId, recipients, 'monthly', year, month);
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
