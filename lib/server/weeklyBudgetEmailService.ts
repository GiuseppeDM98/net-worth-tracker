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

const monthNameFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long' });

/**
 * Builds the budget-status block handed to the model.
 *
 * Every line must carry its own time window. The email is sent weekly, but NONE of
 * its numbers are weekly: monthly budgets and the overall ceiling are month-to-date,
 * annual budgets are year-to-date, and projections land at end of month. Leaving the
 * horizon implicit produced a real error in production — the model saw only the
 * "anno trascorso al N%" hint and reported the overall projection as "a fine anno"
 * when it is in fact a monthly ceiling projected to month end.
 *
 * Pure — exported for testing.
 */
export function buildCommentContext(data: WeeklyBudgetData): string {
  const italy = getItalyDate(data.generatedAt);
  const monthName = monthNameFormatter.format(italy);
  const dayOfMonth = italy.getDate();
  const daysInMonth = new Date(italy.getFullYear(), italy.getMonth() + 1, 0).getDate();

  const header = [
    `Oggi è il giorno ${dayOfMonth} di ${daysInMonth} del mese di ${monthName} ${italy.getFullYear()}.`,
    `L'anno è trascorso al ${Math.round(data.yearElapsedPct)}%.`,
  ].join(' ');

  const lines = [
    data.overall &&
      `Budget complessivo (tetto MENSILE su tutte le spese): speso ${Math.round(data.overall.spent)}€ dal 1° ${monthName} a oggi, su un limite di ${Math.round(data.overall.limit)}€ per questo mese (${Math.round(data.overall.ratio * 100)}%). Al ritmo attuale la proiezione A FINE MESE è ${Math.round(data.overall.projected ?? 0)}€.`,
    ...data.rows.map((row) => {
      const window =
        row.period === 'annual' ? 'da inizio anno a oggi' : `dal 1° ${monthName} a oggi`;
      const horizon = row.period === 'annual' ? 'per quest\'anno' : 'per questo mese';
      const kind = row.isIncome ? 'obiettivo di entrata' : 'budget di spesa';
      const projection =
        row.projected != null && !row.isIncome
          ? ` Proiezione A FINE MESE: ${Math.round(row.projected)}€.`
          : '';
      return `${row.label} (${kind} ${row.period === 'annual' ? 'ANNUALE' : 'MENSILE'}): ${Math.round(row.spent)}€ ${window}, su un limite di ${Math.round(row.limit)}€ ${horizon} (${Math.round(row.ratio * 100)}%).${projection}`;
    }),
  ].filter(Boolean);

  return `${header}\n\n${lines.join('\n')}`;
}

/**
 * Generates a short Italian comment (2 sentences: the most notable fact + one concrete
 * action) for the weekly email. Non-blocking: returns null on any failure or when no
 * API key is set.
 */
export async function generateWeeklyBudgetComment(data: WeeklyBudgetData): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const prompt = `Sei un assistente finanziario personale italiano. Questo è lo stato dei budget dell'utente:

${buildCommentContext(data)}

REGOLE
- Usa SOLO i numeri e gli orizzonti temporali indicati sopra: non inventare cifre né ricavarne di nuove.
- Rispetta l'orizzonte di ogni voce. I budget mensili e il budget complessivo si misurano sul MESE CORRENTE e le loro proiezioni sono A FINE MESE: non definirle mai "a fine anno". Solo i budget annuali riguardano l'anno.
- Nessun dato qui è settimanale: la mail arriva ogni settimana, ma i numeri no. Non parlare di "questa settimana".

Scrivi esattamente DUE frasi in italiano (massimo 45 parole in totale):
1. il fatto più rilevante — il budget più critico (vicino o oltre il limite) oppure, se è tutto in ordine, l'andamento positivo più significativo;
2. una singola azione concreta e specifica che l'utente può fare da qui a fine periodo.
Niente elenchi, saluti, premesse o titoli.`;

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
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
  // Spell out the horizon: "proiezione €X" alone was read as a year-end figure.
  const projectedNote =
    row.projected != null && !row.isIncome
      ? ` · proiezione a fine mese ${formatEur(row.projected)}`
      : '';
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
          <p style="margin:10px 0 0;font-size:12px;color:#64748b;line-height:1.5;">Questa mail arriva ogni domenica, ma gli importi non sono settimanali: i budget mensili e il budget complessivo mostrano quanto hai speso <strong style="font-weight:600;">dal 1° del mese a oggi</strong>, i budget annuali <strong style="font-weight:600;">da inizio anno a oggi</strong>.</p>
        </td></tr>

        ${data.aiComment ? `<tr><td style="padding:8px 32px 0;"><p style="margin:0;font-size:13px;color:#334155;line-height:1.6;background:#f8fafc;border-radius:8px;padding:12px 14px;">${escapeHtml(data.aiComment)}</p></td></tr>` : ''}

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
