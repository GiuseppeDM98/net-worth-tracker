import 'server-only';
import { z } from 'zod';
import { comparePeriods } from '@/lib/utils/assistantExpenseQueries';
import { defineAssistantTool } from './define';
import { assertKnownNames, assertPeriod, filterFields, isoDay, kindField, toExpenseQuery } from './filters';

function periodField(description: string) {
  return z
    .strictObject({
      from: isoDay('Primo giorno, incluso (AAAA-MM-GG).'),
      to: isoDay('Ultimo giorno, incluso (AAAA-MM-GG).'),
    })
    .describe(description);
}

export const spendingCompare = defineAssistantTool({
  name: 'cashflow_confronto',
  description:
    'Confronta due periodi con gli stessi filtri: per ogni gruppo i due totali, la differenza (B − A) e la variazione percentuale, dal movimento più grande. Usalo per spiegare perché una cifra è cambiata.',
  input: z.strictObject({
    kind: kindField,
    periodA: periodField('Il periodo di riferimento (A).'),
    periodB: periodField('Il periodo confrontato (B): la differenza è B − A.'),
    groupBy: z
      .enum(['category', 'subcategory', 'type', 'costCenter'])
      .describe('Come raggruppare: per categoria, sottocategoria, tipo o centro di costo (al più 40 gruppi, dal movimento più grande).'),
    ...filterFields,
  }),
  run: (input, context) => {
    assertPeriod(input.periodA);
    assertPeriod(input.periodB);
    assertKnownNames(input, context);
    const query = toExpenseQuery(input, input.periodA);
    return {
      periodA: input.periodA,
      periodB: input.periodB,
      today: context.todayIso,
      ...comparePeriods(
        context.expenses,
        query,
        { fromIso: input.periodA.from, toIso: input.periodA.to },
        { fromIso: input.periodB.from, toIso: input.periodB.to },
        input.groupBy,
        context.clock,
      ),
    };
  },
});
