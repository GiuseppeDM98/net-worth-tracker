import 'server-only';
import { fetchBudgetConfig, fetchCashflowBlockInputs, fetchCostCenters } from '@/lib/services/assistantMonthContextService';
import { buildCashflowBlock, formatCashflowBlockForPrompt } from '@/lib/utils/cashflowBlock';
import { queryClockOf } from '@/lib/utils/assistantExpenseQueries';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { UNREADABLE, type AssistantToolContext } from './define';

/**
 * What the tools read, read ONCE per request, before the first model round: the whole recorded
 * cashflow is the read the CASHFLOW 12 MESI block already makes, so the block and the tools share
 * it — one expense query a message, as before the tools. The budget and the centres are read beside
 * it, all three started together; a failure of either is logged and becomes `UNREADABLE` (only its
 * tool answers with an error), a failure of the expenses is the caller's: a 500, as today.
 */
async function readTurn(userId: string, now: Date): Promise<{ toolContext: AssistantToolContext; cashflowBlock: string }> {
  const sideReads = Promise.allSettled([fetchCostCenters(userId), fetchBudgetConfig(userId)]);
  const [{ expenses, ...input }, [centers, budget]] = await Promise.all([fetchCashflowBlockInputs(userId, now), sideReads]);
  if (centers.status === 'rejected') console.error('[assistant] cost centres unreadable for the tools', centers.reason);
  if (budget.status === 'rejected') console.error('[assistant] budget unreadable for the tools', budget.reason);
  const todayIso = getItalyDateIso(now);
  return {
    toolContext: {
      userId,
      todayIso,
      now,
      clock: queryClockOf(todayIso, input.settings?.cashflowHistoryStartYear),
      expenses,
      categories: input.categories,
      costCenters: centers.status === 'fulfilled' ? centers.value : UNREADABLE,
      budgetConfig: budget.status === 'fulfilled' ? budget.value : UNREADABLE,
      costCentersEnabled: input.settings?.costCentersEnabled === true,
    },
    cashflowBlock: formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input)),
  };
}

/** The tools' context and the CASHFLOW block from the same expense read: the route's one call. */
export async function readAssistantTurnData(userId: string, now: Date): Promise<{ toolContext: AssistantToolContext; cashflowBlock: string }> {
  return readTurn(userId, now);
}

/** The context alone, for a caller with no chat turn (the spending-review email). */
export async function buildAssistantToolContext(userId: string, now: Date): Promise<AssistantToolContext> {
  return (await readTurn(userId, now)).toolContext;
}
