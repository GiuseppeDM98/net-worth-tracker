import 'server-only';
import { z } from 'zod';
import { listRows, ROWS_CAP } from '@/lib/utils/assistantExpenseQueries';
import { defineAssistantTool } from './define';
import { assertKnownNames, assertPeriod, filterFields, isoDay, kindField, toExpenseQuery } from './filters';

export const spendingRows = defineAssistantTool({
  name: 'cashflow_righe',
  description:
    "Elenca le singole righe registrate che rispondono ai filtri (al più 100), con il conteggio e il totale di TUTTE quelle che corrispondono. Usalo per mostrare che cosa c'è dietro una cifra o per cercare una spesa per parola nelle note.",
  input: z.strictObject({
    kind: kindField,
    from: isoDay('Primo giorno del periodo, incluso (AAAA-MM-GG).'),
    to: isoDay('Ultimo giorno del periodo, incluso (AAAA-MM-GG).'),
    order: z
      .enum(['date-desc', 'date-asc', 'amount-desc'])
      .describe('Ordine: «date-desc» dalla più recente, «date-asc» dalla più vecchia, «amount-desc» dalla più grande.'),
    limit: z.number().int().min(1).max(ROWS_CAP).describe('Quante righe mostrare, da 1 a 100; conteggio e totale restano di tutte.'),
    ...filterFields,
  }),
  run: (input, context) => {
    const period = { from: input.from, to: input.to };
    assertPeriod(period);
    assertKnownNames(input, context);
    return { period, today: context.todayIso, ...listRows(context.expenses, toExpenseQuery(input, period), input.order, input.limit, context.clock) };
  },
});
