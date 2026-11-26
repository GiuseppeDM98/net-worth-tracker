import 'server-only';
import { z } from 'zod';
import { totalsBy } from '@/lib/utils/assistantExpenseQueries';
import { defineAssistantTool } from './define';
import { assertKnownNames, assertPeriod, filterFields, isoDay, kindField, toExpenseQuery } from './filters';

export const spendingTotals = defineAssistantTool({
  name: 'cashflow_totali',
  description:
    'Somma le spese o le entrate registrate in un periodo qualunque, raggruppate per categoria, sottocategoria, tipo, mese o centro di costo. Usalo ogni volta che ti serve un totale o una serie mensile che non è già scritta nei dati del messaggio. Le spese tornano come cifre positive; i trasferimenti tra conti non contano mai.',
  input: z.strictObject({
    kind: kindField,
    from: isoDay('Primo giorno del periodo, incluso (AAAA-MM-GG).'),
    to: isoDay('Ultimo giorno del periodo, incluso (AAAA-MM-GG).'),
    groupBy: z
      .enum(['category', 'subcategory', 'type', 'month', 'costCenter'])
      .describe('Come raggruppare: per categoria, sottocategoria, tipo, mese (serie mensile, al più gli ultimi 60 mesi) o centro di costo.'),
    ...filterFields,
  }),
  run: (input, context) => {
    const period = { from: input.from, to: input.to };
    assertPeriod(period);
    assertKnownNames(input, context);
    return { period, today: context.todayIso, ...totalsBy(context.expenses, toExpenseQuery(input, period), input.groupBy, context.clock) };
  },
});
