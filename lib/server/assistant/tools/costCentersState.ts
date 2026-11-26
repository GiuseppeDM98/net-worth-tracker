import 'server-only';
import { z } from 'zod';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { groupExpensesByCostCenter, resolveLastActivityDate } from '@/lib/utils/costCenterUtils';
import type { Expense } from '@/types/expenses';
import { AssistantToolError, defineAssistantTool, UNREADABLE } from './define';
import { isoDay } from './filters';

/**
 * The cost centres as the Centri di Costo page reads them: grouped by the centre's ID through
 * `groupExpensesByCostCenter` (two centres of one name stay two, a refund is in no figure, a row
 * naming a deleted centre in no entry), the rows after today left out. The history's floor does
 * not apply here: the page has none.
 */
export const costCentersState = defineAssistantTool({
  name: 'centri_di_costo',
  description: "I centri di costo: per ciascuno il totale speso in un periodo, il tetto se c'è e l'ultima spesa. I rimborsi non contano.",
  input: z.strictObject({
    from: isoDay('Primo giorno del periodo, incluso (AAAA-MM-GG).'),
    to: isoDay('Ultimo giorno del periodo, incluso (AAAA-MM-GG).'),
  }),
  run: (input, context) => {
    if (!context.costCentersEnabled) return { enabled: false };
    if (context.costCenters === UNREADABLE) throw new AssistantToolError('Non riesco a leggere i centri di costo adesso.');
    const grouped = groupExpensesByCostCenter(context.expenses as Expense[], [...context.costCenters]);
    const centers = context.costCenters.map((center) => {
      const rows = (grouped[center.id]?.spending ?? []).filter((row) => {
        const day = getItalyDateIso(row.date);
        return day >= input.from && day <= input.to && day <= context.todayIso;
      });
      const last = resolveLastActivityDate(rows);
      return {
        name: center.name,
        archived: Boolean(center.archivedAt),
        spent: roundToCents(rows.reduce((sum, row) => sum + Math.abs(row.amount), 0)),
        rows: rows.length,
        ceiling: center.budgetAmount ?? null,
        ceilingPeriod: center.budgetPeriod ?? null,
        lastExpense: last ? getItalyDateIso(last) : null,
      };
    });
    return { enabled: true, period: { from: input.from, to: input.to }, today: context.todayIso, centers };
  },
});
