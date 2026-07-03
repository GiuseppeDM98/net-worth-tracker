/**
 * Weekly budget status email (sent on Sundays).
 *
 * Server-only: imports firebase-admin and the Resend SDK. Reuses the same pure
 * budget layer as the in-app tab (lib/utils/budgetUtils) so the email and the UI
 * never disagree. Deterministic table + a single optional AI sentence.
 *
 * Category budgets that actually exceeded their limit (ratio > 1) carry a per-expense
 * breakdown (with the note when present) so the reader sees *what* drove the overrun.
 */

import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { getItalyDate, getItalyYear, getItalyMonth } from '@/lib/utils/dateHelpers';
import {
  getPeriodActual,
  getActualForItem,
  getPeriodExpensesForItem,
  buildSpendingForecast,
  getMonthlyTotalExpenses,
  getOverallMonthlyBaseline,
} from '@/lib/utils/budgetUtils';
import type { BudgetItem, BudgetPeriod } from '@/types/budget';
import type { Expense } from '@/types/expenses';

const WARNING_RATIO = 0.8;

export type BudgetRowStatus = 'ok' | 'warning' | 'over';

/** A single expense contributing to an over-budget category, for the email breakdown. */
export interface OverspendExpense {
  description: string; // the note when present, otherwise the budget label
  subCategory?: string; // the expense's subcategory; omitted for subcategory-scoped budgets (redundant)
  date: Date;
  amount: number; // absolute EUR
}

export interface WeeklyBudgetRow {
  label: string;
  period: BudgetPeriod;
  isIncome: boolean;
  spent: number;
  limit: number;
  ratio: number;
  projected: number | null; // end-of-month projection (monthly expense budgets only)
  status: BudgetRowStatus;
  // Individual expenses behind the overrun — populated only for category budgets that
  // actually exceeded their limit (ratio > 1). Never set for the overall budget.
  overspendExpenses?: OverspendExpense[];
}

export interface WeeklyBudgetData {
  rows: WeeklyBudgetRow[];
  overall: WeeklyBudgetRow | null;
  // Fraction of the year elapsed (0-100) — context for annual budgets
  yearElapsedPct: number;
  onTrackCount: number;
  atRiskCount: number;
  aiComment?: string;
  generatedAt: Date;
}

// ─── Date helper ────────────────────────────────────────────────────────────

/** True when `now`, in Italy timezone, falls on a Sunday. Exported for testing. */
export function isWeeklyBudgetDayItaly(now: Date): boolean {
  return getItalyDate(now).getDay() === 0;
}

// ─── Status ─────────────────────────────────────────────────────────────────

/**
 * Status for an expense budget row. Over when actuals (or, for monthly budgets,
 * the projection) exceed the limit; warning near the limit; otherwise ok.
 * Income targets are never "over" — reaching the target is good.
 */
function rowStatus(ratio: number, projectedRatio: number | null, isIncome: boolean): BudgetRowStatus {
  if (isIncome) return ratio >= 1 ? 'ok' : 'warning';
  if (ratio > 1 || (projectedRatio != null && projectedRatio > 1)) return 'over';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'ok';
}

// ─── Data builder ─────────────────────────────────────────────────────────────

/** Back-fills kind/period/amount for budget items saved before those fields existed. */
function normalizeItem(raw: BudgetItem & { monthlyAmount?: number }): BudgetItem {
  const kind =
    raw.kind === 'expense' || raw.kind === 'income'
      ? raw.kind
      : raw.scope === 'type' && raw.expenseType === 'income'
        ? 'income'
        : 'expense';
  return { ...raw, kind, period: raw.period ?? 'monthly', amount: raw.amount ?? raw.monthlyAmount ?? 0 };
}

function itemLabel(item: BudgetItem): string {
  if (item.scope === 'subcategory') return `${item.categoryName ?? ''} › ${item.subCategoryName ?? ''}`;
  return item.categoryName ?? item.expenseType ?? '';
}

/**
 * Builds the weekly budget status for a user. Returns null when the user has no
 * budgets configured (nothing to report).
 *
 * Fetches expenses from Jan 1 of the previous year so monthly projections can be
 * dampened with last year's pace and the overall baseline is available.
 */
export async function buildWeeklyBudgetData(userId: string, now: Date): Promise<WeeklyBudgetData | null> {
  const budgetSnap = await adminDb.collection('budgets').doc(userId).get();
  if (!budgetSnap.exists) return null;
  const data = budgetSnap.data() ?? {};

  const items = ((data.items ?? []) as Array<BudgetItem & { monthlyAmount?: number }>).map(normalizeItem);
  const overallMonthlyAmount: number | undefined = data.overallMonthlyAmount;
  if (items.length === 0 && !overallMonthlyAmount) return null;

  const year = getItalyYear(now);
  const windowStart = new Date(year - 1, 0, 1);
  const expensesSnap = await adminDb
    .collection('expenses')
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(windowStart))
    .where('date', '<=', Timestamp.fromDate(now))
    .get();

  const expenses: Expense[] = expensesSnap.docs.map((doc) => {
    const e = doc.data();
    return { ...(e as Expense), date: e.date?.toDate ? e.date.toDate() : e.date };
  });

  const rows: WeeklyBudgetRow[] = items
    .filter((item) => item.amount > 0)
    .map((item) => {
      const spent = getPeriodActual(item, expenses, now);
      const ratio = item.amount > 0 ? spent / item.amount : 0;
      let projected: number | null = null;
      if (item.period === 'monthly' && item.kind === 'expense') {
        const reference = getActualForItem(item, expenses, year - 1) / 12;
        projected = buildSpendingForecast(spent, item.amount, now, reference).projectedTotal;
      }
      const projectedRatio = projected != null && item.amount > 0 ? projected / item.amount : null;
      const label = itemLabel(item);

      // List the contributing expenses only when an expense budget actually exceeded
      // its limit (ratio > 1) — "sforato" means real spending past the limit, not a
      // forecast-only overrun. Income targets and on-track rows carry no breakdown.
      let overspendExpenses: OverspendExpense[] | undefined;
      if (item.kind !== 'income' && ratio > 1) {
        overspendExpenses = getPeriodExpensesForItem(item, expenses, now).map((expense) => ({
          description: expense.notes?.trim() || label,
          // A subcategory-scoped budget already names the subcategory in its title — don't repeat it.
          subCategory: item.scope === 'subcategory' ? undefined : expense.subCategoryName,
          date: expense.date,
          amount: Math.abs(expense.amount),
        }));
      }

      return {
        label,
        period: item.period,
        isIncome: item.kind === 'income',
        spent,
        limit: item.amount,
        ratio,
        projected,
        status: rowStatus(ratio, projectedRatio, item.kind === 'income'),
        overspendExpenses,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);

  // Overall ceiling — all month spending vs the monthly limit
  let overall: WeeklyBudgetRow | null = null;
  if (overallMonthlyAmount && overallMonthlyAmount > 0) {
    const spent = getMonthlyTotalExpenses(expenses, year, getItalyMonth(now));
    const reference = getOverallMonthlyBaseline(expenses, year);
    const projected = buildSpendingForecast(spent, overallMonthlyAmount, now, reference).projectedTotal;
    const ratio = spent / overallMonthlyAmount;
    overall = {
      label: 'Budget complessivo',
      period: 'monthly',
      isIncome: false,
      spent,
      limit: overallMonthlyAmount,
      ratio,
      projected,
      status: rowStatus(ratio, projected / overallMonthlyAmount, false),
    };
  }

  const expenseRows = rows.filter((r) => !r.isIncome);
  const atRiskCount = expenseRows.filter((r) => r.status === 'over' || r.status === 'warning').length;
  const onTrackCount = expenseRows.length - atRiskCount;

  const italy = getItalyDate(now);
  const startOfYear = new Date(italy.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((italy.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
  const daysInYear = (italy.getFullYear() % 4 === 0 && italy.getFullYear() % 100 !== 0) || italy.getFullYear() % 400 === 0 ? 366 : 365;

  return {
    rows,
    overall,
    yearElapsedPct: (dayOfYear / daysInYear) * 100,
    onTrackCount,
    atRiskCount,
    generatedAt: now,
  };
}

// ─── AI comment ───────────────────────────────────────────────────────────────

/**
 * Generates a single Italian sentence highlighting the most notable budget fact
 * this week. Non-blocking: returns null on any failure or when no API key is set.
 */
export async function generateWeeklyBudgetComment(data: WeeklyBudgetData): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const lines = [
      data.overall &&
        `Complessivo: speso ${Math.round(data.overall.spent)}€ su ${Math.round(data.overall.limit)}€ (proiezione ${Math.round(data.overall.projected ?? 0)}€)`,
      ...data.rows.map(
        (r) =>
          `${r.label} [${r.period === 'annual' ? 'annuale' : 'mensile'}${r.isIncome ? ', entrata' : ''}]: ${Math.round(r.spent)}€ su ${Math.round(r.limit)}€ (${Math.round(r.ratio * 100)}%)`
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = `Sei un assistente finanziario personale italiano. Stato dei budget dell'utente a fine settimana (anno trascorso al ${Math.round(data.yearElapsedPct)}%):\n\n${lines}\n\nScrivi UNA sola frase in italiano (massimo 25 parole) che evidenzia il fatto più rilevante — un budget vicino o oltre il limite, oppure un buon andamento — usando solo i numeri sopra, senza inventarne altri. Niente elenchi, saluti o premesse.`;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    return text || null;
  } catch (error) {
    console.error('[weeklyBudgetEmail] AI comment generation failed:', error);
    return null;
  }
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function formatEur(amount: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

function statusColor(status: BudgetRowStatus): string {
  if (status === 'over') return '#dc2626';
  if (status === 'warning') return '#d97706';
  return '#16a34a';
}

const dayMonthFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' });

/** Escapes the few characters that would break HTML when interpolating a user-entered note. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Indented mono breakdown of the expenses behind an over-budget category. */
function overspendHtml(expenses: OverspendExpense[]): string {
  const items = expenses
    .map((expense) => {
      // Column order: Data · Sottocategoria · Nota · Importo.
      const subCategorySegment = expense.subCategory
        ? `<span style="color:#94a3b8;">${escapeHtml(expense.subCategory)}</span> &nbsp;·&nbsp; `
        : '';
      return `
      <div style="font-size:11px;color:#64748b;font-family:'Geist Mono', ui-monospace, monospace;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${dayMonthFormatter.format(expense.date)} &nbsp;·&nbsp; ${subCategorySegment}<span style="color:#475569;">${escapeHtml(expense.description)}</span> &nbsp;·&nbsp; ${formatEur(expense.amount)}
      </div>`;
    })
    .join('');
  return `<div style="margin-top:6px;padding-left:10px;border-left:2px solid #fecaca;">${items}</div>`;
}

function rowHtml(row: WeeklyBudgetRow): string {
  const color = statusColor(row.status);
  const pct = Math.round(row.ratio * 100);
  const projectedNote =
    row.projected != null && !row.isIncome ? ` · proiezione ${formatEur(row.projected)}` : '';
  const breakdown = row.overspendExpenses?.length ? overspendHtml(row.overspendExpenses) : '';
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;color:#0f172a;">${row.label}</span>
        <div style="font-size:12px;color:#64748b;margin-top:2px;font-family:'Geist Mono', ui-monospace, monospace;">
          ${formatEur(row.spent)} / ${formatEur(row.limit)} &nbsp;·&nbsp; <span style="color:${color};font-weight:600;">${pct}%</span>${projectedNote}
        </div>${breakdown}
      </td>
    </tr>`;
}

function groupHtml(title: string, subtitle: string, rows: WeeklyBudgetRow[]): string {
  if (rows.length === 0) return '';
  return `
    <tr><td style="padding:18px 32px 4px;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${title} <span style="font-weight:400;color:#94a3b8;">· ${subtitle}</span></p>
    </td></tr>
    <tr><td style="padding:0 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.map(rowHtml).join('')}</table>
    </td></tr>`;
}

/** Renders the weekly budget email HTML. Inline styles + hex are required by email clients. */
export function buildWeeklyBudgetEmailHtml(data: WeeklyBudgetData): string {
  const monthly = data.rows.filter((r) => r.period === 'monthly');
  const annual = data.rows.filter((r) => r.period === 'annual');
  const dateLabel = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    data.generatedAt
  );

  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;">Riepilogo settimanale budget</p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#0f172a;">${data.onTrackCount} in linea · ${data.atRiskCount} da tenere d'occhio</p>
          <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${dateLabel}</p>
        </td></tr>

        ${data.aiComment ? `<tr><td style="padding:8px 32px 0;"><p style="margin:0;font-size:13px;color:#334155;line-height:1.6;background:#f8fafc;border-radius:8px;padding:12px 14px;">${data.aiComment}</p></td></tr>` : ''}

        ${data.overall ? groupHtml('Budget complessivo', 'questo mese', [data.overall]) : ''}
        ${groupHtml('Budget mensili', 'questo mese', monthly)}
        ${groupHtml('Budget annuali', `quest'anno · anno al ${Math.round(data.yearElapsedPct)}%`, annual)}

        <tr><td style="padding:18px 32px;background:#f8fafc;">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">Generato automaticamente da Net Worth Tracker</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── Send orchestrator ─────────────────────────────────────────────────────────

/**
 * Builds and sends the weekly budget email. Returns false when the user has no
 * budgets (email skipped). AI comment failure is non-blocking.
 */
export async function buildAndSendWeeklyBudget(
  userId: string,
  recipients: string[],
  now: Date = new Date()
): Promise<boolean> {
  const data = await buildWeeklyBudgetData(userId, now);
  if (!data) return false;

  const aiComment = await generateWeeklyBudgetComment(data);
  if (aiComment) data.aiComment = aiComment;

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com',
    to: recipients,
    subject: 'Budget — riepilogo settimanale · Net Worth Tracker',
    html: buildWeeklyBudgetEmailHtml(data),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return true;
}
