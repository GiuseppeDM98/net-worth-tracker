/**
 * What the Assistente's Registra mode knows (2026-11), pure and client-safe.
 *
 * A row can only be proposed by id: the model copies the category's, the account's, the centre's
 * and the member's id from this block into its proposal, and the browser checks each against what
 * the page holds (lib/utils/expenseProposal.ts). So the block prints every id the form accepts,
 * the recent rows (how this user files what they buy) and the month so far.
 *
 * ONE builder runs on both sides. The server hands it the rows of the window and the month's
 * reads, and prints the result into the prompt; the browser hands it the hooks it already loaded
 * (`recentExpenses: null`, `month: null`) and prints the summary in the companion tile before any
 * message is sent — the server's summary, with the count of the rows read, replaces it when it
 * arrives.
 *
 * Every window is an Italian calendar window and every cut is printed (the silent-cap rule).
 *
 * Since 2026-11 the block also prints what the model needs to decide WHEN to ask: per category,
 * how its rows of the window were filed (PATTERN: the most-used account and its share, the rows in
 * a centre, the personal share, the share «fuori budget»), the loans an instalment may repay
 * (PRESTITI) and the properties a transfer may touch (IMMOBILI).
 */
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { AssistantRegisterSummary } from '@/types/assistant';
import type { BudgetConfig, BudgetPeriod } from '@/types/budget';
import type { CostCenter } from '@/types/costCenters';
import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseCategory, type ExpenseType, type RecurrenceFrequency } from '@/types/expenses';
import { isFeeRow } from '@/lib/utils/expenseFee';
import { debtBalanceOf, isRepayableDebt } from '@/lib/utils/mortgageRepayment';
import { isTransferableProperty } from '@/lib/utils/propertyTransfer';
import { budgetItemLabel, getMonthlyTotalExpenses, getPeriodActual } from '@/lib/utils/budgetUtils';
import { buildCashAccountLines } from '@/lib/utils/cashflowBlock';
import { ITALY_TIMEZONE, getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { formatNumberIt } from '@/lib/utils/formatters';
import { resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';

/** The lines of «ULTIME RIGHE» the prompt prints; the older ones are counted in the cut sentence. */
export const REGISTER_RECENT_ROWS_CAP = 300;
/** The window of the recent rows, in Italian calendar months, the current one included. */
export const REGISTER_RECENT_MONTHS = 12;
/** The budget lines «IL MESE» prints, highest ratio first. */
export const REGISTER_MONTH_BUDGET_ROWS_CAP = 20;

export interface RegisterMonthInput {
  /** `getDashboardOverview(...).expenseStats`; null = the read failed (or the payload holds none). */
  stats: DashboardOverviewExpenseStats | null;
  /** `budgets/{uid}`, its items through `normalizeBudgetItem`; null = no budget document. */
  budget: BudgetConfig | null;
  budgetFailed: boolean;
}

export interface AssistantRegisterContextInput {
  now: Date;
  categories: ExpenseCategory[];
  assets: Asset[];
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId' | 'costCentersEnabled' | 'expenseSplitEnabled' | 'familyMembers'> | null;
  /** All of them; the builder keeps those without `archivedAt`. */
  costCenters: CostCenter[];
  /** The window's rows (server); null in the browser. */
  recentExpenses: Expense[] | null;
  /** Null in the browser. */
  month: RegisterMonthInput | null;
  /** Injected: `calculateAssetValue` imports the client Firebase config. */
  assetValueOf: (asset: Asset) => number;
}

export interface RegisterRecentRow {
  dateIso: string;
  type: ExpenseType;
  /** A magnitude. */
  amount: number;
  categoryId: string;
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  costCenterName: string | null;
  memberName: string | null;
  note: string | null;
  excludeFromBudget: boolean;
  debtAssetId: string | null;
  recurringParentId: string | null;
  /** The series collapsed to its newest occurrence: how many of its rows the window holds. */
  series: { count: number; frequency: RecurrenceFrequency } | null;
}

export interface AssistantRegisterContext {
  /** `label`: «domenica 1 novembre 2026». */
  today: { iso: string; label: string };
  categories: { id: string; name: string; type: ExpenseType; subCategories: { id: string; name: string }[] }[];
  accounts: AssistantRegisterSummary['accounts'];
  /** Null when unset or not a listed account. */
  defaults: { debitId: string | null; creditId: string | null };
  costCenters: { enabled: boolean; items: { id: string; name: string }[] };
  members: { enabled: boolean; items: { id: string; name: string }[] };
  recent: { rows: RegisterRecentRow[]; read: number; cut: number; sinceIso: string } | null;
  /** One line per category with rows in the window (fee rows apart); null when the rows were not read. */
  patterns: RegisterCategoryPattern[] | null;
  /** The loans an instalment may repay, with the median instalment of the recent lines (a series once). */
  loans: { id: string; name: string; debt: number; ratePct: number | null; medianInstalment: { amount: number; lines: number } | null }[];
  /** The properties a transfer may land on or leave. */
  properties: { id: string; name: string; value: number }[];
  month: {
    /** «novembre 2026». */
    label: string;
    /** Null: the overview read failed. */
    totals: { income: number; expenses: number; scheduled: number; net: number } | null;
    /** The Italian month's rows up to today. */
    byType: { type: 'fixed' | 'variable' | 'debt'; amount: number }[];
    budgets: { label: string; spent: number; ceiling: number; ratio: number; period: BudgetPeriod }[] | 'failed' | 'none';
    /** The budget lines past `REGISTER_MONTH_BUDGET_ROWS_CAP`. */
    budgetsCut: number;
    overall: { spent: number; ceiling: number; ratio: number } | null;
  } | null;
}

/**
 * How one category's rows of the window were filed: the base is EVERY windowed row of it (a row
 * with no account counts in the base), every occurrence of a series counted, fee rows apart.
 */
export interface RegisterCategoryPattern {
  categoryId: string;
  name: string;
  type: ExpenseType;
  rows: number;
  topAccount: { name: string; share: number } | null;
  /** Printed only with the centres on. */
  inCostCenter: number | null;
  /** Printed only with Divisione on. */
  personalShare: number | null;
  /** Printed only on a spending category (fixed, variable, debt). */
  outOfBudgetShare: number | null;
}

const SPENDING_TYPES = ['fixed', 'variable', 'debt'] as const;
const CATEGORY_TYPE_ORDER: ExpenseType[] = ['fixed', 'variable', 'income', 'debt', 'transfer'];

// Built at the call, not at import: a formatter at module level would read the zone constant
// while the module graph loads, and a test that mocks `dateHelpers` for an unrelated route breaks on it.
/** «domenica 1 novembre 2026», on the Italian calendar whatever the process zone. */
function formatTodayLabel(now: Date): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: ITALY_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}
/** «novembre 2026». */
function formatMonthLabel(now: Date): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: ITALY_TIMEZONE, month: 'long', year: 'numeric' }).format(now);
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'it');
}

/** The first day of the Italian month `REGISTER_RECENT_MONTHS - 1` months before today's. */
function windowStartIso(todayIso: string): string {
  const [year, month] = todayIso.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1 - (REGISTER_RECENT_MONTHS - 1), 1));
  return start.toISOString().slice(0, 10);
}

function buildRecent(
  expenses: Expense[],
  todayIso: string,
  names: { accounts: Map<string, string>; members: Map<string, string> },
): { recent: NonNullable<AssistantRegisterContext['recent']>; windowRows: Expense[]; collapsed: RegisterRecentRow[] } {
  const sinceIso = windowStartIso(todayIso);
  // The window is decided here, on the Italian day of each row, whatever the caller read.
  const dated = expenses
    .map((row) => ({ row, dateIso: getItalyDateIso(row.date) }))
    .filter(({ dateIso }) => dateIso >= sinceIso && dateIso <= todayIso)
    // Newest first, so the cap drops the OLDEST lines; the id settles two rows of one day.
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : toDate(b.row.date).getTime() - toDate(a.row.date).getTime() || compareNames(a.row.id, b.row.id)));

  const seriesCounts = new Map<string, number>();
  for (const { row } of dated) {
    if (row.recurringParentId) seriesCounts.set(row.recurringParentId, (seriesCounts.get(row.recurringParentId) ?? 0) + 1);
  }

  const lines: RegisterRecentRow[] = [];
  const seenSeries = new Set<string>();
  for (const { row, dateIso } of dated) {
    const parentId = row.recurringParentId ?? null;
    if (parentId) {
      // One line per series: its newest occurrence, the first met in this order.
      if (seenSeries.has(parentId)) continue;
      seenSeries.add(parentId);
    }
    lines.push({
      dateIso,
      type: row.type,
      amount: Math.abs(row.amount),
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      subCategoryId: row.subCategoryId ?? null,
      subCategoryName: row.subCategoryName ?? null,
      accountId: row.linkedCashAssetId ?? null,
      accountName: row.linkedCashAssetId ? names.accounts.get(row.linkedCashAssetId) ?? null : null,
      costCenterName: row.costCenterName ?? null,
      memberName: row.personalMemberId ? names.members.get(row.personalMemberId) ?? null : null,
      note: row.notes?.trim() || null,
      excludeFromBudget: row.excludeFromBudget === true,
      debtAssetId: row.debtAssetId ?? null,
      recurringParentId: parentId,
      series: parentId ? { count: seriesCounts.get(parentId) ?? 1, frequency: resolveRecurrenceFrequency(row.recurringFrequency) } : null,
    });
  }

  return {
    recent: {
      rows: lines.slice(0, REGISTER_RECENT_ROWS_CAP),
      read: dated.length,
      cut: Math.max(0, lines.length - REGISTER_RECENT_ROWS_CAP),
      sinceIso,
    },
    windowRows: dated.map(({ row }) => row),
    collapsed: lines,
  };
}

/**
 * The PATTERN lines: computed over ALL the window's rows — before the cut of «ULTIME RIGHE» and
 * before a series collapses to one line, or the shares would describe what the prompt shows and
 * not how the user files. Fee rows are the app's, not the user's choice: left out. A transfer
 * category gets no line (its category is the app's). Most rows first.
 */
function buildPatterns(
  windowRows: Expense[],
  categories: readonly ExpenseCategory[],
  accountNames: Map<string, string>,
  features: { costCentersEnabled: boolean; membersEnabled: boolean },
): RegisterCategoryPattern[] {
  const byCategory = new Map<string, Expense[]>();
  for (const row of windowRows) {
    if (isFeeRow(row) || row.type === 'transfer') continue;
    byCategory.set(row.categoryId, [...(byCategory.get(row.categoryId) ?? []), row]);
  }
  const patterns: RegisterCategoryPattern[] = [];
  for (const [categoryId, rows] of byCategory) {
    const category = categories.find((candidate) => candidate.id === categoryId);
    const type = category?.type ?? rows[0].type;
    if (type === 'transfer') continue;
    const accountCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.linkedCashAssetId) accountCounts.set(row.linkedCashAssetId, (accountCounts.get(row.linkedCashAssetId) ?? 0) + 1);
    }
    const top = [...accountCounts.entries()].sort((a, b) => b[1] - a[1] || compareNames(a[0], b[0]))[0];
    const share = (count: number) => count / rows.length;
    patterns.push({
      categoryId,
      name: category?.name ?? rows[0].categoryName,
      type,
      rows: rows.length,
      topAccount: top ? { name: accountNames.get(top[0]) ?? top[0], share: share(top[1]) } : null,
      inCostCenter: features.costCentersEnabled ? rows.filter((row) => Boolean(row.costCenterId)).length : null,
      personalShare: features.membersEnabled ? share(rows.filter((row) => Boolean(row.personalMemberId)).length) : null,
      outOfBudgetShare: (SPENDING_TYPES as readonly ExpenseType[]).includes(type) ? share(rows.filter((row) => row.excludeFromBudget === true).length) : null,
    });
  }
  return patterns.sort((a, b) => b.rows - a.rows || compareNames(a.name, b.name));
}

/** The median of the instalments of a loan over the recent lines, a series counted once (its newest occurrence). */
function medianInstalment(lines: readonly RegisterRecentRow[], loanId: string): { amount: number; lines: number } | null {
  const amounts = lines.filter((line) => line.type === 'debt' && line.debtAssetId === loanId).map((line) => line.amount).sort((a, b) => a - b);
  if (amounts.length === 0) return null;
  const middle = Math.floor(amounts.length / 2);
  const amount = amounts.length % 2 === 1 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2;
  return { amount, lines: amounts.length };
}

function buildMonth(input: RegisterMonthInput, windowRows: Expense[], now: Date, todayIso: string): NonNullable<AssistantRegisterContext['month']> {
  const [year, month] = todayIso.split('-').map(Number);
  const monthPrefix = todayIso.slice(0, 7);

  const current = input.stats?.currentMonth ?? null;
  const totals = current
    ? { income: current.income, expenses: current.expenses, scheduled: current.expensesScheduled ?? 0, net: current.net }
    : null;

  // «Finora»: the window's rows stop at today, so nothing in calendar later is counted.
  const byType = SPENDING_TYPES.map((type) => ({
    type,
    amount: windowRows
      .filter((row) => row.type === type && row.amount < 0 && getItalyDateIso(row.date).startsWith(monthPrefix))
      .reduce((sum, row) => sum + Math.abs(row.amount), 0),
  }));

  let budgets: NonNullable<AssistantRegisterContext['month']>['budgets'] = 'none';
  let budgetsCut = 0;
  let overall: NonNullable<AssistantRegisterContext['month']>['overall'] = null;
  if (input.budgetFailed) {
    budgets = 'failed';
  } else if (input.budget) {
    const lines = input.budget.items
      .filter((item) => item.kind === 'expense' && item.amount > 0)
      .map((item) => {
        const spent = getPeriodActual(item, windowRows, now);
        const label = item.scope === 'type' && item.expenseType ? EXPENSE_TYPE_LABELS[item.expenseType] : budgetItemLabel(item);
        return { label, spent, ceiling: item.amount, ratio: spent / item.amount, period: item.period };
      })
      .sort((a, b) => b.ratio - a.ratio || compareNames(a.label, b.label));
    const ceiling = input.budget.overallMonthlyAmount;
    if (ceiling !== undefined && ceiling > 0) {
      const spent = getMonthlyTotalExpenses(windowRows, year, month);
      overall = { spent, ceiling, ratio: spent / ceiling };
    }
    if (lines.length > 0 || overall) {
      budgets = lines.slice(0, REGISTER_MONTH_BUDGET_ROWS_CAP);
      budgetsCut = Math.max(0, lines.length - REGISTER_MONTH_BUDGET_ROWS_CAP);
    }
  }

  return { label: formatMonthLabel(now), totals, byType, budgets, budgetsCut, overall };
}

export function buildAssistantRegisterContext(input: AssistantRegisterContextInput): AssistantRegisterContext {
  const { now, settings } = input;
  const todayIso = getItalyDateIso(now);

  const categories = [...input.categories]
    .sort((a, b) => CATEGORY_TYPE_ORDER.indexOf(a.type) - CATEGORY_TYPE_ORDER.indexOf(b.type) || compareNames(a.name, b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      subCategories: (category.subCategories ?? []).map((sub) => ({ id: sub.id, name: sub.name })),
    }));

  const accounts = buildCashAccountLines(input.assets, settings, input.assetValueOf);
  const listed = (id: string | undefined) => (id && accounts.some((account) => account.id === id) ? id : null);

  const costCentersEnabled = settings?.costCentersEnabled === true;
  const membersEnabled = settings?.expenseSplitEnabled === true;
  const members = settings?.familyMembers ?? [];

  const accountNames = new Map(input.assets.map((asset) => [asset.id, asset.name?.trim() || asset.id]));
  const built = input.recentExpenses
    ? buildRecent(input.recentExpenses, todayIso, {
        accounts: accountNames,
        members: new Map(members.map((member) => [member.id, member.name])),
      })
    : null;
  const byName = (a: { name: string }, b: { name: string }) => compareNames(a.name, b.name);

  return {
    today: { iso: todayIso, label: formatTodayLabel(now) },
    categories,
    accounts,
    defaults: { debitId: listed(settings?.defaultDebitCashAssetId), creditId: listed(settings?.defaultCreditCashAssetId) },
    costCenters: {
      enabled: costCentersEnabled,
      items: costCentersEnabled
        ? input.costCenters.filter((center) => !center.archivedAt).map((center) => ({ id: center.id, name: center.name })).sort((a, b) => compareNames(a.name, b.name))
        : [],
    },
    members: {
      enabled: membersEnabled,
      items: membersEnabled ? members.map((member) => ({ id: member.id, name: member.name })) : [],
    },
    recent: built?.recent ?? null,
    patterns: built ? buildPatterns(built.windowRows, input.categories, accountNames, { costCentersEnabled, membersEnabled }) : null,
    loans: input.assets
      .filter(isRepayableDebt)
      .map((loan) => ({
        id: loan.id,
        name: loan.name?.trim() || loan.id,
        debt: debtBalanceOf(loan),
        ratePct: typeof loan.debtInterestRate === 'number' ? loan.debtInterestRate : null,
        medianInstalment: built ? medianInstalment(built.collapsed, loan.id) : null,
      }))
      .sort(byName),
    properties: input.assets
      .filter(isTransferableProperty)
      .map((property) => ({ id: property.id, name: property.name?.trim() || property.id, value: property.quantity }))
      .sort(byName),
    month: input.month ? buildMonth(input.month, built?.windowRows ?? [], now, todayIso) : null,
  };
}

const eur = (value: number) => `${formatNumberIt(value, 2)} €`;
/** A figure with at most `decimals` decimals and no trailing zero: «96», «99,7», «1,25». */
const trimmed = (value: number, decimals: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: decimals }).format(value);
const percent = (share: number) => `${trimmed(share * 100, 1)}%`;
/** «1 riga», «{n} righe»: every count of the block agrees with its number. */
const rowCount = (count: number) => (count === 1 ? '1 riga' : `${count} righe`);

function formatPattern(pattern: RegisterCategoryPattern): string {
  const parts = [`[${pattern.categoryId}] ${pattern.name}`, `${rowCount(pattern.rows)} in ${REGISTER_RECENT_MONTHS} mesi`];
  parts.push(pattern.topAccount ? `conto più usato ${pattern.topAccount.name} ${percent(pattern.topAccount.share)}` : 'nessun conto nelle righe');
  if (pattern.inCostCenter !== null) parts.push(`in un centro: ${rowCount(pattern.inCostCenter)}`);
  if (pattern.personalShare !== null) parts.push(`personali ${percent(pattern.personalShare)}`);
  if (pattern.outOfBudgetShare !== null) parts.push(`fuori budget ${percent(pattern.outOfBudgetShare)}`);
  return parts.join(' · ');
}

function formatLoan(loan: AssistantRegisterContext['loans'][number]): string {
  const rate = loan.ratePct === null ? 'TAN non indicato' : `TAN ${trimmed(loan.ratePct, 2)}%`;
  const median = loan.medianInstalment
    ? `rata mediana ${eur(loan.medianInstalment.amount)} su ${rowCount(loan.medianInstalment.lines)} (serie contata una volta)`
    : 'nessuna rata nelle righe recenti';
  return [`[${loan.id}] ${loan.name}`, `debito residuo ${eur(loan.debt)}`, rate, median].join(' · ');
}
const ROLE_LABELS: Record<'addebito' | 'accredito', string> = { addebito: 'addebito predefinito', accredito: 'accredito predefinito' };
const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = { monthly: 'mensile', yearly: 'annuale' };

function formatRecentRow(row: RegisterRecentRow): string {
  const category = row.subCategoryId
    ? `${row.categoryName} [${row.categoryId}] › ${row.subCategoryName ?? ''} [${row.subCategoryId}]`
    : `${row.categoryName} [${row.categoryId}]`;
  const parts = [row.dateIso, EXPENSE_TYPE_LABELS[row.type], eur(row.amount), category];
  if (row.accountId) parts.push(`${row.accountName ?? 'conto'} [${row.accountId}]`);
  if (row.costCenterName) parts.push(`centro ${row.costCenterName}`);
  if (row.memberName) parts.push(`di ${row.memberName}`);
  if (row.note) parts.push(`«${row.note}»`);
  if (row.excludeFromBudget) parts.push('fuori budget');
  if (row.series) parts.push(`serie ×${row.series.count}, ${FREQUENCY_LABELS[row.series.frequency]}`);
  return parts.join(' · ');
}

function formatMonth(month: NonNullable<AssistantRegisterContext['month']>): string[] {
  const lines = [`--- IL MESE (${month.label}) ---`];
  lines.push(
    month.totals
      ? `Entrate ${eur(month.totals.income)} · Spese ${eur(month.totals.expenses)} (di cui ${eur(month.totals.scheduled)} in calendario dopo oggi) · Saldo ${eur(month.totals.net)}`
      : 'Riepilogo del mese non disponibile: lettura non riuscita.',
  );
  lines.push(`Spese finora per tipo: ${month.byType.map((entry) => `${EXPENSE_TYPE_LABELS[entry.type]} ${eur(entry.amount)}`).join(' · ')}`);
  if (month.budgets === 'failed') {
    lines.push('Budget: lettura non riuscita.');
  } else if (month.budgets === 'none') {
    lines.push('Budget: nessuno configurato.');
  } else {
    lines.push('Budget (speso finora / tetto):');
    for (const budget of month.budgets) {
      const period = budget.period === 'annual' ? 'annuale, da inizio anno' : 'mensile';
      lines.push(`- ${budget.label}: ${eur(budget.spent)} / ${eur(budget.ceiling)} (${formatNumberIt(budget.ratio * 100, 0)}%) · ${period}`);
    }
    if (month.budgetsCut > 0) lines.push(`(e altri ${month.budgetsCut} budget non elencati)`);
    if (month.overall) {
      lines.push(`Tetto complessivo: ${eur(month.overall.spent)} / ${eur(month.overall.ceiling)} (${formatNumberIt(month.overall.ratio * 100, 0)}%) · mensile`);
    }
  }
  return lines;
}

/** The register block of the prompt: every id a proposal may copy, the recent rows, the month so far. */
export function formatRegisterContextForPrompt(ctx: AssistantRegisterContext): string {
  const lines: string[] = ['--- REGISTRA ---', `Oggi: ${ctx.today.label} (${ctx.today.iso})`, ''];

  lines.push('--- CATEGORIE ---');
  if (ctx.categories.length === 0) {
    lines.push('Nessuna categoria configurata');
  } else {
    for (const category of ctx.categories) {
      lines.push(`[${category.id}] ${category.name} · ${EXPENSE_TYPE_LABELS[category.type]}`);
      for (const sub of category.subCategories) lines.push(`  - [${sub.id}] ${sub.name}`);
    }
  }

  lines.push('', '--- CONTI ---');
  if (ctx.accounts.length === 0) {
    lines.push('Nessun conto configurato: una riga proposta non muove alcun saldo');
  } else {
    for (const account of ctx.accounts) {
      lines.push([`[${account.id}] ${account.name}`, eur(account.balance), ...account.roles.map((role) => ROLE_LABELS[role])].join(' · '));
    }
    if (!ctx.defaults.debitId) lines.push('Nessun conto di addebito predefinito.');
    if (!ctx.defaults.creditId) lines.push('Nessun conto di accredito predefinito.');
  }

  lines.push('', '--- PRESTITI ---');
  if (ctx.loans.length === 0) lines.push('nessun prestito');
  else for (const loan of ctx.loans) lines.push(formatLoan(loan));

  lines.push('', '--- IMMOBILI ---');
  if (ctx.properties.length === 0) lines.push('nessun immobile');
  else for (const property of ctx.properties) lines.push(`[${property.id}] ${property.name} · valore ${eur(property.value)}`);

  lines.push('', '--- CENTRI DI COSTO ---');
  if (!ctx.costCenters.enabled) lines.push('Centri di costo: non attivi');
  else if (ctx.costCenters.items.length === 0) lines.push('Nessun centro di costo attivo');
  else for (const center of ctx.costCenters.items) lines.push(`[${center.id}] ${center.name}`);

  lines.push('', '--- INTESTATARI ---');
  if (!ctx.members.enabled) lines.push('Intestatari: non attivi');
  else if (ctx.members.items.length === 0) lines.push('Nessun componente della famiglia configurato');
  else for (const member of ctx.members.items) lines.push(`[${member.id}] ${member.name}`);

  lines.push('', '--- PATTERN ---');
  if (!ctx.patterns) {
    lines.push('Pattern: righe non lette.');
  } else if (ctx.patterns.length === 0) {
    lines.push(`Nessuna riga nelle categorie negli ultimi ${REGISTER_RECENT_MONTHS} mesi.`);
  } else {
    lines.push(`Per categoria, su tutte le righe degli ultimi ${REGISTER_RECENT_MONTHS} mesi (ogni occorrenza di una serie contata, commissioni escluse):`);
    for (const pattern of ctx.patterns) lines.push(formatPattern(pattern));
  }

  lines.push('', '--- ULTIME RIGHE ---');
  if (!ctx.recent) {
    lines.push('Ultime righe: non lette.');
  } else if (ctx.recent.read === 0) {
    lines.push(`Nessuna riga registrata dal ${ctx.recent.sinceIso} a oggi.`);
  } else {
    lines.push(`Dal ${ctx.recent.sinceIso} a oggi, dalla più recente: ${ctx.recent.read} righe lette (una serie ricorrente è una riga sola).`);
    if (ctx.recent.cut > 0) {
      lines.push(`(le ${ctx.recent.cut} righe più vecchie sono omesse; sotto le ${REGISTER_RECENT_ROWS_CAP} più recenti)`);
    }
    for (const row of ctx.recent.rows) lines.push(formatRecentRow(row));
  }

  if (ctx.month) lines.push('', ...formatMonth(ctx.month));
  return lines.join('\n');
}

/** What the companion tile prints: the same reading on both sides, `recent` known on the server alone. */
export function summarizeRegisterContext(ctx: AssistantRegisterContext): AssistantRegisterSummary {
  return {
    accounts: ctx.accounts,
    categories: ctx.categories.length,
    costCentersEnabled: ctx.costCenters.enabled,
    membersEnabled: ctx.members.enabled,
    recent: ctx.recent ? { rows: ctx.recent.rows.length, cut: ctx.recent.cut } : null,
  };
}
