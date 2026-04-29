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
import { streamAssistantResponse } from '@/lib/server/assistant/anthropicStream';
import { getDefaultAssistantPreferences } from '@/lib/server/assistant/webSearchPolicy';
import { getAssistantMemoryDocument } from '@/lib/server/assistant/store';
import {
  buildAssistantMonthContext,
  buildAssistantQuarterContext,
  buildAssistantYearContext,
} from '@/lib/services/assistantMonthContextService';
import type { AssistantMemoryItem, AssistantMode, AssistantMonthContextBundle } from '@/types/assistant';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailPeriodType = 'monthly' | 'quarterly' | 'yearly';

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
  month: number;   // for monthly: 1-12; for quarterly: last month of quarter; for yearly: 12
  quarter?: number; // 1-4, only set for quarterly
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
  topIndividualExpenses: Array<{ description: string; categoryName: string; amount: number }>; // top 5 transactions
  dividendTotal: number; // gross EUR
  dividendCount: number;
  // AI-generated markdown comment; undefined when generation failed or AI key is absent
  aiComment?: string;
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

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Azioni',
  bonds: 'Obbligazioni',
  crypto: 'Crypto',
  realestate: 'Immobili',
  cash: 'Liquidità',
  commodity: 'Materie prime',
};

// ─── Period label helpers (pure) ──────────────────────────────────────────────

function periodTitle(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return `Q${data.quarter} ${data.year}`;
  if (data.periodType === 'yearly') return `Anno ${data.year}`;
  return `${MONTH_NAMES[data.month - 1]} ${data.year}`;
}

function comparisonLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') {
    const prev = getPreviousQuarterEnd(data.year, data.month);
    return `Q${monthToQuarter(prev.month)} ${prev.year}`;
  }
  if (data.periodType === 'yearly') return `${data.year - 1}`;
  return 'mese precedente';
}

function cashflowSectionLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Cashflow del Trimestre';
  if (data.periodType === 'yearly') return "Cashflow dell'Anno";
  return 'Cashflow del Mese';
}

function expenseCategoryLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Spese per Categoria (Trimestre)';
  if (data.periodType === 'yearly') return 'Spese per Categoria (Anno)';
  return 'Spese per Categoria';
}

function incomeCategoryLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Entrate per Categoria (Trimestre)';
  if (data.periodType === 'yearly') return 'Entrate per Categoria (Anno)';
  return 'Entrate per Categoria';
}

function topExpenseTransactionLabel(data: MonthlyEmailData): string {
  if (data.periodType === 'quarterly') return 'Top 5 Spese del Trimestre';
  if (data.periodType === 'yearly') return "Top 5 Spese dell'Anno";
  return 'Top 5 Spese del Mese';
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
 * Generates an AI comment for the period by calling the same analysis pipeline
 * used by the interactive assistant (month_analysis, quarter_analysis, or year_analysis).
 *
 * The comment is injected into the email HTML when available. Any failure
 * (Anthropic API error, missing key, context build error) is caught and logged;
 * the email is always sent regardless of whether the comment was generated.
 *
 * @returns The AI-generated markdown text, or null on failure.
 */
async function generateEmailAiComment(
  userId: string,
  emailData: MonthlyEmailData
): Promise<string | null> {
  try {
    // Load user's assistant preferences and active memory items for personalisation.
    // Falls back to defaults + empty memory on any Firestore failure.
    let preferences = getDefaultAssistantPreferences();
    // Web search always enabled for email AI comments so the analysis can connect
    // portfolio performance to global macro events (rates, geopolitics, markets).
    preferences = { ...preferences, includeMacroContext: true };
    let memoryItems: AssistantMemoryItem[] = [];

    try {
      const memoryDoc = await getAssistantMemoryDocument(userId);
      // Use user's actual preferences (e.g. responseStyle) but force macro context on
      preferences = { ...memoryDoc.preferences, includeMacroContext: true };
      memoryItems = memoryDoc.items.filter((i) => i.status === 'active');
    } catch {
      // Memory load is non-critical — proceed with defaults
    }

    // Map email periodType → AI mode + context builder
    let mode: AssistantMode;
    let contextBundle: AssistantMonthContextBundle;

    if (emailData.periodType === 'monthly') {
      mode = 'month_analysis';
      contextBundle = await buildAssistantMonthContext(
        userId,
        { year: emailData.year, month: emailData.month },
        false
      );
    } else if (emailData.periodType === 'quarterly') {
      mode = 'quarter_analysis';
      // quarter is always set for quarterly emails
      contextBundle = await buildAssistantQuarterContext(userId, emailData.year, emailData.quarter!, false);
    } else {
      mode = 'year_analysis';
      contextBundle = await buildAssistantYearContext(userId, emailData.year, false);
    }

    const systemPrompt =
      emailData.periodType === 'monthly'
        ? 'Analizza il mese e fornisci le tue osservazioni principali.'
        : emailData.periodType === 'quarterly'
        ? 'Analizza il trimestre e fornisci le tue osservazioni principali.'
        : "Analizza l'anno e fornisci le tue osservazioni principali.";

    const { text } = await streamAssistantResponse({
      mode,
      prompt: systemPrompt,
      contextBundle,
      preferences,
      memoryItems,
      enableWebSearch: true,  // always on — connects portfolio performance to global macro events
      conversationHistory: [],
      onStatus: () => {},     // no-op: email generation is non-interactive
      onText: () => {},       // no-op: we use the returned aggregated text
    });

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
    yearlyEmailEnabled: data.yearlyEmailEnabled,
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

interface CashflowAggregation {
  totalIncome: number;
  totalExpenses: number;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  allIncomeCategories: Array<{ name: string; amount: number }>;
  topIndividualExpenses: Array<{ description: string; categoryName: string; amount: number }>;
}

function aggregateExpenses(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): CashflowAggregation {
  let totalIncome = 0;
  let totalExpenses = 0;
  const expenseCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const incomeCategoryTotals: Record<string, { name: string; amount: number }> = {};
  const individualExpenses: Array<{ description: string; categoryName: string; amount: number }> =
    [];

  for (const doc of docs) {
    const data = doc.data() as {
      amount: number;
      categoryName?: string;
      categoryId?: string;
      notes?: string;
    };
    const { amount } = data;

    const key = data.categoryId ?? data.categoryName ?? 'Altro';
    const categoryName = data.categoryName ?? 'Altro';

    if (amount > 0) {
      totalIncome += amount;
      if (!incomeCategoryTotals[key]) {
        incomeCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      incomeCategoryTotals[key].amount += amount;
    } else {
      const absAmount = Math.abs(amount);
      totalExpenses += absAmount;

      if (!expenseCategoryTotals[key]) {
        expenseCategoryTotals[key] = { name: categoryName, amount: 0 };
      }
      expenseCategoryTotals[key].amount += absAmount;

      // Individual transaction — use notes when available, fall back to category name
      const description = data.notes?.trim() || categoryName;
      individualExpenses.push({ description, categoryName, amount: absAmount });
    }
  }

  // All categories sorted desc — no cap; callers display the full list
  const topExpenseCategories = Object.values(expenseCategoryTotals)
    .sort((a, b) => b.amount - a.amount);

  const allIncomeCategories = Object.values(incomeCategoryTotals)
    .sort((a, b) => b.amount - a.amount);

  const topIndividualExpenses = individualExpenses
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return { totalIncome, totalExpenses, topExpenseCategories, allIncomeCategories, topIndividualExpenses };
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

  const { totalIncome, totalExpenses, topExpenseCategories, allIncomeCategories, topIndividualExpenses } =
    aggregateExpenses(expensesSnap.docs);
  const { dividendTotal, dividendCount } = aggregateDividends(dividendsSnap.docs);

  return {
    periodType,
    year,
    month,
    quarter: periodType === 'quarterly' ? monthToQuarter(month) : undefined,
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
    dividendTotal,
    dividendCount,
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

/** Exported for unit testing only — callers should use sendMonthlyEmail. */
export function generateEmailHtml(data: MonthlyEmailData): string {
  const title = periodTitle(data);
  const comparison = comparisonLabel(data);

  const deltaPositive = data.netWorthDelta >= 0;
  const deltaColor = deltaPositive ? '#16a34a' : '#dc2626';
  const deltaArrow = deltaPositive ? '▲' : '▼';

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

  // Top 5 individual expense transactions
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
                <td style="padding:8px 0 0;font-weight:600;">Risparmio netto</td>
                <td style="padding:8px 0 0;text-align:right;color:${savingsColor};font-weight:700;">${formatEur(savedAmount)}${savingsRate !== null ? `<span style="font-size:11px;color:#64748b;font-weight:400;margin-left:4px;">(${savingsRate}%)</span>` : ''}</td>
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

        <!-- Top 5 individual expense transactions -->
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
  data: MonthlyEmailData
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const title = periodTitle(data);
  const subjectPrefix =
    data.periodType === 'quarterly'
      ? 'Riepilogo Trimestrale'
      : data.periodType === 'yearly'
      ? 'Riepilogo Annuale'
      : 'Riepilogo';

  const subject = `${subjectPrefix} ${title} — Net Worth Tracker`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com',
    to: recipients,
    subject,
    html: generateEmailHtml(data),
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

  // Attempt to generate the AI comment — failure is silently swallowed inside generateEmailAiComment
  const aiComment = await generateEmailAiComment(userId, emailData);
  if (aiComment) {
    emailData.aiComment = aiComment;
  }

  await sendMonthlyEmail(recipients, emailData);
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

export async function buildAndSendYearly(
  userId: string,
  recipients: string[],
  year: number
): Promise<boolean> {
  return buildAndSendForPeriod(userId, recipients, 'yearly', year, 12);
}
