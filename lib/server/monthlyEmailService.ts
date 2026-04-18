/**
 * Monthly email summary service
 *
 * Responsibilities:
 *   - Determine whether today is the last calendar day of the month in Italy timezone
 *   - Query Admin SDK for snapshot, expense, and dividend data for a given user/month
 *   - Build a self-contained HTML email summarizing the month
 *   - Send the email via Resend
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyEmailData {
  year: number;
  month: number;
  currentNetWorth: number;
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  totalIncome: number;
  totalExpenses: number; // always positive in this struct (raw amounts are negative)
  topExpenseCategories: Array<{ name: string; amount: number }>;
  dividendTotal: number; // gross EUR
  dividendCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true only when the Italy-local date of `now` is the last day of its month.
 * Exported for testing.
 */
export function isLastDayOfMonthItaly(now: Date): boolean {
  const italyDate = getItalyDate(now);
  // Day 0 of the next month = last day of the current month
  const lastDay = new Date(
    italyDate.getFullYear(),
    italyDate.getMonth() + 1,
    0
  ).getDate();
  return italyDate.getDate() === lastDay;
}

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

// ─── Admin settings reader ────────────────────────────────────────────────────

/**
 * Read raw settings from Firestore Admin SDK — used inside the cron handler
 * where we cannot use the client SDK.
 */
export async function getSettingsAdmin(
  userId: string
): Promise<AssetAllocationSettings | null> {
  const doc = await adminDb.collection('assetAllocationTargets').doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    monthlyEmailEnabled: data.monthlyEmailEnabled,
    monthlyEmailRecipients: data.monthlyEmailRecipients,
    targets: data.targets,
  } as AssetAllocationSettings;
}

// ─── Data builder ─────────────────────────────────────────────────────────────

/**
 * Aggregate all data required for the monthly summary email.
 * Returns null if no snapshot is found for the requested period.
 */
export async function buildMonthlyEmailData(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyEmailData | null> {
  // Derive previous month boundaries (handles January → December)
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // Parallel fetch: current snapshot, previous snapshot, expenses, dividends
  const [currentSnapshotSnap, prevSnapshotSnap, expensesSnap, dividendsSnap] =
    await Promise.all([
      // isDummy filter omitted from query to keep the chain to 3 conditions
      // (Firestore inequality filters can't be combined with other inequality fields without a composite index).
      // We filter isDummy in code after fetch — a single snapshot per user/month makes this safe.
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
        .where('date', '>=', Timestamp.fromDate(new Date(year, month - 1, 1)))
        .where('date', '<=', Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59)))
        .get(),

      adminDb
        .collection('dividends')
        .where('userId', '==', userId)
        .where('paymentDate', '>=', Timestamp.fromDate(new Date(year, month - 1, 1)))
        .where('paymentDate', '<=', Timestamp.fromDate(new Date(year, month, 0, 23, 59, 59)))
        .get(),
    ]);

  // Filter out dummy snapshots in code (avoids a 4-condition Firestore query)
  const realCurrentDocs = currentSnapshotSnap.docs.filter((d) => !d.data().isDummy);
  const realPrevDocs = prevSnapshotSnap.docs.filter((d) => !d.data().isDummy);

  if (realCurrentDocs.length === 0) return null;

  const current = realCurrentDocs[0].data();
  const previous = realPrevDocs.length > 0 ? realPrevDocs[0].data() : null;

  const currentNetWorth: number = current.totalNetWorth ?? 0;
  const previousNetWorth: number = previous?.totalNetWorth ?? 0;
  const netWorthDelta = currentNetWorth - previousNetWorth;
  const netWorthDeltaPct =
    previousNetWorth !== 0 ? (netWorthDelta / Math.abs(previousNetWorth)) * 100 : 0;

  // Aggregate income and expenses
  let totalIncome = 0;
  let totalExpenses = 0;
  const categoryTotals: Record<string, { name: string; amount: number }> = {};

  for (const doc of expensesSnap.docs) {
    const { amount, categoryName, categoryId } = doc.data() as {
      amount: number;
      categoryName: string;
      categoryId: string;
    };

    if (amount > 0) {
      totalIncome += amount;
    } else {
      totalExpenses += Math.abs(amount);
      const key = categoryId ?? categoryName ?? 'Altro';
      if (!categoryTotals[key]) {
        categoryTotals[key] = { name: categoryName ?? 'Altro', amount: 0 };
      }
      categoryTotals[key].amount += Math.abs(amount);
    }
  }

  // Top 3 expense categories by amount
  const topExpenseCategories = Object.values(categoryTotals)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // Aggregate dividends
  let dividendTotal = 0;
  let dividendCount = 0;
  for (const doc of dividendsSnap.docs) {
    const data = doc.data();
    // Prefer EUR-converted gross amount when available
    const amount = (data.grossAmountEur ?? data.grossAmount ?? 0) as number;
    dividendTotal += amount;
    dividendCount++;
  }

  return {
    year,
    month,
    currentNetWorth,
    previousNetWorth,
    netWorthDelta,
    netWorthDeltaPct,
    liquidNetWorth: current.liquidNetWorth ?? 0,
    byAssetClass: current.byAssetClass ?? {},
    totalIncome,
    totalExpenses,
    topExpenseCategories,
    dividendTotal,
    dividendCount,
  };
}

// ─── Email HTML generator ─────────────────────────────────────────────────────

/** Exported for unit testing only — callers should use sendMonthlyEmail. */
export function generateEmailHtml(data: MonthlyEmailData): string {
  const monthLabel = MONTH_NAMES[data.month - 1];
  const deltaPositive = data.netWorthDelta >= 0;
  const deltaColor = deltaPositive ? '#16a34a' : '#dc2626';
  const deltaArrow = deltaPositive ? '▲' : '▼';

  const assetRows = Object.entries(data.byAssetClass)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([cls, value]) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${ASSET_CLASS_LABELS[cls] ?? cls}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(value)}</td>
        </tr>`
    )
    .join('');

  const expenseRows = data.topExpenseCategories
    .map(
      (cat) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${cat.name}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${formatEur(cat.amount)}</td>
        </tr>`
    )
    .join('');

  const savedAmount = data.totalIncome - data.totalExpenses;
  const savingsColor = savedAmount >= 0 ? '#16a34a' : '#dc2626';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Riepilogo ${monthLabel} ${data.year}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Net Worth Tracker</p>
            <h1 style="margin:8px 0 0;color:#f8fafc;font-size:22px;font-weight:700;">Riepilogo ${monthLabel} ${data.year}</h1>
          </td>
        </tr>

        <!-- Net Worth KPI -->
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Patrimonio Netto</p>
            <p style="margin:0;font-size:32px;font-weight:700;color:#0f172a;">${formatEur(data.currentNetWorth)}</p>
            <p style="margin:8px 0 0;font-size:14px;color:${deltaColor};font-weight:600;">
              ${deltaArrow} ${formatEur(Math.abs(data.netWorthDelta))} (${signedPct(data.netWorthDeltaPct)})
              <span style="color:#94a3b8;font-weight:400;"> rispetto al mese precedente</span>
            </p>
            ${
              data.previousNetWorth > 0
                ? `<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Mese precedente: ${formatEur(data.previousNetWorth)} &nbsp;·&nbsp; Liquido: ${formatEur(data.liquidNetWorth)}</p>`
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
                </tr>
              </thead>
              <tbody>${assetRows}</tbody>
            </table>
          </td>
        </tr>`
            : ''
        }

        <!-- Cashflow summary -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Cashflow del Mese</p>
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
                <td style="padding:8px 0 0;text-align:right;color:${savingsColor};font-weight:700;">${formatEur(savedAmount)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Top expense categories -->
        ${
          expenseRows
            ? `<tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f1f5f9;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#0f172a;">Top Categorie di Spesa</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:6px 12px;text-align:left;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Categoria</th>
                  <th style="padding:6px 12px;text-align:right;font-weight:600;color:#64748b;border-bottom:2px solid #e2e8f0;">Totale</th>
                </tr>
              </thead>
              <tbody>${expenseRows}</tbody>
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

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f8fafc;">
            <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
              Generato automaticamente da Net Worth Tracker &nbsp;·&nbsp; ${monthLabel} ${data.year}
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
 * Send the monthly summary email to all configured recipients.
 * Throws if RESEND_API_KEY is not set or if Resend returns an error.
 */
export async function sendMonthlyEmail(
  recipients: string[],
  data: MonthlyEmailData
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const monthLabel = MONTH_NAMES[data.month - 1];
  const subject = `Riepilogo ${monthLabel} ${data.year} — Net Worth Tracker`;

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

// ─── Convenience: build + send for a given Italy month ───────────────────────

/**
 * Build email data for the current Italy month and send it.
 * Returns false when no snapshot exists for the period (email skipped).
 */
export async function buildAndSendForCurrentMonth(
  userId: string,
  recipients: string[]
): Promise<boolean> {
  const { year, month } = getItalyMonthYear(new Date());
  const emailData = await buildMonthlyEmailData(userId, year, month);
  if (!emailData) return false;
  await sendMonthlyEmail(recipients, emailData);
  return true;
}
