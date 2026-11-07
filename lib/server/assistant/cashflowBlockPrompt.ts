import 'server-only';
import { fetchCashflowBlockInputs } from '@/lib/services/assistantMonthContextService';
import { buildCashflowBlock, formatCashflowBlockForPrompt } from '@/lib/utils/cashflowBlock';

/**
 * The CASHFLOW 12 MESI block as the model reads it, on its own read of the whole recorded history
 * (`fetchCashflowBlockInputs`). Every mode of the Assistente and the emails' AI comments call it
 * (decision 81, 2026-11-07); the Consulente's strategy builds it in `run.ts` and prints it under the same
 * note. A rejection is the
 * caller's: the route answers 500, an email goes out without its AI comment — never a silent zero.
 */
export async function readCashflowBlockForPrompt(userId: string, now: Date): Promise<string> {
  const { expenses, ...input } = await fetchCashflowBlockInputs(userId, now);
  return formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input));
}
