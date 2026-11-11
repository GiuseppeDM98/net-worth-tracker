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
 */
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { AssistantRegisterSummary } from '@/types/assistant';
import type { BudgetConfig, BudgetPeriod } from '@/types/budget';
import type { CostCenter } from '@/types/costCenters';
import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import { EXPENSE_TYPE_LABELS, type Expense, type ExpenseCategory, type ExpenseType, type RecurrenceFrequency } from '@/types/expenses';
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
  categories: { id: string; name: string; type: ExpenseType; proposable: boolean; subCategories: { id: string; name: string }[] }[];
  accounts: AssistantRegisterSummary['accounts'];
  /** Null when unset or not a listed account. */
  defaults: { debitId: string | null; creditId: string | null };
  costCenters: { enabled: boolean; items: { id: string; name: string }[] };
  members: { enabled: boolean; items: { id: string; name: string }[] };
  recent: { rows: RegisterRecentRow[]; read: number; cut: number; sinceIso: string } | null;
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

/** The types a row can be proposed with: a debt or a transfer needs fields this mode does not ask for. */
const PROPOSABLE_TYPES: ReadonlySet<ExpenseType> = new Set<ExpenseType>(['fixed', 'variable', 'income']);
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
): { recent: NonNullable<AssistantRegisterContext['recent']>; windowRows: Expense[] } {
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
  };
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
      proposable: PROPOSABLE_TYPES.has(category.type),
      subCategories: (category.subCategories ?? []).map((sub) => ({ id: sub.id, name: sub.name })),
    }));

  const accounts = buildCashAccountLines(input.assets, settings, input.assetValueOf);
  const listed = (id: string | undefined) => (id && accounts.some((account) => account.id === id) ? id : null);

  const costCentersEnabled = settings?.costCentersEnabled === true;
  const membersEnabled = settings?.expenseSplitEnabled === true;
  const members = settings?.familyMembers ?? [];

  const built = input.recentExpenses
    ? buildRecent(input.recentExpenses, todayIso, {
        accounts: new Map(input.assets.map((asset) => [asset.id, asset.name?.trim() || asset.id])),
        members: new Map(members.map((member) => [member.id, member.name])),
      })
    : null;

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
    month: input.month ? buildMonth(input.month, built?.windowRows ?? [], now, todayIso) : null,
  };
}

const eur = (value: number) => `${formatNumberIt(value, 2)} €`;
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
      const restriction = category.proposable ? '' : ' · non proponibile in questa modalità';
      lines.push(`[${category.id}] ${category.name} · ${EXPENSE_TYPE_LABELS[category.type]}${restriction}`);
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

  lines.push('', '--- CENTRI DI COSTO ---');
  if (!ctx.costCenters.enabled) lines.push('Centri di costo: non attivi');
  else if (ctx.costCenters.items.length === 0) lines.push('Nessun centro di costo attivo');
  else for (const center of ctx.costCenters.items) lines.push(`[${center.id}] ${center.name}`);

  lines.push('', '--- INTESTATARI ---');
  if (!ctx.members.enabled) lines.push('Intestatari: non attivi');
  else if (ctx.members.items.length === 0) lines.push('Nessun componente della famiglia configurato');
  else for (const member of ctx.members.items) lines.push(`[${member.id}] ${member.name}`);

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
